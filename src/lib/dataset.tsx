import { type QueryClient, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect } from "react";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { fetchAllRows } from "@/lib/fetch-all";
import { useAuth } from "@/lib/auth";
import { ALL, demoDatasetFor, useOrg } from "@/lib/orgs";
import { useActiveDataset } from "@/lib/active-dataset";
import { inRange, useWorkspace } from "@/lib/workspace";
import {
  type ArApRecord,
  type BudgetTarget,
  type PayrollRecord,
  type Transaction,
} from "@/lib/finance-data";

export interface Dataset {
  txns: Transaction[];
  pays: PayrollRecord[];
  buds: BudgetTarget[];
  araps: ArApRecord[];
  /** vendor / client names available for the selected organization */
  vendors: string[];
  /** true when the numbers come from the user's own uploaded data */
  live: boolean;
  loading: boolean;
  /** true when rows exist for the dataset but none fall inside the selected date range */
  outOfRange: boolean;
  refresh: () => void;
}

type Row<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];

async function fetchDataset() {
  // Every table is paged past the 1,000-row response cap.
  const [t, p, b, a] = await Promise.all([
    fetchAllRows<Row<"transactions">>((from, to) =>
      supabase.from("transactions").select("*").order("txn_date").range(from, to),
    ),
    fetchAllRows<Row<"payroll_records">>((from, to) =>
      supabase.from("payroll_records").select("*").order("employee_id").range(from, to),
    ),
    fetchAllRows<Row<"budget_targets">>((from, to) =>
      supabase.from("budget_targets").select("*").range(from, to),
    ),
    fetchAllRows<Row<"arap_records">>((from, to) =>
      supabase.from("arap_records").select("*").range(from, to),
    ),
  ]);

  return { t, p, b, a };
}

type CloudDataset = Awaited<ReturnType<typeof fetchDataset>>;
type DatasetBucket = keyof CloudDataset;
const localFallbacks = new Map<string, Partial<CloudDataset>>();

const mergeRows = <T extends { id?: string }>(cloud: T[], local: T[] = []) => {
  const ids = new Set(cloud.map((row) => row.id).filter(Boolean));
  return [...cloud, ...local.filter((row) => !row.id || !ids.has(row.id))];
};

export function cacheLocalDatasetRows(
  queryClient: QueryClient,
  userId: string,
  bucket: DatasetBucket,
  rows: Record<string, unknown>[],
) {
  const current = localFallbacks.get(userId) ?? {};
  localFallbacks.set(userId, { ...current, [bucket]: rows });
  queryClient.setQueryData<CloudDataset>(["dataset", userId], (cloud) => {
    const base = cloud ?? { t: [], p: [], b: [], a: [] };
    return { ...base, [bucket]: mergeRows(base[bucket] as never[], rows as never[]) } as CloudDataset;
  });
}

export function clearLocalDatasetRows(userId: string, bucket: DatasetBucket) {
  const current = localFallbacks.get(userId);
  if (!current) return;
  delete current[bucket];
  if (!Object.keys(current).length) localFallbacks.delete(userId);
}

/**
 * Full dataset read for the page the user is actually looking at.
 * Only the visible module pulls raw rows — other modules load lazily on view.
 */
export function useDataset(): Dataset {
  return useDatasetInternal(true);
}

/**
 * Cache-only view of the dataset: subscribes to whatever the visible page has
 * already loaded but never starts a fetch itself. Used by always-mounted shell
 * pieces (header banner, insights dock) so a 50k-row dataset is not downloaded
 * on every page.
 */
export function useDatasetPeek(): Dataset {
  return useDatasetInternal(false);
}

function useDatasetInternal(fetchEnabled: boolean): Dataset {
  const { user } = useAuth();
  const { orgId, vendor } = useOrg();
  const { activeFile } = useActiveDataset();
  const { range } = useWorkspace();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["dataset", user?.id ?? "anon"],
    queryFn: fetchDataset,
    enabled: fetchEnabled && !!user,
  });

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["dataset"] });
  }, [queryClient]);

  // Realtime cloud sync: any insert/update/delete on the ingested tables
  // refreshes every page that reads the dataset.
  useEffect(() => {
    if (!user || !fetchEnabled) return;
    const channel = supabase.channel(`dataset-sync-${user.id}-${Math.random().toString(36).slice(2)}`);
    ["transactions", "payroll_records", "budget_targets", "arap_records"].forEach((table) => {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, () => refresh());
    });
    channel.subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user, refresh, fetchEnabled]);

  const fallback = user ? localFallbacks.get(user.id) : undefined;
  const combinedRaw = data
    ? {
        t: mergeRows(data.t, fallback?.t),
        p: mergeRows(data.p, fallback?.p),
        b: mergeRows(data.b, fallback?.b),
        a: mergeRows(data.a, fallback?.a),
      }
    : fallback
      ? { t: fallback.t ?? [], p: fallback.p ?? [], b: fallback.b ?? [], a: fallback.a ?? [] }
      : undefined;
  const onlyActive = <T,>(rows: T[]) =>
    activeFile
      ? rows.filter((r) => (r as { source_file?: string | null }).source_file === activeFile)
      : rows;

  const combined = combinedRaw
    ? {
        t: onlyActive(combinedRaw.t),
        p: onlyActive(combinedRaw.p),
        b: onlyActive(combinedRaw.b),
        a: onlyActive(combinedRaw.a),
      }
    : undefined;

  const rowCount = combined ? combined.t.length + combined.p.length + combined.b.length + combined.a.length : 0;

  if (!combined || rowCount === 0) {
    const demo = demoDatasetFor(orgId);
    const vendors = uniqueVendors(demo.txns, demo.araps);
    const demoTxns = demo.txns.filter((r) => inRange(r.date, range));
    const demoAraps = demo.araps.filter((r) => inRange(r.invoice_date, range));
    return {
      txns: byVendor(demoTxns, vendor, (r) => r.vendor_client),
      pays: demo.pays.filter((r) => inRange(r.month_year, range)),
      buds: demo.buds,
      araps: byVendor(demoAraps, vendor, (r) => r.party_name),
      vendors,
      live: false,
      loading: !!user && isLoading,
      outOfRange: demo.txns.length > 0 && demoTxns.length === 0,
      refresh,
    };
  }

  const inOrg = <T extends { org_id?: string | null }>(rows: T[]) =>
    orgId === ALL ? rows : rows.filter((r) => r.org_id === orgId);

  const txns: Transaction[] = inOrg(combined.t).map((r) => ({
    id: r.id,
    date: r.txn_date,
    category: r.category,
    subcategory: r.subcategory,
    type: r.type === "income" ? "income" : "expense",
    amount: Number(r.amount),
    vendor_client: r.vendor_client,
    status: r.status === "pending" ? "pending" : "paid",
  }));

  const pays: PayrollRecord[] = inOrg(combined.p).map((r) => ({
    id: r.id,
    month_year: r.month_year,
    employee_id: r.employee_id,
    name: r.name,
    department: r.department,
    basic_pay: Number(r.basic_pay),
    allowances: Number(r.allowances),
    deductions: Number(r.deductions),
    pf_deduction: Number(r.pf_deduction),
    tds_deduction: Number(r.tds_deduction),
  }));

  const buds: BudgetTarget[] = inOrg(combined.b).map((r) => ({
    id: r.id,
    fiscal_year: r.fiscal_year,
    category: r.category,
    department: r.department,
    budgeted_amount: Number(r.budgeted_amount),
  }));

  const araps: ArApRecord[] = inOrg(combined.a).map((r) => ({
    id: r.id,
    type: r.type === "AP" ? "AP" : "AR",
    party_name: r.party_name,
    invoice_date: r.invoice_date ?? "",
    due_date: r.due_date ?? "",
    amount: Number(r.amount),
    status: r.status === "settled" ? "settled" : "outstanding",
  }));

  // Global date-range filter: every module reads this dataset, so scoping here
  // syncs all pages to the header selection at once.
  const txnsInRange = txns.filter((r) => inRange(r.date, range));
  const arapsInRange = araps.filter((r) => inRange(r.invoice_date || r.due_date, range));
  const paysInRange = pays.filter((r) => inRange(r.month_year, range));

  return {
    txns: byVendor(txnsInRange, vendor, (r) => r.vendor_client),
    pays: paysInRange,
    buds,
    araps: byVendor(arapsInRange, vendor, (r) => r.party_name),
    vendors: uniqueVendors(txns, araps),
    live: true,
    loading: false,
    outOfRange:
      txns.length + araps.length + pays.length > 0 &&
      txnsInRange.length + arapsInRange.length + paysInRange.length === 0,
    refresh,
  };
}

/**
 * Raw rows (original uploaded column names, raw_data flattened back in) for the
 * active dataset. Cache-only: it never triggers a fetch of its own.
 */
export function useDatasetRaw(): Record<string, unknown>[] {
  const { user } = useAuth();
  const { activeFile } = useActiveDataset();
  const queryClient = useQueryClient();
  const cached = queryClient.getQueryData<CloudDataset>(["dataset", user?.id ?? "anon"]);
  const fallback = user ? localFallbacks.get(user.id) : undefined;

  return useMemo(() => {
    const rows = mergeRows((cached?.t ?? []) as { id?: string }[], (fallback?.t ?? []) as { id?: string }[]);
    const scoped = activeFile
      ? rows.filter((r) => (r as { source_file?: string | null }).source_file === activeFile)
      : rows;
    return scoped.map((r) => withRawColumns(r as Record<string, unknown>));
  }, [cached, fallback, activeFile]);
}

function byVendor<T>(rows: T[], vendor: string, pick: (r: T) => string): T[] {
  if (vendor === ALL) return rows;
  return rows.filter((r) => pick(r) === vendor);
}

function uniqueVendors(txns: Transaction[], araps: ArApRecord[]): string[] {
  const set = new Set<string>();
  txns.forEach((t) => t.vendor_client && set.add(t.vendor_client));
  araps.forEach((a) => a.party_name && set.add(a.party_name));
  return [...set].sort();
}

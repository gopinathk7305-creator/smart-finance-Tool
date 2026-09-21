import { type QueryClient, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo } from "react";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { fetchAllRows, withRawColumns } from "@/lib/fetch-all";
import { mapRowsToTransactions, parseNum } from "@/lib/column-map";
import { deriveArAp, deriveBudget, derivePayroll } from "@/lib/module-derive";
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

/**
 * Rows for the active dataset only. Scoping the fetch (instead of downloading
 * every file and filtering in the browser) keeps a switch fast and guarantees
 * the newly selected file's rows are actually present.
 */
async function fetchDataset(activeFile?: string | null) {
  const scope = <T,>(q: T): T =>
    activeFile ? ((q as { eq: (c: string, v: string) => T }).eq("source_file", activeFile) as T) : q;

  // Every table is paged past the 1,000-row response cap.
  const [t, p, b, a] = await Promise.all([
    fetchAllRows<Row<"transactions">>((from, to) =>
      scope(supabase.from("transactions").select("*").order("txn_date")).range(from, to),
    ),
    fetchAllRows<Row<"payroll_records">>((from, to) =>
      scope(supabase.from("payroll_records").select("*").order("employee_id")).range(from, to),
    ),
    fetchAllRows<Row<"budget_targets">>((from, to) =>
      scope(supabase.from("budget_targets").select("*")).range(from, to),
    ),
    fetchAllRows<Row<"arap_records">>((from, to) =>
      scope(supabase.from("arap_records").select("*")).range(from, to),
    ),
  ]);

  return { t, p, b, a };
}

type CloudDataset = Awaited<ReturnType<typeof fetchDataset>>;
/** cache key scoped to the active dataset so a header switch refetches */
const datasetKey = (userId: string, activeFile?: string | null) =>
  ["dataset", userId, activeFile ?? "all"] as const;
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
  queryClient.setQueriesData<CloudDataset>({ queryKey: ["dataset", userId] }, (cloud) => {
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

  const { data, isLoading } = useQuery<CloudDataset>({
    // activeFile is part of the key, so switching datasets in the header
    // refetches straight away instead of reusing a stale snapshot.
    queryKey: datasetKey(user?.id ?? "anon", activeFile),
    queryFn: () => fetchDataset(activeFile),
    enabled: fetchEnabled && !!user,
    // Rows for a dataset stay fresh for 10 minutes, so moving between modules
    // (or back to a previously selected file) renders instantly from cache.
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    placeholderData: (prev) => prev,
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
    date: r.txn_date ?? "",
    category: r.category ?? "Uncategorised",
    subcategory: r.subcategory ?? "",
    type: r.type === "income" ? "income" : "expense",
    amount: parseNum(r.amount),
    vendor_client: r.vendor_client ?? "",
    status: r.status === "pending" ? "pending" : "paid",
  }));

  const pays: PayrollRecord[] = inOrg(combined.p).map((r) => ({
    id: r.id,
    month_year: r.month_year ?? "",
    employee_id: r.employee_id ?? "",
    name: r.name ?? "",
    department: r.department ?? "",
    basic_pay: parseNum(r.basic_pay),
    allowances: parseNum(r.allowances),
    deductions: parseNum(r.deductions),
    pf_deduction: parseNum(r.pf_deduction),
    tds_deduction: parseNum(r.tds_deduction),
  }));

  const buds: BudgetTarget[] = inOrg(combined.b).map((r) => ({
    id: r.id,
    fiscal_year: r.fiscal_year ?? "",
    category: r.category ?? "",
    department: r.department ?? "",
    budgeted_amount: parseNum(r.budgeted_amount),
    month: (r as { month?: string }).month ?? "Annual",
  }));

  const araps: ArApRecord[] = inOrg(combined.a).map((r) => ({
    id: r.id,
    type: r.type === "AP" ? "AP" : "AR",
    party_name: r.party_name ?? "",
    invoice_date: r.invoice_date ?? "",
    due_date: r.due_date ?? "",
    amount: parseNum(r.amount),
    status: r.status === "settled" ? "settled" : "outstanding",
  }));

  // Cross-module fuzzy derivation: an uploaded file usually lands in one table
  // only, so modules whose canonical table is empty map their metrics from the
  // active dataset's own columns instead of showing ₹0.
  const rawBucket = [combined.t, combined.p, combined.b, combined.a].find((rows) => rows.length) ?? [];
  const rawRows = (inOrg(rawBucket as { org_id?: string | null }[]) as Record<string, unknown>[]).map((r) =>
    withRawColumns(r),
  );

  const canonicalTotal = txns.reduce((s, t) => s + t.amount, 0);
  const effectiveTxns = canonicalTotal > 0 ? txns : mapRowsToTransactions(rawRows);
  const effectivePays = pays.length ? pays : derivePayroll(rawRows, effectiveTxns);
  const effectiveBuds = buds.length ? buds : deriveBudget(rawRows);
  const effectiveAraps = araps.length ? araps : deriveArAp(rawRows);

  // Global date-range filter: every module reads this dataset, so scoping here
  // syncs all pages to the header selection at once.
  const txnsInRange = effectiveTxns.filter((r) => inRange(r.date, range));
  const arapsInRange = effectiveAraps.filter((r) => inRange(r.invoice_date || r.due_date, range));
  const paysInRange = effectivePays.filter((r) => inRange(r.month_year, range));

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
 * active dataset. Subscribes to the dataset cache with useQuery so a header
 * dataset switch (or a finished fetch) re-renders every dashboard widget, but
 * never starts a fetch of its own.
 */
export function useDatasetRaw(): Record<string, unknown>[] {
  const { user } = useAuth();
  const { activeFile } = useActiveDataset();

  // enabled:false keeps this read-only while still subscribing to cache updates.
  const { data: cached } = useQuery<CloudDataset>({
    queryKey: datasetKey(user?.id ?? "anon", activeFile),
    queryFn: () => fetchDataset(activeFile),
    enabled: false,
  });
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

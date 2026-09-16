import { type QueryClient, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect } from "react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { ALL, demoDatasetFor, useOrg } from "@/lib/orgs";
import { useActiveDataset } from "@/lib/active-dataset";
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
  refresh: () => void;
}

async function fetchDataset() {
  const [t, p, b, a] = await Promise.all([
    supabase.from("transactions").select("*").order("txn_date"),
    supabase.from("payroll_records").select("*").order("employee_id"),
    supabase.from("budget_targets").select("*"),
    supabase.from("arap_records").select("*"),
  ]);

  return {
    t: t.data ?? [],
    p: p.data ?? [],
    b: b.data ?? [],
    a: a.data ?? [],
  };
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

export function useDataset(): Dataset {
  const { user } = useAuth();
  const { orgId, vendor } = useOrg();
  const { activeFile } = useActiveDataset();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["dataset", user?.id ?? "anon"],
    queryFn: fetchDataset,
    enabled: !!user,
  });

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["dataset"] });
  }, [queryClient]);

  // Realtime cloud sync: any insert/update/delete on the ingested tables
  // refreshes every page that reads the dataset.
  useEffect(() => {
    if (!user) return;
    const channel = supabase.channel(`dataset-sync-${user.id}-${Math.random().toString(36).slice(2)}`);
    ["transactions", "payroll_records", "budget_targets", "arap_records"].forEach((table) => {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, () => refresh());
    });
    channel.subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user, refresh]);

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
    return {
      txns: byVendor(demo.txns, vendor, (r) => r.vendor_client),
      pays: demo.pays,
      buds: demo.buds,
      araps: byVendor(demo.araps, vendor, (r) => r.party_name),
      vendors,
      live: false,
      loading: !!user && isLoading,
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

  return {
    txns: byVendor(txns, vendor, (r) => r.vendor_client),
    pays,
    buds,
    araps: byVendor(araps, vendor, (r) => r.party_name),
    vendors: uniqueVendors(txns, araps),
    live: true,
    loading: false,
    refresh,
  };
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

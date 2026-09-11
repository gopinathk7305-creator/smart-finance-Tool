import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import {
  arApRecords,
  budgets,
  payroll,
  transactions,
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

  const txns: Transaction[] = (t.data ?? []).map((r) => ({
    id: r.id,
    date: r.txn_date,
    category: r.category,
    subcategory: r.subcategory,
    type: r.type === "income" ? "income" : "expense",
    amount: Number(r.amount),
    vendor_client: r.vendor_client,
    status: r.status === "pending" ? "pending" : "paid",
  }));

  const pays: PayrollRecord[] = (p.data ?? []).map((r) => ({
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

  const buds: BudgetTarget[] = (b.data ?? []).map((r) => ({
    id: r.id,
    fiscal_year: r.fiscal_year,
    category: r.category,
    department: r.department,
    budgeted_amount: Number(r.budgeted_amount),
  }));

  const araps: ArApRecord[] = (a.data ?? []).map((r) => ({
    id: r.id,
    type: r.type === "AP" ? "AP" : "AR",
    party_name: r.party_name,
    invoice_date: r.invoice_date ?? "",
    due_date: r.due_date ?? "",
    amount: Number(r.amount),
    status: r.status === "settled" ? "settled" : "outstanding",
  }));

  return { txns, pays, buds, araps };
}

export function useDataset(): Dataset {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["dataset", user?.id ?? "anon"],
    queryFn: fetchDataset,
    enabled: !!user,
  });

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["dataset"] });
  }, [queryClient]);

  const hasLive = !!data && data.txns.length + data.pays.length + data.buds.length + data.araps.length > 0;

  if (!hasLive) {
    return {
      txns: transactions,
      pays: payroll,
      buds: budgets,
      araps: arApRecords,
      live: false,
      loading: !!user && isLoading,
      refresh,
    };
  }

  return {
    txns: data.txns.length ? data.txns : transactions,
    pays: data.pays.length ? data.pays : payroll,
    buds: data.buds.length ? data.buds : budgets,
    araps: data.araps.length ? data.araps : arApRecords,
    live: true,
    loading: false,
    refresh,
  };
}

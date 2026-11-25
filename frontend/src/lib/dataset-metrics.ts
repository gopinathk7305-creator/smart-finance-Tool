import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { api } from "@/services/api";
import { useActiveDataset } from "@/lib/active-dataset";
import { useAuth } from "@/lib/auth";
import { useDatasetPeek } from "@/lib/dataset";
import { useWorkspace } from "@/lib/workspace";

export interface ActiveDatasetMetrics {
  revenue: number;
  expenses: number;
  netProfit: number;
  /** profit before payroll statutory deductions are netted out */
  ebitda: number;
  taxDeductions: number;
  riskFlags: number;
  live: boolean;
  loading: boolean;
  rowCount: number;
}

interface SummaryRow {
  revenue: number | string;
  expenses: number | string;
  tax_deductions: number | string;
  overdue_count: number;
  duplicate_count: number;
  txn_count: number;
  payroll_count: number;
  arap_count: number;
}

/**
 * Aggregated numbers for every KPI card come straight from Postgres
 * (`dataset_summary` RPC): one tiny payload instead of 50,000 rows in browser
 * memory. Raw-row maths is only used as a fallback (demo data / offline).
 */
export function useActiveDatasetMetrics(): ActiveDatasetMetrics {
  const { user } = useAuth();
  const { activeFile } = useActiveDataset();
  const { range } = useWorkspace();
  const peek = useDatasetPeek();

  const { data, isLoading } = useQuery({
    queryKey: ["dataset-summary", user?.id ?? "anon", activeFile ?? "all", range.start ?? "", range.end ?? ""],
    enabled: !!user,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    placeholderData: (prev: SummaryRow | null | undefined) => prev,
    queryFn: async (): Promise<SummaryRow | null> => {
      try {
        const d = await api.analytics.dashboard(activeFile);
        return {
          revenue: Number(d.total_revenue) || 0,
          expenses: Number(d.total_expenses) || 0,
          tax_deductions: 0,
          closing_cash: Number(d.cash_balance) || 0,
          txn_count: d.transaction_count || 0,
          payroll_count: 0,
          budget_count: 0,
          arap_count: 0,
        };
      } catch {
        return null;
      }
    },
  });

  return useMemo(() => {
    const rowCount = data ? data.txn_count + data.payroll_count + data.arap_count : 0;

    if (data && rowCount > 0) {
      const revenue = Number(data.revenue);
      const expenses = Number(data.expenses);
      const taxDeductions = Number(data.tax_deductions);
      const netProfit = revenue - expenses;
      return {
        revenue,
        expenses,
        netProfit,
        ebitda: netProfit + taxDeductions,
        taxDeductions,
        riskFlags: data.overdue_count + data.duplicate_count,
        live: true,
        loading: false,
        rowCount,
      };
    }

    // Fallback: compute from whatever rows the visible page already holds.
    const { txns, pays, araps } = peek;
    const revenue = txns.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
    const expenses = txns.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
    const taxDeductions = pays.reduce((s, p) => s + p.pf_deduction + p.tds_deduction, 0);
    const netProfit = revenue - expenses;
    const overdue = araps.filter((a) => a.status === "outstanding").length;
    const seen = new Set<string>();
    let dupes = 0;
    txns.forEach((t) => {
      const key = `${t.date}|${t.vendor_client}|${t.amount}`;
      if (seen.has(key)) dupes += 1;
      else seen.add(key);
    });

    return {
      revenue,
      expenses,
      netProfit,
      ebitda: netProfit + taxDeductions,
      taxDeductions,
      riskFlags: overdue + dupes,
      live: peek.live,
      loading: !!user && isLoading && !data,
      rowCount: txns.length + pays.length + araps.length,
    };
  }, [data, isLoading, user, peek]);
}

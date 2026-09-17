import { useMemo } from "react";

import { useDataset } from "@/lib/dataset";

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

/**
 * Single source of aggregated numbers for every KPI card, summary header and
 * chart. It reads the same scoped dataset (active dataset + date range), so a
 * dataset switch recalculates all modules in one pass.
 */
export function useActiveDatasetMetrics(): ActiveDatasetMetrics {
  const { txns, pays, araps, live, loading } = useDataset();

  return useMemo(() => {
    const revenue = txns.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
    const expenses = txns.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
    const payrollCost = pays.reduce(
      (s, p) => s + p.basic_pay + p.allowances - p.deductions,
      0,
    );
    const taxDeductions = pays.reduce((s, p) => s + p.pf_deduction + p.tds_deduction, 0);
    const netProfit = revenue - expenses;
    const overdue = araps.filter((a) => a.status === "outstanding").length;
    const duplicates = new Set<string>();
    let dupes = 0;
    txns.forEach((t) => {
      const key = `${t.date}|${t.vendor_client}|${t.amount}`;
      if (duplicates.has(key)) dupes += 1;
      else duplicates.add(key);
    });

    return {
      revenue,
      expenses,
      netProfit,
      ebitda: netProfit + taxDeductions,
      taxDeductions,
      riskFlags: overdue + dupes,
      live,
      loading,
      rowCount: txns.length + pays.length + araps.length,
    };
  }, [txns, pays, araps, live, loading]);
}

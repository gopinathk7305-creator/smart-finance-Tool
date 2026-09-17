import { useMemo } from "react";

import { detectColumns, mapRowsToTransactions, type ColumnMap } from "@/lib/column-map";
import { useDatasetRaw } from "@/lib/dataset";
import type { Transaction } from "@/lib/finance-data";

export interface DynamicDashboard {
  /** rows normalised from the active dataset's own column names */
  txns: Transaction[];
  revenue: number;
  expenses: number;
  netProfit: number;
  mapping: ColumnMap;
  /** true when the auto-mapper found usable money columns */
  usable: boolean;
}

/**
 * In-memory auto-mapping of the active dataset. Runs on the rows the visible
 * page already holds — no extra fetching, no cross-module blocking — so KPI
 * cards populate immediately even when the file uses custom column names.
 */
export function useDynamicDashboard(activeDatasetId?: string | null): DynamicDashboard {
  const rows = useDatasetRaw();

  return useMemo(() => {
    void activeDatasetId; // recompute marker: rows change with the active dataset
    const mapping = detectColumns(rows);
    const txns = mapRowsToTransactions(rows, mapping);
    const revenue = txns.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
    const expenses = txns.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
    return {
      txns,
      revenue,
      expenses,
      netProfit: revenue - expenses,
      mapping,
      usable: revenue > 0 || expenses > 0,
    };
  }, [rows, activeDatasetId]);
}

import { useMemo } from "react";

import { detectColumns, mapRowsToTransactions, type ColumnMap } from "@/lib/column-map";
import { useDatasetRaw } from "@/lib/dataset";
import {
  countRiskRows,
  distribution,
  inspectSchema,
  type SchemaInspection,
} from "@/lib/schema-inspector";
import type { Transaction } from "@/lib/finance-data";

export interface DynamicDashboard {
  /** rows normalised from the active dataset's own column names */
  txns: Transaction[];
  revenue: number;
  expenses: number;
  netProfit: number;
  mapping: ColumnMap;
  /** column roles discovered from the dataset itself */
  schema: SchemaInspection;
  /** rows carrying an anomaly / warning flag */
  riskFlags: number;
  /** top 5 groups from the detected category column (money when available) */
  topGroups: { name: string; value: number }[];
  /** label describing what topGroups measures */
  groupLabel: string;
  /** true when the auto-mapper found usable money columns */
  usable: boolean;
  rowCount: number;
  /** number of columns present in the active dataset's records */
  columnCount: number;
}

/**
 * In-memory auto-mapping of the active dataset. Runs on the rows the visible
 * page already holds — no extra fetching, no cross-module blocking — so KPI
 * cards, charts and widgets configure themselves from whatever columns the
 * uploaded file happens to have.
 */
export function useDynamicDashboard(activeDatasetId?: string | null): DynamicDashboard {
  const rows = useDatasetRaw();

  return useMemo(() => {
    void activeDatasetId; // recompute marker: rows change with the active dataset
    const schema = inspectSchema(rows);
    const mapping = detectColumns(rows);
    const txns = mapRowsToTransactions(rows, mapping);
    const revenue = txns.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
    const expenses = txns.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);

    const groupBy = mapping.category ?? schema.categorical[0];
    const valueColumn = mapping.expense ?? mapping.amount ?? mapping.revenue ?? schema.numeric[0];
    const topGroups = groupBy ? distribution(rows, groupBy, valueColumn) : [];
    const groupLabel = groupBy
      ? valueColumn
        ? `Top ${groupBy} by ${valueColumn}`
        : `Top ${groupBy} by record count`
      : "";

    return {
      txns,
      revenue,
      expenses,
      netProfit: revenue - expenses,
      mapping,
      schema,
      riskFlags: countRiskRows(rows, schema),
      topGroups,
      groupLabel,
      usable: revenue > 0 || expenses > 0,
      rowCount: rows.length,
    };
  }, [rows, activeDatasetId]);
}

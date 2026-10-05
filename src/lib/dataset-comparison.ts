import type { MonthlySummary } from "@/lib/finance-data";

export interface ComparisonTotals {
  revenue: number;
  expenses: number;
  netProfit: number;
  rows: number;
}

export function comparisonReady(a: ComparisonTotals | undefined, b: ComparisonTotals | undefined) {
  return !!a && !!b && a.rows > 0 && b.rows > 0;
}

/** Match calendar months by label, never by array position. */
export function comparisonMonths(a: MonthlySummary[], b: MonthlySummary[]) {
  const left = new Map(a.map((row) => [row.month, row]));
  const right = new Map(b.map((row) => [row.month, row]));
  return [...new Set([...left.keys(), ...right.keys()])].map((month) => ({
    month,
    revenueA: left.get(month)?.revenue ?? 0,
    revenueB: right.get(month)?.revenue ?? 0,
    expenseA: left.get(month)?.expense ?? 0,
    expenseB: right.get(month)?.expense ?? 0,
    cashA: left.get(month)?.cash ?? 0,
    cashB: right.get(month)?.cash ?? 0,
  }));
}
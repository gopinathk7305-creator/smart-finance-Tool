import type { ExpenseCategory } from "@/lib/categories";
import type { MonthlySummary, Transaction } from "@/lib/finance-data";

const normalize = (value: string) => value.trim().toLowerCase().replace(/[_-]+/g, " ");
const nonOperating = /\b(cogs|cost of goods sold|cost of sales|direct costs?|capex|capital expenditure|asset purchase|equipment purchase|depreciation|amorti[sz]ation|interest|finance costs?|tax|gst|loan|debt|dividend|investment)\b/i;

/** Payroll is operating spend; direct costs, financing, tax and capital flows are not. */
export function isOperatingExpense(
  transaction: Transaction,
  categories: Pick<ExpenseCategory, "name" | "kind">[],
): boolean {
  if (transaction.type !== "expense") return false;
  const category = normalize(transaction.category);
  const kind = categories.find((item) => normalize(item.name) === category)?.kind;
  if (kind === "cogs") return false;
  return !nonOperating.test(`${category} ${normalize(transaction.subcategory || "")}`);
}

/** Explicit independent axis ceilings keep small budget allocations visible beside large actuals. */
export function allocationAxisMaximum(values: number[]): number {
  return Math.max(1, ...values.filter(Number.isFinite).map((value) => Math.max(0, value))) * 1.25;
}

/** Reuse the workspace's closing cash series, never introduce a new opening balance. */
export function operatingRunway(series: MonthlySummary[], operatingSpend: number): number | null {
  const months = series.filter((month) => month.revenue !== 0 || month.expense !== 0).length;
  if (!months || operatingSpend <= 0) return null;
  const cash = series.at(-1)?.cash;
  if (cash === undefined || !Number.isFinite(cash)) return null;
  return Math.max(0, cash) / (operatingSpend / months);
}
// Zero-hardcoding schema inspector: looks at the first rows of ANY uploaded
// dataset and classifies each column by role (numeric / categorical / date /
// risk flag) so KPIs, charts and metrics can configure themselves.

import { parseNum } from "@/lib/column-map";

export interface SchemaInspection {
  columns: string[];
  numeric: string[];
  categorical: string[];
  dates: string[];
  flags: string[];
}

const canon = (k: string) => k.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

const MONEY_WORDS = [
  "amount", "net", "gross", "balance", "revenue", "income", "sales", "price", "cost",
  "expense", "salary", "pay", "value", "total", "qty", "quantity", "debit", "credit", "tax",
];
const CATEGORY_WORDS = [
  "category", "type", "department", "status", "vendor", "client", "party", "account",
  "class", "head", "ledger", "branch", "region", "mode", "group", "name", "employee",
];
const DATE_WORDS = ["date", "time", "created", "updated", "period", "month", "year", "due"];
const FLAG_WORDS = ["fraud", "risk", "flag", "anomaly", "status", "approval", "approved", "exception", "duplicate"];

const looksNumeric = (values: unknown[]) => {
  const filled = values.filter((v) => v !== null && v !== undefined && String(v).trim() !== "");
  if (!filled.length) return false;
  const numeric = filled.filter((v) => {
    const s = String(v).replace(/[₹$,€£\s]/g, "");
    return s !== "" && !Number.isNaN(Number(s));
  });
  return numeric.length / filled.length >= 0.7;
};

const looksDate = (values: unknown[]) => {
  const filled = values.filter((v) => v !== null && v !== undefined && String(v).trim() !== "");
  if (!filled.length) return false;
  const ok = filled.filter((v) => {
    const s = String(v).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return true;
    if (/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(s)) return true;
    return /[a-z]/i.test(s) && !Number.isNaN(Date.parse(s));
  });
  return ok.length / filled.length >= 0.6;
};

/** Inspect the first `sampleSize` rows and classify every column. */
export function inspectSchema(rows: Record<string, unknown>[], sampleSize = 10): SchemaInspection {
  const sample = rows.slice(0, Math.max(sampleSize, 1));
  const columns = Array.from(new Set(sample.flatMap((r) => (r ? Object.keys(r) : []))));
  const numeric: string[] = [];
  const categorical: string[] = [];
  const dates: string[] = [];
  const flags: string[] = [];

  columns.forEach((col) => {
    const c = canon(col);
    const values = sample.map((r) => r?.[col]);
    const named = (words: string[]) => words.some((w) => c.includes(w));

    if (named(DATE_WORDS) || looksDate(values)) dates.push(col);
    else if (named(MONEY_WORDS) && looksNumeric(values)) numeric.push(col);
    else if (looksNumeric(values)) numeric.push(col);
    else categorical.push(col);

    if (named(FLAG_WORDS)) flags.push(col);
  });

  // Prefer explicitly-named grouping columns first.
  categorical.sort((a, b) => {
    const rank = (k: string) => (CATEGORY_WORDS.some((w) => canon(k).includes(w)) ? 0 : 1);
    return rank(a) - rank(b);
  });

  return { columns, numeric, categorical, dates, flags };
}

const RISK_WORDS = ["yes", "true", "1", "fraud", "flag", "flagged", "overdue", "pending", "rejected", "fail", "high", "anomaly", "duplicate", "unpaid", "outstanding"];

/** Count rows whose flag columns indicate a warning or anomaly. */
export function countRiskRows(rows: Record<string, unknown>[], schema: SchemaInspection): number {
  if (!schema.flags.length) return 0;
  let count = 0;
  rows.forEach((row) => {
    const hit = schema.flags.some((col) => {
      const raw = row?.[col];
      if (raw === null || raw === undefined || raw === "") return false;
      if (typeof raw === "boolean") return raw;
      const s = String(raw).trim().toLowerCase();
      if (canon(col).includes("risk") || canon(col).includes("score")) return parseNum(raw) >= 70;
      return RISK_WORDS.includes(s);
    });
    if (hit) count += 1;
  });
  return count;
}

/** Generic fallback distribution: group rows by a categorical column, summing a numeric column when available. */
export function distribution(
  rows: Record<string, unknown>[],
  groupBy: string,
  valueColumn?: string,
  limit = 5,
): { name: string; value: number }[] {
  const acc = new Map<string, number>();
  rows.forEach((row) => {
    const key = String(row?.[groupBy] ?? "").trim() || "Unspecified";
    const add = valueColumn ? Math.abs(parseNum(row?.[valueColumn])) : 1;
    acc.set(key, (acc.get(key) ?? 0) + add);
  });
  return [...acc.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, value]) => ({ name, value }));
}

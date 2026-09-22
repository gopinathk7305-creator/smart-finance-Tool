// Dynamic column auto-mapper: uploaded files rarely use our canonical column
// names, so we fuzzy-match whatever headers a dataset actually has onto the
// financial metrics the dashboard needs (revenue / expense / date / category).

import type { Transaction } from "@/lib/finance-data";

export const parseNum = (val: unknown): number => {
  if (typeof val === "number") return Number.isFinite(val) ? val : 0;
  if (val === null || val === undefined) return 0;
  const n = parseFloat(String(val).replace(/[^0-9.-]+/g, ""));
  return Number.isFinite(n) ? n : 0;
};

export interface ColumnMap {
  revenue?: string;
  cogs?: string;
  expense?: string;
  amount?: string;
  date?: string;
  category?: string;
  type?: string;
  party?: string;
  gst?: string;
}

// Order matters: roles are resolved top-down, so the more specific role claims
// its column before a broader one can swallow it (cogs before expense, and
// "total amount" stays with `amount` so the type/sign path still classifies it).
const SIGNALS: Record<keyof ColumnMap, string[]> = {
  revenue: ["revenue", "income", "sales", "credit", "amount_in", "inflow", "receipt", "turnover", "gross_sales"],
  cogs: [
    "cost_of_goods_sold",
    "cogs",
    "cost_of_sales",
    "cost_of_goods",
    "direct_expenses",
    "direct_expense",
    "direct_cost",
    "purchase_amount",
    "purchases",
    "purchase",
    "vendor_payout",
    "cost_of_revenue",
    "material_cost",
  ],
  expense: ["expense", "cost", "debit", "payout", "spending", "spend", "amount_out", "outflow", "payment"],
  amount: ["net_amount", "total_amount", "gross_amount", "amount", "value", "total"],
  date: ["txn_date", "transaction_date", "invoice_date", "date", "created", "time", "period", "month"],
  category: ["category", "sub_category", "subcategory", "department", "class", "head", "ledger", "type"],
  type: ["txn_type", "transaction_type", "entry_type", "dr_cr", "type", "nature"],
  party: ["vendor_client", "vendor", "client", "party_name", "party", "customer", "supplier", "name"],
  gst: ["gst_amount", "gst", "tax_amount", "cgst", "sgst", "igst", "vat", "tax"],
};

/** COGS category label used so downstream P&L rollups recognise the bucket. */
export const COGS_LABEL = "COGS";


const canon = (k: string) => k.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

/** Fuzzy-match the keys of a dataset row onto financial roles. */
export function detectColumns(rows: Record<string, unknown>[]): ColumnMap {
  const sample = rows.find((r) => r && Object.keys(r).length) ?? {};
  const keys = Object.keys(sample);
  const pairs = keys.map((k) => ({ key: k, c: canon(k) }));
  const map: ColumnMap = {};

  (Object.keys(SIGNALS) as (keyof ColumnMap)[]).forEach((role) => {
    for (const frag of SIGNALS[role]) {
      const hit = pairs.find((p) => p.c === frag) ?? pairs.find((p) => p.c.includes(frag));
      if (hit && !Object.values(map).includes(hit.key)) {
        map[role] = hit.key;
        return;
      }
    }
  });

  // A numeric-looking column is a better "amount" than nothing at all.
  if (!map.amount && !map.revenue && !map.expense && !map.cogs) {
    const numeric = pairs.find((p) => rows.slice(0, 25).some((r) => parseNum(r[p.key]) !== 0));
    if (numeric) map.amount = numeric.key;
  }

  return map;
}

const isoDate = (val: unknown): string => {
  if (!val) return "";
  const s = String(val).trim();
  const direct = /^\d{4}-\d{2}-\d{2}/.exec(s);
  if (direct) return s.slice(0, 10);
  const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/.exec(s);
  if (dmy) {
    const [, d, m, y] = dmy;
    const year = y!.length === 2 ? `20${y}` : y!;
    return `${year}-${m!.padStart(2, "0")}-${d!.padStart(2, "0")}`;
  }
  const parsed = Date.parse(s);
  return Number.isNaN(parsed) ? "" : new Date(parsed).toISOString().slice(0, 10);
};

const INCOME_WORDS = ["income", "revenue", "credit", "cr", "sale", "sales", "inflow", "receipt"];

/**
 * Normalise arbitrary rows into transaction shape using the detected mapping.
 * Revenue / expense are inferred from dedicated columns when present, otherwise
 * from a type column, otherwise from the sign of the amount.
 */
export function mapRowsToTransactions(
  rows: Record<string, unknown>[],
  map: ColumnMap = detectColumns(rows),
): Transaction[] {
  const out: Transaction[] = [];
  rows.forEach((row, i) => {
    const date = map.date ? isoDate(row[map.date]) : "";
    const category = map.category ? String(row[map.category] ?? "").trim() || "Uncategorised" : "Uncategorised";
    const party = map.party ? String(row[map.party] ?? "").trim() : "";
    const base = { date, category, subcategory: "", vendor_client: party, status: "paid" as const };

    const rev = map.revenue ? parseNum(row[map.revenue]) : 0;
    const exp = map.expense ? parseNum(row[map.expense]) : 0;
    const cogs = map.cogs ? parseNum(row[map.cogs]) : 0;
    if (rev || exp || cogs) {
      if (rev) out.push({ ...base, id: `${i}-r`, type: "income", amount: Math.abs(rev) });
      // Direct cost lands in its own COGS category so gross profit = revenue - COGS.
      if (cogs)
        out.push({
          ...base,
          category: COGS_LABEL,
          id: `${i}-c`,
          type: "expense",
          amount: Math.abs(cogs),
        });
      if (exp) out.push({ ...base, id: `${i}-e`, type: "expense", amount: Math.abs(exp) });
      return;
    }

    const amount = map.amount ? parseNum(row[map.amount]) : 0;
    if (!amount) return;
    const typeText = map.type ? String(row[map.type] ?? "").trim().toLowerCase() : "";
    const income = typeText ? INCOME_WORDS.some((w) => typeText === w || typeText.includes(w)) : amount > 0;
    out.push({ ...base, id: `${i}-a`, type: income ? "income" : "expense", amount: Math.abs(amount) });
  });
  return out;
}

/** Safe margin: never NaN or -Infinity. */
export const safeMargin = (netProfit: number, revenue: number) =>
  revenue > 0 && Number.isFinite(netProfit) ? (netProfit / revenue) * 100 : 0;

/** Safe percentage-of-whole, always a finite number. */
export const safePct = (part: number, whole: number) =>
  whole !== 0 && Number.isFinite(part) && Number.isFinite(whole) ? (part / whole) * 100 : 0;

/** Format a percentage for display; non-finite or missing base renders as "—". */
export const pctLabel = (part: number, whole: number, digits = 1) =>
  whole > 0 && Number.isFinite(part) ? `${((part / whole) * 100).toFixed(digits)}%` : "—";


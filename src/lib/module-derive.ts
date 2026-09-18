// Cross-module fuzzy derivation.
//
// A generic uploaded file rarely lands in every canonical table: a single CSV
// may only fill `transactions`, leaving Payroll, Cash Flow and Budget modules
// with nothing to show. This module maps whatever columns the active dataset
// actually has onto each module's shape, so switching datasets populates all
// pages instead of rendering ₹0 cards.

import { detectColumns, parseNum } from "@/lib/column-map";
import type { ArApRecord, BudgetTarget, PayrollRecord, Transaction } from "@/lib/finance-data";

const canon = (k: string) => k.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

/** Fuzzy column pick: exact canonical match first, then substring match. */
export function pickColumn(rows: Record<string, unknown>[], signals: string[]): string | undefined {
  const sample = rows.find((r) => r && Object.keys(r).length) ?? {};
  const pairs = Object.keys(sample).map((key) => ({ key, c: canon(key) }));
  for (const frag of signals) {
    const hit = pairs.find((p) => p.c === frag) ?? pairs.find((p) => p.c.includes(frag));
    if (hit) return hit.key;
  }
  return undefined;
}

const str = (row: Record<string, unknown>, col?: string) =>
  col ? String(row[col] ?? "").trim() : "";

const isoish = (val: unknown): string => {
  const s = String(val ?? "").trim();
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/.exec(s);
  if (dmy) {
    const [, d, m, y] = dmy;
    const year = y!.length === 2 ? `20${y}` : y!;
    return `${year}-${m!.padStart(2, "0")}-${d!.padStart(2, "0")}`;
  }
  const parsed = Date.parse(s);
  return Number.isNaN(parsed) ? "" : new Date(parsed).toISOString().slice(0, 10);
};

/* ------------------------------- payroll -------------------------------- */

const PAYROLL_SIGNALS = {
  basic: ["basic_pay", "basic_salary", "basic", "gross_salary", "salary", "ctc", "wage", "payroll"],
  allowances: ["allowances", "allowance", "hra", "bonus", "incentive", "reimbursement"],
  deductions: ["total_deduction", "deductions", "deduction"],
  pf: ["pf_deduction", "provident_fund", "epf", "pf", "esi", "esic"],
  tds: ["tds_deduction", "tds", "income_tax", "tax_deducted", "tax"],
  net: ["net_pay", "net_salary", "take_home", "net_amount"],
  name: ["employee_name", "emp_name", "employee", "name"],
  dept: ["department", "dept", "division", "team", "cost_centre", "cost_center"],
  empId: ["employee_id", "emp_id", "emp_code", "employee_code", "staff_id"],
  month: ["month_year", "pay_month", "salary_month", "month", "period", "pay_date", "date"],
};

/**
 * Payroll records from any dataset. Uses real payroll columns when present,
 * otherwise groups expense/outflow rows by department or category so the module
 * still shows meaningful cost buckets.
 */
export function derivePayroll(rows: Record<string, unknown>[], txns: Transaction[] = []): PayrollRecord[] {
  if (!rows.length) return [];
  const col = {
    basic: pickColumn(rows, PAYROLL_SIGNALS.basic),
    allowances: pickColumn(rows, PAYROLL_SIGNALS.allowances),
    deductions: pickColumn(rows, PAYROLL_SIGNALS.deductions),
    pf: pickColumn(rows, PAYROLL_SIGNALS.pf),
    tds: pickColumn(rows, PAYROLL_SIGNALS.tds),
    net: pickColumn(rows, PAYROLL_SIGNALS.net),
    name: pickColumn(rows, PAYROLL_SIGNALS.name),
    dept: pickColumn(rows, PAYROLL_SIGNALS.dept),
    empId: pickColumn(rows, PAYROLL_SIGNALS.empId),
    month: pickColumn(rows, PAYROLL_SIGNALS.month),
  };

  const hasPay = !!(col.basic || col.net);
  if (hasPay) {
    return rows
      .map((row, i) => {
        const basic = parseNum(row[col.basic ?? ""]) || parseNum(row[col.net ?? ""]);
        if (!basic) return null;
        return {
          id: `d-pay-${i}`,
          month_year: isoish(row[col.month ?? ""]) || str(row, col.month),
          employee_id: str(row, col.empId) || `E${i + 1}`,
          name: str(row, col.name) || `Employee ${i + 1}`,
          department: str(row, col.dept) || "Unspecified",
          basic_pay: Math.abs(basic),
          allowances: Math.abs(parseNum(row[col.allowances ?? ""])),
          deductions: Math.abs(parseNum(row[col.deductions ?? ""])),
          pf_deduction: Math.abs(parseNum(row[col.pf ?? ""])),
          tds_deduction: Math.abs(parseNum(row[col.tds ?? ""])),
        } satisfies PayrollRecord;
      })
      .filter((r): r is PayrollRecord => r !== null);
  }

  // Smart fallback: outflow rows grouped by department / category.
  const groups = new Map<string, { amount: number; month: string }>();
  txns
    .filter((t) => t.type === "expense" && t.amount > 0)
    .forEach((t) => {
      const key = t.category || t.subcategory || "Operating cost";
      const prev = groups.get(key);
      groups.set(key, { amount: (prev?.amount ?? 0) + t.amount, month: prev?.month ?? t.date });
    });

  return [...groups.entries()].map(([key, g], i) => ({
    id: `d-cost-${i}`,
    month_year: g.month,
    employee_id: `G${i + 1}`,
    name: key,
    department: key,
    basic_pay: g.amount,
    allowances: 0,
    deductions: 0,
    pf_deduction: 0,
    tds_deduction: 0,
  }));
}

/* -------------------------------- AR / AP -------------------------------- */

const AR_WORDS = ["receivable", "invoice", "customer", "client", "debtor", "ar"];
const AP_WORDS = ["payable", "vendor", "supplier", "creditor", "bill", "ap"];

/** Receivables / payables from any dataset carrying a party, amount and a due or invoice date. */
export function deriveArAp(rows: Record<string, unknown>[]): ArApRecord[] {
  if (!rows.length) return [];
  const party = pickColumn(rows, ["party_name", "party", "customer", "client", "vendor", "supplier", "name"]);
  const amount = pickColumn(rows, ["outstanding", "balance", "invoice_amount", "amount", "total", "value"]);
  const due = pickColumn(rows, ["due_date", "payment_due", "due"]);
  const invoice = pickColumn(rows, ["invoice_date", "bill_date", "date"]);
  const typeCol = pickColumn(rows, ["ar_ap", "ledger_type", "invoice_type", "type", "category"]);
  const statusCol = pickColumn(rows, ["payment_status", "status", "paid"]);
  if (!party || !amount || !(due || invoice)) return [];

  return rows
    .map((row, i) => {
      const value = Math.abs(parseNum(row[amount]));
      if (!value) return null;
      const hint = `${str(row, typeCol)} ${str(row, party)}`.toLowerCase();
      const isAp = AP_WORDS.some((w) => hint.includes(w)) && !AR_WORDS.some((w) => hint.includes(w));
      const statusText = str(row, statusCol).toLowerCase();
      const settled = ["paid", "settled", "closed", "cleared", "received"].some((w) => statusText.includes(w));
      return {
        id: `d-arap-${i}`,
        type: isAp ? ("AP" as const) : ("AR" as const),
        party_name: str(row, party) || `Party ${i + 1}`,
        invoice_date: isoish(row[invoice ?? ""]),
        due_date: isoish(row[due ?? ""]) || isoish(row[invoice ?? ""]),
        amount: value,
        status: settled ? ("settled" as const) : ("outstanding" as const),
      } satisfies ArApRecord;
    })
    .filter((r): r is ArApRecord => r !== null);
}

/* -------------------------------- budget --------------------------------- */

/** Budget targets from any dataset carrying a budget / target / planned column. */
export function deriveBudget(rows: Record<string, unknown>[]): BudgetTarget[] {
  if (!rows.length) return [];
  const budget = pickColumn(rows, ["budgeted_amount", "budget_amount", "budget", "target", "planned", "forecast", "plan"]);
  if (!budget) return [];
  const category = pickColumn(rows, ["category", "head", "account", "expense_type", "class"]);
  const dept = pickColumn(rows, ["department", "dept", "division", "team"]);
  const fy = pickColumn(rows, ["fiscal_year", "fy", "financial_year", "year"]);

  const acc = new Map<string, { amount: number; dept: string; fy: string }>();
  rows.forEach((row) => {
    const amount = Math.abs(parseNum(row[budget]));
    if (!amount) return;
    const key = str(row, category) || str(row, dept) || "Uncategorised";
    const prev = acc.get(key);
    acc.set(key, {
      amount: (prev?.amount ?? 0) + amount,
      dept: prev?.dept || str(row, dept) || "All",
      fy: prev?.fy || str(row, fy) || "",
    });
  });

  return [...acc.entries()].map(([category_name, g], i) => ({
    id: `d-bud-${i}`,
    fiscal_year: g.fy,
    category: category_name,
    department: g.dept,
    budgeted_amount: g.amount,
  }));
}

/* ---------------------------------- GST ---------------------------------- */

export interface GstPosition {
  outputGst: number;
  inputCredit: number;
  payable: number;
  /** true when real tax columns were found, false when estimated at 18%. */
  fromColumns: boolean;
  source: string;
}

const GST_SIGNALS = ["gst_amount", "output_gst", "gst", "tax_amount", "cgst", "sgst", "igst", "vat", "tax"];
const ITC_SIGNALS = ["input_tax_credit", "itc", "input_gst", "input_credit", "purchase_tax"];

/**
 * GST position from the active dataset. Uses explicit tax columns (GST / tax
 * amount / CGST+SGST+IGST) when present, splitting them into output tax on
 * income rows and input credit on expense rows; otherwise estimates both at the
 * 18% standard rate on taxable revenue and expenses.
 */
export function deriveGst(
  rows: Record<string, unknown>[],
  revenue: number,
  expense: number,
  rate = 0.18,
): GstPosition {
  const estimate = (): GstPosition => ({
    outputGst: Math.round(Math.max(0, revenue) * rate),
    inputCredit: Math.round(Math.max(0, expense) * 0.6 * rate),
    payable: Math.round(Math.max(0, revenue) * rate) - Math.round(Math.max(0, expense) * 0.6 * rate),
    fromColumns: false,
    source: `Estimated at ${(rate * 100).toFixed(0)}% standard rate`,
  });

  if (!rows.length) return estimate();

  const sample = rows.find((r) => r && Object.keys(r).length) ?? {};
  const keys = Object.keys(sample);
  const taxCols = keys.filter((k) => GST_SIGNALS.some((s) => canon(k) === s || canon(k).includes(s)));
  const itcCols = keys.filter((k) => ITC_SIGNALS.some((s) => canon(k) === s || canon(k).includes(s)));
  if (!taxCols.length && !itcCols.length) return estimate();

  const map = detectColumns(rows);
  const rowTax = (row: Record<string, unknown>, cols: string[]) =>
    cols.reduce((s, c) => s + Math.abs(parseNum(row[c])), 0);

  let output = 0;
  let credit = 0;
  rows.forEach((row) => {
    const tax = rowTax(row, taxCols);
    const itc = rowTax(row, itcCols);
    credit += itc;
    if (!tax) return;

    const rev = map.revenue ? parseNum(row[map.revenue]) : 0;
    const exp = map.expense ? parseNum(row[map.expense]) : 0;
    const cogs = map.cogs ? parseNum(row[map.cogs]) : 0;
    const typeText = map.type ? String(row[map.type] ?? "").trim().toLowerCase() : "";
    const amount = map.amount ? parseNum(row[map.amount]) : 0;

    let income: boolean;
    if (rev || exp || cogs) income = rev > 0 && rev >= exp + cogs;
    else if (typeText)
      income = ["income", "revenue", "credit", "cr", "sale", "sales", "inflow", "receipt"].some(
        (w) => typeText === w || typeText.includes(w),
      );
    else income = amount >= 0;

    if (income) output += tax;
    else credit += tax;
  });

  if (output === 0 && credit === 0) return estimate();
  return {
    outputGst: Math.round(output),
    inputCredit: Math.round(credit),
    payable: Math.round(output - credit),
    fromColumns: true,
    source: `From ${[...taxCols, ...itcCols].join(", ")}`,
  };
}

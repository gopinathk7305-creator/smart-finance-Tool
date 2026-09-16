// Automated data cleaning / ETL pipeline used by the Data Upload module.
// Reads CSV + Excel, cleans and casts every field, records a health report,
// and returns rows ready to insert into the cloud database.

import { parseCSV, toNumber } from "@/lib/csv";
import { computeTax } from "@/lib/enterprise-data";
import type { PayrollRecord } from "@/lib/finance-data";

export type DatasetKey = "transactions" | "payroll" | "budget" | "arap";

export type Severity = "error" | "warning" | "fixed";

export interface Issue {
  row: number;
  field: string;
  value: string;
  issue: string;
  severity: Severity;
}

export interface EtlResult {
  fileName: string;
  rows: Record<string, unknown>[];
  issues: Issue[];
  preview: Record<string, string>[];
  total: number;
  clean: number;
}

/* ---------------------------------------------- readers */

export async function readTabular(file: File): Promise<Record<string, string>[]> {
  if (/\.csv$/i.test(file.name)) return parseCSV(await file.text());
  if (/\.xlsx?$/i.test(file.name)) {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
    const sheet = wb.Sheets[wb.SheetNames[0]!];
    if (!sheet) return [];
    const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { raw: false, defval: "" });
    return json.map((r) => {
      const out: Record<string, string> = {};
      Object.entries(r).forEach(([k, v]) => {
        out[String(k).trim().toLowerCase().replace(/\s+/g, "_")] = v == null ? "" : String(v);
      });
      return out;
    });
  }
  throw new Error("Unsupported file — upload .csv, .xls or .xlsx");
}

/* ---------------------------------------------- cleaners */

const UNASSIGNED = "Unassigned";

/** Step 1 — whitespace + special character trimming. */
export function cleanText(v: unknown): string {
  return String(v ?? "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** Normalise category-like text to Title Case. */
export function normaliseLabel(v: unknown): string {
  const t = cleanText(v);
  if (!t) return "";
  return t
    .split(" ")
    .map((w) => (w.length <= 3 && w === w.toUpperCase() ? w : w[0]!.toUpperCase() + w.slice(1).toLowerCase()))
    .join(" ");
}

/** Step 2 — strip currency symbols / text and cast to float. */
export function cleanAmount(v: unknown): { value: number; blank: boolean; negative: boolean } {
  const raw = cleanText(v);
  if (!raw) return { value: 0, blank: true, negative: false };
  const n = toNumber(raw.replace(/[₹$€£,]/g, ""));
  return { value: Math.abs(n), blank: n === 0, negative: n < 0 };
}

/** Step 2 — date detection + validation (rejects impossible calendar dates). */
export function cleanDate(v: unknown): { iso: string | null; raw: string } {
  const raw = cleanText(v);
  if (!raw) return { iso: null, raw };
  const m =
    raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/) ??
    (() => {
      const d = raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
      return d ? ([d[0], d[3], d[2], d[1]] as unknown as RegExpMatchArray) : null;
    })();
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    const dt = new Date(Date.UTC(y, mo - 1, d));
    const ok =
      mo >= 1 && mo <= 12 && d >= 1 && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
    return { iso: ok ? dt.toISOString().slice(0, 10) : null, raw };
  }
  const parsed = Date.parse(raw);
  return { iso: Number.isNaN(parsed) ? null : new Date(parsed).toISOString().slice(0, 10), raw };
}

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

export function cleanTaxId(v: unknown, kind: "gstin" | "pan"): { value: string; valid: boolean } {
  const value = cleanText(v).toUpperCase().replace(/\s/g, "");
  if (!value) return { value: "", valid: true };
  return { value, valid: (kind === "gstin" ? GSTIN_RE : PAN_RE).test(value) };
}

/* ---------------------------------------------- dynamic schema mapping */

/**
 * Any custom dataset works: header variants are mapped onto the canonical
 * field names the pipeline understands, whatever the file calls them.
 */
const ALIASES: Record<string, string[]> = {
  date: ["date", "txn_date", "transaction_date", "posting_date", "voucher_date", "bill_date", "entry_date"],
  amount: ["amount", "total", "total_amount", "value", "net_amount", "grand_total", "debit", "credit", "amt"],
  category: ["category", "expense_type", "expense_category", "head", "account_head", "ledger", "gl_account"],
  subcategory: ["subcategory", "sub_category", "sub_head", "detail"],
  type: ["type", "txn_type", "transaction_type", "direction", "nature", "dr_cr"],
  vendor_client: ["vendor_client", "vendor", "client", "customer", "party", "supplier", "payee", "counterparty"],
  status: ["status", "payment_status", "state", "paid_status"],
  gstin: ["gstin", "gst_no", "gst_number", "gst", "tax_id", "gstin_no"],
  pan: ["pan", "pan_no", "pan_number"],
  party_name: ["party_name", "party", "vendor", "client", "customer", "supplier", "account_name"],
  invoice_date: ["invoice_date", "bill_date", "doc_date", "date"],
  due_date: ["due_date", "maturity_date", "payment_due", "due"],
  month_year: ["month_year", "month", "period", "salary_month", "pay_period"],
  employee_id: ["employee_id", "emp_id", "employee_code", "empcode", "staff_id"],
  name: ["name", "employee_name", "emp_name", "full_name"],
  department: ["department", "dept", "division", "cost_centre", "cost_center"],
  basic_pay: ["basic_pay", "basic", "basic_salary", "base_pay"],
  allowances: ["allowances", "allowance", "hra", "other_allowances"],
  deductions: ["deductions", "deduction", "other_deductions"],
  pf_deduction: ["pf_deduction", "pf", "provident_fund", "epf"],
  tds_deduction: ["tds_deduction", "tds", "income_tax", "tax_deducted"],
  fiscal_year: ["fiscal_year", "fy", "financial_year", "year"],
  budgeted_amount: ["budgeted_amount", "budget", "planned_amount", "plan", "target", "budget_amount"],
};

const canon = (h: string) => h.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

/** Rewrites every row's keys onto canonical field names, keeping originals too. */
export function mapSchema(rows: Record<string, string>[]): Record<string, string>[] {
  if (!rows.length) return rows;
  const headers = Object.keys(rows[0]!);
  const map = new Map<string, string>();
  Object.entries(ALIASES).forEach(([field, variants]) => {
    const hit = headers.find((h) => variants.includes(canon(h)));
    if (hit) map.set(hit, field);
  });
  return rows.map((r) => {
    const out: Record<string, string> = {};
    Object.entries(r).forEach(([k, v]) => {
      out[canon(k)] = v;
      const field = map.get(k);
      if (field && out[field] === undefined) out[field] = v;
    });
    return out;
  });
}

/* ---------------------------------------------- pipeline */

export function runEtl(
  key: DatasetKey,
  rawInput: Record<string, string>[],
  userId: string,
  fileName: string,
  autoFix: boolean,
): EtlResult {
  const raw = mapSchema(rawInput);
  const issues: Issue[] = [];
  const rows: Record<string, unknown>[] = [];
  const seen = new Set<string>();

  const add = (row: number, field: string, value: string, issue: string, severity: Severity) =>
    issues.push({ row, field, value, issue, severity });

  raw.forEach((r, i) => {
    const line = i + 2;

    if (key === "transactions") {
      const date = cleanDate(r["date"] ?? r["txn_date"]);
      const amount = cleanAmount(r["amount"]);
      const category = normaliseLabel(r["category"]);
      const vendor = cleanText(r["vendor_client"] || r["vendor"] || r["client"]);
      const gstin = cleanTaxId(r["gstin"], "gstin");

      if (!date.iso) {
        if (!autoFix) {
          add(line, "date", date.raw || "(blank)", "Invalid or missing date format", "error");
          return;
        }
        add(line, "date", date.raw || "(blank)", "Invalid date replaced with upload date", "fixed");
      }
      if (amount.blank) {
        if (!autoFix) {
          add(line, "amount", cleanText(r["amount"]) || "(blank)", "Missing or zero amount", "error");
          return;
        }
        add(line, "amount", "(blank)", "Missing amount defaulted to 0.00", "fixed");
      }
      if (amount.negative)
        add(line, "amount", cleanText(r["amount"]), "Negative value converted to positive", "fixed");
      if (!category) add(line, "category", "(blank)", `Category set to ${UNASSIGNED}`, "fixed");
      if (!gstin.valid) add(line, "gstin", gstin.value, "GSTIN format looks invalid", "warning");

      const dedupe = `${date.iso}|${amount.value}|${vendor.toLowerCase()}`;
      if (seen.has(dedupe))
        add(line, "vendor_client", vendor, "Possible duplicate invoice (same date, vendor, amount)", "warning");
      seen.add(dedupe);

      const status = cleanText(r["status"]).toLowerCase() === "pending" ? "pending" : "paid";
      if (status === "pending") add(line, "status", "pending", "Unpaid invoice — affects AR/AP aging", "warning");

      rows.push({
        user_id: userId,
        txn_date: date.iso ?? new Date().toISOString().slice(0, 10),
        category: category || UNASSIGNED,
        subcategory: normaliseLabel(r["subcategory"]),
        type: ["income", "revenue", "credit", "sales", "inflow", "in"].includes(
          cleanText(r["type"]).toLowerCase(),
        )
          ? "income"
          : "expense",
        amount: amount.value,
        vendor_client: vendor || UNASSIGNED,
        status,
        source_file: fileName,
      });
      return;
    }

    if (key === "payroll") {
      const basic = cleanAmount(r["basic_pay"]);
      if (basic.blank) {
        if (!autoFix) {
          add(line, "basic_pay", cleanText(r["basic_pay"]) || "(blank)", "Missing basic pay", "error");
          return;
        }
        add(line, "basic_pay", "(blank)", "Basic pay defaulted to 0.00", "fixed");
      }
      const allowances = cleanAmount(r["allowances"]).value;
      const otherDed = cleanAmount(r["deductions"]).value;
      const pf = cleanAmount(r["pf_deduction"]).value || Math.round(basic.value * 0.12);
      const pan = cleanTaxId(r["pan"], "pan");
      if (!pan.valid) add(line, "pan", pan.value, "PAN format looks invalid", "warning");
      const name = cleanText(r["name"] || r["employee_name"]);
      if (!name) add(line, "name", "(blank)", `Employee name set to ${UNASSIGNED}`, "fixed");

      const computed = computeTax(
        {
          employee_id: "",
          name: "",
          department: "",
          month_year: "",
          basic_pay: basic.value,
          allowances,
          deductions: otherDed,
          pf_deduction: pf,
          tds_deduction: 0,
        } as PayrollRecord,
        "new",
      );

      rows.push({
        user_id: userId,
        month_year: cleanText(r["month_year"]),
        employee_id: cleanText(r["employee_id"]) || `EMP-${line}`,
        name: name || UNASSIGNED,
        department: normaliseLabel(r["department"]) || UNASSIGNED,
        basic_pay: basic.value,
        allowances,
        deductions: otherDed,
        pf_deduction: pf,
        tds_deduction: cleanAmount(r["tds_deduction"]).value || computed.monthlyTds,
        source_file: fileName,
      });
      return;
    }

    if (key === "budget") {
      const amt = cleanAmount(r["budgeted_amount"]);
      const category = normaliseLabel(r["category"]);
      if (!category) {
        if (!autoFix) {
          add(line, "category", "(blank)", "Missing category", "error");
          return;
        }
        add(line, "category", "(blank)", `Category set to ${UNASSIGNED}`, "fixed");
      }
      if (amt.blank) {
        if (!autoFix) {
          add(line, "budgeted_amount", "(blank)", "Missing budget amount", "error");
          return;
        }
        add(line, "budgeted_amount", "(blank)", "Budget defaulted to 0.00", "fixed");
      }
      rows.push({
        user_id: userId,
        fiscal_year: cleanText(r["fiscal_year"]) || "FY2026",
        category: category || UNASSIGNED,
        department: normaliseLabel(r["department"]) || UNASSIGNED,
        budgeted_amount: amt.value,
        source_file: fileName,
      });
      return;
    }

    // AR / AP
    const amt = cleanAmount(r["amount"]);
    const party = cleanText(r["party_name"] || r["party"]);
    const inv = cleanDate(r["invoice_date"]);
    const due = cleanDate(r["due_date"]);
    if (!party) {
      if (!autoFix) {
        add(line, "party_name", "(blank)", "Missing party name", "error");
        return;
      }
      add(line, "party_name", "(blank)", `Party set to ${UNASSIGNED}`, "fixed");
    }
    if (amt.blank) {
      if (!autoFix) {
        add(line, "amount", cleanText(r["amount"]) || "(blank)", "Missing invoice amount", "error");
        return;
      }
      add(line, "amount", "(blank)", "Amount defaulted to 0.00", "fixed");
    }
    if (!inv.iso && inv.raw) add(line, "invoice_date", inv.raw, "Invalid invoice date format", "warning");
    if (!due.iso && due.raw) add(line, "due_date", due.raw, "Invalid due date format", "warning");
    const dedupe = `${party.toLowerCase()}|${inv.iso}|${amt.value}`;
    if (seen.has(dedupe)) add(line, "party_name", party, "Duplicate invoice for same party/date/amount", "warning");
    seen.add(dedupe);

    rows.push({
      user_id: userId,
      type: cleanText(r["type"]).toUpperCase() === "AP" ? "AP" : "AR",
      party_name: party || UNASSIGNED,
      invoice_date: inv.iso,
      due_date: due.iso,
      amount: amt.value,
      status: cleanText(r["status"]).toLowerCase() === "settled" ? "settled" : "outstanding",
      source_file: fileName,
    });
  });

  return {
    fileName,
    rows,
    issues,
    preview: raw.slice(0, 10).map((r) => {
      const out: Record<string, string> = {};
      Object.entries(r).forEach(([k, v]) => (out[k] = cleanText(v)));
      return out;
    }),
    total: raw.length,
    clean: rows.length,
  };
}

export const issueTone = (s: Severity) =>
  s === "error" ? "text-danger" : s === "warning" ? "text-warning" : "text-success";

/* ---------------------------------------------- streaming reader (large files) */

export interface StreamProgress {
  phase: "parsing";
  rows: number;
  bytesDone: number;
  bytesTotal: number;
  etaSeconds: number | null;
}

/** Header normalisation — runs on the main thread, never inside the worker config. */
const normaliseHeader = (h: string) => h.trim().toLowerCase().replace(/\s+/g, "_");

/** Rewrites each parsed row's keys to normalised headers (worker results arrive raw). */
function normaliseRows(rows: Record<string, unknown>[]): Record<string, string>[] {
  return rows.map((row) => {
    const out: Record<string, string> = {};
    Object.entries(row).forEach(([k, v]) => {
      out[normaliseHeader(String(k))] = v == null ? "" : String(v);
    });
    return out;
  });
}

/**
 * Streams a CSV in 5,000-row chunks inside a Web Worker so the UI thread never
 * blocks on 50,000+ row files. Excel files fall back to the buffered reader.
 *
 * NOTE: PapaParse posts the options object to the worker and only strips
 * step/chunk/complete/error — inline helpers like `transformHeader` would fail
 * with "function could not be cloned". So the worker config stays free of any
 * function values and headers are sanitised in the chunk/complete callbacks
 * after the worker finishes parsing.
 */
export async function streamTabular(
  file: File,
  onProgress: (p: StreamProgress) => void,
  chunkSize = 5000,
): Promise<Record<string, string>[]> {
  if (!/\.csv$/i.test(file.name)) {
    const rows = await readTabular(file);
    onProgress({ phase: "parsing", rows: rows.length, bytesDone: file.size, bytesTotal: file.size, etaSeconds: 0 });
    return rows;
  }

  const Papa = (await import("papaparse")).default;
  const started = Date.now();
  const all: Record<string, string>[] = [];

  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      worker: true,
      chunkSize: chunkSize * 120,
      chunk: (results) => {
        for (const row of normaliseRows(results.data)) {
          if (row && Object.keys(row).length) all.push(row);
        }
        const bytesDone = results.meta.cursor || 0;
        const elapsed = (Date.now() - started) / 1000;
        const ratio = file.size > 0 ? bytesDone / file.size : 1;
        onProgress({
          phase: "parsing",
          rows: all.length,
          bytesDone,
          bytesTotal: file.size,
          etaSeconds: ratio > 0.02 && elapsed > 0.4 ? Math.max(0, elapsed / ratio - elapsed) : null,
        });
      },
      complete: () => resolve(normaliseRows(all)),
      error: (err: Error) => reject(err),
    });
  });
}

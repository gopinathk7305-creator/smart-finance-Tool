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

/**
 * Step 2 — tolerant date parsing: ISO, DD/MM/YYYY, MM/DD/YYYY, textual months,
 * Excel serial numbers and epoch values all resolve to an ISO calendar date.
 */
export function cleanDate(v: unknown): { iso: string | null; raw: string } {
  const raw = cleanText(v);
  if (!raw) return { iso: null, raw };
  return { iso: toISODateSafe(raw), raw };
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
        raw_data: r,
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
        raw_data: r,
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
        raw_data: r,
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
      raw_data: r,
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

const yieldToBrowser = () =>
  new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 0);
  });

/** Header normalisation runs after each local file chunk is read. */
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
 * Reads local files without a Web Worker. PapaParse uses FileReader slices for
 * CSV input; each callback is split into small row blocks and explicitly yields
 * so React can paint progress. Excel worksheets are mapped in bounded ranges.
 */
export async function streamTabular(
  file: File,
  onProgress: (p: StreamProgress) => void,
  chunkSize = 1000,
): Promise<Record<string, string>[]> {
  if (!/\.csv$/i.test(file.name)) {
    if (!/\.xlsx?$/i.test(file.name)) throw new Error("Unsupported file — upload .csv, .xls or .xlsx");
    const XLSX = await import("xlsx");
    const started = Date.now();
    const buffer = await file.arrayBuffer();
    await yieldToBrowser();
    const wb = XLSX.read(buffer, { type: "array", cellDates: true });
    const sheet = wb.Sheets[wb.SheetNames[0] ?? ""];
    if (!sheet || !sheet["!ref"]) return [];
    const range = XLSX.utils.decode_range(sheet["!ref"]);
    const headerRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      range: { s: { r: range.s.r, c: range.s.c }, e: { r: range.s.r, c: range.e.c } },
      blankrows: false,
      defval: "",
    });
    const headers = (headerRows[0] ?? []).map((h) => normaliseHeader(String(h ?? "")));
    const all: Record<string, string>[] = [];
    const dataStart = range.s.r + 1;
    const totalRows = Math.max(0, range.e.r - range.s.r);
    for (let start = dataStart; start <= range.e.r; start += chunkSize) {
      const end = Math.min(range.e.r, start + chunkSize - 1);
      const values = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
        header: 1,
        range: { s: { r: start, c: range.s.c }, e: { r: end, c: range.e.c } },
        blankrows: false,
        defval: "",
        raw: false,
      });
      for (const valuesRow of values) {
        const row: Record<string, string> = {};
        headers.forEach((header, index) => {
          if (header) row[header] = String(valuesRow[index] ?? "");
        });
        if (Object.values(row).some((value) => value !== "")) all.push(row);
      }
      const elapsed = (Date.now() - started) / 1000;
      const done = Math.min(totalRows, end - range.s.r);
      const ratio = totalRows > 0 ? done / totalRows : 1;
      onProgress({
        phase: "parsing",
        rows: all.length,
        bytesDone: Math.round(file.size * ratio),
        bytesTotal: file.size,
        etaSeconds: ratio > 0 ? Math.max(0, elapsed / ratio - elapsed) : null,
      });
      await yieldToBrowser();
    }
    return all;
  }

  const Papa = (await import("papaparse")).default;
  const started = Date.now();
  const all: Record<string, string>[] = [];

  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      worker: false,
      chunkSize: 256 * 1024,
      chunk: (results, parser) => {
        parser.pause();
        void (async () => {
          for (let offset = 0; offset < results.data.length; offset += chunkSize) {
            const block = normaliseRows(results.data.slice(offset, offset + chunkSize));
            for (const row of block) if (Object.keys(row).length) all.push(row);
            const bytesDone = results.meta.cursor || 0;
            const elapsed = (Date.now() - started) / 1000;
            const ratio = file.size > 0 ? bytesDone / file.size : 1;
            onProgress({
              phase: "parsing",
              rows: all.length,
              bytesDone,
              bytesTotal: file.size,
              etaSeconds: ratio > 0.02 ? Math.max(0, elapsed / ratio - elapsed) : null,
            });
            await yieldToBrowser();
          }
          parser.resume();
        })().catch(reject);
      },
      complete: () => {
        onProgress({
          phase: "parsing",
          rows: all.length,
          bytesDone: file.size,
          bytesTotal: file.size,
          etaSeconds: 0,
        });
        resolve(all);
      },
      error: (err: Error) => reject(err),
    });
  });
}

export async function runEtlChunked(
  key: DatasetKey,
  raw: Record<string, string>[],
  userId: string,
  fileName: string,
  autoFix: boolean,
  onProgress?: (done: number, total: number) => void,
  chunkSize = 1000,
): Promise<EtlResult> {
  const result: EtlResult = { fileName, rows: [], issues: [], preview: [], total: raw.length, clean: 0 };
  for (let start = 0; start < raw.length; start += chunkSize) {
    const part = runEtl(key, raw.slice(start, start + chunkSize), userId, fileName, autoFix);
    result.rows.push(...part.rows);
    result.issues.push(...part.issues.map((issue) => ({ ...issue, row: issue.row + start })));
    if (result.preview.length < 10) result.preview.push(...part.preview.slice(0, 10 - result.preview.length));
    result.clean += part.clean;
    onProgress?.(Math.min(raw.length, start + chunkSize), raw.length);
    await yieldToBrowser();
  }
  return result;
}

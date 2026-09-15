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

/* ---------------------------------------------- pipeline */

export function runEtl(
  key: DatasetKey,
  raw: Record<string, string>[],
  userId: string,
  fileName: string,
  autoFix: boolean,
): EtlResult {
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

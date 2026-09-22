// Schema Discovery Engine: classifies the active dataset's domain from its own
// column names/values and produces the KPI set, spend trend and distribution
// that actually make sense for that domain. No hardcoded finance assumptions —
// an expense ledger never renders ₹0 revenue, a payroll file shows payroll KPIs.

import { useMemo } from "react";

import { parseNum } from "@/lib/column-map";
import { compactMoney, titleCase } from "@/lib/adaptive-dashboard";
import { useDatasetRaw } from "@/lib/dataset";
import { distribution, inspectSchema, type SchemaInspection } from "@/lib/schema-inspector";

export type DatasetMode = "pnl" | "expense" | "payroll" | "generic";

export interface DiscoveryKpi {
  label: string;
  value: string;
  hint?: string;
}

export interface SchemaDiscovery {
  mode: DatasetMode;
  /** human label, e.g. "Vendor Spend & Expense Ledger" */
  label: string;
  /** banner copy explaining the adaptation */
  note: string;
  kpis: DiscoveryKpi[];
  /** monthly spend/outflow series (single measure) */
  monthly: { month: string; spend: number }[];
  monthlyLabel: string;
  breakdown: { name: string; value: number }[];
  breakdownLabel: string;
  hasRevenue: boolean;
  rowCount: number;
  columnCount: number;
  /** true when the discovery engine found enough structure to drive widgets */
  ready: boolean;
}

const canon = (k: string) => k.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
const plain = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

const REVENUE_WORDS = ["revenue", "credit", "income", "sales", "turnover", "inflow", "receipt", "gross_sales"];
const EXPENSE_WORDS = ["expense", "debit", "cost", "spend", "outflow", "payment", "purchase", "amount", "total"];
const PAYROLL_WORDS = ["salary", "basic", "allowance", "gross_pay", "net_pay", "ctc", "payroll", "wage"];
const STATUTORY_WORDS = ["pf", "esi", "tds", "epf", "professional_tax", "statutory", "deduction"];
const EMPLOYEE_WORDS = ["employee", "emp_id", "emp_no", "staff"];
const OVERDUE_WORDS = ["overdue", "unpaid", "outstanding", "pending", "late", "defaulted"];

const findCol = (cols: string[], words: string[]) => {
  for (const w of words) {
    const hit = cols.find((c) => canon(c) === w) ?? cols.find((c) => canon(c).includes(w));
    if (hit) return hit;
  }
  return undefined;
};
const findCols = (cols: string[], words: string[]) =>
  cols.filter((c) => words.some((w) => canon(c).includes(w)));

const monthOf = (val: unknown): string => {
  if (val === null || val === undefined) return "";
  const s = String(val).trim();
  if (!s) return "";
  const iso = /^(\d{4})-(\d{2})/.exec(s);
  if (iso) return `${iso[1]}-${iso[2]}`;
  const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/.exec(s);
  if (dmy) {
    const year = dmy[3]!.length === 2 ? `20${dmy[3]}` : dmy[3]!;
    return `${year}-${dmy[2]!.padStart(2, "0")}`;
  }
  const t = Date.parse(s);
  return Number.isNaN(t) ? "" : new Date(t).toISOString().slice(0, 7);
};

/** Does a type/flag column carry credit/income values? (a ledger with signed rows) */
function hasIncomeRows(rows: Record<string, unknown>[], schema: SchemaInspection): boolean {
  const typeCol = findCol(schema.columns, ["txn_type", "transaction_type", "entry_type", "dr_cr", "type", "nature"]);
  if (!typeCol) return false;
  return rows
    .slice(0, 500)
    .some((r) => {
      const v = String(r?.[typeCol] ?? "").trim().toLowerCase();
      return ["income", "revenue", "credit", "cr", "sale", "sales", "inflow", "receipt"].some((w) => v.includes(w));
    });
}

const MODE_LABEL: Record<DatasetMode, string> = {
  pnl: "P&L / Transactional Ledger",
  expense: "Vendor Spend & Expense Ledger",
  payroll: "Payroll & Employee Register",
  generic: "General Dataset",
};

/**
 * Classify the active dataset and build the adapted KPI/chart configuration.
 * Runs in memory on the rows the page already holds.
 */
export function useSchemaDiscovery(activeDatasetId?: string | null): SchemaDiscovery {
  const rows = useDatasetRaw();

  return useMemo(() => {
    void activeDatasetId; // recompute marker
    const schema = inspectSchema(rows);
    const cols = schema.columns;
    const numeric = schema.numeric;
    const rowCount = rows.length;
    const columnCount = cols.length;

    const sum = (col?: string) =>
      col ? rows.reduce((s, r) => s + Math.abs(Number(parseNum(r?.[col])) || 0), 0) : 0;

    const payrollCols = findCols(numeric, PAYROLL_WORDS);
    const revenueCol = findCol(numeric, REVENUE_WORDS);
    const expenseCol = findCol(
      numeric.filter((c) => c !== revenueCol),
      EXPENSE_WORDS,
    );
    const dateCol = schema.dates[0];
    const groupCol =
      findCol(schema.categorical, ["category", "department", "vendor", "party", "payment_method", "mode", "status", "type", "client"]) ??
      schema.categorical[0];

    const revenueTotal = sum(revenueCol);
    const hasRevenue = Boolean(revenueCol) && revenueTotal > 0;

    // ---- classification --------------------------------------------------
    let mode: DatasetMode = "generic";
    if (payrollCols.length > 0) mode = "payroll";
    else if (hasRevenue || hasIncomeRows(rows, schema)) mode = "pnl";
    else if (expenseCol) mode = "expense";

    // ---- spend measure & monthly trend -----------------------------------
    const spendCol = mode === "payroll" ? (findCol(numeric, ["net_pay", "gross_pay", "ctc", "salary"]) ?? payrollCols[0]) : expenseCol;
    const spendTotal = sum(spendCol);

    const monthMap = new Map<string, number>();
    if (dateCol && spendCol) {
      rows.forEach((r) => {
        const key = monthOf(r?.[dateCol]);
        if (!key) return;
        monthMap.set(key, (monthMap.get(key) ?? 0) + Math.abs(Number(parseNum(r?.[spendCol])) || 0));
      });
    }
    const monthly = [...monthMap.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([month, spend]) => ({ month, spend }));
    const monthlyLabel = spendCol
      ? mode === "payroll"
        ? "Monthly Payroll Cost"
        : "Monthly Spend Trend"
      : "";

    const breakdown = groupCol ? distribution(rows, groupCol, spendCol, 5) : [];
    const breakdownLabel = groupCol
      ? spendCol
        ? `${titleCase(groupCol)} share of ${titleCase(spendCol)}`
        : `${titleCase(groupCol)} by record count`
      : "";

    // ---- KPIs per mode ---------------------------------------------------
    const kpis: DiscoveryKpi[] = [];

    if (mode === "payroll") {
      const employeeCol = findCol(cols, EMPLOYEE_WORDS);
      const headcount = employeeCol
        ? new Set(rows.map((r) => String(r?.[employeeCol] ?? "").trim()).filter(Boolean)).size || rowCount
        : rowCount;
      const statutoryCols = findCols(numeric, STATUTORY_WORDS);
      const statutory = statutoryCols.reduce((s, c) => s + sum(c), 0);
      kpis.push(
        { label: "Total Payroll Cost", value: compactMoney(spendTotal), hint: spendCol ? `Sum of ${titleCase(spendCol)}` : undefined },
        {
          label: "Average Salary / Employee",
          value: compactMoney(headcount ? spendTotal / headcount : 0),
          hint: `Across ${plain.format(headcount)} employees`,
        },
        {
          label: "Statutory Deductions",
          value: compactMoney(statutory),
          hint: statutoryCols.length ? statutoryCols.map(titleCase).join(" + ") : "No PF/ESI/TDS columns found",
        },
        { label: "Employee Headcount", value: plain.format(headcount), hint: employeeCol ? `Distinct ${titleCase(employeeCol)}` : "Rows in file" },
        { label: "Payroll Records", value: plain.format(rowCount), hint: `${columnCount} columns detected` },
      );
    } else if (mode === "expense") {
      const months = monthly.length || 1;
      const statusCol = findCol(cols, ["status", "payment_status", "state", "paid"]);
      const overdue = statusCol
        ? rows.filter((r) => {
            const v = String(r?.[statusCol] ?? "").trim().toLowerCase();
            return v && OVERDUE_WORDS.some((w) => v.includes(w));
          }).length
        : 0;
      const top = breakdown[0];
      kpis.push(
        { label: "Total Spend / Outflow", value: compactMoney(spendTotal), hint: spendCol ? `Sum of ${titleCase(spendCol)}` : undefined },
        { label: "Monthly Average Spend", value: compactMoney(spendTotal / months), hint: `Across ${months} month${months === 1 ? "" : "s"}` },
        {
          label: `Top ${groupCol ? titleCase(groupCol) : "Category"}`,
          value: top ? top.name : "—",
          hint: top ? `${compactMoney(top.value)} of total spend` : "No categorical column found",
        },
        { label: "Total Transactions", value: plain.format(rowCount), hint: `${columnCount} columns detected` },
        {
          label: "Overdue Invoices",
          value: plain.format(overdue),
          hint: statusCol ? `Flagged in ${titleCase(statusCol)}` : "No status column found",
        },
      );
    }

    return {
      mode,
      label: MODE_LABEL[mode],
      note:
        mode === "expense"
          ? "Revenue columns were not found, so revenue, profit and runway widgets are hidden and spend metrics are shown instead."
          : mode === "payroll"
            ? "Payroll columns detected, so widgets show payroll cost, salaries, statutory deductions and headcount."
            : "Dashboard widgets have auto-adapted to present available metrics.",
      kpis,
      monthly,
      monthlyLabel,
      breakdown,
      breakdownLabel,
      hasRevenue,
      rowCount,
      columnCount,
      ready: rowCount > 0 && (mode === "expense" || mode === "payroll") && kpis.length > 0,
    };
  }, [rows, activeDatasetId]);
}

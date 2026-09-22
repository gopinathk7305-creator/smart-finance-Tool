// Schema Discovery Engine: classifies the active dataset's domain from its own
// column names/values and produces the KPI set, spend trend and distribution
// that actually make sense for that domain. No hardcoded finance assumptions —
// an expense ledger never renders ₹0 revenue, a payroll file shows payroll KPIs.

import { useMemo } from "react";

import { parseNum } from "@/lib/column-map";
import { compactMoney, titleCase } from "@/lib/adaptive-dashboard";
import { parseAnyDate } from "@/lib/clean";
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
const CATEGORY_WORDS = ["category", "department", "cost_center", "expense_head", "type"];
const VENDOR_WORDS = ["vendor", "client", "merchant", "supplier", "party", "customer"];
const STATUS_WORDS = ["payment_status", "invoice_status", "status", "paid", "state"];
const TAX_WORDS = ["tax_amount", "gst_amount", "gst", "cgst", "sgst", "igst", "tax", "vat"];

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
  const parsed = parseAnyDate(val);
  return parsed ? parsed.toISOString().slice(0, 7) : "";
};

const formatMonth = (date: Date) =>
  new Intl.DateTimeFormat("en-IN", { month: "short", year: "numeric", timeZone: "UTC" }).format(date);

const validMetric = (metric: DiscoveryKpi & { backing: number }) =>
  metric.backing > 0 && Number.isFinite(metric.backing) && metric.value.trim().length > 0;

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

    const sum = (col?: string) => {
      if (!col) return 0;
      let total = 0;
      for (let start = 0; start < rows.length; start += 2000) {
        const end = Math.min(start + 2000, rows.length);
        for (let i = start; i < end; i += 1) {
          total += Math.abs(Number(parseNum(rows[i]?.[col])) || 0);
        }
      }
      return total;
    };

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

    // ---- ranked autonomous KPI candidates -------------------------------
    // Every candidate carries a positive numeric backing value. Unsupported,
    // zero and non-finite metrics are removed before the best five are shown.
    const candidates: Array<DiscoveryKpi & { backing: number }> = [];
    const expenseCount = spendCol
      ? rows.reduce((count, row) => count + (Math.abs(Number(parseNum(row?.[spendCol])) || 0) > 0 ? 1 : 0), 0)
      : 0;

    if (spendCol && spendTotal > 0) {
      candidates.push(
        { label: mode === "payroll" ? "Total Payroll Cost" : "Total Spend / Outflow", value: compactMoney(spendTotal), hint: `Sum of ${titleCase(spendCol)}`, backing: spendTotal },
        { label: "Average Transaction Value", value: compactMoney(spendTotal / expenseCount), hint: `Across ${plain.format(expenseCount)} transactions`, backing: spendTotal / expenseCount },
      );
      const categoryCol = findCol(schema.categorical, CATEGORY_WORDS);
      const topCategory = categoryCol ? distribution(rows, categoryCol, spendCol, 1)[0] : undefined;
      if (categoryCol && topCategory && topCategory.value > 0 && topCategory.name.trim()) {
        candidates.push({
          label: `Top Spend ${canon(categoryCol).includes("department") ? "Department" : "Category"}`,
          value: topCategory.name,
          hint: `${compactMoney(topCategory.value)} of spend`,
          backing: topCategory.value,
        });
      }
    }

    if (dateCol) {
      const dates = rows.map((row) => parseAnyDate(row?.[dateCol])).filter((date): date is Date => Boolean(date));
      if (dates.length > 0) {
        const firstDate = dates[0];
        if (!firstDate) throw new Error("A non-empty date collection must have a first item");
        let earliest = firstDate;
        let latest = firstDate;
        dates.forEach((date) => {
          if (date.getTime() < earliest.getTime()) earliest = date;
          if (date.getTime() > latest.getTime()) latest = date;
        });
        candidates.push({
          label: "Active Date Range",
          value: earliest.getTime() === latest.getTime() ? formatMonth(earliest) : `${formatMonth(earliest)} – ${formatMonth(latest)}`,
          hint: `From ${titleCase(dateCol)}`,
          backing: dates.length,
        });
      }
      if (spendTotal > 0 && monthly.length > 0) {
        const burn = spendTotal / monthly.length;
        candidates.push({ label: "Monthly Burn Rate", value: compactMoney(burn), hint: `Average across ${monthly.length} active months`, backing: burn });
      }
    }

    const vendorCol = findCol(schema.categorical, VENDOR_WORDS);
    if (vendorCol) {
      const vendors = new Set(rows.map((row) => String(row?.[vendorCol] ?? "").trim()).filter(Boolean)).size;
      candidates.push({ label: "Active Vendors Count", value: plain.format(vendors), hint: `Distinct ${titleCase(vendorCol)}`, backing: vendors });
    }

    const statusCol = findCol(cols, STATUS_WORDS);
    if (statusCol) {
      let pendingCount = 0;
      let pendingValue = 0;
      rows.forEach((row) => {
        const status = String(row?.[statusCol] ?? "").trim().toLowerCase();
        if (!OVERDUE_WORDS.some((word) => status.includes(word))) return;
        pendingCount += 1;
        pendingValue += spendCol ? Math.abs(Number(parseNum(row?.[spendCol])) || 0) : 0;
      });
      candidates.push({
        label: "Pending / Unpaid Volume",
        value: pendingValue > 0 ? compactMoney(pendingValue) : plain.format(pendingCount),
        hint: `${plain.format(pendingCount)} records in ${titleCase(statusCol)}`,
        backing: pendingValue > 0 ? pendingValue : pendingCount,
      });
    }

    const taxCols = findCols(numeric, TAX_WORDS);
    const taxTotal = taxCols.reduce((total, col) => total + sum(col), 0);
    if (taxCols.length > 0) {
      candidates.push({ label: "Total Tax / GST Amount", value: compactMoney(taxTotal), hint: taxCols.map(titleCase).join(" + "), backing: taxTotal });
    }

    if (revenueCol && revenueTotal > 0) {
      const grossProfit = revenueTotal - spendTotal;
      const margin = (grossProfit / revenueTotal) * 100;
      const revenueMetrics: Array<DiscoveryKpi & { backing: number }> = [
        { label: "Total Revenue", value: compactMoney(revenueTotal), hint: `Sum of ${titleCase(revenueCol)}`, backing: revenueTotal },
      ];
      if (grossProfit > 0) revenueMetrics.push({ label: "Gross Profit", value: compactMoney(grossProfit), hint: "Revenue less detected outflow", backing: grossProfit });
      if (margin > 0 && Number.isFinite(margin)) revenueMetrics.push({ label: "Net Margin", value: `${margin.toFixed(1)}%`, hint: "Based on detected revenue and outflow", backing: margin });
      candidates.unshift(...revenueMetrics);
    }

    const kpis = candidates.filter(validMetric).slice(0, 5).map(({ backing: _backing, ...metric }) => metric);

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

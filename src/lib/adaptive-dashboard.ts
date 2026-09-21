// True schema-driven dashboard engine: builds KPI definitions, a trend series
// and a distribution breakdown purely from the columns/values present in the
// active dataset. Nothing here is hardcoded to our finance schema — a sales,
// HR, inventory or banking file configures the widgets by itself.

import { useMemo } from "react";

import { parseNum } from "@/lib/column-map";
import { useDatasetRaw } from "@/lib/dataset";
import { distribution, inspectSchema, type SchemaInspection } from "@/lib/schema-inspector";

export interface AdaptiveKpi {
  label: string;
  value: string;
  hint?: string;
  /** raw numeric value where applicable (used for exports) */
  raw?: number;
}

export interface AdaptiveDashboard {
  schema: SchemaInspection;
  rowCount: number;
  columnCount: number;
  kpis: AdaptiveKpi[];
  /** monthly (or per-bucket) trend rows keyed by each plotted numeric column */
  trend: Record<string, string | number>[];
  /** numeric columns plotted in the trend chart */
  trendSeries: string[];
  trendKey: string;
  trendLabel: string;
  /** true when the trend series are category slices of one money column */
  trendStacked: boolean;
  /** chronological cumulative running total of the primary money column */
  cumulative: { bucket: string; value: number }[];
  cumulativeLabel: string;
  breakdown: { name: string; value: number }[];

  breakdownLabel: string;
  /** true when there is enough structure to render the adaptive widgets */
  ready: boolean;
}

const plain = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });

/** ₹ in Lakhs/Crores, e.g. ₹6.8Cr / ₹45L. */
export const compactMoney = (val: number) => {
  const n = Number(val);
  if (!Number.isFinite(n)) return "₹0";
  const a = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (a >= 1e7) return `${sign}₹${(a / 1e7).toFixed(a / 1e7 >= 100 ? 0 : 2)}Cr`;
  if (a >= 1e5) return `${sign}₹${(a / 1e5).toFixed(a / 1e5 >= 100 ? 0 : 2)}L`;
  if (a >= 1e3) return `${sign}₹${(a / 1e3).toFixed(1)}K`;
  return `${sign}₹${plain.format(a)}`;
};

export const titleCase = (key: string) =>
  key
    .replace(/[_\-.]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());

/** Month bucket (YYYY-MM) from any parseable date value; "" when unusable. */
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

const MONEY_HINTS = ["amount", "revenue", "income", "sales", "value", "total", "net", "gross", "price", "cost", "expense", "salary", "balance", "pay", "credit", "debit"];
const INFLOW_HINTS = ["revenue", "sales", "income", "turnover", "credit", "receipt", "inflow"];
const OUTFLOW_HINTS = ["expense", "cost", "debit", "spend", "outflow", "payment", "purchase", "cogs", "salary"];

const canonKey = (k: string) => k.toLowerCase().replace(/[^a-z0-9]+/g, "_");

/** First numeric column whose name matches one of the hint words, in hint order. */
function pickByHints(numeric: string[], hints: string[], exclude?: string): string | undefined {
  for (const hint of hints) {
    const hit = numeric.find((c) => c !== exclude && canonKey(c).includes(hint));
    if (hit) return hit;
  }
  return undefined;
}

/** Categorical column with the most distinct values (ignoring near-unique id-like columns). */
function highestCardinality(rows: Record<string, unknown>[], categorical: string[]): string | undefined {
  const sample = rows.slice(0, 500);
  if (!sample.length) return categorical[0];
  let best: { col: string; uniques: number } | undefined;
  categorical.forEach((col) => {
    const set = new Set(sample.map((r) => String(r?.[col] ?? "").trim()).filter(Boolean));
    if (!set.size) return;
    if (set.size > sample.length * 0.9) return; // id-like column
    if (!best || set.size > best.uniques) best = { col, uniques: set.size };
  });
  return best?.col ?? categorical[0];
}

/** Pick the most meaningful numeric column: money-named first, then widest spread. */
function primaryNumeric(rows: Record<string, unknown>[], numeric: string[]): string | undefined {
  if (!numeric.length) return undefined;
  const inflow = pickByHints(numeric, INFLOW_HINTS);
  if (inflow) return inflow;
  const named = numeric.find((c) => MONEY_HINTS.some((w) => c.toLowerCase().includes(w)));
  if (named) return named;
  const sample = rows.slice(0, 200);
  let best: { col: string; total: number } | undefined;
  numeric.forEach((col) => {
    const total = sample.reduce((s, r) => s + Math.abs(parseNum(r?.[col])), 0);
    if (!best || total > best.total) best = { col, total };
  });
  return best?.col;
}


/**
 * Inspect the active dataset and derive every dashboard widget from its schema.
 * Runs in memory on the rows the visible page already holds.
 */
export function useAdaptiveDashboard(activeDatasetId?: string | null): AdaptiveDashboard {
  const rows = useDatasetRaw();

  return useMemo(() => {
    void activeDatasetId; // recompute marker: rows change with the active dataset
    const schema = inspectSchema(rows);
    const rowCount = rows.length;
    const columnCount = schema.columns.length;

    const money = primaryNumeric(rows, schema.numeric);
    const secondary = money ? pickByHints(schema.numeric, OUTFLOW_HINTS, money) : undefined;
    const dateCol = schema.dates[0];
    const groupCol = highestCardinality(rows, schema.categorical) ?? schema.flags[0];

    const sum = (col: string) => rows.reduce((s, r) => s + (Number(parseNum(r?.[col])) || 0), 0);

    // ---- KPI cards -------------------------------------------------------
    const kpis: AdaptiveKpi[] = [];
    const primaryTotal = money ? sum(money) : 0;
    if (money) {
      kpis.push({
        label: `Total ${titleCase(money)}`,
        value: compactMoney(primaryTotal),
        hint: `Sum of ${titleCase(money)}`,
        raw: primaryTotal,
      });
    } else {
      kpis.push({ label: "Records", value: plain.format(rowCount), hint: "Rows in this dataset", raw: rowCount });
    }

    // Card 2: outflow/cost total when detected, otherwise average of the primary field.
    if (secondary) {
      const secTotal = sum(secondary);
      kpis.push({
        label: `Total ${titleCase(secondary)}`,
        value: compactMoney(secTotal),
        hint: `Sum of ${titleCase(secondary)}`,
        raw: secTotal,
      });
      // Card 3: margin/ratio between primary and secondary.
      const margin = primaryTotal > 0 ? ((primaryTotal - secTotal) / primaryTotal) * 100 : NaN;
      kpis.push({
        label: "Net Margin",
        value: Number.isFinite(margin) ? `${margin.toFixed(1)}%` : "N/A",
        hint: `(${titleCase(money ?? "")} − ${titleCase(secondary)}) ÷ ${titleCase(money ?? "")}`,
        ...(Number.isFinite(margin) ? { raw: margin } : {}),
      });
    } else if (money) {
      const avg = rowCount ? primaryTotal / rowCount : 0;
      kpis.push({
        label: `Average ${titleCase(money)}`,
        value: compactMoney(avg),
        hint: `Across ${plain.format(rowCount)} records`,
        raw: avg,
      });
      if (groupCol) {
        const uniques = new Set(rows.map((r) => String(r?.[groupCol] ?? "").trim()).filter(Boolean));
        kpis.push({
          label: `Unique ${titleCase(groupCol)}`,
          value: plain.format(uniques.size),
          hint: `Distinct values in ${titleCase(groupCol)}`,
          raw: uniques.size,
        });
      } else {
        kpis.push({ label: "Numeric fields", value: `${schema.numeric.length}`, hint: "Measurable columns" });
      }
    } else {
      kpis.push({ label: "Numeric fields", value: `${schema.numeric.length}`, hint: "Measurable columns" });
      kpis.push({ label: "Text fields", value: `${schema.categorical.length}`, hint: "Groupable columns" });
    }

    kpis.push({ label: "Total Rows", value: plain.format(rowCount), hint: "Dataset volume", raw: rowCount });
    kpis.push({ label: "Active Columns", value: `${columnCount}`, hint: "Detected fields", raw: columnCount });


    // ---- Trend chart -----------------------------------------------------
    let trendSeries = (money ? [money, ...schema.numeric.filter((c) => c !== money)] : schema.numeric).slice(0, 3);
    let trend: Record<string, string | number>[] = [];
    let trendKey = "bucket";
    let trendLabel = "";
    let trendStacked = false;

    if (dateCol && money && groupCol) {
      // Group by the detected date column, split by the top values of the
      // detected category column, summing the detected money column.
      const topCats = distribution(rows, groupCol, money, 5).map((d) => d.name);
      const catSet = new Set(topCats);
      const buckets = new Map<string, Record<string, number>>();
      rows.forEach((r) => {
        const key = monthOf(r?.[dateCol]);
        if (!key) return;
        const raw = String(r?.[groupCol] ?? "").trim() || "Unspecified";
        const cat = catSet.has(raw) ? raw : "Other";
        const acc = buckets.get(key) ?? {};
        acc[cat] = (acc[cat] ?? 0) + parseNum(r?.[money]);
        buckets.set(key, acc);
      });
      if (buckets.size > 0) {
        const used = new Set<string>();
        trend = [...buckets.entries()]
          .sort((a, b) => (a[0] < b[0] ? -1 : 1))
          .map(([bucket, vals]) => {
            Object.keys(vals).forEach((k) => used.add(k));
            return { bucket, ...vals };
          });
        trendSeries = [...topCats.filter((c) => used.has(c)), ...(used.has("Other") ? ["Other"] : [])];
        trendLabel = `${titleCase(money)} by ${titleCase(dateCol)}, split by ${titleCase(groupCol)}`;
        trendStacked = true;
      }
    }

    if (!trend.length && dateCol && trendSeries.length) {
      const buckets = new Map<string, Record<string, number>>();
      rows.forEach((r) => {
        const key = monthOf(r?.[dateCol]);
        if (!key) return;
        const acc = buckets.get(key) ?? {};
        trendSeries.forEach((c) => {
          acc[c] = (acc[c] ?? 0) + parseNum(r?.[c]);
        });
        buckets.set(key, acc);
      });
      trend = [...buckets.entries()]
        .sort((a, b) => (a[0] < b[0] ? -1 : 1))
        .map(([bucket, vals]) => ({ bucket, ...vals }));
      trendLabel = `${trendSeries.map(titleCase).join(" vs ")} by ${titleCase(dateCol)}`;
    } else if (!trend.length && groupCol && trendSeries.length) {
      // No usable date column: compare the numeric columns across the top groups.
      const buckets = new Map<string, Record<string, number>>();
      rows.forEach((r) => {
        const key = String(r?.[groupCol] ?? "").trim() || "Unspecified";
        const acc = buckets.get(key) ?? {};
        trendSeries.forEach((c) => {
          acc[c] = (acc[c] ?? 0) + parseNum(r?.[c]);
        });
        buckets.set(key, acc);
      });
      trend = [...buckets.entries()]
        .sort((a, b) => (b[1][trendSeries[0]!] ?? 0) - (a[1][trendSeries[0]!] ?? 0))
        .slice(0, 12)
        .map(([bucket, vals]) => ({ bucket, ...vals }));
      trendLabel = `${trendSeries.map(titleCase).join(" vs ")} by ${titleCase(groupCol)}`;
    }

    // ---- Distribution ----------------------------------------------------
    const breakdown = groupCol ? distribution(rows, groupCol, money) : [];
    const breakdownLabel = groupCol
      ? money
        ? `${titleCase(groupCol)} share of ${titleCase(money)}`
        : `${titleCase(groupCol)} by record count`
      : "";

    return {
      schema,
      rowCount,
      columnCount,
      kpis,
      trend,
      trendSeries,
      trendKey,
      trendLabel,
      trendStacked,
      breakdown,
      breakdownLabel,
      ready: rowCount > 0 && (trend.length > 0 || breakdown.length > 0),
    };
  }, [rows, activeDatasetId]);
}

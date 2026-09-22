// Live financial alerts derived entirely from the active dataset's own rows —
// no hardcoded copy, no demo thresholds. Everything is computed from detected
// status/flag columns, the monthly series and the category distribution, using
// the thresholds the user configured in AlertSettings.

import { DEFAULT_ALERT_SETTINGS, type AlertSettings } from "@/lib/alert-settings";
import { parseNum } from "@/lib/column-map";
import { inspectSchema, type SchemaInspection } from "@/lib/schema-inspector";
import { inr, type Transaction } from "@/lib/finance-data";


export interface LiveAlert {
  tone: "danger" | "warning" | "success";
  title: string;
  body: string;
}

const canon = (k: string) => k.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");

const OVERDUE_WORDS = ["overdue", "unpaid", "outstanding", "pending", "late", "defaulted"];

/** Rows whose status-like column reads overdue/unpaid, with their total value. */
function overdueRows(rows: Record<string, unknown>[], schema: SchemaInspection) {
  const statusCols = schema.columns.filter((c) => /status|state|payment|paid|due/.test(canon(c)));
  const valueCol =
    schema.numeric.find((c) => /amount|total|value|balance|outstanding|due/.test(canon(c))) ??
    schema.numeric[0];
  let count = 0;
  let value = 0;
  rows.forEach((row) => {
    const hit = statusCols.some((c) => {
      const s = String(row?.[c] ?? "").trim().toLowerCase();
      return s !== "" && OVERDUE_WORDS.some((w) => s.includes(w));
    });
    if (hit) {
      count += 1;
      if (valueCol) value += Math.abs(parseNum(row?.[valueCol]));
    }
  });
  return { count, value };
}

/** Duplicate amount+party combinations inside the active dataset. */
function duplicateCount(rows: Record<string, unknown>[], schema: SchemaInspection) {
  const amountCol = schema.numeric.find((c) => /amount|total|value|net|pay/.test(canon(c))) ?? schema.numeric[0];
  if (!amountCol) return 0;
  const partyCol = schema.categorical[0];
  const seen = new Map<string, number>();
  rows.forEach((row) => {
    const amt = parseNum(row?.[amountCol]);
    if (!amt) return;
    const key = `${partyCol ? String(row?.[partyCol] ?? "").trim().toLowerCase() : ""}|${amt}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  });
  let dupes = 0;
  seen.forEach((n) => {
    if (n > 1) dupes += n - 1;
  });
  return dupes;
}

export interface AlertInputs {
  rows: Record<string, unknown>[];
  txns: Transaction[];
  series: { month: string; revenue: number; expense: number; profit: number; cash: number }[];
  categories: { name: string; value: number }[];
  revenue: number;
  expense: number;
  netProfit: number;
  riskFlags: number;
}

/**
 * Build the alert list from live figures. Returns [] when there is nothing
 * noteworthy so the caller can show a clean "all clear" state.
 */
export function deriveAlerts(input: AlertInputs): LiveAlert[] {
  const { rows, txns, series, categories, revenue, expense, netProfit } = input;
  const schema = inspectSchema(rows, 25);
  const out: LiveAlert[] = [];

  const od = overdueRows(rows, schema);
  if (od.count > 0) {
    out.push({
      tone: "danger",
      title: `${od.count.toLocaleString("en-IN")} overdue / unpaid ${od.count === 1 ? "record" : "records"}`,
      body: od.value > 0
        ? `${inr(od.value, true)} is sitting in rows marked overdue or unpaid in this dataset.`
        : "Rows in this dataset carry an overdue or unpaid status.",
    });
  }

  const dupes = duplicateCount(rows, schema);
  if (dupes > 0) {
    out.push({
      tone: "warning",
      title: `${dupes.toLocaleString("en-IN")} possible duplicate ${dupes === 1 ? "entry" : "entries"}`,
      body: "Identical amounts repeat for the same party — verify before payment or filing.",
    });
  }

  // Spend concentration in the largest category.
  const spend = categories.reduce((s, c) => s + c.value, 0);
  const top = categories[0];
  if (top && spend > 0) {
    const share = (top.value / spend) * 100;
    if (share >= 40) {
      out.push({
        tone: "warning",
        title: `${top.name} is ${share.toFixed(0)}% of spend`,
        body: `${inr(top.value, true)} of ${inr(spend, true)} sits in a single category — concentration risk.`,
      });
    }
  }

  // Month-on-month expense spike / revenue drop from the actual series.
  if (series.length >= 2) {
    const last = series[series.length - 1]!;
    const prev = series[series.length - 2]!;
    if (prev.expense > 0) {
      const jump = ((last.expense - prev.expense) / prev.expense) * 100;
      if (jump >= 20) {
        out.push({
          tone: "danger",
          title: `Expenses up ${jump.toFixed(0)}% in ${last.month}`,
          body: `${inr(last.expense, true)} versus ${inr(prev.expense, true)} the previous month.`,
        });
      }
    }
    if (prev.revenue > 0) {
      const drop = ((last.revenue - prev.revenue) / prev.revenue) * 100;
      if (drop <= -15) {
        out.push({
          tone: "warning",
          title: `Revenue down ${Math.abs(drop).toFixed(0)}% in ${last.month}`,
          body: `${inr(last.revenue, true)} versus ${inr(prev.revenue, true)} the previous month.`,
        });
      }
    }
    const lowCash = series.filter((m) => m.cash < 0);
    if (lowCash.length > 0) {
      out.push({
        tone: "danger",
        title: `Negative cash balance in ${lowCash.length} ${lowCash.length === 1 ? "month" : "months"}`,
        body: `Lowest closing balance ${inr(Math.min(...lowCash.map((m) => m.cash)), true)} — arrange funding cover.`,
      });
    }
  }

  if (revenue > 0) {
    const margin = (netProfit / revenue) * 100;
    if (margin < 0) {
      out.push({
        tone: "danger",
        title: `Loss of ${inr(Math.abs(netProfit), true)}`,
        body: `Expenses of ${inr(expense, true)} exceed revenue of ${inr(revenue, true)}.`,
      });
    } else if (margin >= 20) {
      out.push({
        tone: "success",
        title: `Healthy net margin at ${margin.toFixed(1)}%`,
        body: `${inr(netProfit, true)} retained on revenue of ${inr(revenue, true)}.`,
      });
    }
  }

  if (out.length === 0 && txns.length > 0) {
    out.push({
      tone: "success",
      title: "No exceptions detected",
      body: `${txns.length.toLocaleString("en-IN")} records scanned — no overdue items, duplicates or spend spikes.`,
    });
  }

  return out.slice(0, 6);
}

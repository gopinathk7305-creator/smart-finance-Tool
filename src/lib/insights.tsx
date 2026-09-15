// Dataset-wide AI insight state shared by every page.
// The pop-up opens automatically after an upload sync and can be re-opened
// anytime from the floating "AI Insights" button.

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

import { useDataset } from "@/lib/dataset";
import { cashRunwayMonths, type ArApRecord, type Transaction } from "@/lib/finance-data";

export interface InsightLine {
  label: string;
  value: number;
}

export interface DatasetInsights {
  recordCount: number;
  txnCount: number;
  revenue: number;
  expense: number;
  net: number;
  margin: number;
  from: string;
  to: string;
  runway: number;
  drivers: InsightLine[];
  spend: InsightLine[];
  duplicates: { party: string; date: string; amount: number }[];
  outliers: { party: string; date: string; amount: number }[];
  overdue: { party: string; due: string; amount: number }[];
  risks: string[];
  actions: string[];
}

function topBy(rows: Transaction[], pick: (t: Transaction) => string, limit = 4): InsightLine[] {
  const map = new Map<string, number>();
  rows.forEach((r) => map.set(pick(r) || "Unassigned", (map.get(pick(r) || "Unassigned") ?? 0) + r.amount));
  return [...map.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

export function computeInsights(
  txns: Transaction[],
  payCount: number,
  araps: ArApRecord[],
  budCount: number,
): DatasetInsights {
  const income = txns.filter((t) => t.type === "income");
  const expenses = txns.filter((t) => t.type === "expense");
  const revenue = income.reduce((s, t) => s + t.amount, 0);
  const expense = expenses.reduce((s, t) => s + t.amount, 0);
  const dates = txns.map((t) => t.date).filter(Boolean).sort();

  // duplicates: same party + amount on close dates
  const seen = new Map<string, Transaction>();
  const duplicates: DatasetInsights["duplicates"] = [];
  txns.forEach((t) => {
    const key = `${t.vendor_client.toLowerCase()}|${t.amount}`;
    const prev = seen.get(key);
    if (prev) duplicates.push({ party: t.vendor_client, date: t.date, amount: t.amount });
    else seen.set(key, t);
  });

  const sortedAmt = [...expenses].map((t) => t.amount).sort((a, b) => a - b);
  const median = sortedAmt.length ? sortedAmt[Math.floor(sortedAmt.length / 2)]! : 0;
  const outliers = expenses
    .filter((t) => median > 0 && t.amount > median * 4)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 4)
    .map((t) => ({ party: t.vendor_client, date: t.date, amount: t.amount }));

  const today = "2026-12-20";
  const overdue = araps
    .filter((a) => a.status !== "settled" && a.due_date && a.due_date < today)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 4)
    .map((a) => ({ party: a.party_name, due: a.due_date, amount: a.amount }));

  const runway = cashRunwayMonths(txns);
  const risks: string[] = [];
  if (duplicates.length)
    risks.push(`${duplicates.length} possible duplicate invoice(s) detected on identical party and amount.`);
  if (outliers.length)
    risks.push(`${outliers.length} unusually high-value payment(s) — the largest is to ${outliers[0]!.party}.`);
  if (overdue.length)
    risks.push(`${overdue.length} receivable/payable item(s) are past their due date and blocking cash.`);
  if (runway < 6) risks.push(`Cash runway is only ${runway.toFixed(1)} months — below the 6-month safety band.`);
  if (revenue > 0 && expense > revenue) risks.push("Net expenses exceed revenue for the uploaded period.");
  if (!risks.length) risks.push("No duplicates, outliers or liquidity breaches detected in this dataset.");

  const actions: string[] = [];
  if (duplicates.length || outliers.length)
    actions.push(`Review ${duplicates.length + outliers.length} flagged transaction(s) on the Internal Audit page.`);
  if (overdue.length) actions.push("Chase overdue balances from the Cash Flow & AR/AP aging buckets.");
  if (!budCount) actions.push("Enter planned figures on Budget vs Actual to unlock variance and plan-gap analysis.");
  if (!payCount) actions.push("Upload payroll records to complete PF, ESI and TDS statutory computations.");
  actions.push("Run a scenario on Forecasting and export the formal report pack.");

  return {
    recordCount: txns.length + payCount + araps.length + budCount,
    txnCount: txns.length,
    revenue,
    expense,
    net: revenue - expense,
    margin: revenue > 0 ? ((revenue - expense) / revenue) * 100 : 0,
    from: dates[0] ?? "—",
    to: dates[dates.length - 1] ?? "—",
    runway,
    drivers: topBy(income, (t) => t.vendor_client),
    spend: topBy(expenses, (t) => t.category),
    duplicates: duplicates.slice(0, 4),
    outliers,
    overdue,
    risks,
    actions: actions.slice(0, 4),
  };
}

interface InsightsCtx {
  insights: DatasetInsights;
  open: boolean;
  setOpen: (v: boolean) => void;
  /** open the pop-up, optionally noting the file that triggered it */
  openInsights: (fileName?: string) => void;
  sourceFile: string;
}

const Ctx = createContext<InsightsCtx | null>(null);

export function InsightsProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [sourceFile, setSourceFile] = useState("");
  const { txns, pays, araps, buds } = useDataset();

  const insights = useMemo(
    () => computeInsights(txns, pays.length, araps, buds.length),
    [txns, pays, araps, buds],
  );

  const value = useMemo<InsightsCtx>(
    () => ({
      insights,
      open,
      setOpen,
      sourceFile,
      openInsights: (fileName?: string) => {
        if (fileName) setSourceFile(fileName);
        setOpen(true);
      },
    }),
    [insights, open, sourceFile],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/**
 * Safe to call anywhere. If a subtree renders outside InsightsProvider
 * (e.g. during hot reload or an isolated error boundary) it falls back to
 * local state instead of crashing the page.
 */
export function useInsights(): InsightsCtx {
  const ctx = useContext(Ctx);
  const [open, setOpen] = useState(false);
  const [sourceFile, setSourceFile] = useState("");
  const { txns, pays, araps, buds } = useDataset();
  const insights = useMemo(
    () => computeInsights(txns, pays.length, araps, buds.length),
    [txns, pays, araps, buds],
  );
  const fallback = useMemo<InsightsCtx>(
    () => ({
      insights,
      open,
      setOpen,
      sourceFile,
      openInsights: (fileName?: string) => {
        if (fileName) setSourceFile(fileName);
        setOpen(true);
      },
    }),
    [insights, open, sourceFile],
  );
  return ctx ?? fallback;
}

import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { useMemo, useRef } from "react";

import { sumChunked } from "@/lib/aggregate";
import { useActiveMonthlySeries } from "@/lib/monthly-cache";

import { ActiveDatasetBanner } from "@/components/finance/ActiveDatasetBanner";
import { AdaptedDashboard } from "@/components/finance/AdaptedDashboard";
import { CommandCenter } from "@/components/finance/CommandCenter";
import { useSchemaDiscovery } from "@/lib/schema-discovery";
import { AiReportButton } from "@/components/finance/AiReportButton";
import { LazyVisible } from "@/components/finance/LazyVisible";
import { AppShell } from "@/components/finance/AppShell";
import { useActiveDataset } from "@/lib/active-dataset";
import { useActiveDatasetMetrics } from "@/lib/dataset-metrics";
import { useDynamicDashboard } from "@/lib/dynamic-dashboard";
import { safeMargin } from "@/lib/column-map";
import { useDataset } from "@/lib/dataset";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useDatasetRaw } from "@/lib/dataset";
import { deriveAlerts } from "@/lib/live-alerts";
import { useAlertSettings } from "@/lib/alert-settings";
import { AlertSettingsDialog } from "@/components/finance/AlertSettingsDialog";

import {
  actualsByCategory,
  cashRunwayMonths,
  formatCompactCurrency,
  inr,
  monthlySummary,
  totals,
} from "@/lib/finance-data";


export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Executive Dashboard — Finance IQ" },
      {
        name: "description",
        content:
          "Revenue, expenses, margin and cash runway at a glance with live financial alerts for FY2026.",
      },
      { property: "og:title", content: "Executive Dashboard — Finance IQ" },
      {
        property: "og:description",
        content: "Financial KPIs, revenue vs expense trends and cash runway in one dashboard.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});


function Dashboard() {
  const { txns: mapped, live } = useDataset();
  const { activeId, syncing } = useActiveDataset();
  const dyn = useDynamicDashboard(activeId);
  // Whenever the active dataset's own rows carry usable money columns we bind the
  // executive dashboard straight to those records; the schema-driven adaptive view
  // is only a fallback for datasets with no recognisable monetary fields.
  // Schema discovery: classify the dataset domain (P&L ledger / expense-only
  // ledger / payroll register) so the widgets match the columns that exist.
  const discovery = useSchemaDiscovery(activeId, mapped);
  const adaptedMode = discovery.ready;
  const recordsMode = dyn.usable && dyn.rowCount > 0;

  // Canonical columns first; if the uploaded file used its own header names the
  // auto-mapper's normalised rows drive every figure instead.
  const txns = useMemo(() => {
    const canonical = totals(mapped);
    return recordsMode && (Boolean(activeId) || (canonical.revenue === 0 && canonical.expense === 0))
      ? dyn.txns
      : mapped;
  }, [mapped, dyn.txns, recordsMode, activeId]);

  // Row-level maths runs once per dataset change, in chunks of 2,000 rows.
  // Revenue vs Expense and the cash balance come from the precomputed monthly
  // table for this dataset (12 rows); browser maths is only the fallback.
  const clientSeries = useMemo(() => monthlySummary(txns), [txns]);
  const { series } = useActiveMonthlySeries(clientSeries);
  const t = useMemo(() => totals(txns), [txns]);
  const runway = useMemo(() => cashRunwayMonths(txns), [txns]);

  const { revDelta, expDelta, margin } = useMemo(() => {
    const h1 = series.slice(0, 6);
    const h2 = series.slice(6);
    const sum = (a: typeof series, k: "revenue" | "expense") => sumChunked(a, (m) => m[k]);
    const pctChange = (a: number, b: number) => (a > 0 ? ((b - a) / a) * 100 : 0);
    return {
      revDelta: pctChange(sum(h1, "revenue"), sum(h2, "revenue")),
      expDelta: pctChange(sum(h1, "expense"), sum(h2, "expense")),
      margin: safeMargin(t.netProfit, t.revenue),
    };
  }, [series, t.netProfit, t.revenue]);

  // Spend concentration still feeds the live alerts engine even though the
  // category donut widget has been retired from this dashboard.
  const topCats = useMemo(() => {
    const canonicalCats = [...actualsByCategory(txns).entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, value]) => ({ name, value }));
    return canonicalCats.length === 0 ? dyn.topGroups : canonicalCats;
  }, [txns, dyn.topGroups]);

  const toneIcon = { danger: AlertTriangle, warning: Info, success: CheckCircle2 };

  const chartsRef = useRef<HTMLDivElement>(null);
  const metrics = useActiveDatasetMetrics();
  const riskFlags = metrics.riskFlags || dyn.riskFlags;
  const rawRows = useDatasetRaw();
  const { settings: alertSettings } = useAlertSettings();
  // Alerts are computed from the active dataset's own rows — status columns,
  // duplicate amounts, category concentration and the real monthly series —
  // against the thresholds configured by the user.
  const liveAlerts = useMemo(
    () =>
      deriveAlerts({
        rows: rawRows,
        txns,
        series,
        categories: topCats,
        revenue: t.revenue,
        expense: t.expense,
        netProfit: t.netProfit,
        riskFlags,
        settings: alertSettings,
      }),
    [rawRows, txns, series, topCats, t.revenue, t.expense, t.netProfit, riskFlags, alertSettings],
  );


  // Never show skeletons once the active dataset's rows are in hand — real figures
  // beat placeholders even while the background summary is still refreshing.
  const busy = (syncing || metrics.loading) && txns.length === 0;
  const recent = useMemo(
    () => [...txns].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 10),
    [txns],
  );

  const buildReport = () => ({
    page: "dashboard" as const,
    reportName: "Executive Overview & Entity Health Report",
    fy: "FY 2026-27",
    kpis: [
      { label: "Total Revenue", value: inr(t.revenue, true), delta: `${revDelta.toFixed(1)}% H2 vs H1` },
      { label: "Total Expenses", value: inr(t.expense, true), delta: `${expDelta.toFixed(1)}% H2 vs H1` },
      { label: "Net Profit Margin", value: `${margin.toFixed(1)}%`, delta: inr(t.netProfit, true) },
      {
        label: "Cash Runway",
        value: Number.isFinite(runway) ? `${runway.toFixed(1)} months` : "Cash positive",
        delta: "At current burn",
      },
    ],
    tables: [
      {
        title: "Monthly Revenue, Expense & Cash Position",
        columns: ["Month", "Revenue", "Expense", "Profit", "Cash Balance"],
        numericFrom: 1,
        rows: series.map((m) => [m.month, inr(m.revenue), inr(m.expense), inr(m.profit), inr(m.cash)]),
      },
    ],
    facts: `Revenue ${inr(t.revenue)}, expenses ${inr(t.expense)}, gross profit ${inr(t.grossProfit)}, EBITDA ${inr(t.ebitda)}, net profit ${inr(t.netProfit)}, net margin ${margin.toFixed(1)}%, cash runway ${Number.isFinite(runway) ? runway.toFixed(1) : "unlimited"} months. Largest spend categories: ${topCats.map((c) => `${c.name} ${inr(c.value)}`).join(", ")}. Data source: ${live ? "user-uploaded ledger" : "demo dataset"}.`,
    chartEl: chartsRef.current,
  });

  return (
    <AppShell title="CFO Command Center" subtitle={live ? "Live view of your uploaded data" : "Sample data · upload your files to see real numbers"}>
      <ActiveDatasetBanner />
      <div className="mb-4 flex justify-end">
        <div className="w-full flex flex-wrap items-center justify-between gap-4"><div><h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">Good Morning, Welcome Back!</h2><p className="mt-0.5 text-sm text-muted-foreground">Here&apos;s your financial overview.</p></div><AiReportButton build={buildReport} /></div>
      </div>
      {(adaptedMode || discovery.mode !== "generic") && (
        <Card className="mb-4 border-border bg-muted/40 shadow-card">
          <CardContent className="flex flex-wrap items-center gap-2 py-3 text-sm">
            <Info className="size-4 text-primary" />
            <span className="font-semibold">Dataset Mode: {discovery.label}.</span>
            <span className="text-muted-foreground">{discovery.note}</span>
          </CardContent>
        </Card>
      )}
      {adaptedMode && t.expense === 0 ? (
        <AdaptedDashboard profile={discovery} />
      ) : busy ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-[132px] rounded-xl" />
          ))}
        </div>
      ) : (
        <div ref={chartsRef}>
          <CommandCenter txns={txns} series={series} alerts={liveAlerts} />
        </div>
      )}

      <LazyVisible minHeight={200}>
      <Card className="mt-4 border-border shadow-card">
        <CardHeader>
          <CardTitle className="text-base">Recent Transactions</CardTitle>
          <CardDescription>Latest 10 entries from the active dataset</CardDescription>
        </CardHeader>
        <CardContent>
          {busy ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-9 rounded-md" />
              ))}
            </div>
          ) : recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">No transactions in the selected period.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Date</th>
                    <th className="py-2 pr-3 font-medium">Party</th>
                    <th className="py-2 pr-3 font-medium">Category</th>
                    <th className="py-2 pr-3 font-medium">Type</th>
                    <th className="py-2 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((r, i) => (
                    <tr key={r.id ?? i} className="border-b border-border/60 last:border-0">
                      <td className="py-2 pr-3 whitespace-nowrap tabular-nums">{r.date}</td>
                      <td className="py-2 pr-3">{r.vendor_client || "—"}</td>
                      <td className="py-2 pr-3">{r.category || "—"}</td>
                      <td className={`py-2 pr-3 ${r.type === "income" ? "text-success" : "text-danger"}`}>
                        {r.type === "income" ? "Income" : "Expense"}
                      </td>
                      <td className="py-2 text-right font-mono tabular-nums">{inr(r.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
      </LazyVisible>
    </AppShell>
  );
}

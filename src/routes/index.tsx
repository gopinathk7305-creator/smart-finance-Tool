import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Landmark,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { useRef } from "react";

import { ActiveDatasetBanner } from "@/components/finance/ActiveDatasetBanner";
import { AiReportButton } from "@/components/finance/AiReportButton";
import { AppShell } from "@/components/finance/AppShell";
import { KpiCard } from "@/components/finance/KpiCard";
import { useActiveDataset } from "@/lib/active-dataset";
import { useActiveDatasetMetrics } from "@/lib/dataset-metrics";
import { useDataset } from "@/lib/dataset";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  actualsByCategory,
  alerts,
  cashRunwayMonths,
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
    ],
  }),
  component: Dashboard,
});

const PIE_COLORS = [
  "var(--brand)",
  "var(--primary)",
  "var(--success)",
  "var(--warning)",
  "var(--danger)",
];

function Dashboard() {
  const { txns, live } = useDataset();
  const series = monthlySummary(txns);
  const t = totals(txns);
  const runway = cashRunwayMonths(txns);

  const h1 = series.slice(0, 6);
  const h2 = series.slice(6);
  const sum = (a: typeof series, k: "revenue" | "expense") => a.reduce((s, m) => s + m[k], 0);
  const revDelta = ((sum(h2, "revenue") - sum(h1, "revenue")) / sum(h1, "revenue")) * 100;
  const expDelta = ((sum(h2, "expense") - sum(h1, "expense")) / sum(h1, "expense")) * 100;
  const margin = (t.netProfit / t.revenue) * 100;

  const topCats = [...actualsByCategory(txns).entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, value]) => ({ name, value }));

  const toneIcon = { danger: AlertTriangle, warning: Info, success: CheckCircle2 };
  const chartsRef = useRef<HTMLDivElement>(null);
  const metrics = useActiveDatasetMetrics();
  const { syncing } = useActiveDataset();
  const busy = syncing || metrics.loading;
  const recent = [...txns]
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 10);

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
      {
        title: "Top 5 Expense Categories",
        columns: ["Category", "Spend"],
        numericFrom: 1,
        rows: topCats.map((c) => [c.name, inr(c.value)]),
      },
    ],
    facts: `Revenue ${inr(t.revenue)}, expenses ${inr(t.expense)}, gross profit ${inr(t.grossProfit)}, EBITDA ${inr(t.ebitda)}, net profit ${inr(t.netProfit)}, net margin ${margin.toFixed(1)}%, cash runway ${Number.isFinite(runway) ? runway.toFixed(1) : "unlimited"} months. Largest spend categories: ${topCats.map((c) => `${c.name} ${inr(c.value)}`).join(", ")}. Data source: ${live ? "user-uploaded ledger" : "demo dataset"}.`,
    chartEl: chartsRef.current,
  });

  return (
    <AppShell title="Executive Dashboard" subtitle={live ? "Live view of your uploaded data" : "Sample data · upload your files to see real numbers"}>
      <div className="mb-4 flex justify-end">
        <AiReportButton build={buildReport} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Total Revenue"
          value={inr(t.revenue, true)}
          delta={revDelta}
          hint="H2 vs H1"
          icon={TrendingUp}
          tone="success"
        />
        <KpiCard
          label="Total Expenses"
          value={inr(t.expense, true)}
          delta={expDelta}
          hint="H2 vs H1"
          icon={TrendingDown}
          tone="danger"
          invertDelta
        />
        <KpiCard
          label="Net Profit Margin"
          value={`${margin.toFixed(1)}%`}
          hint={margin > 10 ? "Healthy" : "Watch closely"}
          icon={Landmark}
          tone={margin > 10 ? "success" : "warning"}
        />
        <KpiCard
          label="Cash Runway"
          value={Number.isFinite(runway) ? `${runway.toFixed(1)} mo` : "Cash positive"}
          hint="At current burn rate"
          icon={Wallet}
          tone="neutral"
        />
      </div>

      <div ref={chartsRef}>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="border-border shadow-card lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Monthly Revenue vs Expense</CardTitle>
            <CardDescription>Twelve month actuals, FY2026</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={series} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis
                  tickFormatter={(v) => inr(Number(v), true)}
                  tickLine={false}
                  axisLine={false}
                  fontSize={12}
                  width={70}
                />
                <Tooltip formatter={(v) => inr(Number(v))} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="revenue" name="Revenue" fill="var(--brand)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expense" name="Expense" fill="var(--danger)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-border shadow-card">
          <CardHeader>
            <CardTitle className="text-base">Top 5 Expense Categories</CardTitle>
            <CardDescription>Share of total spend</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={topCats} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90}>
                  {topCats.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => inr(Number(v))} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="border-border shadow-card lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Cash Balance Trend</CardTitle>
            <CardDescription>Closing balance per month</CardDescription>
          </CardHeader>
          <CardContent className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series}>
                <defs>
                  <linearGradient id="cashFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--brand)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--brand)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis
                  tickFormatter={(v) => inr(Number(v), true)}
                  tickLine={false}
                  axisLine={false}
                  fontSize={12}
                  width={70}
                />
                <Tooltip formatter={(v) => inr(Number(v))} />
                <Area
                  type="monotone"
                  dataKey="cash"
                  name="Cash balance"
                  stroke="var(--brand)"
                  strokeWidth={2}
                  fill="url(#cashFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-border shadow-card">
          <CardHeader>
            <CardTitle className="text-base">Live Financial Alerts</CardTitle>
            <CardDescription>Auto-generated from current data</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {alerts.map((a) => {
              const Icon = toneIcon[a.tone];
              const tone =
                a.tone === "danger"
                  ? "bg-danger-soft text-danger"
                  : a.tone === "warning"
                    ? "bg-warning-soft text-warning"
                    : "bg-success-soft text-success";
              return (
                <div key={a.title} className="flex gap-3 rounded-lg border border-border p-3">
                  <span className={`flex size-8 shrink-0 items-center justify-center rounded-md ${tone}`}>
                    <Icon className="size-4" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold">{a.title}</p>
                    <p className="text-xs text-muted-foreground">{a.body}</p>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
      </div>
    </AppShell>
  );
}

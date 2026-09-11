import { createFileRoute } from "@tanstack/react-router";
import { Activity, Percent, PiggyBank, TrendingUp } from "lucide-react";
import { useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from "recharts";

import { AppShell } from "@/components/finance/AppShell";
import { KpiCard } from "@/components/finance/KpiCard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { actualsByCategory, inr, monthlySummary, totals } from "@/lib/finance-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/pnl")({
  head: () => ({
    meta: [
      { title: "Financial Analysis & P&L — Finance IQ" },
      {
        name: "description",
        content:
          "Interactive profit and loss statement with gross profit, EBITDA, net margin and monthly margin trends.",
      },
      { property: "og:title", content: "Financial Analysis & P&L — Finance IQ" },
      {
        property: "og:description",
        content: "Revenue to net profit walk-down with dynamic margin toggles.",
      },
    ],
  }),
  component: PnlPage,
});

function PnlPage() {
  const [showPct, setShowPct] = useState(true);
  const t = totals();
  const cats = actualsByCategory();
  const series = monthlySummary();

  const opexLines = ["Payroll", "Office Rent", "Marketing", "Utilities", "Software Subscriptions", "Legal"]
    .map((c) => ({ label: c, value: cats.get(c) ?? 0 }))
    .filter((r) => r.value > 0);

  const rows: { label: string; value: number; kind?: "sub" | "total" | "grand" }[] = [
    { label: "Gross Revenue", value: t.revenue, kind: "total" },
    { label: "Cost of Goods Sold (COGS)", value: -t.cogs, kind: "sub" },
    { label: "Gross Profit", value: t.grossProfit, kind: "total" },
    ...opexLines.map((o) => ({ label: o.label, value: -o.value, kind: "sub" as const })),
    { label: "EBITDA", value: t.ebitda, kind: "total" },
    { label: "Depreciation", value: -t.depreciation, kind: "sub" },
    { label: "Interest", value: -t.interest, kind: "sub" },
    { label: "Tax @ 25%", value: -t.tax, kind: "sub" },
    { label: "Net Profit", value: t.netProfit, kind: "grand" },
  ];

  const marginSeries = series.map((m) => ({
    month: m.month,
    grossMargin: ((m.revenue - m.revenue * 0.22) / m.revenue) * 100,
    netMargin: (m.profit / m.revenue) * 100,
  }));

  return (
    <AppShell title="Financial Analysis & P&L" subtitle="FY2026 statement of profit and loss">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Gross Profit" value={inr(t.grossProfit, true)} icon={TrendingUp} tone="success" hint={`${((t.grossProfit / t.revenue) * 100).toFixed(1)}% margin`} />
        <KpiCard label="EBITDA" value={inr(t.ebitda, true)} icon={Activity} hint={`${((t.ebitda / t.revenue) * 100).toFixed(1)}% of revenue`} />
        <KpiCard label="Net Profit" value={inr(t.netProfit, true)} icon={PiggyBank} tone={t.netProfit > 0 ? "success" : "danger"} hint="After tax & interest" />
        <KpiCard label="Net Margin" value={`${((t.netProfit / t.revenue) * 100).toFixed(1)}%`} icon={Percent} tone="neutral" hint="FY2026" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <Card className="border-border shadow-card lg:col-span-3">
          <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
            <div>
              <CardTitle className="text-base">Profit & Loss Statement</CardTitle>
              <CardDescription>Consolidated, fiscal year 2026</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="pct" checked={showPct} onCheckedChange={setShowPct} />
              <Label htmlFor="pct" className="text-xs text-muted-foreground">
                % of revenue
              </Label>
            </div>
          </CardHeader>
          <CardContent className="space-y-1">
            {rows.map((r) => (
              <div
                key={r.label}
                className={cn(
                  "flex items-center justify-between rounded-md px-3 py-2 text-sm",
                  r.kind === "sub" && "pl-7 text-muted-foreground",
                  r.kind === "total" && "bg-secondary font-semibold",
                  r.kind === "grand" && "mt-2 bg-primary font-bold text-primary-foreground",
                )}
              >
                <span>{r.label}</span>
                <span className="tabular flex items-center gap-3">
                  {showPct && (
                    <span
                      className={cn(
                        "text-xs",
                        r.kind === "grand" ? "text-primary-foreground/70" : "text-muted-foreground",
                      )}
                    >
                      {((r.value / t.revenue) * 100).toFixed(1)}%
                    </span>
                  )}
                  <span>
                    {r.value < 0 ? `(${inr(Math.abs(r.value))})` : inr(r.value)}
                  </span>
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-border shadow-card lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Margin Trend</CardTitle>
            <CardDescription>Gross and net margin by month</CardDescription>
          </CardHeader>
          <CardContent className="h-[340px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={marginSeries}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis tickFormatter={(v) => `${Number(v).toFixed(0)}%`} tickLine={false} axisLine={false} fontSize={12} width={44} />
                <Tooltip formatter={(v) => `${Number(v).toFixed(1)}%`} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="grossMargin" name="Gross margin" stroke="var(--brand)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="netMargin" name="Net margin" stroke="var(--success)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

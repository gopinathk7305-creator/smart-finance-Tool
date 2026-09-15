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

import { AiReportButton } from "@/components/finance/AiReportButton";
import { AppShell } from "@/components/finance/AppShell";
import { KpiCard } from "@/components/finance/KpiCard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { actualsByCategory, inr, monthlySummary, totals } from "@/lib/finance-data";
import { gstSummary } from "@/lib/enterprise-data";
import { useCategories } from "@/lib/categories";
import { useDataset } from "@/lib/dataset";
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
  const { txns } = useDataset();
  const { categories, cogsNames, live: liveCats } = useCategories();
  const t = totals(txns, cogsNames);
  const cats = actualsByCategory(txns);
  const series = monthlySummary(txns);
  const gst = gstSummary(t.revenue, t.expense);

  // Expense lines below gross profit follow the user's own category definitions,
  // plus any ledger category they have not defined yet.
  const belowGross = categories.filter((c) => c.kind !== "cogs").map((c) => c.name);
  const extras = [...cats.keys()].filter(
    (c) => !categories.some((cat) => cat.name.toLowerCase() === c.toLowerCase()),
  );
  const opexLines = [...belowGross, ...extras]
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

  const buildReport = () => ({
    page: "pnl" as const,
    reportName: "Income Statement, EBITDA Bridge & Tax Compliance Breakdown",
    fy: "FY 2026-27",
    kpis: [
      {
        label: "Gross Profit",
        value: inr(t.grossProfit, true),
        delta: `${((t.grossProfit / t.revenue) * 100).toFixed(1)}% margin`,
      },
      { label: "EBITDA", value: inr(t.ebitda, true), delta: `${((t.ebitda / t.revenue) * 100).toFixed(1)}% of revenue` },
      { label: "Net Profit (Post-Tax)", value: inr(t.netProfit, true), delta: "After tax & interest" },
      { label: "Net Margin", value: `${((t.netProfit / t.revenue) * 100).toFixed(1)}%`, delta: "FY 2026-27" },
    ],
    tables: [
      {
        title: "Profit & Loss Statement",
        columns: ["Line item", "Amount", "% of revenue"],
        numericFrom: 1,
        rows: rows.map((r) => [
          r.label,
          r.value < 0 ? `(${inr(Math.abs(r.value))})` : inr(r.value),
          `${((r.value / t.revenue) * 100).toFixed(1)}%`,
        ]),
      },
      {
        title: "GST & Corporate Tax Position",
        columns: ["Particulars", "Amount"],
        numericFrom: 1,
        rows: [
          ["Output GST on sales (18%)", inr(gst.outputGst)],
          ["Input tax credit on purchases", `(${inr(gst.inputCredit)})`],
          ["Net GST payable", inr(gst.payable)],
          ["Earnings before tax", inr(t.ebitda - t.depreciation - t.interest)],
          ["Corporate tax @ 25%", `(${inr(t.tax)})`],
          ["Net profit after tax", inr(t.netProfit)],
        ],
      },
      {
        title: "Monthly Margin Trend",
        columns: ["Month", "Gross margin %", "Net margin %"],
        numericFrom: 1,
        rows: marginSeries.map((m) => [
          m.month,
          `${m.grossMargin.toFixed(1)}%`,
          `${m.netMargin.toFixed(1)}%`,
        ]),
      },
    ],
    facts: `Revenue ${inr(t.revenue)}, COGS ${inr(t.cogs)}, gross profit ${inr(t.grossProfit)}, opex ${inr(t.opex)}, EBITDA ${inr(t.ebitda)}, depreciation ${inr(t.depreciation)}, interest ${inr(t.interest)}, corporate tax ${inr(t.tax)}, net profit ${inr(t.netProfit)}. Output GST ${inr(gst.outputGst)}, input credit ${inr(gst.inputCredit)}, net GST payable ${inr(gst.payable)}.`,
    chartEl: null,
  });

  return (
    <AppShell title="Financial Analysis & P&L" subtitle="FY2026 statement of profit and loss">
      <div className="mb-4 flex justify-end">
        <AiReportButton build={buildReport} />
      </div>
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

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card className="border-border shadow-card">
          <CardHeader>
            <CardTitle className="text-base">GST Breakdown</CardTitle>
            <CardDescription>Output GST payable vs input tax credit (18% standard rate)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            <div className="flex justify-between rounded-md px-3 py-2 text-sm">
              <span className="text-muted-foreground">Output GST on sales</span>
              <span className="tabular font-medium">{inr(gst.outputGst)}</span>
            </div>
            <div className="flex justify-between rounded-md px-3 py-2 text-sm">
              <span className="text-muted-foreground">Input Tax Credit (ITC) on purchases</span>
              <span className="tabular font-medium text-success">({inr(gst.inputCredit)})</span>
            </div>
            <div className="mt-2 flex justify-between rounded-md bg-primary px-3 py-2 text-sm font-bold text-primary-foreground">
              <span>Net GST payable</span>
              <span className="tabular">{inr(gst.payable)}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border shadow-card">
          <CardHeader>
            <CardTitle className="text-base">Corporate Tax Computation</CardTitle>
            <CardDescription>Statutory rate 25% on earnings before tax</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            <div className="flex justify-between rounded-md px-3 py-2 text-sm">
              <span className="text-muted-foreground">EBITDA</span>
              <span className="tabular font-medium">{inr(t.ebitda)}</span>
            </div>
            <div className="flex justify-between rounded-md px-3 py-2 text-sm">
              <span className="text-muted-foreground">Less: depreciation & interest</span>
              <span className="tabular font-medium">({inr(t.depreciation + t.interest)})</span>
            </div>
            <div className="flex justify-between rounded-md bg-secondary px-3 py-2 text-sm font-semibold">
              <span>Earnings before tax (EBT)</span>
              <span className="tabular">{inr(t.ebitda - t.depreciation - t.interest)}</span>
            </div>
            <div className="flex justify-between rounded-md px-3 py-2 text-sm">
              <span className="text-muted-foreground">Corporate tax @ 25%</span>
              <span className="tabular font-medium text-danger">({inr(t.tax)})</span>
            </div>
            <div className="mt-2 flex justify-between rounded-md bg-primary px-3 py-2 text-sm font-bold text-primary-foreground">
              <span>Net profit after tax</span>
              <span className="tabular">{inr(t.netProfit)}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

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

import { ActiveDatasetBanner } from "@/components/finance/ActiveDatasetBanner";
import { AiReportButton } from "@/components/finance/AiReportButton";
import { AppShell } from "@/components/finance/AppShell";
import { KpiCard } from "@/components/finance/KpiCard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { actualsByCategory, inr, monthlyMargins, totals } from "@/lib/finance-data";
import { pctLabel, safeMargin } from "@/lib/column-map";
import { deriveGst } from "@/lib/module-derive";
import { useCategories } from "@/lib/categories";
import { useDataset, useDatasetRaw } from "@/lib/dataset";
import { corporateTax, type CorporateRate, type SurchargeBand } from "@/lib/tax";
import { cn } from "@/lib/utils";


export const Route = createFileRoute("/pnl")({
  head: () => ({
    meta: [
      { title: "Financial Analysis & P&L — Finance IQ" },
      {
        name: "description",
        content:
          "Interactive profit and loss waterfall with gross profit, EBITDA, EBIT and a step-by-step Indian corporate tax computation.",
      },
      { property: "og:title", content: "Financial Analysis & P&L — Finance IQ" },
      {
        property: "og:description",
        content: "Revenue to net profit walk-down with surcharge, cess and Sec 115BAA options.",
      },
    ],
  }),
  component: PnlPage,
});

function PnlPage() {
  const [showPct, setShowPct] = useState(true);
  const [rate, setRate] = useState<CorporateRate>(0.25);
  const [band, setBand] = useState<SurchargeBand>("auto");
  const { txns } = useDataset();
  const { categories, cogsNames, live: liveCats } = useCategories();
  const t = totals(txns, cogsNames);
  const cats = actualsByCategory(txns);
  const marginSeries = monthlyMargins(txns, cogsNames);
  const rawRows = useDatasetRaw();
  const gst = deriveGst(rawRows, t.revenue, t.expense);
  // Net GST never shows negative: excess input credit is carried forward instead.
  const gstPayable = Math.max(0, gst.payable);
  const gstCreditAvailable = gst.payable < 0 ? Math.abs(gst.payable) : 0;


  // Taxable profit: EBITDA less depreciation & amortisation and finance cost.
  const ebit = t.ebitda - t.depreciation - t.interest;
  const tx = corporateTax(ebit, rate, band);

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
    { label: "Gross Revenue (excl. GST)", value: t.revenue, kind: "total" },
    {
      label: cogsNames.length ? `Cost of Goods Sold (${cogsNames.join(", ")})` : "Cost of Goods Sold",
      value: -t.cogs,
      kind: "sub",
    },
    { label: "Gross Profit", value: t.grossProfit, kind: "total" },
    ...opexLines.map((o) => ({ label: o.label, value: -o.value, kind: "sub" as const })),
    { label: "EBITDA", value: t.ebitda, kind: "total" },
    { label: "Depreciation & Amortisation", value: -t.depreciation, kind: "sub" },
    { label: "Finance cost / interest", value: -t.interest, kind: "sub" },
    { label: "EBIT (taxable profit)", value: ebit, kind: "total" },
    { label: `Corporate tax @ ${(rate * 100).toFixed(0)}% + surcharge + cess`, value: -tx.total, kind: "sub" },
    { label: "Net Profit After Tax", value: tx.netProfit, kind: "grand" },
  ];


  const taxRows: [string, string][] = [
    ["EBITDA", inr(t.ebitda)],
    ["Less: depreciation & amortisation", `(${inr(t.depreciation)})`],
    ["Less: finance cost", `(${inr(t.interest)})`],
    ["EBIT (taxable profit)", inr(ebit)],
    [`Base corporate tax @ ${(rate * 100).toFixed(0)}%`, inr(tx.base)],
    [`Surcharge @ ${tx.surchargePct}%`, inr(tx.surcharge)],
    ["Health & education cess @ 4%", inr(tx.cess)],
    ["Total tax payable", inr(tx.total)],
    ["Effective tax rate", `${tx.effectiveRate.toFixed(2)}%`],
    ["Net profit after tax", inr(tx.netProfit)],
  ];

  const buildReport = () => ({
    page: "pnl" as const,
    reportName: "Income Statement, EBITDA Bridge & Tax Compliance Breakdown",
    fy: "FY 2026-27",
    kpis: [
      {
        label: "Gross Profit",
        value: inr(t.grossProfit, true),
        delta: `${pctLabel(t.grossProfit, t.revenue)} margin`,
      },
      { label: "EBITDA", value: inr(t.ebitda, true), delta: `${pctLabel(t.ebitda, t.revenue)} of revenue` },
      { label: "Net Profit (Post-Tax)", value: inr(tx.netProfit, true), delta: `Effective tax ${tx.effectiveRate.toFixed(2)}%` },
      { label: "Net Margin", value: pctLabel(tx.netProfit, t.revenue), delta: "FY 2026-27" },
    ],
    tables: [
      {
        title: "Profit & Loss Statement",
        columns: ["Line item", "Amount", "% of revenue"],
        numericFrom: 1,
        rows: rows.map((r) => [
          r.label,
          r.value < 0 ? `(${inr(Math.abs(r.value))})` : inr(r.value),
          pctLabel(r.value, t.revenue),
        ]),
      },
      {
        title: "Corporate Tax Computation (step by step)",
        columns: ["Particulars", "Amount"],
        numericFrom: 1,
        rows: taxRows.map(([a, b]) => [a, b]),
      },
      {
        title: "GST Position",
        columns: ["Particulars", "Amount"],
        numericFrom: 1,
        rows: [
          ["Output GST on sales (18%)", inr(gst.outputGst)],
          ["Input tax credit on purchases", `(${inr(gst.inputCredit)})`],
          ["Net GST payable", inr(gstPayable)],
          ["Tax credit available (carry forward)", inr(gstCreditAvailable)],
        ],
      },
      {
        title: "Monthly Margin Trend",
        columns: ["Month", "Gross margin %", "Net margin %"],
        numericFrom: 1,
        rows: marginSeries.map((m) => [
          m.month,
          `${safeMargin(m.grossProfit, m.revenue).toFixed(1)}%`,
          `${safeMargin(m.ebitda, m.revenue).toFixed(1)}%`,
        ]),
      },
    ],
    facts: `Revenue ${inr(t.revenue)}, COGS ${inr(t.cogs)}, gross profit ${inr(t.grossProfit)}, opex ${inr(t.opex)}, EBITDA ${inr(t.ebitda)}, depreciation ${inr(t.depreciation)}, finance cost ${inr(t.interest)}, EBIT ${inr(ebit)}. Corporate tax base ${inr(tx.base)} at ${(rate * 100).toFixed(0)}%, surcharge ${tx.surchargePct}% ${inr(tx.surcharge)}, cess 4% ${inr(tx.cess)}, total tax ${inr(tx.total)} at an effective rate of ${tx.effectiveRate.toFixed(2)}%, net profit after tax ${inr(tx.netProfit)}. Output GST ${inr(gst.outputGst)}, input credit ${inr(gst.inputCredit)}, net GST payable ${inr(gst.payable)}.`,
    chartEl: null,
  });

  return (
    <AppShell title="Financial Analysis & P&L" subtitle="FY 2026-27 statement of profit and loss">
      <ActiveDatasetBanner />
      <div className="mb-4 flex justify-end">
        <AiReportButton build={buildReport} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Gross Profit" value={inr(t.grossProfit, true)} icon={TrendingUp} tone="success" hint={`${pctLabel(t.grossProfit, t.revenue)} margin`} />
        <KpiCard label="EBITDA" value={inr(t.ebitda, true)} icon={Activity} hint={`${pctLabel(t.ebitda, t.revenue)} of revenue`} />
        <KpiCard label="Net Profit After Tax" value={inr(tx.netProfit, true)} icon={PiggyBank} tone={tx.netProfit > 0 ? "success" : "danger"} hint={`Effective tax ${tx.effectiveRate.toFixed(2)}%`} />
        <KpiCard label="Net Margin" value={pctLabel(tx.netProfit, t.revenue)} icon={Percent} tone="neutral" hint="FY 2026-27" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <Card className="border-border shadow-card lg:col-span-3">
          <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
            <div>
              <CardTitle className="text-base">Profit & Loss Waterfall</CardTitle>
              <CardDescription>
                Revenue to net profit ·{" "}
                {liveCats ? "your expense categories" : "starter expense categories"}
              </CardDescription>
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
                      {pctLabel(r.value, t.revenue)}
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
            <CardDescription>
              Gross margin (revenue − COGS) and EBITDA margin by month
            </CardDescription>
          </CardHeader>
          <CardContent className="h-[340px]">
            {marginSeries.length === 0 ? (
              <div className="flex h-full items-center justify-center text-center text-sm text-muted-foreground">
                No dated revenue rows in this dataset yet — the monthly trend appears as soon as
                revenue with dates is available.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={marginSeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} />
                  <YAxis tickFormatter={(v) => `${Number(v).toFixed(0)}%`} tickLine={false} axisLine={false} fontSize={12} width={44} />
                  <Tooltip formatter={(v) => `${Number(v).toFixed(1)}%`} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="grossMargin" name="Gross margin" stroke="var(--brand)" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="ebitdaMargin" name="EBITDA margin" stroke="var(--success)" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="netMargin" name="Net margin" stroke="var(--warning)" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>

        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card className="border-border shadow-card">
          <CardHeader>
            <CardTitle className="text-base">GST Breakdown</CardTitle>
            <CardDescription>
              {gst.fromColumns
                ? "Output GST vs input tax credit read from your dataset's tax columns"
                : "Output GST payable vs input tax credit (estimated at the 18% standard rate)"}
            </CardDescription>

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
              <span className="tabular">{inr(gstPayable)}</span>
            </div>
            {gstCreditAvailable > 0 && (
              <div className="flex justify-between rounded-md bg-success-soft px-3 py-2 text-sm font-semibold text-success">
                <span>Tax credit available (carry forward)</span>
                <span className="tabular">{inr(gstCreditAvailable)}</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border shadow-card">
          <CardHeader className="space-y-3">
            <div>
              <CardTitle className="text-base">Corporate Tax Computation</CardTitle>
              <CardDescription>
                Base rate, surcharge and 4% health &amp; education cess on taxable profit
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Select value={String(rate)} onValueChange={(v) => setRate(Number(v) as CorporateRate)}>
                <SelectTrigger className="w-[230px] bg-background" aria-label="Corporate tax rate">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0.25">25% standard domestic rate</SelectItem>
                  <SelectItem value="0.22">22% concessional (Sec 115BAA)</SelectItem>
                </SelectContent>
              </Select>
              <Select value={band} onValueChange={(v) => setBand(v as SurchargeBand)}>
                <SelectTrigger className="w-[190px] bg-background" aria-label="Surcharge band">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Surcharge: automatic</SelectItem>
                  <SelectItem value="none">No surcharge</SelectItem>
                  <SelectItem value="7">7% (profit above ₹1 Cr)</SelectItem>
                  <SelectItem value="12">12% (profit above ₹10 Cr)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="space-y-1">
            {taxRows.slice(0, 7).map(([label, value]) => (
              <div key={label} className="flex justify-between rounded-md px-3 py-2 text-sm">
                <span className="text-muted-foreground">{label}</span>
                <span className="tabular font-medium">{value}</span>
              </div>
            ))}
            <div className="flex justify-between rounded-md bg-secondary px-3 py-2 text-sm font-semibold">
              <span>Total tax payable</span>
              <span className="tabular">
                {inr(tx.total)} · {tx.effectiveRate.toFixed(2)}% effective
              </span>
            </div>
            <div className="mt-2 flex justify-between rounded-md bg-primary px-3 py-2 text-sm font-bold text-primary-foreground">
              <span>Net profit after tax</span>
              <span className="tabular">{inr(tx.netProfit)}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { Banknote, CheckCircle2, Landmark, Scale, TriangleAlert } from "lucide-react";
import { useMemo, useRef } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { ActiveDatasetBanner } from "@/components/finance/ActiveDatasetBanner";
import { AiReportButton } from "@/components/finance/AiReportButton";
import { AppShell } from "@/components/finance/AppShell";
import { KpiCard } from "@/components/finance/KpiCard";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { deriveBalanceSheet, type BalanceLine } from "@/lib/balance-sheet";
import { useDataset, useDatasetRaw } from "@/lib/dataset";
import { useActiveDataset } from "@/lib/active-dataset";
import { ModuleSkeleton } from "@/components/finance/ModuleSkeleton";
import { formatCompactCurrency, inr, monthlySummary, totals } from "@/lib/finance-data";
import { useActiveMonthlySeries } from "@/lib/monthly-cache";

export const Route = createFileRoute("/balance-sheet")({
  head: () => ({
    meta: [
      { title: "Balance Sheet — Finance IQ" },
      {
        name: "description",
        content:
          "Assets, liabilities and equity built from your active dataset's own columns, with cash tied to the monthly cash balance trend.",
      },
      { property: "og:title", content: "Balance Sheet — Finance IQ" },
      {
        property: "og:description",
        content: "Dynamic balance sheet with retained earnings and a balanced assets = liabilities + equity check.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: BalanceSheetPage,
});

function Section({
  title,
  lines,
  total,
  totalLabel,
}: {
  title: string;
  lines: BalanceLine[];
  total: number;
  totalLabel: string;
}) {
  return (
    <Card className="border-border shadow-card">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>Mapped from the active dataset</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Line</TableHead>
              <TableHead>Source</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((l) => (
              <TableRow key={l.label}>
                <TableCell className="font-medium">{l.label}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{l.source}</TableCell>
                <TableCell className="tabular text-right">{inr(l.amount)}</TableCell>
              </TableRow>
            ))}
            <TableRow>
              <TableCell className="font-semibold">{totalLabel}</TableCell>
              <TableCell />
              <TableCell className="tabular text-right font-semibold">{inr(total)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function BalanceSheetPage() {
  const { txns, araps, live } = useDataset();
  const { syncing } = useActiveDataset();
  const rawRows = useDatasetRaw();
  const clientSeries = useMemo(() => monthlySummary(txns), [txns]);
  const { series } = useActiveMonthlySeries(clientSeries);
  const t = useMemo(() => totals(txns), [txns]);

  // Cash & cash equivalents read the same closing balance the trend chart plots,
  // so a change in monthly net cash flow moves both views together.
  const cashBalance = series.length ? (series[series.length - 1]?.cash ?? 0) : 0;

  const sheet = useMemo(
    () =>
      deriveBalanceSheet({
        rows: rawRows,
        cashBalance,
        revenue: t.revenue,
        expense: t.expense,
        araps,
      }),
    [rawRows, cashBalance, t.revenue, t.expense, araps],
  );

  const chartRef = useRef<HTMLDivElement>(null);

  const buildReport = () => ({
    page: "balance-sheet" as const,
    reportName: "Balance Sheet Statement",
    fy: "FY 2026-27",
    kpis: [
      { label: "Total Assets", value: inr(sheet.totalAssets, true), delta: "as at period end" },
      { label: "Total Liabilities", value: inr(sheet.totalLiabilities, true), delta: "payables & loans" },
      { label: "Total Equity", value: inr(sheet.totalEquity, true), delta: "incl. retained earnings" },
      { label: "Cash & Equivalents", value: inr(sheet.cash, true), delta: "closing balance" },
    ],
    tables: [
      {
        title: "Assets",
        columns: ["Line", "Amount"],
        numericFrom: 1,
        rows: [...sheet.assets.map((l) => [l.label, inr(l.amount)]), ["Total Assets", inr(sheet.totalAssets)]],
      },
      {
        title: "Liabilities & Equity",
        columns: ["Line", "Amount"],
        numericFrom: 1,
        rows: [
          ...sheet.liabilities.map((l) => [l.label, inr(l.amount)]),
          ["Total Liabilities", inr(sheet.totalLiabilities)],
          ...sheet.equity.map((l) => [l.label, inr(l.amount)]),
          ["Total Equity", inr(sheet.totalEquity)],
        ],
      },
    ],
    facts: `Total assets ${inr(sheet.totalAssets)}, total liabilities ${inr(sheet.totalLiabilities)}, total equity ${inr(sheet.totalEquity)}, retained earnings (net income) ${inr(sheet.netIncome)}, cash and cash equivalents ${inr(sheet.cash)}. The sheet balances: assets equal liabilities plus equity. Line detail: ${[...sheet.assets, ...sheet.liabilities, ...sheet.equity].map((l) => `${l.label} ${inr(l.amount)} (${l.source})`).join("; ")}. Data source: ${live ? "uploaded dataset" : "demo dataset"}.`,
    chartEl: chartRef.current,
  });

  if (syncing)
    return (
      <AppShell title="Balance Sheet" subtitle="Loading the selected dataset…">
        <ModuleSkeleton />
      </AppShell>
    );

  return (
    <AppShell
      title="Balance Sheet"
      subtitle={
        sheet.fromColumns
          ? "Assets, liabilities and equity read from your file's own columns"
          : "Built from your cash trend, AR/AP ledger and net income"
      }
    >
      <ActiveDatasetBanner />
      <div className="mb-4 flex justify-end">
        <AiReportButton build={buildReport} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total Assets" value={inr(sheet.totalAssets, true)} icon={Landmark} tone="neutral" />
        <KpiCard
          label="Total Liabilities"
          value={inr(sheet.totalLiabilities, true)}
          icon={Scale}
          tone="warning"
        />
        <KpiCard
          label="Total Equity"
          value={inr(sheet.totalEquity, true)}
          hint={`retained earnings ${inr(sheet.netIncome, true)}`}
          icon={Scale}
          tone={sheet.totalEquity >= 0 ? "success" : "danger"}
        />
        <KpiCard
          label="Cash & Equivalents"
          value={inr(sheet.cash, true)}
          hint="linked to the cash trend below"
          icon={Banknote}
          tone="neutral"
        />
      </div>

      <div className="mt-4 flex items-center gap-2">
        {sheet.balanced ? (
          <Badge className="bg-success-soft text-success hover:bg-success-soft">
            <CheckCircle2 className="mr-1 size-3.5" /> Balanced — assets = liabilities + equity (
            {inr(sheet.totalAssets)})
          </Badge>
        ) : (
          <Badge className="bg-danger-soft text-danger hover:bg-danger-soft">
            <TriangleAlert className="mr-1 size-3.5" /> Out of balance by{" "}
            {inr(Math.abs(sheet.totalAssets - (sheet.totalLiabilities + sheet.totalEquity)))}
          </Badge>
        )}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Section title="Assets" lines={sheet.assets} total={sheet.totalAssets} totalLabel="Total Assets" />
        <div className="grid gap-4">
          <Section
            title="Liabilities"
            lines={sheet.liabilities}
            total={sheet.totalLiabilities}
            totalLabel="Total Liabilities"
          />
          <Section title="Equity" lines={sheet.equity} total={sheet.totalEquity} totalLabel="Total Equity" />
        </div>
      </div>

      <Card ref={chartRef} className="mt-4 border-border shadow-card">
        <CardHeader>
          <CardTitle className="text-base">Cash Balance Trend</CardTitle>
          <CardDescription>
            Closing balance per month — the final point is the Cash &amp; Cash Equivalents line above
          </CardDescription>
        </CardHeader>
        <CardContent className="h-[280px]">
          {series.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              No dated rows in this dataset yet.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ right: 36 }}>
                <defs>
                  <linearGradient id="bsCashFill" x1="0" y1="0" x2="0" y2="1">
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
                  fill="url(#bsCashFill)"
                >
                  <LabelList
                    dataKey="cash"
                    position="top"
                    style={{ fontSize: 9, fill: "var(--muted-foreground)" }}
                    formatter={(val: number) => formatCompactCurrency(Number(val))}
                  />
                </Area>
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}

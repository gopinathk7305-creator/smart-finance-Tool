import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRightLeft, History as HistoryIcon, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { AppShell } from "@/components/finance/AppShell";
import { chartLabelProps, moneyDataLabel } from "@/components/finance/ChartDataLabels";
import { KpiCard } from "@/components/finance/KpiCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useActiveDataset } from "@/lib/active-dataset";
import { useAuth } from "@/lib/auth";
import { safeMargin } from "@/lib/column-map";
import { formatCompactCurrency, inr } from "@/lib/finance-data";
import { useMonthlyCache } from "@/lib/monthly-cache";
import { comparisonMonths, comparisonReady } from "@/lib/dataset-comparison";
import { useDataset } from "@/lib/dataset";
import { useCategories } from "@/lib/categories";
import { BASE_SCENARIO, loadScenarios, runForecast, type SavedScenario } from "@/lib/forecast-engine";

export const Route = createFileRoute("/compare")({
  head: () => ({
    meta: [
      { title: "Compare Datasets — Finance IQ" },
      {
        name: "description",
        content:
          "Put two uploaded datasets side by side and see how revenue, expenses, profit and margin differ month by month.",
      },
      { property: "og:title", content: "Compare Datasets — Finance IQ" },
      {
        property: "og:description",
        content: "Side-by-side revenue, expense and margin comparison between any two datasets.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ComparePage,
});

interface SummaryRow {
  revenue: number | string;
  expenses: number | string;
  txn_count: number;
  payroll_count?: number;
  arap_count?: number;
}

function useDatasetTotals(sourceFile: string | null) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["compare-summary", user?.id ?? "anon", sourceFile ?? "none"],
    enabled: !!user && !!sourceFile,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      if (!sourceFile) throw new Error("Select a dataset first.");
      const { data, error } = await supabase.rpc("dataset_summary", {
        p_source_file: sourceFile,
      });
      if (error) throw new Error(error.message);
      const row = (Array.isArray(data) ? data[0] : data) as SummaryRow | undefined;
      const revenue = Number(row?.revenue) || 0;
      const expenses = Number(row?.expenses) || 0;
      return { revenue, expenses, netProfit: revenue - expenses, rows: Number(row?.txn_count ?? 0) + Number(row?.payroll_count ?? 0) + Number(row?.arap_count ?? 0) };
    },
  });
}

const EMPTY = { revenue: 0, expenses: 0, netProfit: 0, rows: 0 };

function ComparePage() {
  const { datasets, active, activeFile } = useActiveDataset();
  const [leftChoice, setLeft] = useState<string | null>(null);
  const [right, setRight] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedScenario[]>([]);
  const dataset = useDataset();
  const { payrollNames } = useCategories();
  const payrollKey = JSON.stringify(payrollNames);
  const stablePayrollNames = useMemo<string[]>(() => JSON.parse(payrollKey), [payrollKey]);
  const scenarioSelected = right?.startsWith("scenario:") ?? false;
  const left = scenarioSelected ? activeFile : datasets.some((d) => d.file_name === leftChoice)
    ? leftChoice : activeFile ?? datasets[0]?.file_name ?? null;
  const rightFile = !scenarioSelected && datasets.some((d) => d.file_name === right) ? right : null;

  useEffect(() => {
    const refresh = () => setSaved(loadScenarios());
    refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const activeBase = active?.base_name || active?.file_name || null;
  const versions = useMemo(() => datasets
    .filter((d) => (d.base_name || d.file_name) === activeBase)
    .sort((x, y) => (y.version ?? 1) - (x.version ?? 1)), [datasets, activeBase]);

  const leftTotals = useDatasetTotals(left);
  const rightTotals = useDatasetTotals(rightFile);
  const leftMonthly = useMonthlyCache(left, !!left);
  const rightMonthly = useMonthlyCache(rightFile, !!rightFile);

  const projection = useMemo(() => {
    if (!scenarioSelected || !activeFile || dataset.loading ||
        (!dataset.txns.length && !dataset.pays.length)) return null;
    const inputs = right === "scenario:baseline" ? BASE_SCENARIO
      : saved[Number(right?.slice("scenario:".length))]?.inputs;
    if (!inputs) return null;
    return runForecast(inputs, dataset.txns, dataset.pays, stablePayrollNames);
  }, [scenarioSelected, right, activeFile, dataset.loading, dataset.txns, dataset.pays, saved, stablePayrollNames]);
  const scenarioSeries = useMemo(() => projection?.rows.map((row) => {
    const baseline = right === "scenario:baseline";
    return { month: row.month, revenue: baseline ? row.baseRevenue : row.scenRevenue,
      expense: baseline ? row.baseExpense : row.scenExpense,
      profit: baseline ? row.baseProfit : row.scenProfit,
      cash: baseline ? row.baseCash : row.scenCash };
  }) ?? [], [projection, right]);
  const scenarioTotals = useMemo(() => projection ? {
    revenue: scenarioSeries.reduce((sum, row) => sum + row.revenue, 0),
    expenses: scenarioSeries.reduce((sum, row) => sum + row.expense, 0),
    netProfit: scenarioSeries.reduce((sum, row) => sum + row.profit, 0),
    rows: dataset.txns.length || dataset.pays.length,
  } : undefined, [projection, scenarioSeries, dataset.txns.length, dataset.pays.length]);
  const a = leftTotals.data ?? EMPTY;
  const b = (scenarioSelected ? scenarioTotals : rightTotals.data) ?? EMPTY;
  const loading = leftTotals.isFetching || (!!rightFile && rightTotals.isFetching) ||
    (scenarioSelected && dataset.loading);
  const error = leftTotals.error || rightTotals.error;
  const ready = !loading && !error && comparisonReady(leftTotals.data,
    scenarioSelected ? scenarioTotals : rightTotals.data);

  const marginA = safeMargin(a.netProfit, a.revenue);
  const marginB = safeMargin(b.netProfit, b.revenue);
  const diff = (x: number, y: number) => y - x;
  const pct = (x: number, y: number) => (x > 0 ? ((y - x) / x) * 100 : 0);

  const monthly = useMemo(() => comparisonMonths(leftMonthly.series,
    scenarioSelected ? scenarioSeries : rightMonthly.series),
    [leftMonthly.series, rightMonthly.series, scenarioSelected, scenarioSeries]);

  const shortA = left ?? "Dataset A";
  const shortB = right === "scenario:baseline" ? "Forecast baseline"
    : scenarioSelected ? saved[Number(right?.slice("scenario:".length))]?.name ?? "Saved scenario"
    : rightFile ?? "Dataset B";

  const rows: { label: string; a: string; b: string; delta: string }[] = ready ? [
    {
      label: "Total revenue",
      a: inr(a.revenue, true),
      b: inr(b.revenue, true),
      delta: `${inr(diff(a.revenue, b.revenue), true)} (${pct(a.revenue, b.revenue).toFixed(1)}%)`,
    },
    {
      label: "Total expenses",
      a: inr(a.expenses, true),
      b: inr(b.expenses, true),
      delta: `${inr(diff(a.expenses, b.expenses), true)} (${pct(a.expenses, b.expenses).toFixed(1)}%)`,
    },
    {
      label: "Net profit",
      a: inr(a.netProfit, true),
      b: inr(b.netProfit, true),
      delta: inr(diff(a.netProfit, b.netProfit), true),
    },
    {
      label: "Net margin",
      a: `${marginA.toFixed(1)}%`,
      b: `${marginB.toFixed(1)}%`,
      delta: `${(marginB - marginA).toFixed(1)} pts`,
    },
    {
      label: "Records",
      a: a.rows.toLocaleString("en-IN"),
      b: b.rows.toLocaleString("en-IN"),
      delta: (b.rows - a.rows).toLocaleString("en-IN"),
    },
  ] : [];

  return (
    <AppShell
      title="Compare Datasets"
      subtitle="Two datasets side by side · revenue, expenses and margin differences"
    >
      <Card className="border-border shadow-card">
        <CardContent className="flex flex-wrap items-center gap-3 py-4">
          <Select value={left ?? ""} disabled={scenarioSelected} onValueChange={(v) => setLeft(v)}>
            <SelectTrigger aria-label="Dataset A" className="w-full sm:w-[300px]">
              <SelectValue placeholder="Choose first dataset" />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {datasets.map((d) => (
                <SelectItem key={d.id} value={d.file_name}>
                  {d.file_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <ArrowRightLeft className="size-4 text-muted-foreground" />
          <Select value={right ?? "none"} onValueChange={(v) => {
            setRight(v === "none" ? null : v);
            if (v.startsWith("scenario:")) setLeft(activeFile);
          }}>
            <SelectTrigger aria-label="Dataset B" className="w-full sm:w-[300px]">
              <SelectValue placeholder="Choose second dataset" />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value="none">Choose second dataset</SelectItem>
              {datasets.map((d) => (
                <SelectItem key={d.id} value={d.file_name}>
                  {d.file_name} · v{d.version ?? 1}
                </SelectItem>
              ))}
              {activeFile && <SelectItem value="scenario:baseline">Forecast baseline · active dataset</SelectItem>}
              {activeFile && saved.map((scenario, index) => (
                <SelectItem key={`scenario:${index}`} value={`scenario:${index}`}>
                  {scenario.name} · saved scenario
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {loading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
          {datasets.length < 2 && (
            <span className="text-sm text-muted-foreground">
              Upload a second file to compare two datasets.
            </span>
          )}
        </CardContent>
      </Card>

      {versions.length > 0 && (
        <Card className="mt-4 border-border shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <HistoryIcon className="size-4 text-brand" /> Version history — {activeBase}
            </CardTitle>
            <CardDescription>
              Every upload of this file is kept with its date. Pick a past version to compare it against the
              one you have active.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Version</TableHead>
                  <TableHead>Uploaded</TableHead>
                  <TableHead className="text-right">Rows</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {versions.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell className="font-medium">
                      <span className="flex items-center gap-2">
                        Version {v.version ?? 1}
                        {v.file_name === activeFile && (
                          <Badge className="bg-success-soft text-success">Active</Badge>
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {new Date(v.created_at).toLocaleString("en-IN")}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {(v.row_count ?? 0).toLocaleString("en-IN")}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!activeFile || v.file_name === activeFile}
                        onClick={() => {
                          setLeft(activeFile);
                          setRight(v.file_name);
                        }}
                      >
                        Compare with active
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {!ready ? (
        <section className="mt-6 flex min-h-64 flex-col items-center justify-center gap-3 border-y border-border px-6 py-10 text-center" aria-live="polite">
          <ArrowRightLeft className="size-8 text-muted-foreground" />
          <p className="max-w-lg text-sm font-medium text-foreground">
            {loading ? "Loading comparison…" : error ? "Comparison could not be loaded. Please retry."
              : "Select a second dataset or upload a past version to view comparison"}
          </p>
          {!loading && !error && rightFile && b.rows === 0 && <p className="text-sm text-muted-foreground">Dataset B contains no records.</p>}
          {!loading && error && <Button variant="outline" onClick={() => {
            void leftTotals.refetch();
            if (rightFile) void rightTotals.refetch();
          }}>Retry</Button>}
        </section>
      ) : <>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Revenue difference"
          value={formatCompactCurrency(diff(a.revenue, b.revenue))}
          hint={`${shortB} vs ${shortA}`}
        />
        <KpiCard
          label="Expense difference"
          value={formatCompactCurrency(diff(a.expenses, b.expenses))}
          hint={`${shortB} vs ${shortA}`}
        />
        <KpiCard
          label="Profit difference"
          value={formatCompactCurrency(diff(a.netProfit, b.netProfit))}
          hint="Net of all expenses"
        />
        <KpiCard
          label="Margin difference"
          value={`${(marginB - marginA).toFixed(1)} pts`}
          hint={`${marginA.toFixed(1)}% vs ${marginB.toFixed(1)}%`}
        />
      </div>

      <Card className="mt-4 border-border shadow-card">
        <CardHeader>
          <CardTitle className="text-base">Side-by-side totals</CardTitle>
          <CardDescription>Precomputed figures for each dataset</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Metric</TableHead>
                <TableHead className="text-right">{shortA}</TableHead>
                <TableHead className="text-right">{shortB}</TableHead>
                <TableHead className="text-right">Difference</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.label}>
                  <TableCell className="font-medium">{r.label}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{r.a}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{r.b}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{r.delta}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card className="border-border shadow-card">
          <CardHeader>
            <CardTitle className="text-base">Monthly revenue</CardTitle>
            <CardDescription>Both datasets, month by month</CardDescription>
          </CardHeader>
          <CardContent className="min-w-0 overflow-x-auto">
            <div className="h-[320px]" style={{ minWidth: Math.max(640, monthly.length * 200) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthly} barGap={24} barCategoryGap="18%" margin={{ top: 40, right: 24, bottom: 12 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={11} />
                <YAxis
                  tickFormatter={(v) => formatCompactCurrency(Number(v))}
                  tickLine={false}
                  axisLine={false}
                  fontSize={11}
                  width={64}
                />
                <Tooltip formatter={(v) => inr(Number(v))} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                <Bar isAnimationActive={false} dataKey="revenueA" name={shortA} fill="var(--brand)" radius={[4, 4, 0, 0]}><LabelList dataKey="revenueA" position="top" offset={12} {...chartLabelProps} formatter={moneyDataLabel} /></Bar>
                <Bar isAnimationActive={false} dataKey="revenueB" name={shortB} fill="var(--primary)" radius={[4, 4, 0, 0]}><LabelList dataKey="revenueB" position="top" offset={12} {...chartLabelProps} formatter={moneyDataLabel} /></Bar>
              </BarChart>
            </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border shadow-card">
          <CardHeader>
            <CardTitle className="text-base">Monthly expenses</CardTitle>
            <CardDescription>Both datasets, month by month</CardDescription>
          </CardHeader>
          <CardContent className="min-w-0 overflow-x-auto">
            <div className="h-[320px]" style={{ minWidth: Math.max(640, monthly.length * 200) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthly} barGap={24} barCategoryGap="18%" margin={{ top: 40, right: 24, bottom: 12 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={11} />
                <YAxis
                  tickFormatter={(v) => formatCompactCurrency(Number(v))}
                  tickLine={false}
                  axisLine={false}
                  fontSize={11}
                  width={64}
                />
                <Tooltip formatter={(v) => inr(Number(v))} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                <Bar isAnimationActive={false} dataKey="expenseA" name={shortA} fill="var(--danger)" radius={[4, 4, 0, 0]}><LabelList dataKey="expenseA" position="top" offset={12} {...chartLabelProps} formatter={moneyDataLabel} /></Bar>
                <Bar isAnimationActive={false} dataKey="expenseB" name={shortB} fill="var(--warning)" radius={[4, 4, 0, 0]}><LabelList dataKey="expenseB" position="top" offset={12} {...chartLabelProps} formatter={moneyDataLabel} /></Bar>
              </BarChart>
            </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4 border-border shadow-card">
        <CardHeader>
          <CardTitle className="text-base">Cash balance paths</CardTitle>
          <CardDescription>Closing balance per month for both datasets</CardDescription>
        </CardHeader>
        <CardContent className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={monthly} margin={{ top: 24, right: 16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={11} />
              <YAxis
                tickFormatter={(v) => formatCompactCurrency(Number(v))}
                tickLine={false}
                axisLine={false}
                fontSize={11}
                width={70}
              />
              <Tooltip formatter={(v) => inr(Number(v))} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
              <Line isAnimationActive={false} type="monotone" dataKey="cashA" name={shortA} stroke="var(--brand)" strokeWidth={2} dot={{ r: 3 }}><LabelList dataKey="cashA" position="top" {...chartLabelProps} formatter={moneyDataLabel} /></Line>
              <Line isAnimationActive={false} type="monotone" dataKey="cashB" name={shortB} stroke="var(--primary)" strokeWidth={2} dot={{ r: 3 }}><LabelList dataKey="cashB" position="bottom" {...chartLabelProps} formatter={moneyDataLabel} /></Line>
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
      </>}
    </AppShell>
  );
}

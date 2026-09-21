import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRightLeft, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { AppShell } from "@/components/finance/AppShell";
import { KpiCard } from "@/components/finance/KpiCard";
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
      const { data, error } = await supabase.rpc("dataset_summary", {
        p_source_file: sourceFile!,
      });
      if (error) throw new Error(error.message);
      const row = (Array.isArray(data) ? data[0] : data) as SummaryRow | undefined;
      const revenue = Number(row?.revenue) || 0;
      const expenses = Number(row?.expenses) || 0;
      return { revenue, expenses, netProfit: revenue - expenses, rows: row?.txn_count ?? 0 };
    },
  });
}

const EMPTY = { revenue: 0, expenses: 0, netProfit: 0, rows: 0 };

function ComparePage() {
  const { datasets, activeFile } = useActiveDataset();
  const [left, setLeft] = useState<string | null>(null);
  const [right, setRight] = useState<string | null>(null);

  // Default: the active dataset on the left, the next most recent on the right.
  useEffect(() => {
    if (datasets.length === 0) return;
    setLeft((cur) => cur ?? activeFile ?? datasets[0]!.file_name);
    setRight((cur) => {
      if (cur) return cur;
      const first = activeFile ?? datasets[0]!.file_name;
      return datasets.find((d) => d.file_name !== first)?.file_name ?? null;
    });
  }, [datasets, activeFile]);

  const leftTotals = useDatasetTotals(left);
  const rightTotals = useDatasetTotals(right);
  const leftMonthly = useMonthlyCache(left);
  const rightMonthly = useMonthlyCache(right);

  const a = leftTotals.data ?? EMPTY;
  const b = rightTotals.data ?? EMPTY;
  const loading = leftTotals.isLoading || rightTotals.isLoading;

  const marginA = safeMargin(a.netProfit, a.revenue);
  const marginB = safeMargin(b.netProfit, b.revenue);
  const diff = (x: number, y: number) => y - x;
  const pct = (x: number, y: number) => (x > 0 ? ((y - x) / x) * 100 : 0);

  const monthly = useMemo(() => {
    const labels = (leftMonthly.series.length ? leftMonthly.series : rightMonthly.series).map(
      (m) => m.month,
    );
    return labels.map((month, i) => ({
      month,
      revenueA: leftMonthly.series[i]?.revenue ?? 0,
      revenueB: rightMonthly.series[i]?.revenue ?? 0,
      expenseA: leftMonthly.series[i]?.expense ?? 0,
      expenseB: rightMonthly.series[i]?.expense ?? 0,
      cashA: leftMonthly.series[i]?.cash ?? 0,
      cashB: rightMonthly.series[i]?.cash ?? 0,
    }));
  }, [leftMonthly.series, rightMonthly.series]);

  const shortA = left ?? "Dataset A";
  const shortB = right ?? "Dataset B";

  const rows: { label: string; a: string; b: string; delta: string }[] = [
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
  ];

  return (
    <AppShell
      title="Compare Datasets"
      subtitle="Two datasets side by side · revenue, expenses and margin differences"
    >
      <Card className="border-border shadow-card">
        <CardContent className="flex flex-wrap items-center gap-3 py-4">
          <Select value={left ?? ""} onValueChange={(v) => setLeft(v)}>
            <SelectTrigger className="w-[260px]">
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
          <Select value={right ?? ""} onValueChange={(v) => setRight(v)}>
            <SelectTrigger className="w-[260px]">
              <SelectValue placeholder="Choose second dataset" />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {datasets.map((d) => (
                <SelectItem key={d.id} value={d.file_name}>
                  {d.file_name}
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
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthly} barGap={4}>
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
                <Bar dataKey="revenueA" name={shortA} fill="var(--brand)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="revenueB" name={shortB} fill="var(--primary)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-border shadow-card">
          <CardHeader>
            <CardTitle className="text-base">Monthly expenses</CardTitle>
            <CardDescription>Both datasets, month by month</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthly} barGap={4}>
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
                <Bar dataKey="expenseA" name={shortA} fill="var(--danger)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expenseB" name={shortB} fill="var(--warning)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
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
            <LineChart data={monthly}>
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
              <Line type="monotone" dataKey="cashA" name={shortA} stroke="var(--brand)" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="cashB" name={shortB} stroke="var(--primary)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </AppShell>
  );
}

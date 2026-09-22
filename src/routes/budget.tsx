import { createFileRoute } from "@tanstack/react-router";
import { Plus, Scale, Target, Trash2, Wallet } from "lucide-react";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";

import { AiReportButton } from "@/components/finance/AiReportButton";
import { AppShell } from "@/components/finance/AppShell";
import { KpiCard } from "@/components/finance/KpiCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { FISCAL_YEARS, useBudget } from "@/lib/budget";
import { useCategories } from "@/lib/categories";
import { useDataset } from "@/lib/dataset";
import { useActiveDataset } from "@/lib/active-dataset";
import { ModuleSkeleton } from "@/components/finance/ModuleSkeleton";
import { actualsByCategory, inr, monthlySummary } from "@/lib/finance-data";
import { BASE_SCENARIO, FY_MONTHS, runForecast } from "@/lib/forecast-engine";

export const Route = createFileRoute("/budget")({
  head: () => ({
    meta: [
      { title: "Budget Planning & Variance — Finance IQ" },
      {
        name: "description",
        content:
          "Enter your planned budget by category and department, then compare it against real ledger spend and the twelve-month forecast.",
      },
      { property: "og:title", content: "Budget Planning & Variance — Finance IQ" },
      {
        property: "og:description",
        content: "Budget vs actual variance and budget vs forecast gap analysis for the Indian fiscal year.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: BudgetPage,
});

function BudgetPage() {
  const [fy, setFy] = useState<string>(FISCAL_YEARS[0]);
  const [query, setQuery] = useState("");
  const { txns, pays, live } = useDataset();
  const { syncing } = useActiveDataset();
  const { categories, payrollNames } = useCategories();
  const budget = useBudget(fy);

  const [category, setCategory] = useState("");
  const [department, setDepartment] = useState("");
  const [amount, setAmount] = useState("");
  const [month, setMonth] = useState("Annual");

  const actuals = useMemo(() => actualsByCategory(txns), [txns]);
  const forecast = useMemo(
    () => runForecast({ ...BASE_SCENARIO, fy: "FY 2026-27" }, txns, pays, payrollNames),
    [txns, pays, payrollNames],
  );
  const forecastSpend = forecast.rows.reduce((s, r) => s + r.opex + r.payroll, 0);

  const rows = useMemo(
    () =>
      budget.rows.map((b) => {
        const actual = actuals.get(b.category) ?? 0;
        const variance = actual - b.budgeted_amount;
        return {
          ...b,
          actual,
          variance,
          variancePct: b.budgeted_amount ? (variance / b.budgeted_amount) * 100 : 0,
        };
      }),
    [budget.rows, actuals],
  );

  const actualTotal = rows.reduce((s, r) => s + r.actual, 0);
  const plannedTotal = budget.plannedTotal;
  const totalVariance = actualTotal - plannedTotal;

  const filtered = rows.filter((r) =>
    `${r.category} ${r.department}`.toLowerCase().includes(query.toLowerCase()),
  );

  // Budget vs forecast: the forecast's twelve-month spend split by each
  // category's share of actual spend to date.
  const forecastRows = useMemo(() => {
    const share = (name: string) => {
      const actual = actuals.get(name) ?? 0;
      return actualTotal ? actual / actualTotal : 0;
    };
    return rows.map((r) => {
      const projected = forecastSpend * share(r.category);
      return { ...r, projected, gap: projected - r.budgeted_amount };
    });
  }, [rows, actuals, actualTotal, forecastSpend]);

  const forecastGap = forecastSpend - plannedTotal;

  // Monthly plan vs actual: the annual plan spread evenly across twelve months
  // against the real month-by-month spend from the active dataset.
  const monthlyPlan = useMemo(() => {
    const perMonth = budget.annualTotal / 12;
    return monthlySummary(txns).map((m) => {
      // A month-specific target wins over the annual plan spread evenly.
      const target = budget.byMonth.get(m.month);
      const plan = target ?? perMonth;
      const variance = m.expense - plan;
      return {
        month: m.month,
        plan: Math.round(plan),
        custom: target !== undefined,
        actual: m.expense,
        variance,
        variancePct: plan ? (variance / plan) * 100 : 0,
      };
    });
  }, [txns, budget.annualTotal, budget.byMonth]);

  const submit = async () => {
    const value = Number(amount.replace(/[^0-9.]/g, ""));
    if (!category) {
      toast.error("Pick a category for this budget line.");
      return;
    }
    if (!value) {
      toast.error("Enter the planned amount in rupees.");
      return;
    }
    try {
      await budget.add({
        fiscal_year: fy,
        category,
        department: department || "General",
        budgeted_amount: value,
        month,
      });
      setAmount("");
      setDepartment("");
      toast.success(
        `${category} budget of ${inr(value)} saved${month === "Annual" ? "" : ` for ${month}`}`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save that budget line.");
    }
  };

  const buildReport = () => ({
    page: "budget" as const,
    reportName: "Budget Plan, Variance Analysis & Forecast Gap Statement",
    fy,
    kpis: [
      { label: "Planned Budget", value: inr(plannedTotal, true), delta: `${rows.length} budget lines` },
      { label: "Actual Spend", value: inr(actualTotal, true), delta: "Ledger to date" },
      {
        label: "Variance",
        value: inr(Math.abs(totalVariance), true),
        delta: totalVariance > 0 ? "over plan" : "under plan",
      },
      {
        label: "Forecast Gap",
        value: inr(Math.abs(forecastGap), true),
        delta: forecastGap > 0 ? "forecast above plan" : "forecast within plan",
      },
    ],
    tables: [
      {
        title: "Budget vs Actual by Category",
        columns: ["Category", "Department", "Budgeted", "Actual", "Variance", "Variance %"],
        numericFrom: 2,
        rows: rows.map((r) => [
          r.category,
          r.department,
          inr(r.budgeted_amount),
          inr(r.actual),
          `${r.variance > 0 ? "+" : "-"}${inr(Math.abs(r.variance))}`,
          `${r.variancePct.toFixed(1)}%`,
        ]),
      },
      {
        title: "Budget vs 12-Month Forecast",
        columns: ["Category", "Planned", "Forecast projection", "Gap"],
        numericFrom: 1,
        rows: forecastRows.map((r) => [
          r.category,
          inr(r.budgeted_amount),
          inr(r.projected),
          `${r.gap > 0 ? "+" : "-"}${inr(Math.abs(r.gap))}`,
        ]),
      },
    ],
    facts: `Fiscal year ${fy}. Planned budget ${inr(plannedTotal)} across ${rows.length} lines. Actual ledger spend ${inr(actualTotal)}, variance ${inr(totalVariance)} (${plannedTotal ? ((totalVariance / plannedTotal) * 100).toFixed(1) : "0"}%). Twelve-month forecast operating and payroll spend ${inr(forecastSpend)}, gap to plan ${inr(forecastGap)}. Line detail: ${rows
      .map((r) => `${r.category} planned ${inr(r.budgeted_amount)} actual ${inr(r.actual)} variance ${r.variancePct.toFixed(1)}%`)
      .join("; ")}. Data source: ${live ? "uploaded ledger" : "demo dataset"}.`,
    chartEl: null,
  });

  if (syncing)
    return (
      <AppShell title="Budget Planning & Variance" subtitle="Loading the selected dataset…">
        <ModuleSkeleton />
      </AppShell>
    );

  return (
    <AppShell
      title="Budget Planning & Variance"
      subtitle={`${fy} · ${live ? "your saved plan and uploaded ledger" : "sample plan — sign in to enter your own"}`}
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Planned Budget" value={inr(plannedTotal, true)} icon={Target} hint={`${rows.length} lines`} />
        <KpiCard label="Actual Spend" value={inr(actualTotal, true)} icon={Wallet} tone="warning" hint="ledger to date" />
        <KpiCard
          label="Variance vs Plan"
          value={`${totalVariance >= 0 ? "+" : "−"}${inr(Math.abs(totalVariance), true)}`}
          delta={plannedTotal ? (totalVariance / plannedTotal) * 100 : 0}
          invertDelta
          hint="actual vs plan"
          icon={Scale}
          tone={totalVariance > 0 ? "danger" : "success"}
        />
        <KpiCard
          label="Forecast Gap"
          value={`${forecastGap >= 0 ? "+" : "−"}${inr(Math.abs(forecastGap), true)}`}
          hint={`12M forecast ${inr(forecastSpend, true)}`}
          icon={Scale}
          tone={forecastGap > 0 ? "danger" : "success"}
        />
      </div>

      <Card className="mt-4 border-border shadow-card">
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-base">Enter a budget line</CardTitle>
            <CardDescription>
              Planned spend for a category and department — saved to your account
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Select value={fy} onValueChange={setFy}>
              <SelectTrigger className="w-40 bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {budget.fiscalYears.map((f) => (
                  <SelectItem key={f} value={f}>
                    {f}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <AiReportButton build={buildReport} size="default" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-5">
            <div className="space-y-1.5">
              <Label htmlFor="budget-category" className="text-xs">
                Category
              </Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger id="budget-category" className="bg-background">
                  <SelectValue placeholder="Choose a category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.name}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="budget-dept" className="text-xs">
                Department
              </Label>
              <Input
                id="budget-dept"
                placeholder="Engineering"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="bg-background"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="budget-amount" className="text-xs">
                Planned amount (₹)
              </Label>
              <Input
                id="budget-amount"
                placeholder="2400000"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="bg-background"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="budget-month" className="text-xs">
                Applies to
              </Label>
              <Select value={month} onValueChange={setMonth}>
                <SelectTrigger id="budget-month" className="bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Annual">Whole year</SelectItem>
                  {FY_MONTHS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m} only
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button className="w-full" disabled={budget.saving} onClick={() => void submit()}>
                <Plus className="size-4" /> {budget.saving ? "Saving…" : "Add budget line"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-4 border-border shadow-card">
        <CardHeader>
          <CardTitle className="text-base">Budget vs Actual by Category</CardTitle>
          <CardDescription>Planned spend against real ledger spend</CardDescription>
        </CardHeader>
        <CardContent className="h-[360px]">
          {rows.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              No budget lines for {fy} yet — add one above.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} layout="vertical" margin={{ left: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                <XAxis
                  type="number"
                  tickFormatter={(v) => inr(Number(v), true)}
                  tickLine={false}
                  axisLine={false}
                  fontSize={12}
                />
                <YAxis type="category" dataKey="category" width={140} tickLine={false} axisLine={false} fontSize={12} />
                <Tooltip formatter={(v) => inr(Number(v))} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="budgeted_amount" name="Planned" fill="var(--primary)" radius={[0, 4, 4, 0]} />
                <Bar dataKey="actual" name="Actual" fill="var(--brand)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card className="mt-4 border-border shadow-card">
        <CardHeader>
          <CardTitle className="text-base">Monthly Budget vs Actual</CardTitle>
          <CardDescription>
            Yearly plan spread evenly ({inr(budget.annualTotal / 12, true)} a month), replaced by any
            month-specific target you set, against real monthly spend
          </CardDescription>
        </CardHeader>
        <CardContent className="h-[320px]">
          {plannedTotal === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Add budget lines above to compare them month by month.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={monthlyPlan}>
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
                <Bar dataKey="actual" name="Actual spend" fill="var(--brand)" radius={[4, 4, 0, 0]} />
                <Line
                  type="monotone"
                  dataKey="plan"
                  name="Monthly plan"
                  stroke="var(--primary)"
                  strokeWidth={2}
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {plannedTotal > 0 && (
        <Card className="mt-4 border-border shadow-card">
          <CardHeader>
            <CardTitle className="text-base">Month-by-Month Variance</CardTitle>
            <CardDescription>Over or under the monthly plan</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Month</TableHead>
                    <TableHead className="text-right">Plan</TableHead>
                    <TableHead className="text-right">Actual</TableHead>
                    <TableHead className="text-right">Variance</TableHead>
                    <TableHead className="text-right">Variance %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {monthlyPlan.map((m) => (
                    <TableRow key={`mp-${m.month}`}>
                      <TableCell className="font-medium">{m.month}</TableCell>
                      <TableCell className="tabular text-right">{inr(m.plan)}</TableCell>
                      <TableCell className="tabular text-right">{inr(m.actual)}</TableCell>
                      <TableCell
                        className={`tabular text-right ${m.variance > 0 ? "text-danger" : "text-success"}`}
                      >
                        {m.variance > 0 ? "+" : "−"}
                        {inr(Math.abs(m.variance))}
                      </TableCell>
                      <TableCell
                        className={`tabular text-right ${m.variance > 0 ? "text-danger" : "text-success"}`}
                      >
                        {m.variancePct.toFixed(1)}%
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="mt-4 border-border shadow-card">
        <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-base">Variance Detail</CardTitle>
            <CardDescription>{filtered.length} budget lines</CardDescription>
          </div>
          <Input
            placeholder="Filter by category or department"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-64 bg-background"
          />
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead className="text-right">Planned</TableHead>
                  <TableHead className="text-right">Actual</TableHead>
                  <TableHead className="text-right">Variance</TableHead>
                  <TableHead className="text-right">Variance %</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => {
                  const over = r.variance > 0;
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.category}</TableCell>
                      <TableCell className="text-muted-foreground">{r.department}</TableCell>
                      <TableCell className="tabular text-right">{inr(r.budgeted_amount)}</TableCell>
                      <TableCell className="tabular text-right">{inr(r.actual)}</TableCell>
                      <TableCell className={`tabular text-right ${over ? "text-danger" : "text-success"}`}>
                        {over ? "+" : "−"}
                        {inr(Math.abs(r.variance))}
                      </TableCell>
                      <TableCell className={`tabular text-right ${over ? "text-danger" : "text-success"}`}>
                        {r.variancePct.toFixed(1)}%
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge
                          className={
                            over
                              ? "bg-danger-soft text-danger hover:bg-danger-soft"
                              : "bg-success-soft text-success hover:bg-success-soft"
                          }
                        >
                          {over ? "Over budget" : "Under budget"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {live && (
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label={`Delete ${r.category} budget line`}
                            onClick={() => void budget.remove(r.id)}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                      Nothing to show yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-4 border-border shadow-card">
        <CardHeader>
          <CardTitle className="text-base">Budget vs Forecast</CardTitle>
          <CardDescription>
            Planned annual spend against the twelve-month forecast projection ({inr(forecastSpend, true)} total)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Planned</TableHead>
                  <TableHead className="text-right">Forecast projection</TableHead>
                  <TableHead className="text-right">Gap</TableHead>
                  <TableHead className="text-right">Read</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {forecastRows.map((r) => (
                  <TableRow key={`fc-${r.id}`}>
                    <TableCell className="font-medium">{r.category}</TableCell>
                    <TableCell className="tabular text-right">{inr(r.budgeted_amount)}</TableCell>
                    <TableCell className="tabular text-right">{inr(r.projected)}</TableCell>
                    <TableCell
                      className={`tabular text-right ${r.gap > 0 ? "text-danger" : "text-success"}`}
                    >
                      {r.gap > 0 ? "+" : "−"}
                      {inr(Math.abs(r.gap))}
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {r.gap > 0 ? "Forecast exceeds plan" : "Plan covers forecast"}
                    </TableCell>
                  </TableRow>
                ))}
                {forecastRows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                      Add budget lines to compare them against the forecast.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </AppShell>
  );
}

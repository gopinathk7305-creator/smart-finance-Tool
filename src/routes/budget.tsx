import { createFileRoute } from "@tanstack/react-router";
import { Scale, Target, Wallet } from "lucide-react";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { AppShell } from "@/components/finance/AppShell";
import { KpiCard } from "@/components/finance/KpiCard";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { actualsByCategory, budgets, inr } from "@/lib/finance-data";

export const Route = createFileRoute("/budget")({
  head: () => ({
    meta: [
      { title: "Budget vs Actual — Finance IQ" },
      {
        name: "description",
        content:
          "Track FY2026 budget versus actual spend by category and department with variance percentages.",
      },
      { property: "og:title", content: "Budget vs Actual — Finance IQ" },
      {
        property: "og:description",
        content: "Category-level variance tracking with over-budget indicators.",
      },
    ],
  }),
  component: BudgetPage,
});

function BudgetPage() {
  const [query, setQuery] = useState("");
  const actuals = actualsByCategory();

  const rows = useMemo(
    () =>
      budgets.map((b) => {
        const actual = actuals.get(b.category) ?? 0;
        const variance = actual - b.budgeted_amount;
        return {
          ...b,
          actual,
          variance,
          variancePct: (variance / b.budgeted_amount) * 100,
        };
      }),
    [actuals],
  );

  const filtered = rows.filter((r) =>
    `${r.category} ${r.department}`.toLowerCase().includes(query.toLowerCase()),
  );

  const totalBudget = rows.reduce((s, r) => s + r.budgeted_amount, 0);
  const totalActual = rows.reduce((s, r) => s + r.actual, 0);
  const totalVariance = totalActual - totalBudget;

  return (
    <AppShell title="Budget vs Actual" subtitle="Fiscal year 2026 spend control">
      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard label="Total Budgeted" value={inr(totalBudget, true)} icon={Target} />
        <KpiCard label="Total Actual Spent" value={inr(totalActual, true)} icon={Wallet} tone="warning" />
        <KpiCard
          label="Total Variance"
          value={`${totalVariance >= 0 ? "+" : "−"}${inr(Math.abs(totalVariance), true)}`}
          delta={(totalVariance / totalBudget) * 100}
          invertDelta
          hint="vs plan"
          icon={Scale}
          tone={totalVariance > 0 ? "danger" : "success"}
        />
      </div>

      <Card className="mt-4 border-border shadow-card">
        <CardHeader>
          <CardTitle className="text-base">Budget vs Actual by Category</CardTitle>
          <CardDescription>Horizontal comparison across FY2026</CardDescription>
        </CardHeader>
        <CardContent className="h-[360px]">
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
              <Bar dataKey="budgeted_amount" name="Budgeted" fill="var(--primary)" radius={[0, 4, 4, 0]} />
              <Bar dataKey="actual" name="Actual" fill="var(--brand)" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card className="mt-4 border-border shadow-card">
        <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-base">Category Breakdown</CardTitle>
            <CardDescription>{filtered.length} categories</CardDescription>
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
                  <TableHead className="text-right">Budgeted</TableHead>
                  <TableHead className="text-right">Actual</TableHead>
                  <TableHead className="text-right">Variance</TableHead>
                  <TableHead className="text-right">Variance %</TableHead>
                  <TableHead className="text-right">Status</TableHead>
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
                    </TableRow>
                  );
                })}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                      No categories match “{query}”.
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

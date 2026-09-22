import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiCard } from "@/components/finance/KpiCard";
import { compactMoney } from "@/lib/adaptive-dashboard";
import type { SchemaDiscovery } from "@/lib/schema-discovery";

const PIE_COLORS = ["var(--brand)", "var(--primary)", "var(--success)", "var(--warning)", "var(--danger)"];
const full = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });

/**
 * Dashboard layout for datasets without revenue (expense/vendor ledgers) or
 * payroll registers: KPI cards, a single-measure spend trend and a distribution
 * grouped by the primary categorical column of the file.
 */
export function AdaptedDashboard({ profile }: { profile: SchemaDiscovery }) {
  const { kpis, monthly, monthlyLabel, breakdown, breakdownLabel } = profile;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {kpis.map((k) => (
          <KpiCard key={k.label} label={k.label} value={k.value} {...(k.hint ? { hint: k.hint } : {})} />
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {monthly.length > 0 && (
          <Card className="border-border shadow-card lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">{monthlyLabel || "Monthly Spend Trend"}</CardTitle>
              <CardDescription>Grouped from the dates in your active file</CardDescription>
            </CardHeader>
            <CardContent className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthly}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={11} />
                  <YAxis
                    tickFormatter={(v) => compactMoney(Number(v))}
                    tickLine={false}
                    axisLine={false}
                    fontSize={11}
                    width={64}
                  />
                  <Tooltip formatter={(v) => full.format(Number(v))} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="spend" name="Spend" fill="var(--danger)" radius={[4, 4, 0, 0]}>
                    <LabelList
                      dataKey="spend"
                      position="top"
                      style={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                      formatter={(val: number) => compactMoney(Number(val))}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {breakdown.length > 0 && (
          <Card className="border-border shadow-card">
            <CardHeader>
              <CardTitle className="text-base">Distribution</CardTitle>
              <CardDescription>{breakdownLabel}</CardDescription>
            </CardHeader>
            <CardContent className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={breakdown} dataKey="value" nameKey="name" cx="50%" cy="45%" innerRadius={44} outerRadius={70}>
                    {breakdown.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => full.format(Number(v))} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

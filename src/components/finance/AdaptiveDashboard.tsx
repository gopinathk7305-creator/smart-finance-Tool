import {
  Area,
  AreaChart,

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

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiCard } from "@/components/finance/KpiCard";
import { chartLabelProps, DonutBreakdownLegend } from "@/components/finance/ChartDataLabels";
import { compactMoney, titleCase, type AdaptiveDashboard as Profile } from "@/lib/adaptive-dashboard";

const SERIES_COLORS = [
  "var(--brand)",
  "var(--primary)",
  "var(--success)",
  "var(--warning)",
  "var(--danger)",
  "var(--muted-foreground)",
];
const PIE_COLORS = [
  "var(--brand)",
  "var(--primary)",
  "var(--success)",
  "var(--warning)",
  "var(--danger)",
];

const full = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });

/**
 * Schema-driven dashboard: KPI cards, trend chart and distribution chart built
 * entirely from the columns present in the active dataset.
 */
export function AdaptiveDashboard({ profile }: { profile: Profile }) {
  const {
    kpis,
    trend,
    trendSeries,
    trendLabel,
    trendStacked,
    breakdown,
    breakdownLabel,
    schema,
    cumulative,
    cumulativeLabel,
    finance,
  } = profile;


  return (
    <div className="space-y-4">
      <Card className="border-border shadow-card">
        <CardContent className="flex flex-wrap items-center gap-2 py-4">
          <span className="text-sm font-semibold">Auto-configured from your dataset</span>
          <Badge variant="secondary" className="text-[11px]">{profile.columnCount} columns detected</Badge>
          <Badge variant="secondary" className="text-[11px]">{schema.numeric.length} numeric</Badge>
          <Badge variant="secondary" className="text-[11px]">{schema.categorical.length} text</Badge>
          <Badge variant="secondary" className="text-[11px]">{schema.dates.length} date</Badge>
          {schema.flags.length > 0 && (
            <Badge variant="secondary" className="text-[11px]">{schema.flags.length} status/flag</Badge>
          )}
        </CardContent>
      </Card>

      {finance.ready && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            label="Total Revenue"
            value={compactMoney(finance.revenue)}
            hint="Sum of detected credit/revenue rows"
          />
          <KpiCard
            label="Total Expenses"
            value={compactMoney(finance.expenses)}
            hint="Sum of detected debit/expense rows"
          />
          <KpiCard
            label="Net Profit Margin"
            value={`${finance.margin.toFixed(1)}%`}
            hint={`Net ${compactMoney(finance.netProfit)} on revenue`}
          />
          <KpiCard
            label="Cash Runway"
            value={`${finance.runwayMonths.toFixed(1)} mo`}
            hint="Balance ÷ average monthly expense"
          />
        </div>
      )}

      {finance.monthly.length > 0 && (
        <Card className="border-border shadow-card">
          <CardHeader>
            <CardTitle className="text-base">Monthly Revenue vs Expenses</CardTitle>
            <CardDescription>Grouped from the dates in your active file</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={finance.monthly} barGap={4} margin={{ top: 24 }}>
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
                <Bar isAnimationActive={false} dataKey="revenue" name="Revenue" fill="var(--primary)" radius={[4, 4, 0, 0]}>
                  <LabelList
                    dataKey="revenue"
                    position="top"
                    {...chartLabelProps}
                    formatter={(val: number) => compactMoney(Number(val))}
                  />
                </Bar>
                <Bar isAnimationActive={false} dataKey="expenses" name="Expenses" fill="var(--danger)" radius={[4, 4, 0, 0]}>
                  <LabelList
                    dataKey="expenses"
                    position="top"
                    {...chartLabelProps}
                    formatter={(val: number) => compactMoney(Number(val))}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}


      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {kpis.map((k) => (
          <KpiCard key={k.label} label={k.label} value={k.value} {...(k.hint ? { hint: k.hint } : {})} />
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {trend.length > 0 && (
          <Card className="border-border shadow-card lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">{trendLabel || "Dataset Trend"}</CardTitle>
              <CardDescription>Grouped automatically from the detected columns</CardDescription>
            </CardHeader>
            <CardContent className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trend} barGap={4} margin={{ top: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="bucket" tickLine={false} axisLine={false} fontSize={11} />
                  <YAxis
                    tickFormatter={(v) => compactMoney(Number(v))}
                    tickLine={false}
                    axisLine={false}
                    fontSize={11}
                    width={64}
                  />
                  <Tooltip formatter={(v) => full.format(Number(v))} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                  {trendSeries.map((col, i) => (
                    <Bar isAnimationActive={false}
                      key={col}
                      dataKey={col}
                      name={titleCase(col)}
                      {...(trendStacked ? { stackId: "a" } : {})}
                      fill={SERIES_COLORS[i % SERIES_COLORS.length]}
                      radius={[4, 4, 0, 0]}
                    >
                      {(!trendStacked || i === trendSeries.length - 1) && (
                        <LabelList
                          dataKey={col}
                          position="top"
                          {...chartLabelProps}
                          formatter={(val: number) => compactMoney(Number(val))}
                        />
                      )}
                    </Bar>
                  ))}
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
            <CardContent className="grid h-[300px] min-w-0 grid-cols-[minmax(110px,42%)_minmax(0,1fr)] items-center gap-3">
              <div className="h-[200px] min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie isAnimationActive={false} data={breakdown} dataKey="value" nameKey="name" innerRadius="48%" outerRadius="77%" labelLine={false} label={false}>
                      {breakdown.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => full.format(Number(v))} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <DonutBreakdownLegend items={breakdown} colors={PIE_COLORS} />
            </CardContent>
          </Card>
        )}
      </div>

      {cumulative.length > 1 && (
        <Card className="border-border shadow-card">
          <CardHeader>
            <CardTitle className="text-base">{cumulativeLabel || "Cumulative Trend"}</CardTitle>
            <CardDescription>Running total in chronological order</CardDescription>
          </CardHeader>
          <CardContent className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={cumulative} margin={{ top: 24, right: 16 }}>
                <defs>
                  <linearGradient id="adaptiveCumulative" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--brand)" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="var(--brand)" stopOpacity={0.04} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="bucket" tickLine={false} axisLine={false} fontSize={11} />
                <YAxis
                  tickFormatter={(v) => compactMoney(Number(v))}
                  tickLine={false}
                  axisLine={false}
                  fontSize={11}
                  width={64}
                />
                <Tooltip formatter={(v) => full.format(Number(v))} />
                <Area isAnimationActive={false}
                  type="monotone"
                  dataKey="value"
                  name="Cumulative"
                  stroke="var(--brand)"
                  strokeWidth={2}
                  fill="url(#adaptiveCumulative)"
                >
                  <LabelList
                    dataKey="value"
                    position="top"
                    {...chartLabelProps}
                    formatter={(val: number) => compactMoney(Number(val))}
                  />
                </Area>
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

    </div>
  );
}

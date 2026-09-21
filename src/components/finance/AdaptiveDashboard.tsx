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
              <BarChart data={finance.monthly} barGap={4}>
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
                <Bar dataKey="revenue" name="Revenue" fill="var(--primary)" radius={[4, 4, 0, 0]}>
                  <LabelList
                    dataKey="revenue"
                    position="top"
                    style={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                    formatter={(val: number) => compactMoney(Number(val))}
                  />
                </Bar>
                <Bar dataKey="expenses" name="Expenses" fill="var(--danger)" radius={[4, 4, 0, 0]}>
                  <LabelList
                    dataKey="expenses"
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

      {finance.topExpense.length > 0 && (
        <Card className="border-border shadow-card">
          <CardHeader>
            <CardTitle className="text-base">Top 5 Expense Categories</CardTitle>
            <CardDescription>By {finance.categoryLabel} in the active dataset</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={finance.topExpense}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={54}
                    outerRadius={82}
                    paddingAngle={2}
                  >
                    {finance.topExpense.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => full.format(Number(v))} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="space-y-2 self-center">
              {finance.topExpense.map((c, i) => (
                <li key={c.name} className="flex items-center gap-2 text-sm">
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}
                  />
                  <span className="min-w-0 flex-1 truncate">{c.name}</span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {compactMoney(c.value)}
                  </span>
                  <Badge variant="secondary" className="font-mono text-[11px]">
                    {c.share.toFixed(1)}%
                  </Badge>
                </li>
              ))}
            </ul>
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
                <BarChart data={trend} barGap={4}>
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
                    <Bar
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
                          style={{ fontSize: 10, fill: "var(--muted-foreground)" }}
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
            <CardContent className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={breakdown}
                    dataKey="value"
                    nameKey="name"
                    cx="42%"
                    cy="50%"
                    innerRadius={42}
                    outerRadius={68}
                    labelLine={{ stroke: "var(--border)" }}
                    label={({ cx, cy, midAngle, outerRadius, name, percent }) => {
                      const rad = Math.PI / 180;
                      const r = (outerRadius ?? 0) + 10;
                      const x = (cx ?? 0) + r * Math.cos(-(midAngle ?? 0) * rad);
                      const y = (cy ?? 0) + r * Math.sin(-(midAngle ?? 0) * rad);
                      const short = name && name.length > 10 ? `${name.slice(0, 9)}…` : name;
                      return (
                        <text
                          x={x}
                          y={y}
                          fill="var(--foreground)"
                          fontSize={10}
                          textAnchor={x > (cx ?? 0) ? "start" : "end"}
                          dominantBaseline="central"
                        >
                          {`${short} (${Math.round((percent ?? 0) * 100)}%)`}
                        </text>
                      );
                    }}
                  >
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

      {cumulative.length > 1 && (
        <Card className="border-border shadow-card">
          <CardHeader>
            <CardTitle className="text-base">{cumulativeLabel || "Cumulative Trend"}</CardTitle>
            <CardDescription>Running total in chronological order</CardDescription>
          </CardHeader>
          <CardContent className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={cumulative}>
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
                <Area
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
                    style={{ fontSize: 10, fill: "var(--muted-foreground)" }}
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

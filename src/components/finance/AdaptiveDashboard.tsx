import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
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
import { titleCase, type AdaptiveDashboard as Profile } from "@/lib/adaptive-dashboard";

const SERIES_COLORS = ["var(--brand)", "var(--danger)", "var(--success)"];
const PIE_COLORS = [
  "var(--brand)",
  "var(--primary)",
  "var(--success)",
  "var(--warning)",
  "var(--danger)",
];

const compact = new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 2 });
const full = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });

/**
 * Schema-driven dashboard: KPI cards, trend chart and distribution chart built
 * entirely from the columns present in the active dataset.
 */
export function AdaptiveDashboard({ profile }: { profile: Profile }) {
  const { kpis, trend, trendSeries, trendLabel, breakdown, breakdownLabel, schema } = profile;

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
                    tickFormatter={(v) => compact.format(Number(v))}
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
                      fill={SERIES_COLORS[i % SERIES_COLORS.length]}
                      radius={[4, 4, 0, 0]}
                    />
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
    </div>
  );
}

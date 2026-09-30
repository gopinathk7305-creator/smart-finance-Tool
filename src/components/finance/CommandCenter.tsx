import { useMemo } from "react";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  Flame,
  Gauge,
  Info,
  Layers,
  Sparkles,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Legend,

  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { AlertSettingsDialog } from "@/components/finance/AlertSettingsDialog";
import { chartLabelProps, DonutBreakdownLegend, moneyDataLabel } from "@/components/finance/ChartDataLabels";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useBudget } from "@/lib/budget";
import type { MonthlySummary, Transaction } from "@/lib/finance-data";
import { cn } from "@/lib/utils";

/** ₹1.05L / ₹17.40L / ₹2.30Cr style compact INR. */
export function lakh(v: number): string {
  const n = Math.abs(v);
  const s = v < 0 ? "-" : "";
  if (n >= 1e7) return `${s}₹${(n / 1e7).toFixed(2)}Cr`;
  if (n >= 1e5) return `${s}₹${(n / 1e5).toFixed(2)}L`;
  if (n >= 1e3) return `${s}₹${(n / 1e3).toFixed(1)}K`;
  return `${s}₹${n.toFixed(0)}`;
}
const exact = (v: number) =>
  `₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(v)}`;

const DONUT = ["var(--brand)", "var(--success)", "var(--warning)", "var(--danger)", "var(--primary)", "var(--muted-foreground)"];

interface Alert {
  title: string;
  body: string;
  tone: "danger" | "warning" | "success";
}

type Tone = "brand" | "success" | "warning" | "danger";
const toneCls: Record<Tone, { ring: string; glow: string; stroke: string }> = {
  brand: { ring: "bg-brand-soft text-brand", glow: "hover:border-brand/50 hover:shadow-[0_0_0_1px_var(--brand)]", stroke: "var(--brand)" },
  success: { ring: "bg-success-soft text-success", glow: "hover:border-success/50 hover:shadow-[0_0_0_1px_var(--success)]", stroke: "var(--success)" },
  warning: { ring: "bg-warning-soft text-warning", glow: "hover:border-warning/50 hover:shadow-[0_0_0_1px_var(--warning)]", stroke: "var(--warning)" },
  danger: { ring: "bg-danger-soft text-danger", glow: "hover:border-danger/50 hover:shadow-[0_0_0_1px_var(--danger)]", stroke: "var(--danger)" },
};

function Pill({ delta, invert = true }: { delta: number | null; invert?: boolean }) {
  if (delta === null || !Number.isFinite(delta)) return null;
  const good = invert ? delta <= 0 : delta >= 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-mono text-[10px] font-semibold",
        good ? "bg-success-soft text-success" : "bg-danger-soft text-danger",
      )}
    >
      {delta >= 0 ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
      {Math.abs(delta).toFixed(1)}% MoM
    </span>
  );
}

function MetricCard({
  label,
  value,
  sub,
  icon: Icon,
  tone,
  spark,
  delta,
  progress,
}: {
  label: string;
  value: string;
  sub: string;
  icon: LucideIcon;
  tone: Tone;
  spark?: number[];
  delta?: number | null;
  progress?: number;
}) {
  const t = toneCls[tone];
  const data = (spark ?? []).map((v, i) => ({ i, v }));
  const id = `spark-${label.replace(/\W/g, "")}`;
  return (
    <Card className={cn("min-w-0 gap-0 border-border p-4 shadow-card transition-all", t.glow)}>
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{label}</p>
        <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-md", t.ring)}>
          <Icon className="size-3.5" />
        </span>
      </div>
      <p className="mt-2 min-w-0 font-mono text-xl font-bold leading-tight tabular-nums break-words xl:text-lg 2xl:text-xl">{value}</p>
      <div className="mt-1 flex min-h-5 min-w-0 flex-wrap items-center gap-1.5 text-[11px]">
        {delta !== undefined && <Pill delta={delta} />}
        <span className="truncate text-muted-foreground">{sub}</span>
      </div>
      {progress !== undefined ? (
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
          <div
            className={cn("h-full rounded-full", progress > 100 ? "bg-danger" : progress > 85 ? "bg-warning" : "bg-success")}
            style={{ width: `${Math.min(100, progress)}%` }}
          />
        </div>
      ) : data.length > 1 ? (
        <div className="mt-3 h-9" aria-hidden="true">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 2, bottom: 0, left: 0, right: 0 }}>
              <defs>
                <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={t.stroke} stopOpacity={0.4} />
                  <stop offset="100%" stopColor={t.stroke} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area type="monotone" dataKey="v" stroke={t.stroke} strokeWidth={1.5} fill={`url(#${id})`} dot={false} activeDot={false} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : null}
    </Card>
  );
}

const statusCls = {
  "Within Budget": "bg-success-soft text-success",
  "Over Budget": "bg-danger-soft text-danger",
  "Pending Approval": "bg-warning-soft text-warning",
} as const;

export function CommandCenter({
  txns,
  series,
  alerts,
}: {
  txns: Transaction[];
  series: MonthlySummary[];
  alerts: Alert[];
}) {
  const budget = useBudget();

  const m = useMemo(() => {
    const expenses = txns.filter((t) => t.type === "expense");
    const actual = expenses.reduce((s, t) => s + t.amount, 0);
    const byCat = new Map<string, number>();
    const pendingCat = new Map<string, number>();
    for (const t of expenses) {
      const k = t.category || "Uncategorised";
      byCat.set(k, (byCat.get(k) ?? 0) + t.amount);
      if (t.status === "pending") pendingCat.set(k, (pendingCat.get(k) ?? 0) + 1);
    }
    const cats = [...byCat.entries()].sort((a, b) => b[1] - a[1]);
    const planned = budget.plannedTotal;
    const monthlyBudget = planned > 0 ? planned / 12 : 0;

    const monthly = series.map((s) => ({
      month: s.month,
      actual: s.expense,
      budget: budget.byMonth.get(s.month) ?? monthlyBudget,
    }));
    let run = 0;
    let runBudget = 0;
    const cumulative = monthly.map((r) => {
      run += r.actual;
      runBudget += r.budget;
      return { month: r.month, spent: run, remaining: planned > 0 ? Math.max(0, planned - run) : 0, budget: runBudget };
    });

    const active = monthly.filter((r) => r.actual > 0);
    const last = active.at(-1)?.actual ?? 0;
    const prev = active.at(-2)?.actual ?? 0;
    const mom = prev > 0 ? ((last - prev) / prev) * 100 : null;
    const burn = active.length ? actual / active.length : 0;

    const opexRe = /capex|capital|asset|equipment|depreciation/i;
    const opex = cats.filter(([c]) => !opexRe.test(c)).reduce((s, [, v]) => s + v, 0);

    const lines = cats.slice(0, 12).map(([name, ytd]) => {
      const alloc = budget.byCategory.get(name.toLowerCase()) ?? 0;
      const status: keyof typeof statusCls =
        alloc <= 0 || pendingCat.has(name) ? "Pending Approval" : ytd > alloc ? "Over Budget" : "Within Budget";
      return { name, alloc, ytd, variance: alloc - ytd, status };
    });

    // Anomalies: months > 1.5x average, and single entries > 3x mean line size.
    const anomalies: { title: string; body: string; tone: Alert["tone"] }[] = [];
    active.forEach((r, i) => {
      const p = active[i - 1];
      if (burn > 0 && r.actual > burn * 1.5)
        anomalies.push({
          title: `Spend spike in ${r.month}`,
          body: `${lakh(r.actual)} outflow — ${((r.actual / burn - 1) * 100).toFixed(0)}% above monthly average${p ? `, ${(((r.actual - p.actual) / Math.max(1, p.actual)) * 100).toFixed(0)}% MoM` : ""}.`,
          tone: "danger",
        });
    });
    const mean = expenses.length ? actual / expenses.length : 0;
    [...expenses]
      .sort((a, b) => b.amount - a.amount)
      .filter((t) => mean > 0 && t.amount > mean * 3)
      .slice(0, 3)
      .forEach((t) =>
        anomalies.push({
          title: `High-value line: ${t.category || "Uncategorised"}`,
          body: `${lakh(t.amount)} on ${t.date}${t.vendor_client ? ` · ${t.vendor_client}` : ""} (${(t.amount / mean).toFixed(1)}× avg entry).`,
          tone: "warning",
        }),
      );
    lines.filter((l) => l.status === "Over Budget").forEach((l) =>
      anomalies.push({ title: `${l.name} over budget`, body: `Exceeded allocation by ${lakh(-l.variance)}.`, tone: "danger" }),
    );

    return {
      actual,
      planned,
      cats,
      monthly,
      cumulative,
      mom,
      burn,
      opex,
      lines,
      anomalies,
      utilization: planned > 0 ? (actual / planned) * 100 : null,
      spark: monthly.map((r) => r.actual),
    };
  }, [txns, series, budget.plannedTotal, budget.byMonth, budget.byCategory]);

  const totalCat = m.cats.reduce((s, [, v]) => s + v, 0);
  const donut = m.cats.slice(0, 5).map(([name, value]) => ({ name, value }));
  const rest = m.cats.slice(5).reduce((s, [, v]) => s + v, 0);
  if (rest > 0) donut.push({ name: "Other", value: rest });
  const top = m.cats[0];
  const toneIcon = { danger: AlertTriangle, warning: Info, success: CheckCircle2 };
  const feed = [...m.anomalies, ...alerts].slice(0, 6);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <MetricCard
          label="Budget vs Actual"
          value={lakh(m.actual)}
          sub={m.planned > 0 ? `of ${lakh(m.planned)} budgeted` : "No budget set"}
          icon={Wallet}
          tone="brand"
          spark={m.spark}
          delta={m.mom}
        />
        <MetricCard
          label="Operating Expenses"
          value={lakh(m.opex)}
          sub={`${m.actual > 0 ? ((m.opex / m.actual) * 100).toFixed(0) : 0}% of total · ${m.cats.length} categories`}
          icon={Layers}
          tone="danger"
          spark={m.spark}
        />
        <MetricCard
          label="Monthly Burn Rate"
          value={lakh(m.burn)}
          sub="Avg cash outflow / active month"
          icon={Flame}
          tone="warning"
          spark={m.spark}
        />
        <MetricCard
          label="Top Allocation"
          value={top ? lakh(top[1]) : "—"}
          sub={top ? `${top[0]} · ${((top[1] / Math.max(1, totalCat)) * 100).toFixed(0)}%` : "No categories"}
          icon={Sparkles}
          tone="success"
          spark={m.cats.slice(0, 8).map(([, v]) => v)}
        />
        <MetricCard
          label="Budget Utilization"
          value={m.utilization === null ? "—" : `${m.utilization.toFixed(1)}%`}
          sub={m.utilization === null ? "Add targets in Budget" : m.utilization > 100 ? "Over allocation" : "Of annual allocation used"}
          icon={Gauge}
          tone={m.utilization !== null && m.utilization > 100 ? "danger" : "success"}
          progress={m.utilization ?? 0}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="min-w-0 border-border shadow-card lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Budgeted Allocation vs Actual Spend</CardTitle>
            <CardDescription>Monthly actuals (left axis) against budget line (right axis)</CardDescription>
          </CardHeader>
          <CardContent className="h-[350px] overflow-x-auto">
            <div className="h-full min-w-[850px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={m.monthly} margin={{ top: 28, right: 8, left: 4 }}>
                <defs>
                  <linearGradient id="ccActual" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--danger)" stopOpacity={0.9} />
                    <stop offset="100%" stopColor="var(--danger)" stopOpacity={0.35} />
                  </linearGradient>
                  <linearGradient id="ccBudget" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--brand)" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="var(--brand)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={11} />
                 <YAxis yAxisId="l" tickFormatter={(v) => Number(v) === 0 ? "" : lakh(Number(v))} tickLine={false} axisLine={false} fontSize={11} width={64} />
                 <YAxis yAxisId="r" orientation="right" tickFormatter={(v) => Number(v) === 0 ? "" : lakh(Number(v))} tickLine={false} axisLine={false} fontSize={11} width={64} />
                <Tooltip
                  contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                  formatter={(v, n, p) => {
                    const row = p.payload as { actual: number; budget: number };
                    const pct = row.budget > 0 ? ` (${((row.actual / row.budget) * 100).toFixed(0)}% of budget)` : "";
                    return [`${exact(Number(v))}${n === "Actual spend" ? pct : ""}`, n];
                  }}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                <Area yAxisId="r" type="monotone" dataKey="budget" name="Budgeted" stroke="var(--brand)" strokeDasharray="4 3" fill="url(#ccBudget)" dot={{ r: 3 }}>
                   <LabelList dataKey="budget" position="top" offset={16} {...chartLabelProps} formatter={(value: number) => Number(value) > 0 ? moneyDataLabel(value) : ""} />
                </Area>
                <Bar yAxisId="l" dataKey="actual" name="Actual spend" fill="url(#ccActual)" radius={[4, 4, 0, 0]}>
                   <LabelList dataKey="actual" position="top" offset={8} dy={-8} {...chartLabelProps} formatter={(value: number) => Number(value) > 0 ? moneyDataLabel(value) : ""} />
                </Bar>
              </ComposedChart>
            </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="min-w-0 border-border shadow-card">
          <CardHeader>
            <CardTitle className="text-base">Category Distribution</CardTitle>
            <CardDescription>Share of total expenditure</CardDescription>
          </CardHeader>
          <CardContent className="grid h-[350px] min-w-0 grid-cols-[minmax(110px,42%)_minmax(0,1fr)] items-center gap-3">
            <div className="h-[230px] min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={donut} dataKey="value" nameKey="name" innerRadius="48%" outerRadius="77%" paddingAngle={2} label={false} labelLine={false}>
                    {donut.map((_, i) => (
                      <Cell key={i} fill={DONUT[i % DONUT.length]} stroke="var(--card)" />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                    formatter={(v, n) => [`${exact(Number(v))} · ${((Number(v) / Math.max(1, totalCat)) * 100).toFixed(1)}%`, n]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <DonutBreakdownLegend items={donut} colors={DONUT} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="min-w-0 border-border shadow-card lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Cumulative Outflow & Budget Depletion</CardTitle>
            <CardDescription>Running spend vs cumulative allocation</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={m.cumulative} margin={{ top: 28, right: 20, left: 4 }}>
                <defs>
                  <linearGradient id="ccSpent" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--danger)" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="var(--danger)" stopOpacity={0.03} />
                  </linearGradient>
                  <linearGradient id="ccLeft" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--success)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--success)" stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={11} />
                <YAxis tickFormatter={(v) => lakh(Number(v))} tickLine={false} axisLine={false} fontSize={11} width={64} />
                <Tooltip
                  contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                  formatter={(v, n) => [exact(Number(v)), n]}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="spent" name="Cumulative spend" stroke="var(--danger)" strokeWidth={2} fill="url(#ccSpent)" dot={{ r: 3 }}>
                  <LabelList dataKey="spent" position="top" offset={8} {...chartLabelProps} formatter={moneyDataLabel} />
                </Area>
                {m.planned > 0 && (
                  <Area type="monotone" dataKey="remaining" name="Budget remaining" stroke="var(--success)" strokeWidth={2} fill="url(#ccLeft)" dot={{ r: 3 }}>
                    <LabelList dataKey="remaining" position="bottom" offset={8} {...chartLabelProps} formatter={moneyDataLabel} />
                  </Area>
                )}
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="min-w-0 border-border shadow-card">
          <CardHeader className="flex-row items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <CardTitle className="flex items-center gap-1.5 text-base">
                <Sparkles className="size-4 text-brand" /> AI Anomaly & Variance Alerts
              </CardTitle>
              <CardDescription>Spikes, high-value lines and threshold breaches</CardDescription>
            </div>
            <AlertSettingsDialog />
          </CardHeader>
          <CardContent className="space-y-2">
            {feed.length === 0 && <p className="text-sm text-muted-foreground">No anomalies detected.</p>}
            {feed.map((a, i) => {
              const Icon = toneIcon[a.tone];
              const tone = a.tone === "danger" ? "bg-danger-soft text-danger" : a.tone === "warning" ? "bg-warning-soft text-warning" : "bg-success-soft text-success";
              return (
                <div key={`${a.title}-${i}`} className="flex gap-2.5 rounded-lg border border-border p-2.5">
                  <span className={`flex size-7 shrink-0 items-center justify-center rounded-md ${tone}`}>
                    <Icon className="size-3.5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{a.title}</p>
                    <p className="text-xs text-muted-foreground">{a.body}</p>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      <Card className="border-border shadow-card">
        <CardHeader>
          <CardTitle className="text-base">Budget Line Item Breakdown</CardTitle>
          <CardDescription>Annual allocation vs YTD spend per category</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] tracking-wider text-muted-foreground uppercase">
                  <th className="py-2 pr-3 font-semibold">Category</th>
                  <th className="py-2 pr-3 text-right font-semibold">Annual Allocation</th>
                  <th className="py-2 pr-3 text-right font-semibold">YTD Spend</th>
                  <th className="py-2 pr-3 text-right font-semibold">Variance (₹)</th>
                  <th className="py-2 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {m.lines.map((l) => (
                  <tr key={l.name} className="border-b border-border/60 last:border-0 hover:bg-muted/40">
                    <td className="py-2 pr-3 font-medium">{l.name}</td>
                    <td className="py-2 pr-3 text-right font-mono tabular-nums" title={exact(l.alloc)}>{l.alloc > 0 ? lakh(l.alloc) : "—"}</td>
                    <td className="py-2 pr-3 text-right font-mono tabular-nums" title={exact(l.ytd)}>{lakh(l.ytd)}</td>
                    <td className={cn("py-2 pr-3 text-right font-mono tabular-nums", l.alloc <= 0 ? "text-muted-foreground" : l.variance < 0 ? "text-danger" : "text-success")}>
                      {l.alloc > 0 ? lakh(l.variance) : "—"}
                    </td>
                    <td className="py-2">
                      <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap", statusCls[l.status])}>{l.status}</span>
                    </td>
                  </tr>
                ))}
                {m.lines.length === 0 && (
                  <tr><td colSpan={5} className="py-4 text-center text-muted-foreground">No expense lines in the active dataset.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

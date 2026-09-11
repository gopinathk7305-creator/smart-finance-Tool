import { createFileRoute } from "@tanstack/react-router";
import { RotateCcw, TrendingUp, UserPlus, Wallet } from "lucide-react";
import { useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { AppShell } from "@/components/finance/AppShell";
import { KpiCard } from "@/components/finance/KpiCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { forecast, inr } from "@/lib/finance-data";

export const Route = createFileRoute("/forecast")({
  head: () => ({
    meta: [
      { title: "Forecasting & Scenarios — Finance IQ" },
      {
        name: "description",
        content:
          "Model 12-month rolling forecasts with revenue growth, opex adjustment and hiring levers.",
      },
      { property: "og:title", content: "Forecasting & Scenarios — Finance IQ" },
      {
        property: "og:description",
        content: "Compare baseline versus scenario profit over the next twelve months.",
      },
    ],
  }),
  component: ForecastPage,
});

function ForecastPage() {
  const [growth, setGrowth] = useState(12);
  const [opex, setOpex] = useState(4);
  const [hires, setHires] = useState(3);

  const data = forecast(growth, opex, hires);
  const baselineTotal = data.reduce((s, d) => s + d.baseline, 0);
  const scenarioTotal = data.reduce((s, d) => s + d.scenario, 0);
  const delta = ((scenarioTotal - baselineTotal) / Math.abs(baselineTotal)) * 100;

  return (
    <AppShell title="Forecasting & Scenario Planning" subtitle="12-month rolling outlook">
      <div className="grid gap-4 lg:grid-cols-4">
        <Card className="border-border shadow-card lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Scenario levers</CardTitle>
            <CardDescription>Drag to re-model instantly</CardDescription>
          </CardHeader>
          <CardContent className="space-y-7">
            <Lever
              label="Revenue growth"
              value={growth}
              suffix="%"
              min={-20}
              max={50}
              onChange={setGrowth}
            />
            <Lever label="Opex adjustment" value={opex} suffix="%" min={-20} max={30} onChange={setOpex} />
            <Lever label="New hires" value={hires} suffix="" min={0} max={25} onChange={setHires} />
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                setGrowth(12);
                setOpex(4);
                setHires(3);
              }}
            >
              <RotateCcw className="size-4" /> Reset to baseline
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-4 lg:col-span-3">
          <div className="grid gap-4 sm:grid-cols-3">
            <KpiCard label="Baseline 12M Profit" value={inr(baselineTotal, true)} icon={Wallet} />
            <KpiCard
              label="Scenario 12M Profit"
              value={inr(scenarioTotal, true)}
              delta={delta}
              hint="vs baseline"
              icon={TrendingUp}
              tone={scenarioTotal >= baselineTotal ? "success" : "danger"}
            />
            <KpiCard
              label="Headcount Impact"
              value={inr(
                hires *
                  (data[0] ? data[0].scenarioExpense - data[0].scenarioExpense / (hires || 1) : 0) /
                  (hires || 1),
                true,
              )}
              hint={`${hires} new roles modelled`}
              icon={UserPlus}
              tone="warning"
            />
          </div>

          <Card className="border-border shadow-card">
            <CardHeader>
              <CardTitle className="text-base">Baseline vs Scenario Monthly Profit</CardTitle>
              <CardDescription>Next twelve months</CardDescription>
            </CardHeader>
            <CardContent className="h-[340px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data}>
                  <defs>
                    <linearGradient id="scen" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--brand)" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="var(--brand)" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} />
                  <YAxis tickFormatter={(v) => inr(Number(v), true)} tickLine={false} axisLine={false} fontSize={12} width={72} />
                  <Tooltip formatter={(v) => inr(Number(v))} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                  <Area
                    type="monotone"
                    dataKey="baseline"
                    name="Baseline"
                    stroke="var(--muted-foreground)"
                    strokeDasharray="5 4"
                    strokeWidth={2}
                    fill="transparent"
                  />
                  <Area
                    type="monotone"
                    dataKey="scenario"
                    name="Scenario"
                    stroke="var(--brand)"
                    strokeWidth={2}
                    fill="url(#scen)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

function Lever({
  label,
  value,
  suffix,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  suffix: string;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm">{label}</Label>
        <span className="tabular rounded-md bg-secondary px-2 py-0.5 text-sm font-semibold">
          {value > 0 && suffix === "%" ? "+" : ""}
          {value}
          {suffix}
        </span>
      </div>
      <Slider value={[value]} min={min} max={max} step={1} onValueChange={([v]) => onChange(v ?? 0)} />
      <div className="flex justify-between text-[11px] text-muted-foreground">
        <span>
          {min}
          {suffix}
        </span>
        <span>
          {max}
          {suffix}
        </span>
      </div>
    </div>
  );
}

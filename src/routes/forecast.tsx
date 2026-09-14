import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { explainForecast } from "@/lib/ai.functions";
import {
  Banknote,
  Bookmark,
  Download,
  FileText,
  Loader2,
  Gauge,
  RotateCcw,
  Sparkles,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ComposedChart,
  Line,

  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";

import { AppShell } from "@/components/finance/AppShell";
import { KpiCard } from "@/components/finance/KpiCard";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/lib/auth";
import { useDataset } from "@/lib/dataset";

import { downloadCSV, inr } from "@/lib/finance-data";
import { exportElementToPdf } from "@/lib/pdf-export";
import {
  BASE_SCENARIO,
  FY_OPTIONS,
  PRESETS,
  loadScenarios,
  runForecast,
  saveScenarios,
  type FinancialYear,
  type SavedScenario,
  type ScenarioInputs,
} from "@/lib/forecast-engine";

import { cn } from "@/lib/utils";

export const Route = createFileRoute("/forecast")({
  head: () => ({
    meta: [
      { title: "Financial Forecasting & Scenario Modeling — Finance IQ" },
      {
        name: "description",
        content:
          "Interactive 12-month rolling forecast with revenue, cost, payroll and cash-flow levers, sensitivity insights and exportable projections.",
      },
      {
        property: "og:title",
        content: "Financial Forecasting & Multi-Scenario Modeling — Finance IQ",
      },
      {
        property: "og:description",
        content:
          "Stress-test revenue growth, churn, hiring, CAPEX and DSO against your baseline in one workspace.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ForecastPage,
});

const TABS = [
  { id: "profit", label: "Net Profit (Post-Tax)" },
  { id: "revopex", label: "Revenue vs Opex (Excl. GST)" },
  { id: "runway", label: "Cash Runway & Buffer" },
  { id: "cumulative", label: "Cumulative Cash Flow" },
] as const;


function ForecastPage() {
  const { txns, pays, live } = useDataset();
  const [inputs, setInputs] = useState<ScenarioInputs>(BASE_SCENARIO);
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("profit");
  const [band, setBand] = useState(true);
  const [saved, setSaved] = useState<SavedScenario[]>(() => loadScenarios());
  const [name, setName] = useState("");
  const [open, setOpen] = useState(false);
  const tableRef = useRef<HTMLDivElement>(null);
  const [aiText, setAiText] = useState("");
  const [aiMonth, setAiMonth] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const explain = useServerFn(explainForecast);

  const askAi = async (focusMonth?: string) => {
    setAiLoading(true);
    setAiMonth(focusMonth ?? null);
    setAiText("");
    try {
      const res = await explain({
        data: {
          drivers: inputs,
          months: rows.map((r) => ({
            month: r.month,
            revenue: r.scenRevenue,
            cost: r.scenExpense,
            profit: r.scenProfit,
            baseRevenue: r.baseRevenue,
            baseCost: r.baseExpense,
            baseProfit: r.baseProfit,
          })),
          ...(focusMonth ? { focusMonth } : {}),
        },
      });
      setAiText(res.text);
    } catch (err) {
      const message = err instanceof Error ? err.message : "AI request failed.";
      toast.error(
        message.includes("Unauthorized")
          ? "Sign in to use the AI explanation — demo mode has no AI access."
          : message,
      );
    } finally {
      setAiLoading(false);
    }
  };


  const set = <K extends keyof ScenarioInputs>(key: K, value: ScenarioInputs[K]) =>
    setInputs((prev) => ({ ...prev, [key]: value }));

  const result = useMemo(() => runForecast(inputs, txns, pays), [inputs, txns, pays]);
  const { rows } = result;

  const revDelta = pctChange(result.scenRevenueTotal, result.baseRevenueTotal);
  const profitDelta = pctChange(result.scenProfitTotal, result.baseProfitTotal);
  const runwayTone = result.runway > 12 ? "success" : result.runway >= 6 ? "warning" : "danger";
  const q3Tax = rows.find((r) => r.month === "Dec")?.advanceTax ?? 0;

  const applyPreset = (key: keyof typeof PRESETS) =>
    setInputs({ ...BASE_SCENARIO, fy: inputs.fy, ...PRESETS[key] });

  const exportCsv = () =>
    downloadCSV(
      `fy-projection-${inputs.fy.replace(/\s/g, "-").toLowerCase()}.csv`,
      rows.map((r) => ({
        Month: r.month,
        "Revenue (Excl. GST)": r.scenRevenue,
        "GST Output": r.gstOutput,
        "Operating Expenses": r.opex,
        "Payroll (incl. PF/ESI)": r.payroll,
        EBITDA: r.ebitda,
        "Corporate Tax": r.tax,
        "Advance Tax Payout": r.advanceTax,
        "Net Profit (Post-Tax)": r.scenProfit,
        "Ending Cash Balance": r.scenCash,
        "Runway (Months)": r.runway,
      })),
    );

  const exportPdf = async () => {
    if (!tableRef.current) return;
    toast.info("Preparing PDF…");
    await exportElementToPdf(
      tableRef.current,
      `fy-projection-${inputs.fy.replace(/\s/g, "-").toLowerCase()}.pdf`,
      `${inputs.fy} Projection Statement`,
    );
  };


  const saveScenario = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const next = [...saved.filter((s) => s.name !== trimmed), { name: trimmed, inputs }];
    setSaved(next);
    saveScenarios(next);
    setName("");
    setOpen(false);
    toast.success(`Scenario "${trimmed}" saved`);
  };

  return (
    <AppShell
      title={`Financial Forecasting & Scenario Planning (${inputs.fy})`}
      subtitle={`12-Month Rolling Indian Corporate Outlook & Runway Stress Testing · ${live ? "live data" : "demo data"}`}
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => applyPreset("base")}>
          Base Case
        </Button>
        <Button variant="outline" size="sm" onClick={() => applyPreset("best")}>
          High Growth (+25% Rev)
        </Button>
        <Button variant="outline" size="sm" onClick={() => applyPreset("worst")}>
          Conservative / Slowdown (−15% Rev)
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setInputs(BASE_SCENARIO)}>
          <RotateCcw className="size-4" /> Reset All
        </Button>
        <Tabs value={inputs.fy} onValueChange={(v) => set("fy", v as FinancialYear)}>
          <TabsList>
            {FY_OPTIONS.map((f) => (
              <TabsTrigger key={f} value={f} className="text-xs">
                {f}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <Button variant="outline" size="sm" onClick={exportPdf}>
          <FileText className="size-4" /> Export PDF Report
        </Button>
        <Button variant="outline" size="sm" onClick={exportCsv}>
          <Download className="size-4" /> Export CSV
        </Button>



        <div className="ml-auto flex items-center gap-2">
          {saved.length > 0 && (
            <Select
              onValueChange={(v) => {
                const s = saved.find((x) => x.name === v);
                if (s) setInputs(s.inputs);
              }}
            >
              <SelectTrigger className="w-[190px] bg-background">
                <SelectValue placeholder="Load saved scenario" />
              </SelectTrigger>
              <SelectContent>
                {saved.map((s) => (
                  <SelectItem key={s.name} value={s.name}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Bookmark className="size-4" /> Save Current Scenario
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Name this scenario</DialogTitle>
              </DialogHeader>
              <Input
                autoFocus
                placeholder="Aggressive Hiring Q4"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && saveScenario()}
              />
              <DialogFooter>
                <Button onClick={saveScenario}>Save scenario</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-4">
        <Card className="border-border shadow-card xl:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Scenario controls</CardTitle>
            <CardDescription>Tune drivers, results update instantly</CardDescription>
          </CardHeader>
          <CardContent>
            <Accordion type="multiple" defaultValue={["rev", "cost", "capex", "cash"]}>
              <AccordionItem value="rev">
                <AccordionTrigger className="text-sm font-semibold">
                  Revenue &amp; billing drivers
                </AccordionTrigger>
                <AccordionContent className="space-y-6 pt-2">
                  <Lever
                    label="Projected annual revenue growth"
                    value={inputs.revenueGrowth}
                    min={-30}
                    max={100}
                    suffix="%"
                    onChange={(v) => set("revenueGrowth", v)}
                  />
                  <Lever
                    label="Churn / attrition rate"
                    value={inputs.churn}
                    min={0}
                    max={20}
                    suffix="%"
                    onChange={(v) => set("churn", v)}
                  />
                  <Lever
                    label="Price / inflation factor"
                    value={inputs.priceFactor}
                    min={-10}
                    max={30}
                    suffix="%"
                    onChange={(v) => set("priceFactor", v)}
                  />
                  <Lever
                    label="GST output rate"
                    value={inputs.gstRate}
                    min={0}
                    max={28}
                    suffix="%"
                    onChange={(v) => set("gstRate", v)}
                  />
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="cost">
                <AccordionTrigger className="text-sm font-semibold">
                  Expense &amp; payroll drivers (Indian norms)
                </AccordionTrigger>

                <AccordionContent className="space-y-6 pt-2">
                  <Lever
                    label="Opex inflation / cost increase"
                    value={inputs.opexAdj}
                    min={-20}
                    max={40}
                    suffix="%"
                    onChange={(v) => set("opexAdj", v)}
                  />
                  <Lever
                    label="New hires count"
                    value={inputs.hires}
                    min={0}
                    max={50}
                    suffix=""
                    onChange={(v) => set("hires", v)}
                  />
                  <Lever
                    label="Avg cost per employee (CTC p.a.)"
                    value={inputs.avgSalary}
                    min={300000}
                    max={5000000}
                    step={50000}
                    suffix=""
                    currency
                    onChange={(v) => set("avgSalary", v)}
                  />
                  <p className="-mt-3 text-[11px] text-muted-foreground">
                    Employer PF 12% and ESI 3.25% are auto-included on CTC.
                  </p>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="capex">
                <AccordionTrigger className="text-sm font-semibold">
                  CAPEX &amp; tax drivers
                </AccordionTrigger>
                <AccordionContent className="space-y-6 pt-2">
                  <Lever
                    label="Capital expenditure / asset purchase"
                    value={inputs.capex}
                    min={0}
                    max={50000000}
                    step={500000}
                    suffix=""
                    currency
                    onChange={(v) => set("capex", v)}
                  />
                  <p className="-mt-3 text-[11px] text-muted-foreground">
                    Advance tax is paid quarterly — Q1 Jun, Q2 Sep, Q3 Dec, Q4 Mar — at 25% corporate tax
                    plus 7% surcharge and 4% cess.
                  </p>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="cash">
                <AccordionTrigger className="text-sm font-semibold">Cash flow drivers</AccordionTrigger>
                <AccordionContent className="space-y-6 pt-2">
                  <Lever
                    label="Average collection delay (DSO)"
                    value={inputs.dso}
                    min={15}
                    max={90}
                    suffix=" d"
                    onChange={(v) => set("dso", v)}
                  />
                </AccordionContent>
              </AccordionItem>

            </Accordion>
          </CardContent>
        </Card>

        <div className="space-y-4 xl:col-span-3">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="Projected 12M Revenue"
              value={inr(result.scenRevenueTotal, true)}
              delta={revDelta}
              hint={`baseline ${inr(result.baseRevenueTotal, true)}`}
              icon={TrendingUp}
            />
            <KpiCard
              label="Projected 12M EBITDA / Net Profit"
              value={inr(result.scenProfitTotal, true)}
              delta={profitDelta}
              hint={`net margin ${result.netMargin.toFixed(1)}% · after tax ${inr(result.taxTotal, true)}`}

              icon={Banknote}
              tone={result.scenProfitTotal >= result.baseProfitTotal ? "success" : "danger"}
            />
            <KpiCard
              label="Projected End Cash"
              value={inr(result.endCash, true)}
              hint={`cash impact ${inr(result.cashImpact, true)}`}
              icon={Wallet}
              tone={result.endCash >= 0 ? "neutral" : "danger"}
            />
            <KpiCard
              label="Estimated Cash Runway"
              value={result.runway >= 24 ? "24+ Months" : `${result.runway.toFixed(1)} Months`}
              hint={runwayTone === "success" ? "healthy" : runwayTone === "warning" ? "monitor" : "critical"}
              icon={Gauge}
              tone={runwayTone}
            />
          </div>

          <Card className="border-border shadow-card">
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base">Baseline vs Scenario</CardTitle>
                <CardDescription>Next twelve months</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                {tab === "profit" && (
                  <Button
                    variant={band ? "secondary" : "outline"}
                    size="sm"
                    onClick={() => setBand((b) => !b)}
                  >
                    95% band
                  </Button>
                )}
                <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
                  <TabsList>
                    {TABS.map((t) => (
                      <TabsTrigger key={t.id} value={t.id} className="text-xs">
                        {t.label}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
              </div>
            </CardHeader>
            <CardContent className="h-[340px]">
              <ResponsiveContainer width="100%" height="100%">
                {tab === "revopex" ? (
                  <BarChart data={rows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} />
                    <YAxis
                      tickFormatter={(v) => inr(Number(v), true)}
                      tickLine={false}
                      axisLine={false}
                      fontSize={12}
                      width={72}
                    />
                    <Tooltip formatter={(v) => inr(Number(v))} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="scenRevenue" name="Revenue" fill="#0284c7" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="scenExpense" name="Opex" fill="#334155" radius={[4, 4, 0, 0]} />
                  </BarChart>
                ) : tab === "runway" ? (
                  <LineChart data={rows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} />
                    <YAxis
                      tickFormatter={(v) => `${v}m`}
                      tickLine={false}
                      axisLine={false}
                      fontSize={12}
                      width={48}
                    />
                    <Tooltip formatter={(v) => `${Number(v).toFixed(1)} months`} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                    <Line
                      type="monotone"
                      dataKey="runway"
                      name="Runway"
                      stroke="#0284c7"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                ) : tab === "cumulative" ? (
                  <ComposedChart data={rows}>

                    <defs>
                      <linearGradient id="cum" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#0284c7" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#0284c7" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} />
                    <YAxis
                      tickFormatter={(v) => inr(Number(v), true)}
                      tickLine={false}
                      axisLine={false}
                      fontSize={12}
                      width={72}
                    />
                    <Tooltip formatter={(v) => inr(Number(v))} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                    <Area
                      type="monotone"
                      dataKey="cumulative"
                      name="Cumulative cash flow"
                      stroke="#0284c7"
                      strokeWidth={2}
                      fill="url(#cum)"
                    />
                    <Line
                      type="monotone"
                      dataKey="advanceTax"
                      name="Advance tax payout"
                      stroke="#dc2626"
                      strokeWidth={0}
                      dot={{ r: 4, fill: "#dc2626" }}
                      activeDot={{ r: 6 }}
                    />
                  </ComposedChart>

                ) : (
                  <AreaChart data={rows}>
                    <defs>
                      <linearGradient id="scen" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#0284c7" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#0284c7" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} />
                    <YAxis
                      tickFormatter={(v) => inr(Number(v), true)}
                      tickLine={false}
                      axisLine={false}
                      fontSize={12}
                      width={72}
                    />
                    <Tooltip formatter={(v) => inr(Number(v))} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                    {band && (
                      <Area
                        type="monotone"
                        dataKey="upper"
                        name="95% confidence"
                        stroke="transparent"
                        fill="#0284c7"
                        fillOpacity={0.12}
                      />
                    )}
                    {band && (
                      <Area
                        type="monotone"
                        dataKey="lower"
                        name="Lower bound"
                        stroke="#0284c7"
                        strokeOpacity={0.3}
                        strokeWidth={1}
                        fill="transparent"
                        legendType="none"
                        tooltipType="none"
                      />
                    )}
                    <Area
                      type="monotone"
                      dataKey="baseProfit"
                      name="Baseline"
                      stroke="#334155"
                      strokeDasharray="5 4"
                      strokeWidth={2}
                      fill="transparent"
                    />
                    <Area
                      type="monotone"
                      dataKey="scenProfit"
                      name="Scenario"
                      stroke="#0284c7"
                      strokeWidth={2}
                      fill="url(#scen)"
                    />
                  </AreaChart>
                )}
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-5">
            <Card className="border-border shadow-card lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Sparkles className="size-4 text-brand" /> Sensitivity insights
                </CardTitle>
                <CardDescription>Updates as you move the levers</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm leading-relaxed">
                <p className="rounded-md bg-brand-soft p-3 text-brand">
                  🇮🇳 AI Corporate Insight: revenue growth of {inputs.revenueGrowth}% against{" "}
                  {inputs.churn}% churn moves FY top-line by {revDelta.toFixed(1)}% (
                  {inr(result.scenRevenueTotal - result.baseRevenueTotal, true)}). Adding {inputs.hires} team
                  members at {inr(inputs.avgSalary, true)} CTC raises annual payroll by{" "}
                  {inr(result.payrollImpact, true)} (incl. PF 12% &amp; ESI 3.25%).
                </p>
                <p className="text-muted-foreground">
                  Post-tax net profit moves {profitDelta.toFixed(1)}% versus baseline at a{" "}
                  {result.netMargin.toFixed(1)}% net margin. Corporate tax for the year is{" "}
                  {inr(result.taxTotal, true)} (25% + 7% surcharge + 4% cess), with the Q3 advance tax
                  instalment of {inr(q3Tax, true)} due in December.
                </p>
                <p className="text-muted-foreground">
                  GST output at {inputs.gstRate}% routes {inr(result.gstTotal, true)} through the books as a
                  pass-through. A {inputs.dso}-day collection cycle (DSO) delays{" "}
                  {inr((result.scenRevenueTotal / 12) * Math.min(0.35, inputs.dso / 365), true)} of cash, and
                  CAPEX of {inr(inputs.capex, true)} hits month one. Runway lands at{" "}
                  {result.runway >= 24 ? "beyond 24" : result.runway.toFixed(1)} months.
                </p>


                <div className="space-y-2 border-t border-border pt-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                      AI explanation{aiMonth ? ` · ${aiMonth}` : ""}
                    </span>
                    <Button size="sm" variant="outline" disabled={aiLoading} onClick={() => void askAi()}>
                      {aiLoading ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Sparkles className="size-4" />
                      )}
                      Why it changed
                    </Button>
                  </div>
                  {aiText ? (
                    <p className="whitespace-pre-line rounded-md bg-secondary p-3 text-sm">{aiText}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Ask AI to explain the month-by-month revenue, cost and profit movement, or press
                      “Why?” on any month in the table.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="border-border shadow-card lg:col-span-3">
              <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base">12-month detailed projections</CardTitle>
                  <CardDescription>Low runway and negative cash months highlighted</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={exportCsv}>
                    <Download className="size-4" /> CSV
                  </Button>
                  <Button variant="outline" size="sm" onClick={exportPdf}>
                    <FileText className="size-4" /> PDF
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div ref={tableRef} className="max-h-[320px] overflow-auto rounded-md border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Month</TableHead>
                        <TableHead className="text-right">Revenue (Excl. GST)</TableHead>
                        <TableHead className="text-right">Operating Exp.</TableHead>
                        <TableHead className="text-right">Payroll (incl. PF/ESI)</TableHead>
                        <TableHead className="text-right">EBITDA</TableHead>
                        <TableHead className="text-right">Corporate Tax</TableHead>
                        <TableHead className="text-right">Net Profit</TableHead>
                        <TableHead className="text-right">Ending Cash</TableHead>
                        <TableHead className="text-right">Runway</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((r) => {
                        const risky = r.scenProfit < 0 || r.scenCash < 0 || r.runway < 3;
                        return (
                          <TableRow key={r.month} className={cn(risky && "bg-danger-soft/60")}>
                            <TableCell className="font-medium">
                              <button
                                type="button"
                                disabled={aiLoading}
                                onClick={() => void askAi(r.month)}
                                className="underline decoration-dotted underline-offset-4 hover:text-brand"
                                title={`Why did ${r.month} change?`}
                              >
                                {r.month}
                                {r.advanceTax > 0 ? " *" : ""}
                              </button>
                            </TableCell>
                            <TableCell className="tabular text-right">{inr(r.scenRevenue, true)}</TableCell>
                            <TableCell className="tabular text-right">{inr(r.opex, true)}</TableCell>
                            <TableCell className="tabular text-right">{inr(r.payroll, true)}</TableCell>
                            <TableCell className="tabular text-right">{inr(r.ebitda, true)}</TableCell>
                            <TableCell className="tabular text-right text-muted-foreground">
                              {inr(r.tax, true)}
                            </TableCell>
                            <TableCell
                              className={cn(
                                "tabular text-right font-semibold",
                                r.scenProfit < 0 ? "text-danger" : "text-success",
                              )}
                            >
                              {inr(r.scenProfit, true)}
                            </TableCell>
                            <TableCell className="tabular text-right">{inr(r.scenCash, true)}</TableCell>
                            <TableCell className="tabular text-right">
                              {r.runway >= 24 ? "24+" : `${r.runway.toFixed(1)}m`}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[11px] text-muted-foreground">
                    * quarterly advance tax payout month (Q1 Jun, Q2 Sep, Q3 Dec, Q4 Mar). Net profit is
                    post-tax at 25% + 7% surcharge + 4% cess.
                  </p>
                  <Button variant="secondary" size="sm" onClick={exportCsv}>
                    <Download className="size-4" /> Download FY Projection Statement
                  </Button>
                </div>
              </CardContent>

            </Card>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function pctChange(next: number, base: number) {
  if (!base) return 0;
  return ((next - base) / Math.abs(base)) * 100;
}

function Lever({
  label,
  value,
  min,
  max,
  step = 1,
  suffix,
  currency = false,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix: string;
  currency?: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs">{label}</Label>
        <Input
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(e) => onChange(clamp(Number(e.target.value), min, max))}
          className="tabular h-8 w-24 text-right text-xs"
        />
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={([v]) => onChange(v ?? min)}
      />
      <div className="flex justify-between text-[11px] text-muted-foreground">
        <span>{currency ? inr(min, true) : `${min}${suffix}`}</span>
        <span className="font-medium text-foreground">
          {currency ? inr(value, true) : `${value}${suffix}`}
        </span>
        <span>{currency ? inr(max, true) : `${max}${suffix}`}</span>
      </div>
    </div>
  );
}

function clamp(v: number, min: number, max: number) {
  if (!Number.isFinite(v)) return min;
  return Math.min(max, Math.max(min, v));
}

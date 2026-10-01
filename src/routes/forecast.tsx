import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { explainForecast } from "@/lib/ai.functions";
import {
  Banknote,
  Bookmark,
  Download,
  Loader2,
  Gauge,
  RotateCcw,
  Sparkles,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
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

import { AiReportButton } from "@/components/finance/AiReportButton";
import { chartLabelProps, moneyDataLabel, monthsDataLabel } from "@/components/finance/ChartDataLabels";
import { ActiveDatasetBanner } from "@/components/finance/ActiveDatasetBanner";
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
import { Switch } from "@/components/ui/switch";
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
import { useBudget } from "@/lib/budget";
import { useCategories } from "@/lib/categories";
import { CURRENCIES, useFx } from "@/lib/fx";
import { useDataset } from "@/lib/dataset";
import { useActiveDataset } from "@/lib/active-dataset";
import { ModuleSkeleton } from "@/components/finance/ModuleSkeleton";

import { actualsByCategory, downloadCSV, formatCompactCurrency, inr } from "@/lib/finance-data";

import {
  BASE_SCENARIO,
  FY_OPTIONS,
  PRESETS,
  loadScenarios,
  runForecast,
  saveScenarios,
  type FinancialYear,
  type ForecastRow,
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

function milestoneIndices(rows: ForecastRow[], key: "baseProfit" | "scenProfit") {
  if (!rows.length) return new Set<number>();
  const first = 0;
  const last = rows.length - 1;
  const values = rows.map((row) => row[key]);
  const peak = values.indexOf(Math.max(...values));
  const low = values.indexOf(Math.min(...values));
  const indices = new Set([first, last]);
  // Skip extrema next to an endpoint or each other; the endpoint badge already explains that area.
  if (peak > first + 1 && peak < last - 1) indices.add(peak);
  if (low > first + 1 && low < last - 1 && Math.abs(low - peak) > 1) indices.add(low);
  return indices;
}

function milestoneBadge(rows: ForecastRow[], key: "baseProfit" | "scenProfit", above: boolean) {
  const visible = milestoneIndices(rows, key);
  return (props: { x?: number | string | undefined; y?: number | string | undefined; index?: number | undefined; value?: number | string | undefined }) => {
    const index = Number(props.index);
    const x = Number(props.x);
    const y = Number(props.y);
    if (!visible.has(index) || !Number.isFinite(x) || !Number.isFinite(y)) return null;
    const value = Number(props.value);
    if (!Number.isFinite(value)) return null;
    const text = formatCompactCurrency(value);
    const width = Math.max(48, text.length * 7 + 16);
    // Keep the first/last badges inside the plot instead of clipping at either edge.
    const left = index === 0 ? x - 4 : index === rows.length - 1 ? x - width + 4 : x - width / 2;
    const top = above ? y - 32 : y + 12;
    return (
      <g className="forecast-milestone" aria-label={`${rows[index]?.month} ${key === "baseProfit" ? "baseline" : "scenario"}: ${inr(value)}`}>
        <rect x={left} y={top} width={width} height={23} rx={4} />
        <text x={left + width / 2} y={top + 15} textAnchor="middle">{text}</text>
      </g>
    );
  };
}

function ForecastComparisonTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ payload?: ForecastRow }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const row = payload.find((entry) => entry.payload?.month === label)?.payload;
  if (!row) return null;
  const difference = row.scenProfit - row.baseProfit;
  const percent = pctChange(row.scenProfit, row.baseProfit);
  return (
    <div className="rounded-md border border-border bg-popover p-3 text-xs text-popover-foreground shadow-card">
      <p className="mb-2 font-semibold">{row.month} · Net profit</p>
      <div className="grid grid-cols-[auto_auto] gap-x-6 gap-y-1.5">
        <span>Baseline Value</span><span className="tabular text-right font-semibold">{inr(row.baseProfit)}</span>
        <span>Scenario Value</span><span className="tabular text-right font-semibold">{inr(row.scenProfit)}</span>
        <span className="border-t border-border pt-2">Variance Difference</span>
        <span className="tabular border-t border-border pt-2 text-right font-semibold">{difference >= 0 ? "+" : "−"}{inr(Math.abs(difference))} ({percent >= 0 ? "+" : ""}{percent.toFixed(1)}%)</span>
      </div>
    </div>
  );
}


function ForecastPage() {
  const { txns, pays, live } = useDataset();
  const { syncing } = useActiveDataset();
  const { session } = useAuth();
  const { payrollNames } = useCategories();

  const fx = useFx();
  const [newRevenueEntered, setNewRevenueEntered] = useState(0);
  const [rateDraft, setRateDraft] = useState("");
  const [inputs, setInputs] = useState<ScenarioInputs>(BASE_SCENARIO);
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("profit");
  const [band, setBand] = useState(false);
  const [comparisonView, setComparisonView] = useState<"line" | "bar">("line");
  const [saved, setSaved] = useState<SavedScenario[]>(() => loadScenarios());
  const [name, setName] = useState("");
  const [open, setOpen] = useState(false);
  const tableRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const [aiText, setAiText] = useState("");
  const [aiMonth, setAiMonth] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const explain = useServerFn(explainForecast);

  const askAi = async (focusMonth?: string) => {
    if (!session) {
      toast.error("Sign in to use the AI explanation — demo mode has no AI access.");
      return;
    }

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
          ...(plannedTotal
            ? {
                budget: {
                  plannedAnnual: plannedTotal,
                  actualToDate,
                  forecastSpend: result.spendTotal,
                  lines: budgetLines,
                },
              }
            : {}),
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

  // Revenue typed in the selected currency is converted to rupees for the model.
  useEffect(() => {
    setInputs((prev) => ({
      ...prev,
      newRevenue: Math.round(newRevenueEntered * fx.rate),
      currency: fx.code,
      fxRate: fx.rate,
    }));
  }, [newRevenueEntered, fx.rate, fx.code]);

  const result = useMemo(
    () => runForecast(inputs, txns, pays, payrollNames),
    [inputs, txns, pays, payrollNames],
  );
  const { rows } = result;
  const comparisonRows = useMemo(() => rows.map((row) => ({ ...row, confidenceRange: [row.lower, row.upper] })), [rows]);
  const stressScenario = inputs.revenueGrowth < 0 || inputs.churn >= 10 || inputs.opexAdj >= 10;
  const scenarioColor = stressScenario ? "var(--forecast-stress)" : "var(--forecast-scenario)";

  const budget = useBudget(inputs.fy);
  const actuals = useMemo(() => actualsByCategory(txns), [txns]);
  const plannedTotal = budget.plannedTotal;
  const budgetGap = result.spendTotal - plannedTotal;
  const budgetLines = budget.rows.map((b) => ({
    category: b.category,
    planned: b.budgeted_amount,
    actual: actuals.get(b.category) ?? 0,
  }));
  const actualToDate = budgetLines.reduce((s, l) => s + l.actual, 0);

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

  const buildReport = () => ({
    page: "forecast" as const,
    reportName: "Scenario Analysis, Sensitivity Assessment & Runway Projections",
    fy: inputs.fy,
    kpis: [
      {
        label: "Projected 12M Revenue (Excl. GST)",
        value: inr(result.scenRevenueTotal, true),
        delta: `${revDelta >= 0 ? "+" : ""}${revDelta.toFixed(1)}% vs baseline`,
      },
      {
        label: "Projected 12M Net Profit (Post-Tax)",
        value: inr(result.scenProfitTotal, true),
        delta: `${profitDelta >= 0 ? "+" : ""}${profitDelta.toFixed(1)}% vs baseline`,
      },
      {
        label: "Ending Cash Balance",
        value: inr(rows[rows.length - 1]?.scenCash ?? 0, true),
        delta: `Q3 advance tax ${inr(q3Tax, true)}`,
      },
      {
        label: "Cash Runway",
        value: result.runway >= 24 ? "24+ months" : `${result.runway.toFixed(1)} months`,
        delta: runwayTone === "success" ? "healthy" : runwayTone === "warning" ? "monitor" : "critical",
      },
    ],
    tables: [
      {
        title: `${inputs.fy} Projection Statement (April to March)`,
        columns: [
          "Month",
          "Revenue",
          "Opex",
          "Payroll",
          "EBITDA",
          "Corp. Tax",
          "Net Profit",
          "Ending Cash",
          "Runway",
        ],
        numericFrom: 1,
        rows: rows.map((r) => [
          `${r.month}${r.advanceTax > 0 ? " *" : ""}`,
          inr(r.scenRevenue, true),
          inr(r.opex, true),
          inr(r.payroll, true),
          inr(r.ebitda, true),
          inr(r.tax, true),
          inr(r.scenProfit, true),
          inr(r.scenCash, true),
          r.runway >= 24 ? "24+" : `${r.runway.toFixed(1)}m`,
        ]),
      },
      {
        title: "Plan vs Forecast",
        columns: ["Particulars", "Amount"],
        numericFrom: 1,
        rows: [
          ["Planned budget for the year", inr(plannedTotal)],
          ["Actual spend to date", inr(actualToDate)],
          ["Forecast 12-month operating + payroll spend", inr(result.spendTotal)],
          ["Gap vs plan", `${budgetGap > 0 ? "+" : "-"}${inr(Math.abs(budgetGap))}`],
          ["Currency basis", fx.note],
        ],
      },
      {
        title: "Scenario Drivers",
        columns: ["Driver", "Setting"],
        rows: [
          ["Revenue growth", `${inputs.revenueGrowth}%`],
          ["Churn", `${inputs.churn}%`],
          ["Price / inflation", `${inputs.priceFactor}%`],
          ["GST output rate", `${inputs.gstRate}%`],
          ["Opex inflation", `${inputs.opexAdj}%`],
          ["New hires", `${inputs.hires} at ${inr(inputs.avgSalary)} p.a. CTC (incl. PF 12% + ESI 3.25%)`],
          ["CAPEX", inr(inputs.capex)],
          ["DSO", `${inputs.dso} days`],
          [
            "New contracted revenue",
            `${fx.currency.symbol}${newRevenueEntered.toLocaleString("en-IN")} per month${fx.code === "INR" ? "" : ` = ${inr(inputs.newRevenue)}`}`,
          ],
          ["Reporting currency basis", fx.note],
        ],
      },
    ],
    facts: `Baseline 12M revenue ${inr(result.baseRevenueTotal)} vs scenario ${inr(result.scenRevenueTotal)} (${revDelta.toFixed(1)}%). Baseline net profit ${inr(result.baseProfitTotal)} vs scenario ${inr(result.scenProfitTotal)} (${profitDelta.toFixed(1)}%). Cash runway ${result.runway.toFixed(1)} months. Drivers: revenue growth ${inputs.revenueGrowth}%, churn ${inputs.churn}%, opex ${inputs.opexAdj}%, ${inputs.hires} hires at ${inr(inputs.avgSalary)} CTC, CAPEX ${inr(inputs.capex)}, DSO ${inputs.dso} days, GST ${inputs.gstRate}%. Monthly detail: ${rows
      .map((r) => `${r.month} rev ${inr(r.scenRevenue, true)} profit ${inr(r.scenProfit, true)} cash ${inr(r.scenCash, true)} runway ${r.runway.toFixed(1)}m`)
      .join("; ")}. Planned budget ${inr(plannedTotal)}, actual spend to date ${inr(actualToDate)}, forecast operating plus payroll spend ${inr(result.spendTotal)}, gap ${inr(budgetGap)}. ${fx.note} Data source: ${live ? "uploaded ledger" : "demo dataset"}.`,
    chartEl: chartRef.current,
  });


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

  if (syncing)
    return (
      <AppShell title="Financial Forecasting & Scenario Planning" subtitle="Loading the selected dataset…">
        <ModuleSkeleton />
      </AppShell>
    );

  return (
    <AppShell
      title={`Financial Forecasting & Scenario Planning (${inputs.fy})`}
      subtitle={`12-Month Rolling Indian Corporate Outlook & Runway Stress Testing · ${live ? "live data" : "demo data"}`}
    >
      <ActiveDatasetBanner />
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
        <AiReportButton build={buildReport} label="Download AI Report" />
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

                  <div className="space-y-2 rounded-md border border-border p-3">
                    <Label className="text-xs font-semibold">Revenue currency</Label>
                    <Select value={fx.code} onValueChange={fx.setCode}>
                      <SelectTrigger className="bg-background" aria-label="Revenue currency">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CURRENCIES.map((c) => (
                          <SelectItem key={c.code} value={c.code}>
                            {c.code} — {c.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Label htmlFor="new-revenue" className="text-xs">
                      New contracted revenue per month ({fx.currency.symbol.trim() || fx.code})
                    </Label>
                    <Input
                      id="new-revenue"
                      className="bg-background"
                      placeholder="25000"
                      value={newRevenueEntered ? String(newRevenueEntered) : ""}
                      onChange={(e) =>
                        setNewRevenueEntered(Number(e.target.value.replace(/[^0-9.]/g, "")) || 0)
                      }
                    />

                    {fx.code !== "INR" && (
                      <>
                        <Label htmlFor="fx-rate" className="text-xs">
                          1 {fx.code} in rupees
                        </Label>
                        <div className="flex gap-2">
                          <Input
                            id="fx-rate"
                            className="bg-background"
                            value={rateDraft || String(fx.rate)}
                            onChange={(e) => setRateDraft(e.target.value.replace(/[^0-9.]/g, ""))}
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={fx.saving}
                            onClick={() => {
                              const value = Number(rateDraft);
                              if (!value) {
                                toast.error("Enter a conversion rate greater than zero.");
                                return;
                              }
                              void fx
                                .setRate(value)
                                .then(() => {
                                  setRateDraft("");
                                  toast.success(`Rate saved — 1 ${fx.code} = ₹${value.toFixed(2)}`);
                                })
                                .catch((e: unknown) =>
                                  toast.error(
                                    e instanceof Error ? e.message : "Could not save the rate.",
                                  ),
                                );
                            }}
                          >
                            Save
                          </Button>
                        </div>
                      </>
                    )}
                    <p className="text-[11px] text-muted-foreground">{fx.note}</p>
                  </div>
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
              label="Plan vs Forecast Gap"
              value={`${budgetGap >= 0 ? "+" : "−"}${inr(Math.abs(budgetGap), true)}`}
              hint={plannedTotal ? `plan ${inr(plannedTotal, true)}` : "no budget entered yet"}
              icon={Gauge}
              tone={plannedTotal === 0 ? "neutral" : budgetGap > 0 ? "danger" : "success"}
            />
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

          <Card ref={chartRef} className="border-border shadow-card">
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base">Baseline vs Scenario</CardTitle>
                <CardDescription>
                  Next twelve months ·{" "}
                  {result.history.months > 1
                    ? `learned from ${result.history.months} months of your actuals (±${result.history.band95Pct.toFixed(1)}% first-month band)`
                    : "not enough history yet — using a gentle default trend"}
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {tab === "profit" && (
                  <>
                    <div className="flex items-center gap-2">
                      <Switch id="forecast-confidence" checked={band} onCheckedChange={setBand} aria-label="Show Confidence Interval" />
                      <Label htmlFor="forecast-confidence" className="whitespace-nowrap text-xs">Show Confidence Interval</Label>
                    </div>
                    <Tabs value={comparisonView} onValueChange={(v) => setComparisonView(v as "line" | "bar")}>
                      <TabsList aria-label="Comparison chart view">
                        <TabsTrigger value="line" className="text-xs">Line View</TabsTrigger>
                        <TabsTrigger value="bar" className="text-xs">Side-by-Side Bar Comparison View</TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </>
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
            <CardContent className="h-[380px] min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                {tab === "revopex" ? (
                  <BarChart data={rows} margin={{ top: 26 }}>
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
                    <Bar isAnimationActive={false} dataKey="scenRevenue" name="Revenue" fill="#0284c7" radius={[4, 4, 0, 0]}>
                      <LabelList dataKey="scenRevenue" position="top" {...chartLabelProps} formatter={moneyDataLabel} />
                    </Bar>
                    <Bar isAnimationActive={false} dataKey="scenExpense" name="Opex" fill="#334155" radius={[4, 4, 0, 0]}>
                      <LabelList dataKey="scenExpense" position="top" {...chartLabelProps} formatter={moneyDataLabel} />
                    </Bar>
                  </BarChart>
                ) : tab === "runway" ? (
                  <LineChart data={rows} margin={{ top: 26, right: 16 }}>
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
                    <Line isAnimationActive={false}
                      type="monotone"
                      dataKey="runway"
                      name="Runway"
                      stroke="#0284c7"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    >
                      <LabelList dataKey="runway" position="top" {...chartLabelProps} formatter={monthsDataLabel} />
                    </Line>
                  </LineChart>
                ) : tab === "cumulative" ? (
                  <ComposedChart data={rows} margin={{ top: 26, right: 16 }}>

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
                    <Area isAnimationActive={false}
                      type="monotone"
                      dataKey="cumulative"
                      name="Cumulative cash flow"
                      stroke="#0284c7"
                      strokeWidth={2}
                      fill="url(#cum)"
                      dot={{ r: 3 }}
                    >
                      <LabelList dataKey="cumulative" position="top" {...chartLabelProps} formatter={moneyDataLabel} />
                    </Area>
                    <Line isAnimationActive={false}
                      type="monotone"
                      dataKey="advanceTax"
                      name="Advance tax payout"
                      stroke="#dc2626"
                      strokeWidth={0}
                      dot={{ r: 4, fill: "#dc2626" }}
                      activeDot={{ r: 6 }}
                    >
                      <LabelList dataKey="advanceTax" position="bottom" {...chartLabelProps} formatter={moneyDataLabel} />
                    </Line>
                  </ComposedChart>

                ) : comparisonView === "bar" ? (
                  <BarChart data={comparisonRows} margin={{ top: 32, right: 24, bottom: 8, left: 16 }} barGap={3}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} />
                    <YAxis
                      tickFormatter={(v) => inr(Number(v), true)}
                      tickLine={false}
                      axisLine={false}
                      fontSize={12}
                      width={80}
                    />
                    <Tooltip content={<ForecastComparisonTooltip />} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                    <Bar isAnimationActive={false} dataKey="baseProfit" name="Baseline" fill="var(--forecast-baseline)" radius={[3, 3, 0, 0]} />
                    <Bar isAnimationActive={false} dataKey="scenProfit" name="Scenario" fill={scenarioColor} radius={[3, 3, 0, 0]} />
                  </BarChart>
                ) : (
                  <ComposedChart data={comparisonRows} margin={{ top: 44, right: 24, bottom: 28, left: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} />
                    <YAxis tickFormatter={(v) => inr(Number(v), true)} tickLine={false} axisLine={false} fontSize={12} width={80} />
                    <Tooltip content={<ForecastComparisonTooltip />} />
                    {band && (
                      <Area
                        type="monotone"
                        dataKey="confidenceRange"
                        name="95% confidence interval"
                        stroke="transparent"
                        legendType="none"
                        tooltipType="none"
                        fill={scenarioColor}
                        fillOpacity={0.08}
                        isAnimationActive={false}
                      />
                    )}
                    <Legend iconType="line" wrapperStyle={{ fontSize: 12 }} />
                    <Line
                      type="monotone"
                      dataKey="baseProfit"
                      name="Baseline"
                      stroke="var(--forecast-baseline)"
                      strokeWidth={2.5}
                      dot={{ r: 2.5 }}
                      activeDot={{ r: 5 }}
                      isAnimationActive={false}
                    >
                      <LabelList dataKey="baseProfit" content={milestoneBadge(rows, "baseProfit", true)} />
                    </Line>
                    <Line
                      type="monotone"
                      dataKey="scenProfit"
                      name="Scenario"
                      stroke={scenarioColor}
                      strokeDasharray="7 5"
                      strokeWidth={2.5}
                      dot={{ r: 2.5 }}
                      activeDot={{ r: 5 }}
                      isAnimationActive={false}
                    >
                      <LabelList dataKey="scenProfit" content={milestoneBadge(rows, "scenProfit", false)} />
                    </Line>
                  </ComposedChart>
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
                  <AiReportButton build={buildReport} label="AI PDF" />
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
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  useEffect(() => {
    if (local === value) return;
    const id = setTimeout(() => onChange(local), 300);
    return () => clearTimeout(id);
  }, [local]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs">{label}</Label>
        <Input
          type="number"
          value={local}
          min={min}
          max={max}
          step={step}
          onChange={(e) => setLocal(clamp(Number(e.target.value), min, max))}
          className="tabular h-8 w-24 text-right text-xs"
        />
      </div>
      <Slider
        value={[local]}
        min={min}
        max={max}
        step={step}
        onValueChange={([v]) => setLocal(v ?? min)}
      />
      <div className="flex justify-between text-[11px] text-muted-foreground">
        <span>{currency ? inr(min, true) : `${min}${suffix}`}</span>
        <span className="font-medium text-foreground">
          {currency ? inr(local, true) : `${local}${suffix}`}
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

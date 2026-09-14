import {
  MONTHS,
  grossPay,
  monthlySummary,
  type PayrollRecord,
  type Transaction,
} from "@/lib/finance-data";

export interface ScenarioInputs {
  revenueGrowth: number;
  churn: number;
  priceFactor: number;
  opexAdj: number;
  hires: number;
  avgSalary: number;
  capex: number;
  dso: number;
}

export const BASE_SCENARIO: ScenarioInputs = {
  revenueGrowth: 12,
  churn: 4,
  priceFactor: 3,
  opexAdj: 4,
  hires: 3,
  avgSalary: 900000,
  capex: 0,
  dso: 30,
};

export const PRESETS: Record<string, Partial<ScenarioInputs>> = {
  base: {},
  best: { revenueGrowth: 25, churn: 2, priceFactor: 6, opexAdj: 2, hires: 5 },
  worst: { revenueGrowth: -15, churn: 12, priceFactor: -4, opexAdj: 12, hires: 0, dso: 60 },
};

export interface ForecastRow {
  month: string;
  baseRevenue: number;
  scenRevenue: number;
  baseExpense: number;
  scenExpense: number;
  baseProfit: number;
  scenProfit: number;
  baseCash: number;
  scenCash: number;
  cumulative: number;
  runway: number;
  lower: number;
  upper: number;
}

export interface ForecastResult {
  rows: ForecastRow[];
  baseRevenueTotal: number;
  scenRevenueTotal: number;
  baseProfitTotal: number;
  scenProfitTotal: number;
  endCash: number;
  baseEndCash: number;
  runway: number;
  netMargin: number;
  payrollImpact: number;
  cashImpact: number;
}

/** Deterministic 12-month scenario model driven by the selected entity's ledger. */
export function runForecast(
  inputs: ScenarioInputs,
  txns: Transaction[],
  pays: PayrollRecord[],
): ForecastResult {
  const series = monthlySummary(txns);
  const last = series[series.length - 1]!;
  const startCash = last.cash;
  const lastRev = last.revenue || 1;
  const lastExp = last.expense || 1;

  const avgSalary = pays.length
    ? pays.reduce((s, p) => s + grossPay(p), 0) / pays.length * 12
    : inputs.avgSalary;
  const hireCost = (inputs.hires * (inputs.avgSalary || avgSalary) * 1.18) / 12;

  const gBase = 0.012;
  const gScen =
    gBase + inputs.revenueGrowth / 100 / 12 - inputs.churn / 100 / 12 + inputs.priceFactor / 100 / 12;
  const eBase = 0.009;
  const eScen = eBase + inputs.opexAdj / 100 / 12;
  const collectionDrag = Math.min(0.35, inputs.dso / 365);

  let baseCash = startCash;
  let scenCash = startCash;
  let cumulative = 0;

  const rows: ForecastRow[] = Array.from({ length: 12 }, (_, i) => {
    const baseRevenue = lastRev * Math.pow(1 + gBase, i + 1);
    const scenRevenue = lastRev * Math.pow(1 + gScen, i + 1);
    const baseExpense = lastExp * Math.pow(1 + eBase, i + 1);
    const scenExpense =
      lastExp * Math.pow(1 + eScen, i + 1) + hireCost + (i === 0 ? inputs.capex : 0);

    const baseProfit = baseRevenue - baseExpense;
    const scenProfit = scenRevenue - scenExpense;

    baseCash += baseProfit;
    scenCash += scenProfit - scenRevenue * collectionDrag * (i === 0 ? 1 : 0.15);
    cumulative += scenProfit;

    const burn = Math.max(0, -scenProfit);
    const band = 0.06 * (i + 1);

    return {
      month: MONTHS[i]!.slice(0, 3),
      baseRevenue: Math.round(baseRevenue),
      scenRevenue: Math.round(scenRevenue),
      baseExpense: Math.round(baseExpense),
      scenExpense: Math.round(scenExpense),
      baseProfit: Math.round(baseProfit),
      scenProfit: Math.round(scenProfit),
      baseCash: Math.round(baseCash),
      scenCash: Math.round(scenCash),
      cumulative: Math.round(cumulative),
      runway: burn <= 0 ? 24 : Math.max(0, Math.round((scenCash / burn) * 10) / 10),
      lower: Math.round(scenProfit * (1 - band)),
      upper: Math.round(scenProfit * (1 + band)),
    };
  });

  const sum = (pick: (r: ForecastRow) => number) => rows.reduce((s, r) => s + pick(r), 0);
  const scenRevenueTotal = sum((r) => r.scenRevenue);
  const scenProfitTotal = sum((r) => r.scenProfit);
  const endCash = rows[11]!.scenCash;
  const monthlyBurn =
    rows.reduce((s, r) => s + Math.max(0, -r.scenProfit), 0) / 12 ||
    Math.max(1, sum((r) => r.scenExpense) / 12 - sum((r) => r.scenRevenue) / 12);

  return {
    rows,
    baseRevenueTotal: sum((r) => r.baseRevenue),
    scenRevenueTotal,
    baseProfitTotal: sum((r) => r.baseProfit),
    scenProfitTotal,
    endCash,
    baseEndCash: rows[11]!.baseCash,
    runway: monthlyBurn <= 0 ? 24 : Math.max(0, endCash / monthlyBurn),
    netMargin: scenRevenueTotal ? (scenProfitTotal / scenRevenueTotal) * 100 : 0,
    payrollImpact: inputs.hires * (inputs.avgSalary || avgSalary),
    cashImpact: endCash - rows[11]!.baseCash,
  };
}

export interface SavedScenario {
  name: string;
  inputs: ScenarioInputs;
}

const KEY = "financeiq.scenarios";

export function loadScenarios(): SavedScenario[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SavedScenario[]) : [];
  } catch {
    return [];
  }
}

export function saveScenarios(list: SavedScenario[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(list));
}

import { grossPay, monthlySummary, type PayrollRecord, type Transaction } from "@/lib/finance-data";

/** Indian financial year months, April to March. */
export const FY_MONTHS = [
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
  "Jan",
  "Feb",
  "Mar",
] as const;

/** Quarterly advance-tax payout months (Q1 Jun, Q2 Sep, Q3 Dec, Q4 Mar). */
export const ADVANCE_TAX_MONTHS = ["Jun", "Sep", "Dec", "Mar"] as const;

export const FY_OPTIONS = ["FY 2026-27", "FY 2027-28"] as const;
export type FinancialYear = (typeof FY_OPTIONS)[number];

/** Employer statutory add-ons on CTC: PF 12% + ESI 3.25%. */
export const EMPLOYER_PF = 0.12;
export const EMPLOYER_ESI = 0.0325;
export const STATUTORY_LOAD = 1 + EMPLOYER_PF + EMPLOYER_ESI;

/** Base corporate tax 25% + surcharge 7% + cess 4%. */
export const CORPORATE_TAX = 0.25;
export const SURCHARGE = 0.07;
export const CESS = 0.04;
export const EFFECTIVE_TAX = CORPORATE_TAX * (1 + SURCHARGE) * (1 + CESS);

export interface ScenarioInputs {
  revenueGrowth: number;
  churn: number;
  priceFactor: number;
  gstRate: number;
  opexAdj: number;
  hires: number;
  avgSalary: number;
  capex: number;
  dso: number;
  fy: FinancialYear;
  /** extra contracted revenue per month, already converted to rupees */
  newRevenue: number;
  /** currency the new revenue was entered in (reporting only) */
  currency: string;
  /** conversion rate used, 1 unit of `currency` in rupees */
  fxRate: number;
}

export const BASE_SCENARIO: ScenarioInputs = {
  revenueGrowth: 12,
  churn: 4,
  priceFactor: 3,
  gstRate: 18,
  opexAdj: 4,
  hires: 3,
  avgSalary: 900000,
  capex: 0,
  dso: 30,
  fy: "FY 2026-27",
  newRevenue: 0,
  currency: "INR",
  fxRate: 1,
};

export const PRESETS: Record<string, Partial<ScenarioInputs>> = {
  base: {},
  best: { revenueGrowth: 25, churn: 2, priceFactor: 6, opexAdj: 2, hires: 5 },
  worst: { revenueGrowth: -15, churn: 12, priceFactor: -4, opexAdj: 12, hires: 0, dso: 60 },
};

export interface ForecastRow {
  month: string;
  /** Revenue excluding GST. */
  baseRevenue: number;
  scenRevenue: number;
  /** GST output collected on scenario revenue (pass-through, not income). */
  gstOutput: number;
  /** Operating expenses excluding payroll. */
  opex: number;
  /** Payroll cost including employer PF/ESI. */
  payroll: number;
  /** Opex + payroll + one-time CAPEX. */
  baseExpense: number;
  scenExpense: number;
  ebitda: number;
  /** Accrued corporate tax for the month (incl. surcharge & cess). */
  tax: number;
  /** Advance-tax cash payout in this month (0 outside Jun/Sep/Dec/Mar). */
  advanceTax: number;
  baseProfit: number;
  /** Post-tax net profit for the scenario. */
  scenProfit: number;
  baseCash: number;
  scenCash: number;
  cumulative: number;
  runway: number;
  /** 95% confidence bounds on scenario profit. */
  lower: number;
  upper: number;
  /** 80% confidence bounds on scenario profit. */
  lower80: number;
  upper80: number;
}

/** Descriptive statistics learned from a dataset's historical monthly numbers. */
export interface HistoryStats {
  /** number of months with activity */
  months: number;
  mean: number;
  /** ordinary-least-squares slope, rupees per month */
  slope: number;
  stdDev: number;
  /** coefficient of variation (stdDev / mean) */
  cv: number;
  /** slope expressed as a monthly growth rate on the mean */
  growthRate: number;
  /** 3-month moving average of the most recent months */
  movingAverage: number;
}

const EMPTY_STATS: HistoryStats = {
  months: 0,
  mean: 0,
  slope: 0,
  stdDev: 0,
  cv: 0,
  growthRate: 0,
  movingAverage: 0,
};

/**
 * Trend slope (linear regression), mean, standard deviation and moving average
 * of a historical monthly series. Drives both the projection growth rate and
 * the width of the confidence bands, so a longer history yields tighter bands.
 */
export function historyStats(values: number[]): HistoryStats {
  const xs = values.filter((v) => Number.isFinite(v));
  const n = xs.length;
  if (n === 0) return EMPTY_STATS;
  const mean = xs.reduce((s, v) => s + v, 0) / n;

  let slope = 0;
  if (n > 1) {
    const xMean = (n - 1) / 2;
    let num = 0;
    let den = 0;
    xs.forEach((v, i) => {
      num += (i - xMean) * (v - mean);
      den += (i - xMean) ** 2;
    });
    slope = den ? num / den : 0;
  }

  const variance = n > 1 ? xs.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1) : 0;
  const stdDev = Math.sqrt(variance);
  const tail = xs.slice(-3);

  return {
    months: n,
    mean,
    slope,
    stdDev,
    cv: mean > 0 ? stdDev / mean : 0,
    growthRate: mean > 0 ? slope / mean : 0,
    movingAverage: tail.length ? tail.reduce((s, v) => s + v, 0) / tail.length : mean,
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Relative half-width of a confidence band for the n-th projected month.
 * Volatility comes from the history's coefficient of variation; the standard
 * error shrinks with the square root of the number of historical months, so
 * 12+ months of actuals produce visibly tighter bands than 3 months.
 */
export function bandWidthFor(stats: HistoryStats, monthsAhead: number, z: number): number {
  const volatility = stats.months > 1 ? clamp(stats.cv, 0.03, 0.9) : 0.35;
  const standardError = volatility / Math.sqrt(Math.max(1, stats.months));
  return clamp(z * standardError * Math.sqrt(monthsAhead), 0.01, 0.75);
}

export interface ForecastResult {
  rows: ForecastRow[];
  /** total 12-month operating + payroll spend, for budget comparison */
  spendTotal: number;
  baseRevenueTotal: number;
  scenRevenueTotal: number;
  baseProfitTotal: number;
  scenProfitTotal: number;
  gstTotal: number;
  taxTotal: number;
  payrollTotal: number;
  endCash: number;
  baseEndCash: number;
  runway: number;
  netMargin: number;
  payrollImpact: number;
  cashImpact: number;
}

/**
 * Deterministic 12-month Indian-FY scenario model driven by the selected entity's ledger.
 *
 * @param payrollCategories user-defined expense categories that count as people cost.
 *   When the ledger carries spend in those categories it defines the payroll baseline,
 *   so the split between payroll and other operating expenses follows the user's own
 *   category setup instead of a fixed assumption.
 */
export function runForecast(
  inputs: ScenarioInputs,
  txns: Transaction[],
  pays: PayrollRecord[],
  payrollCategories: string[] = ["Payroll"],
): ForecastResult {
  const series = monthlySummary(txns);
  const last = series[series.length - 1]!;
  const startCash = last.cash;
  // Use the average of months that actually carry activity so a partially
  // populated ledger (e.g. a freshly uploaded two-month CSV) still yields a
  // realistic run-rate instead of an empty trailing month.
  const active = series.filter((s) => s.revenue > 0 || s.expense > 0);
  const sample = active.length ? active : series;
  const avg = (pick: (s: (typeof series)[number]) => number) =>
    sample.reduce((s, r) => s + pick(r), 0) / sample.length;
  const lastRev = avg((s) => s.revenue) || 1;
  const lastExp = avg((s) => s.expense) || 1;

  // Learn the trend from the dataset's own history instead of a fixed assumption.
  const revStats = historyStats(sample.map((s) => s.revenue));
  const expStats = historyStats(sample.map((s) => s.expense));
  const profitStats = historyStats(sample.map((s) => s.profit));

  // Monthly people cost taken from the user's own payroll categories in the ledger.
  const payrollNames = new Set(payrollCategories.map((c) => c.toLowerCase()));
  const ledgerPayroll =
    txns
      .filter((t) => t.type === "expense" && payrollNames.has(t.category.toLowerCase()))
      .reduce((s, t) => s + t.amount, 0) / sample.length;

  const basePayroll = ledgerPayroll
    ? ledgerPayroll
    : pays.length
      ? pays.reduce((s, p) => s + grossPay(p), 0)
      : lastExp * 0.45;
  const baseOpex = Math.max(0, lastExp - basePayroll);
  const hirePayroll = (inputs.hires * inputs.avgSalary * STATUTORY_LOAD) / 12;

  // FY 2027-28 continues the same compounding curve one year further out.
  const offset = inputs.fy === "FY 2027-28" ? 12 : 0;

  // Baseline growth is the regression slope of the dataset's own monthly history,
  // clamped to a sane band; with too little history we fall back to a gentle drift.
  const gBase = revStats.months > 1 ? clamp(revStats.growthRate, -0.08, 0.12) : 0.012;
  const gScen =
    gBase + inputs.revenueGrowth / 100 / 12 - inputs.churn / 100 / 12 + inputs.priceFactor / 100 / 12;
  const eBase = expStats.months > 1 ? clamp(expStats.growthRate, -0.06, 0.1) : 0.009;
  const eScen = eBase + inputs.opexAdj / 100 / 12;
  const collectionDrag = Math.min(0.35, inputs.dso / 365);

  let baseCash = startCash;
  let scenCash = startCash;
  let cumulative = 0;
  let quarterTax = 0;

  const rows: ForecastRow[] = Array.from({ length: 12 }, (_, i) => {
    const n = i + 1 + offset;
    const month = FY_MONTHS[i]!;

    const baseRevenue = lastRev * Math.pow(1 + gBase, n);
    const scenRevenue = lastRev * Math.pow(1 + gScen, n) + inputs.newRevenue;
    const gstOutput = scenRevenue * (inputs.gstRate / 100);

    const opex = baseOpex * Math.pow(1 + eScen, n);
    const payroll = basePayroll * Math.pow(1 + eScen, n) + hirePayroll;
    const capexHit = i === 0 ? inputs.capex : 0;
    const scenExpense = opex + payroll + capexHit;
    const baseExpense = lastExp * Math.pow(1 + eBase, n);

    const ebitda = scenRevenue - opex - payroll;
    const tax = ebitda > 0 ? ebitda * EFFECTIVE_TAX : 0;
    quarterTax += tax;

    const isTaxMonth = (ADVANCE_TAX_MONTHS as readonly string[]).includes(month);
    const advanceTax = isTaxMonth ? quarterTax : 0;
    if (isTaxMonth) quarterTax = 0;

    const scenProfit = ebitda - tax - capexHit;
    const baseProfit = baseRevenue - baseExpense;

    baseCash += baseProfit;
    scenCash +=
      ebitda - capexHit - advanceTax - scenRevenue * collectionDrag * (i === 0 ? 1 : 0.15);
    cumulative += scenProfit;

    const burn = Math.max(0, -scenProfit);
    // Band width learned from historical volatility; it shrinks as the dataset
    // carries more months of actuals and widens further into the future.
    const band95 = bandWidthFor(profitStats, i + 1, 1.96);
    const band80 = bandWidthFor(profitStats, i + 1, 1.282);

    return {
      month,
      baseRevenue: Math.round(baseRevenue),
      scenRevenue: Math.round(scenRevenue),
      gstOutput: Math.round(gstOutput),
      opex: Math.round(opex),
      payroll: Math.round(payroll),
      baseExpense: Math.round(baseExpense),
      scenExpense: Math.round(scenExpense),
      ebitda: Math.round(ebitda),
      tax: Math.round(tax),
      advanceTax: Math.round(advanceTax),
      baseProfit: Math.round(baseProfit),
      scenProfit: Math.round(scenProfit),
      baseCash: Math.round(baseCash),
      scenCash: Math.round(scenCash),
      cumulative: Math.round(cumulative),
      runway: burn <= 0 ? 24 : Math.max(0, Math.round((scenCash / burn) * 10) / 10),
      lower: Math.round(scenProfit - Math.abs(scenProfit) * band95),
      upper: Math.round(scenProfit + Math.abs(scenProfit) * band95),
      lower80: Math.round(scenProfit - Math.abs(scenProfit) * band80),
      upper80: Math.round(scenProfit + Math.abs(scenProfit) * band80),
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
    spendTotal: sum((r) => r.opex + r.payroll),
    baseRevenueTotal: sum((r) => r.baseRevenue),
    scenRevenueTotal,
    baseProfitTotal: sum((r) => r.baseProfit),
    scenProfitTotal,
    gstTotal: sum((r) => r.gstOutput),
    taxTotal: sum((r) => r.tax),
    payrollTotal: sum((r) => r.payroll),
    endCash,
    baseEndCash: rows[11]!.baseCash,
    runway: monthlyBurn <= 0 ? 24 : Math.max(0, endCash / monthlyBurn),
    netMargin: scenRevenueTotal ? (scenProfitTotal / scenRevenueTotal) * 100 : 0,
    payrollImpact: inputs.hires * inputs.avgSalary * STATUTORY_LOAD,
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
    const list = raw ? (JSON.parse(raw) as SavedScenario[]) : [];
    // Older saves predate GST / FY fields.
    return list.map((s) => ({ name: s.name, inputs: { ...BASE_SCENARIO, ...s.inputs } }));
  } catch {
    return [];
  }
}

export function saveScenarios(list: SavedScenario[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(list));
}

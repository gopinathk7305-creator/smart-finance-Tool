import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

async function callGateway(system: string, user: string, json = false) {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("AI is not configured for this project yet.");

  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": key,
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify({
      model: "google/gemini-3.8-flash",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      ...(json ? { response_format: { type: "json_object" } } : {}),
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    if (res.status === 429) throw new Error("AI is rate limited right now — try again shortly.");
    if (res.status === 402) throw new Error("AI credits are exhausted for this workspace.");
    throw new Error(`AI request failed (${res.status}): ${detail.slice(0, 300)}`);
  }

  const payload = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return payload.choices?.[0]?.message?.content ?? "";
}

export interface PayrollAiInput {
  name: string;
  department: string;
  regime: "new" | "old";
  gross: number;
  basic: number;
  allowances: number;
  pf: number;
  esi: number;
  taxableIncome: number;
  annualTax: number;
  cess: number;
  monthlyTds: number;
  netPay: number;
}

export const explainPayroll = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: PayrollAiInput) => input)
  .handler(async ({ data }) => {
    const text = await callGateway(
      "You are an Indian payroll and income-tax expert. Explain salary structures clearly in short markdown-free plain text. Use Indian rupee amounts. Never invent numbers that are not supplied.",
      `Explain this monthly payslip for ${data.name} (${data.department}), ${data.regime} tax regime.
Gross: ${data.gross}. Basic: ${data.basic}. Allowances: ${data.allowances}.
PF (12% of basic): ${data.pf}. ESI: ${data.esi}. Annual taxable income: ${data.taxableIncome}.
Annual tax before cess: ${data.annualTax}. Cess (4%): ${data.cess}. Monthly TDS: ${data.monthlyTds}. Net take-home: ${data.netPay}.
Give: 1) a two-line summary, 2) how the slab-wise tax and cess were arrived at, 3) one practical saving tip. Keep under 160 words.`,
    );
    return { text };
  });

export interface ScanTxn {
  id: string;
  date: string;
  category: string;
  type: string;
  amount: number;
  vendor_client: string;
  status: string;
}

export interface AiFinding {
  rule: string;
  severity: "high" | "medium" | "low";
  party: string;
  date: string;
  amount: number;
  detail: string;
}

export const scanLedgerWithAi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { rows: ScanTxn[] }) => input)
  .handler(async ({ data }) => {
    const rows = data.rows.slice(0, 250);
    if (!rows.length) return { findings: [] as AiFinding[] };

    const content = await callGateway(
      "You are a forensic finance auditor. Review the ledger and return ONLY JSON.",
      `Ledger rows (JSON): ${JSON.stringify(rows)}

Flag anomalies for these rules only: "Duplicate invoice", "Round-figure high value", "Out-of-hours posting", "Category variance".
Return JSON exactly like {"findings":[{"rule":"","severity":"high|medium|low","party":"","date":"YYYY-MM-DD","amount":0,"detail":""}]}.
Maximum 20 findings, most severe first. Use only amounts and parties present in the data.`,
      true,
    );

    try {
      const parsed = JSON.parse(content) as { findings?: AiFinding[] };
      return { findings: (parsed.findings ?? []).slice(0, 20) };
    } catch {
      return { findings: [] as AiFinding[] };
    }
  });

export interface DatasetInsightInput {
  org: string;
  recordCount: number;
  revenue: number;
  expense: number;
  net: number;
  margin: number;
  from: string;
  to: string;
  runway: number;
  drivers: { label: string; value: number }[];
  spend: { label: string; value: number }[];
  risks: string[];
}

export const explainDataset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: DatasetInsightInput) => input)
  .handler(async ({ data }) => {
    const text = await callGateway(
      "You are a CFO-level Indian corporate finance analyst. Write a crisp executive overview of an uploaded finance dataset in 3 sentences of plain text (no markdown). Amounts are Indian rupees quoted in Lakhs (L) or Crores (Cr) using the Indian number system. Use only the supplied numbers.",
      `Entity: ${data.org}. Records ingested: ${data.recordCount}. Period ${data.from} to ${data.to}.
Total revenue ${data.revenue}. Net expenses ${data.expense}. Net position ${data.net} at ${data.margin.toFixed(1)}% margin. Cash runway ${data.runway.toFixed(1)} months.
Top revenue drivers: ${data.drivers.map((d) => `${d.label} ${d.value}`).join("; ") || "none"}.
Largest expense categories: ${data.spend.map((d) => `${d.label} ${d.value}`).join("; ") || "none"}.
Detected risks: ${data.risks.join("; ")}.
Summarise the dataset health, name the biggest driver and the single most urgent risk. Under 80 words.`,
    );
    return { text };
  });

export interface ForecastMonth {
  month: string;
  revenue: number;
  cost: number;
  profit: number;
  baseRevenue: number;
  baseCost: number;
  baseProfit: number;
}

export interface ForecastAiInput {
  drivers: {
    revenueGrowth: number;
    churn: number;
    priceFactor: number;
    opexAdj: number;
    hires: number;
    avgSalary: number;
    capex: number;
    dso: number;
  };
  months: ForecastMonth[];
  /** planned budget and actual spend so the answer can name plan gaps */
  budget?: {
    plannedAnnual: number;
    actualToDate: number;
    forecastSpend: number;
    lines: { category: string; planned: number; actual: number }[];
  };
  /** when set, focus the explanation on this single month */
  focusMonth?: string;
}

export const explainForecast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: ForecastAiInput) => input)
  .handler(async ({ data }) => {
    const d = data.drivers;
    const budgetLine = data.budget
      ? `Budget context: planned annual spend ${data.budget.plannedAnnual}, actual spend to date ${data.budget.actualToDate}, forecast twelve-month operating plus payroll spend ${data.budget.forecastSpend}. Per-category plan vs actual: ${data.budget.lines
          .map((l) => `${l.category} planned ${l.planned} actual ${l.actual}`)
          .join("; ")}. Say clearly where the entity is over or under plan and where the forecast breaches the budget.`
      : "No budget has been entered yet; do not invent plan figures.";
    const text = await callGateway(
      "You are a CFO-level Indian corporate financial planning analyst. Explain forecast movements in short, concrete plain text (no markdown symbols). Amounts are Indian rupees; quote them in Lakhs (L) or Crores (Cr) using the Indian number system. Months follow the Indian financial year, April to March. Costs already include employer PF 12% and ESI 3.25%, and profit is post-tax at 25% corporate tax plus 7% surcharge and 4% cess, with advance tax paid in Jun, Sep, Dec and Mar. Use only the numbers supplied and never invent new figures.",
      data.focusMonth
        ? `Scenario drivers: revenue growth ${d.revenueGrowth}%, churn ${d.churn}%, price/inflation ${d.priceFactor}%, opex adjustment ${d.opexAdj}%, ${d.hires} new hires at ${d.avgSalary} each per year, CAPEX ${d.capex}, DSO ${d.dso} days.
Monthly data (JSON, revenue/cost/profit are scenario values, base* are baseline): ${JSON.stringify(data.months)}
${budgetLine}
Explain ONLY the month "${data.focusMonth}": why its revenue, cost and profit differ from the baseline and from the previous month, naming which drivers caused it and by roughly how much. Under 90 words.`
        : `Scenario drivers: revenue growth ${d.revenueGrowth}%, churn ${d.churn}%, price/inflation ${d.priceFactor}%, opex adjustment ${d.opexAdj}%, ${d.hires} new hires at ${d.avgSalary} each per year, CAPEX ${d.capex}, DSO ${d.dso} days.
Monthly data (JSON, revenue/cost/profit are scenario values, base* are baseline): ${JSON.stringify(data.months)}
${budgetLine}
Give: 1) two lines on how revenue, cost and profit move across the twelve months, 2) three bullets naming the drivers behind the biggest monthly changes with the months and amounts, 3) one line naming the biggest budget-vs-actual gap and the main risk month. Under 190 words.`,
    );
    return { text };
  });

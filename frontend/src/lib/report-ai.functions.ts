import { createServerFn } from "@tanstack/react-start";


const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

export interface ReportAiInput {
  page: string;
  reportName: string;
  org: string;
  vendor?: string;
  fy: string;
  kpis: { label: string; value: string; delta?: string }[];
  facts: string;
}

const TEMPLATE: Record<string, string> = {
  dashboard: "Executive Overview & Entity Health Report: comment on revenue vs expense momentum, margin quality, cash runway and entity health.",
  forecast:
    "Scenario Analysis, Sensitivity Assessment & Runway Projections: compare baseline vs scenario, cash runway impact, and recommend on hiring and opex.",
  pnl: "Income Statement, EBITDA Bridge & Tax Compliance Breakdown: walk revenue to net profit, comment on GST position and corporate tax.",
  payroll:
    "Salary Register & Statutory Deductions Summary: total CTC breakdown, PF 12% / ESI 3.25% / slab-wise TDS compliance status and tax liability.",
  audit:
    "Forensic Audit Trail & Compliance Register: total audited transactions, flagged anomalies, risk score and recommended audit actions.",
  budget:
    "Budget Plan, Variance Analysis & Forecast Gap Statement: compare planned spend to actual spend and to the twelve-month forecast, naming the categories driving the gap.",
  compliance:
    "Statutory Compliance & Filings Status Report: GST, TDS, PF/ESI and advance-tax filing position, overdue exposure and late-fee risk.",
  reports: "Consolidated Management Report: summarise the selected statement and its control implications.",
};

export const generateReportNarrative = createServerFn({ method: "POST" })
  .inputValidator((input: ReportAiInput) => input)
  .handler(async ({ data }) => {
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
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You are a CFO-level Indian corporate finance analyst writing formal board documents. Write in plain prose without markdown symbols. Amounts are Indian rupees quoted in the Indian numbering system (Lakhs / Crores). Statutory context: employer PF 12%, ESI 3.25%, GST 18%, corporate tax 25% plus 7% surcharge and 4% cess, advance tax in Jun, Sep, Dec, Mar, financial year April to March. Use only the figures supplied; never invent numbers.",
          },
          {
            role: "user",
            content: `Document: ${data.reportName} for ${data.org}${data.vendor ? ` (vendor/entity: ${data.vendor})` : ""}, ${data.fy}.
Template focus: ${TEMPLATE[data.page] ?? TEMPLATE["reports"]}
Headline KPIs: ${data.kpis.map((k) => `${k.label} = ${k.value}${k.delta ? ` (${k.delta})` : ""}`).join("; ")}
Supporting data: ${data.facts}

Return ONLY JSON: {"summary":"3 to 4 paragraphs separated by \\n\\n, 220-320 words total","takeaways":["three short critical observations, each under 22 words"]}`,
          },
        ],
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      if (res.status === 429) throw new Error("AI is rate limited right now — try again shortly.");
      if (res.status === 402) throw new Error("AI credits are exhausted for this workspace.");
      throw new Error(`AI request failed (${res.status}): ${detail.slice(0, 200)}`);
    }

    const payload = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = payload.choices?.[0]?.message?.content ?? "";
    try {
      const parsed = JSON.parse(content) as { summary?: string; takeaways?: string[] };
      return {
        summary: parsed.summary ?? "",
        takeaways: (parsed.takeaways ?? []).slice(0, 4),
      };
    } catch {
      return { summary: content, takeaways: [] as string[] };
    }
  });

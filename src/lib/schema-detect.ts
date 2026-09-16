// AI-style schema detection: inspects the column headers of any uploaded
// financial file and decides which module the dataset belongs to, plus the
// app sections that will refresh once the rows land in the cloud.

import type { DatasetKey } from "@/lib/etl";

export interface Detection {
  key: DatasetKey;
  /** human label for the detected dataset */
  label: string;
  /** target cloud table */
  table: "transactions" | "payroll_records" | "budget_targets" | "arap_records";
  /** app modules the data feeds */
  modules: string[];
  /** 0-100 confidence */
  confidence: number;
  /** normalised headers found in the file */
  columns: string[];
  /** headers that drove the decision */
  matched: string[];
}

const canon = (h: string) =>
  h.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

interface Rule {
  key: DatasetKey;
  label: string;
  table: Detection["table"];
  modules: string[];
  /** signals: header fragments that indicate this dataset */
  signals: string[];
  /** stronger, near-unique signals */
  strong: string[];
}

const RULES: Rule[] = [
  {
    key: "payroll",
    label: "Payroll & Statutory",
    table: "payroll_records",
    modules: ["Payroll", "Statutory Tax", "Compliance", "P&L Statement"],
    signals: ["employee", "emp_id", "department", "month_year", "salary", "basic", "allowance", "gross_pay", "net_pay"],
    strong: ["tds", "pf", "esi", "pf_deduction", "tds_deduction", "basic_pay", "salary", "employee_id"],
  },
  {
    key: "budget",
    label: "Budget Targets",
    table: "budget_targets",
    modules: ["Budget vs Actual", "Forecasting", "P&L Statement"],
    signals: ["fiscal_year", "financial_year", "category", "department", "plan", "forecast"],
    strong: ["budget_amount", "budgeted_amount", "target", "actual_variance", "variance", "planned_amount"],
  },
  {
    key: "arap",
    label: "Receivables / Payables",
    table: "arap_records",
    modules: ["Cash Flow", "AR/AP Aging", "Reports"],
    signals: ["party", "party_name", "invoice", "outstanding", "aging", "settled"],
    strong: ["due_date", "invoice_date", "receivable", "payable", "ar_ap", "invoice_no"],
  },
  {
    key: "transactions",
    label: "Financial Transactions",
    table: "transactions",
    modules: ["Dashboard", "P&L Statement", "Financial Analysis", "Cash Flow"],
    signals: ["date", "txn_date", "amount", "category", "vendor", "client", "expense", "type", "status", "gstin"],
    strong: ["transaction_id", "net_amount", "gross_profit", "revenue", "transaction_date", "total_amount"],
  },
];

/** Audit / fraud columns add the Internal Audit module to any dataset. */
const AUDIT_SIGNALS = ["risk_score", "is_fraud_flag", "fraud", "approval_status", "approved_by", "flag", "anomaly"];

export function detectSchema(headers: string[]): Detection {
  const columns = headers.map(canon).filter(Boolean);
  const has = (frag: string) => columns.some((c) => c === frag || c.includes(frag));

  let best: { rule: Rule; score: number; matched: string[] } | null = null;
  for (const rule of RULES) {
    const matched: string[] = [];
    let score = 0;
    rule.strong.forEach((s) => {
      if (has(s)) {
        score += 3;
        matched.push(s);
      }
    });
    rule.signals.forEach((s) => {
      if (has(s)) {
        score += 1;
        matched.push(s);
      }
    });
    if (!best || score > best.score) best = { rule, score, matched };
  }

  const picked = best!;
  const modules = [...picked.rule.modules];
  if (AUDIT_SIGNALS.some(has)) modules.push("Audit & Fraud Risk");
  if (has("gstin") || has("gst")) modules.push("GST & Compliance");

  return {
    key: picked.rule.key,
    label: picked.rule.label,
    table: picked.rule.table,
    modules: [...new Set(modules)],
    confidence: Math.max(35, Math.min(99, picked.score * 11)),
    columns,
    matched: [...new Set(picked.matched)],
  };
}

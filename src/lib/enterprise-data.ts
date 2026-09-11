// Enterprise layer: users & activity logs, Indian tax engine, forensic audit rules, GST.
// All demo data is deterministic and illustrative.

import { grossPay, payroll, transactions, type Transaction, type PayrollRecord } from "./finance-data";

/* ---------------- Users & activity ---------------- */

export type UserRole = "Admin" | "Finance Manager" | "Auditor" | "Viewer";

export interface SystemUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: "active" | "suspended";
  created_at: string;
  last_login: string;
}

export const systemUsers: SystemUser[] = [
  ["Aathi Krishnan", "aathi.k@financeiq.io", "Admin"],
  ["Meera Iyer", "meera.iyer@financeiq.io", "Finance Manager"],
  ["Rohan Patel", "rohan.patel@financeiq.io", "Auditor"],
  ["Sneha Reddy", "sneha.reddy@financeiq.io", "Finance Manager"],
  ["Vikram Nair", "vikram.nair@financeiq.io", "Auditor"],
  ["Ananya Gupta", "ananya.gupta@financeiq.io", "Viewer"],
  ["Karthik Menon", "karthik.menon@financeiq.io", "Finance Manager"],
  ["Priya Sharma", "priya.sharma@financeiq.io", "Viewer"],
  ["Imran Khan", "imran.khan@financeiq.io", "Auditor"],
  ["Tara Nair", "tara.nair@financeiq.io", "Admin"],
].map(([name, email, role], i) => ({
  id: `USR-${1001 + i}`,
  name: name!,
  email: email!,
  role: role as UserRole,
  status: i === 7 ? ("suspended" as const) : ("active" as const),
  created_at: `2026-0${(i % 9) + 1}-1${i % 9}`,
  last_login: `2026-12-${String(20 - (i % 6)).padStart(2, "0")} ${String(9 + (i % 9)).padStart(2, "0")}:${String((i * 7) % 60).padStart(2, "0")}`,
}));

export interface ActivityLog {
  id: string;
  timestamp: string;
  email: string;
  action: string;
  module: string;
  device: string;
}

const ACTIONS = [
  ["Uploaded transactions.csv (312 rows)", "Data Upload"],
  ["Committed payroll batch Dec 2026", "Payroll & Tax"],
  ["Edited budget target — Marketing", "Budget vs Actual"],
  ["Exported P&L statement (PDF)", "Reports"],
  ["Flagged invoice INV-2291 for investigation", "Internal Audit"],
  ["Changed user role: Viewer → Auditor", "User Management"],
  ["Ran forecast scenario (+8% revenue)", "Forecasting"],
  ["Viewed tax breakdown EMP-1014", "Payroll & Tax"],
  ["Downloaded AR/AP aging CSV", "Cash Flow"],
  ["Signed in", "Authentication"],
  ["Approved audit exception AX-04", "Internal Audit"],
  ["Deleted duplicate vendor record", "Data Upload"],
];

export const activityLogs: ActivityLog[] = Array.from({ length: 24 }, (_, i) => {
  const u = systemUsers[i % systemUsers.length]!;
  const a = ACTIONS[i % ACTIONS.length]!;
  return {
    id: `LOG-${5000 + i}`,
    timestamp: `2026-12-${String(20 - Math.floor(i / 3)).padStart(2, "0")} ${String(18 - (i % 10)).padStart(2, "0")}:${String((i * 13) % 60).padStart(2, "0")}`,
    email: u.email,
    action: a[0]!,
    module: a[1]!,
    device: i % 3 === 0 ? "192.168.14.2 · Chrome / macOS" : i % 3 === 1 ? "10.4.9.18 · Edge / Windows" : "172.16.8.44 · Safari / iOS",
  };
});

/* ---------------- Tax engine ---------------- */

export interface Slab {
  from: number;
  to: number;
  rate: number;
}

export const NEW_REGIME_SLABS: Slab[] = [
  { from: 0, to: 300_000, rate: 0 },
  { from: 300_000, to: 700_000, rate: 0.05 },
  { from: 700_000, to: 1_000_000, rate: 0.1 },
  { from: 1_000_000, to: 1_200_000, rate: 0.15 },
  { from: 1_200_000, to: 1_500_000, rate: 0.2 },
  { from: 1_500_000, to: Infinity, rate: 0.3 },
];

export const OLD_REGIME_SLABS: Slab[] = [
  { from: 0, to: 250_000, rate: 0 },
  { from: 250_000, to: 500_000, rate: 0.05 },
  { from: 500_000, to: 1_000_000, rate: 0.2 },
  { from: 1_000_000, to: Infinity, rate: 0.3 },
];

export function slabBreakdown(annualIncome: number, slabs: Slab[]) {
  return slabs.map((s) => {
    const taxable = Math.max(0, Math.min(annualIncome, s.to) - s.from);
    return { ...s, taxable, tax: taxable * s.rate };
  });
}

export interface TaxComputation {
  gross: number;
  pf: number;
  esi: number;
  annualGross: number;
  annualTax: number;
  cess: number;
  monthlyTds: number;
  otherDeductions: number;
  net: number;
  rows: ReturnType<typeof slabBreakdown>;
}

export function computeTax(p: PayrollRecord, regime: "new" | "old" = "new"): TaxComputation {
  const gross = grossPay(p);
  const pf = Math.round(p.basic_pay * 0.12);
  const esi = gross <= 21_000 ? Math.round(gross * 0.0075) : 0;
  const annualGross = gross * 12;
  const standardDeduction = regime === "new" ? 75_000 : 50_000;
  const taxableIncome = Math.max(0, annualGross - standardDeduction - (regime === "old" ? pf * 12 : 0));
  const slabs = regime === "new" ? NEW_REGIME_SLABS : OLD_REGIME_SLABS;
  const rows = slabBreakdown(taxableIncome, slabs);
  const baseTax = rows.reduce((s, r) => s + r.tax, 0);
  const cess = baseTax * 0.04;
  const annualTax = baseTax + cess;
  const monthlyTds = Math.round(annualTax / 12);
  const net = gross - (pf + esi + monthlyTds + p.deductions);
  return {
    gross,
    pf,
    esi,
    annualGross: taxableIncome,
    annualTax: Math.round(annualTax),
    cess: Math.round(cess),
    monthlyTds,
    otherDeductions: p.deductions,
    net,
    rows,
  };
}

export const payrollTaxTotals = () => {
  const list = payroll.map((p) => computeTax(p));
  return {
    gross: list.reduce((s, c) => s + c.gross, 0),
    pf: list.reduce((s, c) => s + c.pf, 0),
    tds: list.reduce((s, c) => s + c.monthlyTds, 0),
    net: list.reduce((s, c) => s + c.net, 0),
  };
};

/* ---------------- GST / corporate tax ---------------- */

export function gstSummary(revenue: number, expense: number) {
  const outputGst = Math.round(revenue * 0.18);
  const inputCredit = Math.round(expense * 0.6 * 0.18);
  return { outputGst, inputCredit, payable: outputGst - inputCredit };
}

/* ---------------- Forensic audit engine ---------------- */

export type AuditSeverity = "high" | "medium" | "low";
export type AuditStatus = "open" | "approved" | "investigating" | "rejected";

export interface AuditFinding {
  id: string;
  rule: string;
  severity: AuditSeverity;
  party: string;
  date: string;
  amount: number;
  detail: string;
}

// Deliberately seeded suspicious entries on top of the base ledger.
export const seededTransactions: Transaction[] = [
  {
    id: "txn-aud-1",
    date: "2026-11-04",
    category: "Marketing",
    subcategory: "Operating",
    type: "expense",
    amount: 500_000,
    vendor_client: "Brightline Agency",
    status: "paid",
  },
  {
    id: "txn-aud-2",
    date: "2026-11-07",
    category: "Marketing",
    subcategory: "Operating",
    type: "expense",
    amount: 500_000,
    vendor_client: "Brightline Agency",
    status: "paid",
  },
  {
    id: "txn-aud-3",
    date: "2026-09-21",
    category: "COGS",
    subcategory: "Operating",
    type: "expense",
    amount: 1_000_000,
    vendor_client: "Vertex Components",
    status: "paid",
  },
  {
    id: "txn-aud-4",
    date: "2026-10-13",
    category: "Legal",
    subcategory: "Operating",
    type: "expense",
    amount: 250_000,
    vendor_client: "Kapoor & Associates",
    status: "pending",
  },
  {
    id: "txn-aud-5",
    date: "2026-10-13",
    category: "Legal",
    subcategory: "Operating",
    type: "expense",
    amount: 250_000,
    vendor_client: "Kapoor & Associates",
    status: "pending",
  },
];

export const auditLedger: Transaction[] = [...transactions, ...seededTransactions];

export function auditFindings(): AuditFinding[] {
  const out: AuditFinding[] = [];
  const expenses = auditLedger.filter((t) => t.type === "expense");

  // Rule 1: duplicate invoices — same vendor & amount within 7 days.
  const seen = new Set<string>();
  expenses.forEach((a) => {
    expenses.forEach((b) => {
      if (a.id >= b.id) return;
      if (a.vendor_client !== b.vendor_client || a.amount !== b.amount) return;
      const days = Math.abs(Date.parse(a.date) - Date.parse(b.date)) / 86400000;
      if (days > 7) return;
      const key = `${a.id}-${b.id}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push({
        id: `AX-${out.length + 1}`,
        rule: "Duplicate invoice",
        severity: "high",
        party: a.vendor_client,
        date: b.date,
        amount: b.amount,
        detail: `Identical amount paid to ${a.vendor_client} on ${a.date} and ${b.date} (${Math.round(days)} days apart).`,
      });
    });
  });

  // Rule 2: round-figure high value transactions.
  expenses
    .filter((t) => t.amount >= 250_000 && t.amount % 50_000 === 0)
    .forEach((t) =>
      out.push({
        id: `AX-${out.length + 1}`,
        rule: "Round-figure high value",
        severity: "medium",
        party: t.vendor_client,
        date: t.date,
        amount: t.amount,
        detail: `Exact round sum payment — verify supporting invoice and approval trail.`,
      }),
    );

  // Rule 3: category variance > 25% vs historical average.
  const byCat = new Map<string, number[]>();
  expenses.forEach((t) => byCat.set(t.category, [...(byCat.get(t.category) ?? []), t.amount]));
  byCat.forEach((amts, cat) => {
    const avg = amts.reduce((s, v) => s + v, 0) / amts.length;
    amts.forEach((v, i) => {
      if (v > avg * 1.25 && out.filter((o) => o.rule === "Category variance" && o.party === cat).length < 2) {
        out.push({
          id: `AX-${out.length + 1}`,
          rule: "Category variance",
          severity: "medium",
          party: cat,
          date: `2026-${String((i % 12) + 1).padStart(2, "0")}-15`,
          amount: v,
          detail: `${cat} entry is ${(((v - avg) / avg) * 100).toFixed(1)}% above the 12-month average.`,
        });
      }
    });
  });

  // Rule 4: postings outside business hours (demo timestamps).
  ["Meta Ads", "AWS", "Northwind Supplies"].forEach((party, i) => {
    const t = expenses.find((e) => e.vendor_client === party);
    if (!t) return;
    out.push({
      id: `AX-${out.length + 1}`,
      rule: "Out-of-hours posting",
      severity: "low",
      party,
      date: t.date,
      amount: t.amount,
      detail: `Entry posted at ${23 - i}:4${i} IST, outside 09:00–19:00 business hours.`,
    });
  });

  return out.slice(0, 24);
}

export const immutableAuditTrail = activityLogs.slice(0, 12);

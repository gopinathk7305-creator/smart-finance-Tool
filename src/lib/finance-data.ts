// Mock financial dataset + calculation utilities.
// All figures are illustrative demo data for FY2026.

export type TxnType = "income" | "expense";

export interface Transaction {
  id: string;
  date: string; // ISO
  category: string;
  subcategory: string;
  type: TxnType;
  amount: number;
  vendor_client: string;
  status: "paid" | "pending";
}

export interface PayrollRecord {
  id: string;
  month_year: string;
  employee_id: string;
  name: string;
  department: string;
  basic_pay: number;
  allowances: number;
  deductions: number;
  pf_deduction: number;
  tds_deduction: number;
}

export interface BudgetTarget {
  id: string;
  fiscal_year: string;
  category: string;
  department: string;
  budgeted_amount: number;
}

export interface ArApRecord {
  id: string;
  type: "AR" | "AP";
  party_name: string;
  invoice_date: string;
  due_date: string;
  amount: number;
  status: "outstanding" | "settled";
}

export const MONTHS = [
  "Jan 2026",
  "Feb 2026",
  "Mar 2026",
  "Apr 2026",
  "May 2026",
  "Jun 2026",
  "Jul 2026",
  "Aug 2026",
  "Sep 2026",
  "Oct 2026",
  "Nov 2026",
  "Dec 2026",
];

const EXPENSE_CATEGORIES = [
  "Payroll",
  "COGS",
  "Software Subscriptions",
  "Office Rent",
  "Marketing",
  "Utilities",
  "Legal",
] as const;

const VENDORS: Record<string, string[]> = {
  Payroll: ["Internal Payroll Run"],
  COGS: ["Northwind Supplies", "Vertex Components"],
  "Software Subscriptions": ["Atlassian", "Figma", "AWS"],
  "Office Rent": ["Prestige Estates"],
  Marketing: ["Meta Ads", "Google Ads", "Brightline Agency"],
  Utilities: ["City Power Board", "Airtel Business"],
  Legal: ["Kapoor & Associates"],
};

const CLIENTS = [
  "Helios Retail",
  "Vanta Logistics",
  "Orbit Health",
  "Ferrous Steel Co",
  "Lumen Media",
];

// Deterministic pseudo-random so charts stay stable between renders.
function rand(seed: number) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function monthDate(monthIndex: number, day: number) {
  return `2026-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function buildTransactions(): Transaction[] {
  const rows: Transaction[] = [];
  let n = 0;
  MONTHS.forEach((_, m) => {
    // Revenue: growing trend with seasonality
    const baseRevenue = 4_200_000 + m * 145_000;
    for (let i = 0; i < 3; i++) {
      const amount = Math.round((baseRevenue / 3) * (0.82 + rand(m * 7 + i) * 0.42));
      rows.push({
        id: `txn-${++n}`,
        date: monthDate(m, 6 + i * 8),
        category: "Sales Revenue",
        subcategory: i === 0 ? "Subscriptions" : i === 1 ? "Services" : "Licensing",
        type: "income",
        amount,
        vendor_client: CLIENTS[(m + i) % CLIENTS.length]!,
        status: m >= 10 && i === 2 ? "pending" : "paid",
      });
    }

    const weights: Record<string, number> = {
      Payroll: 1_850_000 + m * 32_000,
      COGS: 980_000 + m * 21_000,
      "Software Subscriptions": 185_000,
      "Office Rent": 320_000,
      Marketing: 260_000 + (m % 4 === 0 ? 180_000 : 0),
      Utilities: 74_000,
      Legal: 48_000,
    };

    EXPENSE_CATEGORIES.forEach((cat, ci) => {
      const amount = Math.round(weights[cat]! * (0.92 + rand(m * 13 + ci) * 0.2));
      rows.push({
        id: `txn-${++n}`,
        date: monthDate(m, 12 + ci * 2),
        category: cat,
        subcategory: cat === "Payroll" ? "Salaries" : "Operating",
        type: "expense",
        amount,
        vendor_client: VENDORS[cat]![(m + ci) % VENDORS[cat]!.length]!,
        status: m === 11 && ci > 3 ? "pending" : "paid",
      });
    });
  });
  return rows;
}

export const transactions: Transaction[] = buildTransactions();

const DEPARTMENTS = ["Engineering", "Sales", "Marketing", "HR", "Operations"];
const FIRST = [
  "Aarav",
  "Diya",
  "Rohan",
  "Meera",
  "Karthik",
  "Sneha",
  "Vikram",
  "Ananya",
  "Rahul",
  "Priya",
  "Arjun",
  "Nisha",
  "Sanjay",
  "Kavya",
  "Imran",
  "Tara",
  "Nikhil",
  "Lakshmi",
  "Dev",
  "Riya",
  "Manoj",
  "Swathi",
  "Harish",
  "Ishita",
  "Varun",
];
const LAST = ["Sharma", "Iyer", "Patel", "Reddy", "Nair", "Gupta", "Menon", "Khan"];

function buildPayroll(): PayrollRecord[] {
  return FIRST.map((first, i) => {
    const dept = DEPARTMENTS[i % DEPARTMENTS.length]!;
    const basic = Math.round((52_000 + rand(i + 1) * 68_000) / 500) * 500;
    const allowances = Math.round(basic * (0.28 + rand(i + 40) * 0.14));
    const pf = Math.round(basic * 0.12);
    const tds = Math.round((basic + allowances) * (0.06 + rand(i + 80) * 0.05));
    const other = Math.round(1200 + rand(i + 120) * 2600);
    return {
      id: `pay-${i + 1}`,
      month_year: "Dec 2026",
      employee_id: `EMP-${String(1001 + i)}`,
      name: `${first} ${LAST[i % LAST.length]!}`,
      department: dept,
      basic_pay: basic,
      allowances,
      deductions: other,
      pf_deduction: pf,
      tds_deduction: tds,
    };
  });
}

export const payroll: PayrollRecord[] = buildPayroll();

export const netPay = (p: PayrollRecord) =>
  p.basic_pay + p.allowances - (p.pf_deduction + p.tds_deduction + p.deductions);

export const grossPay = (p: PayrollRecord) => p.basic_pay + p.allowances;

export const budgets: BudgetTarget[] = [
  { category: "Payroll", department: "People Ops", budgeted_amount: 24_800_000 },
  { category: "COGS", department: "Operations", budgeted_amount: 13_600_000 },
  { category: "Software Subscriptions", department: "Engineering", budgeted_amount: 2_050_000 },
  { category: "Office Rent", department: "Operations", budgeted_amount: 3_840_000 },
  { category: "Marketing", department: "Marketing", budgeted_amount: 3_600_000 },
  { category: "Utilities", department: "Operations", budgeted_amount: 980_000 },
  { category: "Legal", department: "Finance", budgeted_amount: 520_000 },
].map((b, i) => ({ id: `bud-${i + 1}`, fiscal_year: "FY2026", ...b }));

function buildArAp(): ArApRecord[] {
  const rows: ArApRecord[] = [];
  const arParties = [
    ...CLIENTS,
    "Zenith Foods",
    "Cobalt Labs",
    "Arcadia Realty",
    "Nimbus Cloud",
    "Trident Motors",
    "Sable Finance",
    "Kestrel Tools",
    "Aurora Textiles",
    "Pinecrest Edu",
    "Solstice Travel",
  ];
  arParties.slice(0, 15).forEach((party, i) => {
    const ageDays = Math.round(rand(i + 3) * 130);
    const due = new Date(Date.UTC(2026, 11, 20) - ageDays * 86400000);
    rows.push({
      id: `ar-${i + 1}`,
      type: "AR",
      party_name: party,
      invoice_date: new Date(due.getTime() - 30 * 86400000).toISOString().slice(0, 10),
      due_date: due.toISOString().slice(0, 10),
      amount: Math.round((180_000 + rand(i + 22) * 1_400_000) / 1000) * 1000,
      status: i % 6 === 0 ? "settled" : "outstanding",
    });
  });
  const apParties = [
    "Northwind Supplies",
    "Vertex Components",
    "Atlassian",
    "AWS",
    "Prestige Estates",
    "Meta Ads",
    "City Power Board",
    "Kapoor & Associates",
    "Brightline Agency",
    "Airtel Business",
  ];
  apParties.forEach((party, i) => {
    const ageDays = Math.round(rand(i + 55) * 110);
    const due = new Date(Date.UTC(2026, 11, 20) - ageDays * 86400000);
    rows.push({
      id: `ap-${i + 1}`,
      type: "AP",
      party_name: party,
      invoice_date: new Date(due.getTime() - 30 * 86400000).toISOString().slice(0, 10),
      due_date: due.toISOString().slice(0, 10),
      amount: Math.round((120_000 + rand(i + 77) * 900_000) / 1000) * 1000,
      status: i % 5 === 0 ? "settled" : "outstanding",
    });
  });
  return rows;
}

export const arApRecords: ArApRecord[] = buildArAp();

/* ---------------- derived helpers ---------------- */

export const monthIndexOf = (iso: string) => Number(iso.slice(5, 7)) - 1;

export interface MonthlySummary {
  month: string;
  revenue: number;
  expense: number;
  profit: number;
  cash: number;
}

export function monthlySummary(): MonthlySummary[] {
  let cash = 8_500_000;
  return MONTHS.map((month, m) => {
    const rows = transactions.filter((t) => monthIndexOf(t.date) === m);
    const revenue = rows.filter((r) => r.type === "income").reduce((s, r) => s + r.amount, 0);
    const expense = rows.filter((r) => r.type === "expense").reduce((s, r) => s + r.amount, 0);
    cash += revenue - expense;
    return { month: month.slice(0, 3), revenue, expense, profit: revenue - expense, cash };
  });
}

export function actualsByCategory() {
  const map = new Map<string, number>();
  transactions
    .filter((t) => t.type === "expense")
    .forEach((t) => map.set(t.category, (map.get(t.category) ?? 0) + t.amount));
  return map;
}

export function totals() {
  const revenue = transactions.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const expense = transactions
    .filter((t) => t.type === "expense")
    .reduce((s, t) => s + t.amount, 0);
  const cogs = actualsByCategory().get("COGS") ?? 0;
  const grossProfit = revenue - cogs;
  const opex = expense - cogs;
  const ebitda = grossProfit - opex;
  const depreciation = 1_150_000;
  const interest = 420_000;
  const tax = Math.max(0, (ebitda - depreciation - interest) * 0.25);
  const netProfit = ebitda - (depreciation + interest + tax);
  return { revenue, expense, cogs, grossProfit, opex, ebitda, depreciation, interest, tax, netProfit };
}

export function cashRunwayMonths() {
  const series = monthlySummary();
  const last3 = series.slice(-3);
  const burn = last3.reduce((s, m) => s + Math.max(0, m.expense - m.revenue), 0) / 3;
  const cash = series[series.length - 1]!.cash;
  return burn <= 0 ? Infinity : cash / burn;
}

export function agingBucket(dueISO: string) {
  const today = Date.UTC(2026, 11, 20);
  const days = Math.floor((today - Date.parse(dueISO)) / 86400000);
  if (days <= 30) return "0-30";
  if (days <= 60) return "31-60";
  if (days <= 90) return "61-90";
  return "90+";
}

export const AGING_BUCKETS = ["0-30", "31-60", "61-90", "90+"] as const;

export function forecast(revenueGrowth: number, opexAdj: number, newHires: number) {
  const series = monthlySummary();
  const lastRev = series[series.length - 1]!.revenue;
  const lastExp = series[series.length - 1]!.expense;
  const avgSalary = payroll.reduce((s, p) => s + grossPay(p), 0) / payroll.length;
  return Array.from({ length: 12 }, (_, i) => {
    const baseRev = lastRev * Math.pow(1.012, i + 1);
    const baseExp = lastExp * Math.pow(1.009, i + 1);
    const scenRev = lastRev * Math.pow(1 + (0.012 + revenueGrowth / 100 / 12), i + 1);
    const scenExp =
      lastExp * Math.pow(1 + (0.009 + opexAdj / 100 / 12), i + 1) + newHires * avgSalary * 1.2;
    return {
      month: MONTHS[i]!.slice(0, 3),
      baseline: Math.round(baseRev - baseExp),
      scenario: Math.round(scenRev - scenExp),
      scenarioRevenue: Math.round(scenRev),
      scenarioExpense: Math.round(scenExp),
    };
  });
}

export const inr = (v: number, compact = false) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: compact ? 1 : 0,
    notation: compact ? "compact" : "standard",
  }).format(v);

export const pct = (v: number, digits = 1) => `${v >= 0 ? "" : ""}${v.toFixed(digits)}%`;

export function toCSV(rows: Record<string, unknown>[]) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]!);
  const escape = (v: unknown) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => escape(r[h])).join(","))].join(
    "\n",
  );
}

export function downloadCSV(filename: string, rows: Record<string, unknown>[]) {
  const blob = new Blob([toCSV(rows)], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export const alerts = [
  {
    tone: "danger" as const,
    title: "Payroll over budget",
    body: "Payroll actuals exceeded the FY2026 target by 12.4% — review headcount plan.",
  },
  {
    tone: "warning" as const,
    title: "3 invoices overdue > 60 days",
    body: "₹34.2L receivable is sitting in the 61-90 and 90+ aging buckets.",
  },
  {
    tone: "success" as const,
    title: "Gross margin improved",
    body: "Gross margin is up 2.8 pts versus the previous quarter on stronger licensing mix.",
  },
  {
    tone: "warning" as const,
    title: "Marketing spend spike",
    body: "Q4 campaign spend ran 18% above the quarterly plan.",
  },
];

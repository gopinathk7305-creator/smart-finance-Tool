/**
 * Schema-driven balance sheet. Asset / liability / equity lines are matched
 * against whatever column names the active dataset actually carries; anything
 * the file does not provide falls back to figures already derived elsewhere
 * (cash from the monthly cash-balance series, receivables and payables from the
 * AR/AP ledger, retained earnings from revenue minus expenses).
 *
 * Total Assets is forced to equal Total Liabilities + Equity by treating
 * owner's equity as the balancing figure, which is how a trial balance closes.
 */
import { parseNum } from "@/lib/column-map";
import type { ArApRecord } from "@/lib/finance-data";

export interface BalanceLine {
  label: string;
  amount: number;
  /** where the number came from, shown in the UI */
  source: string;
}

export interface BalanceSheet {
  assets: BalanceLine[];
  liabilities: BalanceLine[];
  equity: BalanceLine[];
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  netIncome: number;
  cash: number;
  /** true when at least one line came from the dataset's own columns */
  fromColumns: boolean;
  balanced: boolean;
}

const canon = (k: string) => k.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");

/** Sum the first column whose canonical name matches one of the hints. */
function sumColumn(
  rows: Record<string, unknown>[],
  hints: string[],
): { total: number; column: string | null } {
  const sample = rows.find((r) => r && Object.keys(r).length);
  if (!sample) return { total: 0, column: null };
  const pairs = Object.keys(sample).map((key) => ({ key, c: canon(key) }));
  for (const hint of hints) {
    const hit = pairs.find((p) => p.c === hint) ?? pairs.find((p) => p.c.includes(hint));
    if (!hit) continue;
    let total = 0;
    for (const row of rows) total += parseNum(row[hit.key]);
    if (total !== 0) return { total, column: hit.key };
  }
  return { total: 0, column: null };
}

const HINTS = {
  cash: ["cash_and_cash_equivalents", "cash_equivalents", "cash_balance", "cash_in_hand", "cash"],
  bank: ["bank_balance", "bank_account", "bank_accounts", "bank"],
  receivable: ["accounts_receivable", "trade_receivable", "receivable", "debtors", "sundry_debtors"],
  inventory: ["inventory", "closing_stock", "stock_value", "stock"],
  fixedAssets: ["fixed_assets", "fixed_asset", "property_plant", "plant_and_machinery", "equipment_value"],
  payable: ["accounts_payable", "trade_payable", "payable", "creditors", "sundry_creditors"],
  shortDebt: ["short_term_debt", "short_term_loan", "overdraft", "working_capital_loan"],
  accrued: ["accrued_expenses", "accrued_expense", "accrued_liabilities", "outstanding_expenses", "provisions"],
  longLoans: ["long_term_loan", "long_term_debt", "term_loan", "secured_loan", "borrowings"],
  ownersEquity: ["owners_equity", "owner_equity", "share_capital", "capital_account", "paid_up_capital", "equity"],
} as const;

export interface BalanceSheetInput {
  /** raw rows of the active dataset */
  rows: Record<string, unknown>[];
  /** closing cash from the monthly cash-balance series */
  cashBalance: number;
  revenue: number;
  expense: number;
  araps: ArApRecord[];
}

export function deriveBalanceSheet({
  rows,
  cashBalance,
  revenue,
  expense,
  araps,
}: BalanceSheetInput): BalanceSheet {
  const outstanding = (type: "AR" | "AP") =>
    araps.filter((a) => a.type === type && a.status === "outstanding").reduce((s, a) => s + a.amount, 0);

  const col = (hints: readonly string[]) => sumColumn(rows, [...hints]);

  const cashCol = col(HINTS.cash);
  const bankCol = col(HINTS.bank);
  const arCol = col(HINTS.receivable);
  const invCol = col(HINTS.inventory);
  const faCol = col(HINTS.fixedAssets);
  const apCol = col(HINTS.payable);
  const sdCol = col(HINTS.shortDebt);
  const accCol = col(HINTS.accrued);
  const llCol = col(HINTS.longLoans);
  const oeCol = col(HINTS.ownersEquity);

  // Cash & cash equivalents stay tied to the cash-balance trend unless the file
  // states a cash figure of its own, so both views always move together.
  const cash = cashCol.total || cashBalance;
  const receivable = arCol.total || outstanding("AR");
  const payable = apCol.total || outstanding("AP");
  const netIncome = revenue - expense;

  const assets: BalanceLine[] = [
    { label: "Cash & Cash Equivalents", amount: cash, source: cashCol.column ?? "cash balance trend" },
    { label: "Bank Accounts", amount: bankCol.total, source: bankCol.column ?? "not in dataset" },
    { label: "Accounts Receivable", amount: receivable, source: arCol.column ?? "AR ledger (outstanding)" },
    { label: "Inventory", amount: invCol.total, source: invCol.column ?? "not in dataset" },
    { label: "Fixed Assets", amount: faCol.total, source: faCol.column ?? "not in dataset" },
  ];

  const liabilities: BalanceLine[] = [
    { label: "Accounts Payable", amount: payable, source: apCol.column ?? "AP ledger (outstanding)" },
    { label: "Short-Term Debt", amount: sdCol.total, source: sdCol.column ?? "not in dataset" },
    { label: "Accrued Expenses", amount: accCol.total, source: accCol.column ?? "not in dataset" },
    { label: "Long-Term Loans", amount: llCol.total, source: llCol.column ?? "not in dataset" },
  ];

  const totalAssets = assets.reduce((s, l) => s + l.amount, 0);
  const totalLiabilities = liabilities.reduce((s, l) => s + l.amount, 0);

  // Owner's equity balances the sheet: Assets = Liabilities + Equity.
  const retained = netIncome;
  const ownersEquity = totalAssets - totalLiabilities - retained;

  const equity: BalanceLine[] = [
    {
      label: "Owner's Equity",
      amount: ownersEquity,
      source: oeCol.column ? `${oeCol.column} (balanced)` : "balancing figure",
    },
    { label: "Retained Earnings", amount: retained, source: "revenue − expenses" },
  ];
  const totalEquity = equity.reduce((s, l) => s + l.amount, 0);

  const fromColumns = [cashCol, bankCol, arCol, invCol, faCol, apCol, sdCol, accCol, llCol, oeCol].some(
    (c) => c.column !== null,
  );

  return {
    assets,
    liabilities,
    equity,
    totalAssets,
    totalLiabilities,
    totalEquity,
    netIncome,
    cash,
    fromColumns,
    balanced: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 1,
  };
}

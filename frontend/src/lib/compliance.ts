// Statutory filing calendar for an Indian private limited company, FY April to March.

export type FilingStatus = "filed" | "overdue" | "pending" | "upcoming";

export const FILING_STATUS_LABEL: Record<FilingStatus, string> = {
  filed: "Filed",
  overdue: "Overdue",
  pending: "Pending",
  upcoming: "Upcoming",
};

export interface FilingRow {
  /** stable key: <form>-<period>, used to match a saved filing */
  key: string;
  form: string;
  description: string;
  period: string;
  dueDate: string;
  amount: number;
  basis: string;
}

export interface FiledRecord {
  id: string;
  filing_key: string;
  period: string;
  ack_number: string;
  filed_date: string | null;
  amount: number;
}

export interface ComplianceInputs {
  /** FY start year, e.g. 2026 for FY 2026-27 */
  startYear: number;
  /** GST charged on sales for each of the twelve FY months */
  gstOutput: number[];
  /** input tax credit available for each FY month */
  inputCredit: number[];
  /** TDS deducted (payroll + vendor) for each FY month */
  tds: number[];
  /** employer PF + ESI challan for each FY month */
  pfEsi: number[];
  /** estimated corporate tax for the full year, incl. surcharge and cess */
  annualTax: number;
}

export const FY_SEQUENCE = [
  { label: "Apr", monthIndex: 3 },
  { label: "May", monthIndex: 4 },
  { label: "Jun", monthIndex: 5 },
  { label: "Jul", monthIndex: 6 },
  { label: "Aug", monthIndex: 7 },
  { label: "Sep", monthIndex: 8 },
  { label: "Oct", monthIndex: 9 },
  { label: "Nov", monthIndex: 10 },
  { label: "Dec", monthIndex: 11 },
  { label: "Jan", monthIndex: 0 },
  { label: "Feb", monthIndex: 1 },
  { label: "Mar", monthIndex: 2 },
] as const;

const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** Advance corporate tax instalments: cumulative 15%, 45%, 75%, 100%. */
export const ADVANCE_TAX_SCHEDULE = [
  { label: "Q1", cumulative: 0.15, month: 5, day: 15, sameYear: true },
  { label: "Q2", cumulative: 0.45, month: 8, day: 15, sameYear: true },
  { label: "Q3", cumulative: 0.75, month: 11, day: 15, sameYear: true },
  { label: "Q4", cumulative: 1, month: 2, day: 15, sameYear: false },
] as const;

/** Build the full FY filing calendar with amounts derived from the entity's data. */
export function buildFilings(input: ComplianceInputs): FilingRow[] {
  const rows: FilingRow[] = [];
  const { startYear } = input;

  FY_SEQUENCE.forEach((m, i) => {
    const periodYear = m.monthIndex >= 3 ? startYear : startYear + 1;
    const period = `${m.label} ${periodYear}`;
    // Returns for a month are filed in the following month.
    const nextMonth = (m.monthIndex + 1) % 12;
    const nextYear = m.monthIndex === 11 ? periodYear + 1 : periodYear;

    const output = input.gstOutput[i] ?? 0;
    const credit = input.inputCredit[i] ?? 0;

    rows.push({
      key: `GSTR-1-${period}`,
      form: "GSTR-1",
      description: "Outward supply return",
      period,
      dueDate: iso(nextYear, nextMonth, 11),
      amount: output,
      basis: "Output GST on sales for the month",
    });
    rows.push({
      key: `GSTR-3B-${period}`,
      form: "GSTR-3B",
      description: "Summary return & GST payment",
      period,
      dueDate: iso(nextYear, nextMonth, 20),
      amount: Math.max(0, output - credit),
      basis: "Output GST net of input tax credit",
    });
    rows.push({
      key: `TDS-${period}`,
      form: "TDS (26Q/24Q)",
      description: "TDS deposit challan",
      period,
      dueDate: iso(nextYear, nextMonth, 7),
      amount: input.tds[i] ?? 0,
      basis: "TDS deducted on salaries and vendor payments",
    });
    rows.push({
      key: `PF-ESI-${period}`,
      form: "PF & ESI",
      description: "Provident fund and ESI challan",
      period,
      dueDate: iso(nextYear, nextMonth, 15),
      amount: input.pfEsi[i] ?? 0,
      basis: "Employer PF 12% and ESI 3.25% on payroll",
    });
  });

  let paid = 0;
  ADVANCE_TAX_SCHEDULE.forEach((q) => {
    const due = input.annualTax * q.cumulative - paid;
    paid += due;
    const year = q.sameYear ? startYear : startYear + 1;
    rows.push({
      key: `ADV-TAX-${q.label}`,
      form: `Advance tax ${q.label}`,
      description: `Instalment — ${Math.round(q.cumulative * 100)}% of estimated liability`,
      period: `${q.label} FY ${startYear}-${String(startYear + 1).slice(2)}`,
      dueDate: iso(year, q.month, q.day),
      amount: Math.max(0, due),
      basis: "Estimated corporate tax incl. surcharge and cess",
    });
  });

  return rows.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

export function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
}

/** Filed if recorded; otherwise overdue past due, pending within 15 days, else upcoming. */
export function statusOf(row: FilingRow, filed: Map<string, FiledRecord>, today: string): FilingStatus {
  if (filed.has(row.key)) return "filed";
  const days = daysBetween(today, row.dueDate);
  if (days < 0) return "overdue";
  if (days <= 15) return "pending";
  return "upcoming";
}

export interface LateCharge {
  days: number;
  lateFee: number;
  interest: number;
  total: number;
  note: string;
}

/** Indicative late fee / interest for an overdue filing. */
export function lateCharge(row: FilingRow, today: string): LateCharge {
  const days = Math.max(0, -daysBetween(today, row.dueDate));
  if (!days) return { days: 0, lateFee: 0, interest: 0, total: 0, note: "Within due date" };

  const months = Math.max(1, Math.ceil(days / 30));

  if (row.form.startsWith("GSTR")) {
    const lateFee = Math.min(5000, days * 50);
    const interest = row.amount * 0.18 * (days / 365);
    return {
      days,
      lateFee,
      interest,
      total: lateFee + interest,
      note: "Rs 50 per day (capped at Rs 5,000) plus 18% p.a. interest on tax due",
    };
  }

  if (row.form.startsWith("TDS")) {
    const interest = row.amount * 0.015 * months;
    return { days, lateFee: 0, interest, total: interest, note: "1.5% per month on late deposit" };
  }

  if (row.form.startsWith("PF")) {
    const interest = row.amount * 0.12 * (days / 365);
    const lateFee = row.amount * 0.05 * (days / 365);
    return {
      days,
      lateFee,
      interest,
      total: lateFee + interest,
      note: "12% p.a. interest plus damages on delayed remittance",
    };
  }

  const interest = row.amount * 0.01 * months;
  return { days, lateFee: 0, interest, total: interest, note: "1% per month under section 234B/234C" };
}

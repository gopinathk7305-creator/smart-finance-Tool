// Shared data-cleaning helpers: key normalisation, tolerant date parsing and
// default value filling used by the importer, the dataset viewer and auto-fix.

/** lowercase + underscore key normalisation so header variants always match. */
export function normaliseKey(key: string): string {
  return String(key)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export const isBlank = (v: unknown) =>
  v === null || v === undefined || (typeof v === "string" && v.trim() === "");

export const DATE_KEY_RE = /(date|_at|period|month|year|dob|due|from|to)/i;

const MONTHS = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];

const valid = (y: number, m: number, d: number) => {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? dt : null;
};

/**
 * Parses YYYY-MM-DD, DD/MM/YYYY, MM/DD/YYYY, DD-MMM-YYYY, Excel serial numbers
 * and anything Date can read. Returns null only when nothing works.
 */
export function parseAnyDate(input: unknown): Date | null {
  if (input instanceof Date) return Number.isNaN(input.getTime()) ? null : input;
  if (typeof input === "number" && Number.isFinite(input)) return fromSerial(input);

  const raw = String(input ?? "").trim();
  if (!raw) return null;

  // Excel serial timestamp (days since 1899-12-30), e.g. 45291 or 45291.5
  if (/^\d{4,6}(\.\d+)?$/.test(raw)) {
    const n = Number(raw);
    if (n > 20000 && n < 80000) return fromSerial(n);
  }
  // Unix epoch (seconds or milliseconds)
  if (/^\d{10}$/.test(raw)) return new Date(Number(raw) * 1000);
  if (/^\d{13}$/.test(raw)) return new Date(Number(raw));

  // ISO / YYYY-MM-DD (optionally with time)
  const iso = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (iso) {
    const dt = valid(Number(iso[1]), Number(iso[2]), Number(iso[3]));
    if (dt) return dt;
  }

  // D/M/Y or M/D/Y — prefer day-first (Indian convention), fall back to month-first
  const dmy = raw.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (dmy) {
    const a = Number(dmy[1]);
    const b = Number(dmy[2]);
    let y = Number(dmy[3]);
    if (y < 100) y += y < 70 ? 2000 : 1900;
    return valid(y, b, a) ?? valid(y, a, b);
  }

  // 12-Mar-2025 / Mar 12, 2025 / March 2025
  const textual = raw.toLowerCase();
  const mi = MONTHS.findIndex((m) => textual.includes(m));
  if (mi >= 0) {
    const nums = textual.match(/\d+/g) ?? [];
    const year = nums.find((n) => n.length === 4);
    const day = nums.find((n) => n.length <= 2);
    if (year) return valid(Number(year), mi + 1, day ? Number(day) : 1);
  }

  // 2025-03 / 2025/03 month periods
  const period = raw.match(/^(\d{4})[-/](\d{1,2})$/);
  if (period) return valid(Number(period[1]), Number(period[2]), 1);

  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? null : new Date(parsed);
}

function fromSerial(serial: number): Date | null {
  if (serial > 1e11) return new Date(serial); // epoch milliseconds
  if (serial > 1e9) return new Date(serial * 1000); // epoch seconds
  if (serial <= 0 || serial > 80000) return null;
  const ms = Math.round((serial - 25569) * 86400 * 1000);
  const dt = new Date(ms);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

/** Tolerant parse to an ISO calendar date (YYYY-MM-DD), or null. */
export function toISODateSafe(input: unknown): string | null {
  const dt = parseAnyDate(input);
  return dt ? dt.toISOString().slice(0, 10) : null;
}

/* ------------------------------------------------ default filling */

const CURRENCY_RE = /(currency|curr_code|ccy)/i;
const RATE_RE = /(tax_rate|gst_rate|vat_rate|rate_pct|tax_percent)/i;
const GST_RATE_RE = /(gst|vat)/i;
const PEOPLE_RE = /(vendor|client|party|customer|supplier|created_by|updated_by|owner|user_name|approver)/i;
const NOTE_RE = /(note|notes|remark|remarks|description|comment)/i;

export const DEFAULTS = {
  currency: "INR",
  person: "System / Unassigned",
  note: "—",
};

/**
 * Fills a single cell with a sensible default for its column type.
 * Returns undefined when there is no default for this column.
 */
export function defaultFor(column: string, numeric: boolean): unknown {
  if (CURRENCY_RE.test(column)) return DEFAULTS.currency;
  if (RATE_RE.test(column)) return GST_RATE_RE.test(column) ? 18 : 0;
  if (PEOPLE_RE.test(column)) return DEFAULTS.person;
  if (NOTE_RE.test(column)) return "";
  if (numeric) return 0;
  return undefined;
}

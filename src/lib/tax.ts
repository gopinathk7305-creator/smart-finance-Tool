// Indian corporate tax computation used by P&L, forecasting and the filings tracker.

export type CorporateRate = 0.25 | 0.22;
export type SurchargeBand = "auto" | "none" | "7" | "12";

export const CRORE = 10_000_000;

export interface CorporateTaxBreakdown {
  ebt: number;
  rate: number;
  base: number;
  surchargePct: number;
  surcharge: number;
  cess: number;
  total: number;
  effectiveRate: number;
  netProfit: number;
}

/**
 * Base corporate tax with surcharge and 4% health & education cess.
 *
 * @param rate 0.25 standard domestic rate, or 0.22 under section 115BAA.
 * @param band "auto" applies 7% above Rs 1 Cr and 12% above Rs 10 Cr of taxable profit.
 */
export function corporateTax(
  ebt: number,
  rate: CorporateRate = 0.25,
  band: SurchargeBand = "auto",
): CorporateTaxBreakdown {
  const taxable = Math.max(0, ebt);
  const surchargePct =
    band === "none"
      ? 0
      : band === "7"
        ? 7
        : band === "12"
          ? 12
          : taxable > 10 * CRORE
            ? 12
            : taxable > CRORE
              ? 7
              : 0;

  const base = taxable * rate;
  const surcharge = base * (surchargePct / 100);
  const cess = (base + surcharge) * 0.04;
  const total = base + surcharge + cess;

  return {
    ebt,
    rate,
    base,
    surchargePct,
    surcharge,
    cess,
    total,
    effectiveRate: taxable ? (total / taxable) * 100 : 0,
    netProfit: ebt - total,
  };
}

export const RATE_LABEL: Record<string, string> = {
  "0.25": "25% standard domestic rate",
  "0.22": "22% concessional rate (Sec 115BAA)",
};

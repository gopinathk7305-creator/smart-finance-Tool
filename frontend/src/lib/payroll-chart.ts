/** Pixel floors affect geometry only: financial amounts stay unchanged. */
export function payrollStackHeights(basic: number, allowances: number, deductions: number, pixelsPerRupee: number) {
  return {
    basic: Math.max(0, basic) * pixelsPerRupee,
    allowances: allowances > 0 ? Math.max(12, allowances * pixelsPerRupee) : 0,
    deductions: deductions > 0 ? Math.max(12, deductions * pixelsPerRupee) : 0,
  };
}
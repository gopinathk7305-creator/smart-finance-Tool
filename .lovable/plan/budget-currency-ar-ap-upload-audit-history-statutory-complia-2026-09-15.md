# Budget, currency, AR/AP upload, audit history + Statutory Compliance module

Five requested features plus the pasted compliance & tax specification, built on your live data and scoped to the selected organization/vendor.

## 1. Real Budget page
- Replace the demo-only Budget page with an entry form: fiscal year, category (from your Expense Categories), department, planned amount. Rows save to your account and are org-scoped.
- Budget vs Actual table and chart read your saved plan against real ledger spend, with variance amount and %.
- New section: **Budget vs Forecast** — planned annual spend per category next to the 12-month forecast projection, with the gap highlighted.

## 2. Forecasting reads the budget
- Forecast page loads your saved budget totals and shows a "Plan vs Forecast" band on the chart plus a gap KPI.
- The AI "Why it changed" explanation receives budget, actual and forecast figures, so it names where you are over or under plan instead of describing the curve only.

## 3. Multi-currency
- Currency selector (INR, USD, EUR, GBP, AED) with an editable rate per currency, saved per organization.
- Forecasting revenue inputs accept the chosen currency and convert to INR for all downstream maths; every report and PDF shows INR with a "converted at 1 USD = ₹xx.xx" note.

## 4. AR/AP ledger upload
- Upload page gains an AR/AP file type: party name, type (AR/AP), invoice date, due date, amount, status.
- Saved rows fill the Cash Flow aging buckets (Current / 1-30 / 31-60 / 61-90 / 90+) automatically, plus the AR/AP report and its PDF.

## 5. Persistent audit history
- Audit findings save to your account with the organization attached, so flagged rows survive later uploads and page reloads.
- Audit page shows the full history with filters, duplicate scans do not create duplicate findings, and each row can be marked Open / Reviewed / Closed.

## 6. New module: Statutory Compliance & Filings Tracker
New page in the sidebar, filtered by the active organization.

- Monthly timeline of statutory deadlines with badges: Upcoming, Pending, Filed, Overdue (red).
- Pre-configured rules with amounts derived from your data:
  - GSTR-1 — 11th monthly, linked to monthly GST output.
  - GSTR-3B — 20th monthly, liability net of input credit.
  - TDS deposit (26Q/24Q) — 7th of following month, from payroll and vendor TDS.
  - PF & ESI challan — 15th monthly, from payroll.
  - Advance corporate tax — 15 Jun 15%, 15 Sep 45%, 15 Dec 75%, 15 Mar 100% of estimated annual tax.
- "Mark as Filed" dialog capturing acknowledgment number and filing date.
- Late-fee / interest estimator widget for overdue items.

## 7. Refined P&L and corporate tax engine
- P&L waterfall: Gross Revenue (excl. GST) → COGS → Gross Profit → Operating Expenses → EBITDA → Depreciation & Amortisation → EBIT (taxable profit).
- Tax breakdown card: base rate 25% with a 22% toggle (Sec 115BAA), surcharge 7% above ₹1 Cr or 12% above ₹10 Cr (toggle), 4% health & education cess, effective tax payable with effective rate %, then Net Profit After Tax.
- Formal PDF export gains a Compliance Status section and the full step-by-step tax breakdown.

## Technical notes
- Database: new `compliance_filings` and `fx_rates` tables (RLS own-rows, org-scoped, GRANTs); `org_id` and `status` added to `audit_findings`; depreciation stored as a per-org setting.
- New modules `src/lib/compliance.ts`, `src/lib/fx.tsx`, `src/lib/budget.tsx`; `forecast-engine.ts` gains budget + currency inputs; `report-doc.ts` gains compliance and tax-breakdown sections.
- Verified end to end with a real signed-in account on TechNova Solutions, including generated PDFs.

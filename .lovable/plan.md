# Upgrade Report Generator card downloads

## What will change
- Replace each report card's single download link with a polished two-action row: **Quick CSV** and **PDF Document**.
- Add spreadsheet/document icons, clear focus states, and Indigo/Sky hover treatment using the existing design system.
- Make the report builder use the currently selected organization and vendor dataset instead of global demo constants.

## Formal PDF behavior
- Clicking **PDF Document** will immediately show a report-specific loading toast, prepare AI commentary for signed-in users (or data-derived commentary in demo mode), generate the formal PDF, and confirm completion.
- Reuse the existing letterhead, GSTIN/address, reference ID, IST date, safe INR rendering, structured tables, sign-off, confidentiality footer, and multi-page pagination.
- Tailor the five documents:
  - Profit & Loss: full income statement and operating variance commentary.
  - Executive Summary: management overview, liquidity/cash movement, and revenue-versus-expense table.
  - Payroll Tax: employee and department statutory register with PF, ESI, TDS, cess, and compliance note.
  - Audit Log: exception/risk register with recommended actions and approval status.
  - AR/AP Aging: current through 90+ day buckets with overdue cash-flow risk commentary.

## Validation
- Verify all five cards render both actions.
- Download and visually inspect every generated PDF page for clipping, overlap, currency glyph issues, page order, and selected-entity context.
- Confirm CSV downloads still work and app errors remain clear.

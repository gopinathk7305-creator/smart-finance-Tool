# Unify Finance IQ modules around the active CFO workspace

## Goal
Make every requested finance page use the active uploaded workbook and present the same professional, data-dense CFO interface.

## What will change
- Strengthen the shared dataset adapter so transaction, payroll, budget, AR/AP, balance-sheet, forecast, and report views all derive from the active file and selected date range without silently reverting to unrelated demo figures.
- Add a shared active-workspace context strip and consistent loading/empty states so each page clearly reflects the selected file.
- Build Budget vs Actual as a Jan–Dec category matrix with budget, spend, rupee variance, percentage variance, and status for Team Lunch, Travel, Festival, Logistics, plus discovered workbook categories.
- Refine Payroll into a CFO allocation and statutory-deduction view using derived employee or cost-center data from the active sheet.
- Add a true P&L bridge/waterfall and enhance Cash Flow with active-data operating, investing, financing, monthly outflow, and burn-rate views instead of fixed assumptions.
- Keep Balance Sheet and Forecasting tied to the same active rows and visibly aligned with the selected workspace.
- Add one-click Financial Summary exports in both formal PDF and Excel workbook formats, populated from the active financial metrics.
- Apply shared slate surfaces, compact tables, monospace/tabular financial values, semantic chart colors, and standardized status badges throughout the requested sidebar modules.

## Technical details
- Reuse `useDataset`, `useDatasetRaw`, `useActiveDataset`, and `useWorkspace` as the single data pipeline; extend derivation utilities rather than adding page-local demo constants.
- Generate the Excel export client-side from the already installed SheetJS package; retain the existing formal PDF generator and AI narrative fallback.
- Use semantic tokens from the global theme for every page and chart, with reusable finance presentation helpers where repetition exists.
- Preserve module-specific controls, statutory calculations, and current upload behavior.

## Validation
- Check the requested pages with the active FMG workbook selected and confirm their visible figures, labels, and source context update together.
- Verify Jan–Dec budget variance math, cash-flow/burn calculations, and report export contents.
- Download and open both PDF and Excel summary files.
- Check desktop and mobile layouts, runtime errors, and the final build signal.
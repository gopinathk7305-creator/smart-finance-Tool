# Fix Dashboard KPI Rendering

## Goal
Make the KPI cards use the same detected financial records as the working charts, so valid datasets always produce an accurate card count and visible metrics.

## Changes
- Normalize flexible revenue, amount, credit, expense, debit, COGS, cost, and payout headers through the existing transaction mapper.
- Calculate revenue, expenses, and margin from those normalized transactions instead of relying only on narrowly classified raw columns.
- Generate five core cards for transactional datasets: revenue, expenses, safe net margin, active records, and risk/audit flags.
- Count both explicit risk flags and duplicate transaction signatures.
- Preserve contextual spend/payroll metrics when a dataset genuinely has no revenue.
- Add semantic icons, tones, and available trend indicators to generated cards.
- Use a responsive four-column desktop grid, with the fifth card flowing cleanly to the next row.
- Keep the banner count tied directly to the rendered card array.

## Validation
- Run the project type check and confirm the dashboard responds successfully.
- Verify the dashboard renders a non-zero active metric count with cards above the chart.

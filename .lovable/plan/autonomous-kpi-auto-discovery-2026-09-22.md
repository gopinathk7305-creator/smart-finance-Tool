# Autonomous KPI Auto-Discovery

## Goal
Replace the Executive Dashboard’s fixed KPI row with up to five useful metrics discovered from the active dataset, never rendering unsupported, blank, non-finite, or zero-value cards.

## Changes
- Extend the schema discovery engine to inspect the active file’s real headers and rank valid KPI candidates.
- Detect spend, revenue, dates, categories/departments, vendors/clients/merchants, payment status, and tax/GST fields using normalized header matching.
- Generate only backed metrics: spend, average transaction value, top spend group, active date range, monthly burn rate, vendor count, pending/unpaid count and value, tax total, revenue, gross profit, and net margin.
- Exclude candidates whose numeric backing is zero/non-finite or whose text/range value is missing, then select the five highest-priority metrics.
- Use robust date parsing and chunk-friendly aggregation so large active datasets remain stable.
- Make the KPI grid choose responsive column counts from the actual number of cards, avoiding blank slots.
- Show “Auto-Adapted Layout: Showing N active metrics based on uploaded schema.” above the generated cards.
- Keep the existing schema-adapted charts and hide any chart without valid data.

## Validation
- Run the project type check.
- Open the Executive Dashboard and verify the metric count banner, non-empty cards, and responsive layout.

# Non-blocking upload rewrite

## Outcome
CSV and Excel uploads will no longer depend on a Web Worker or hold the page at 2%. Parsing, cleaning, and saving will yield to the browser every 1,000 rows, with visible progress after each block.

## Changes
- Replace the current worker parser with a local chunk reader:
  - CSV files: read byte slices with `FileReader`, preserve partial lines between slices, parse completed blocks, normalize headers, and yield between blocks.
  - Excel files: read once with XLSX, then map worksheet rows in 1,000-row blocks with a browser yield between blocks.
- Change cleaning to process 1,000-row blocks, merge the resulting rows/issues, and update progress only between blocks so charts and other heavy calculations stay paused.
- Save 1,000-row bulk payloads with bounded concurrency and explicit timeout/error handling.
- Add an immediate local dataset fallback when any cloud batch takes over five seconds or fails, then refresh the shared dataset state once so all finance pages can use the uploaded rows without waiting.
- Save dataset metadata after successful cloud completion; mark fallback uploads clearly when cloud sync continues unsuccessfully.
- Open the detected-dataset dialog after local processing and open executive insights after the sync/fallback result.

## Technical notes
- Existing typed finance tables remain the source for cloud-backed Dashboard, P&L, Payroll, Budget, Cash Flow, and Forecasting data. A generic `financial_records` upsert cannot replace those tables safely because it is not present in the current schema and those pages do not read it.
- The local fallback will use the same normalized typed records, scoped to the signed-in user and selected organization, and will be exposed through the existing shared dataset hook.
- No inline parsing functions will be sent to workers because the worker path will be removed entirely.

## Verification
- Run the project typecheck.
- Upload a CSV with more than 2,000 rows and confirm progress advances past 2%, the page remains responsive, the review dialog appears, and no worker-cloning errors occur.
- Simulate a slow cloud request and confirm the local fallback populates the shared views within five seconds without blocking the upload screen.

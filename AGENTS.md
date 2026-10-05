<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Keep every finance module on the shared active-dataset and workspace pipeline; never add page-local demo financial figures because cross-page totals must reconcile.
- Generate downloadable workbooks in the browser with SheetJS from the same report specification used for PDF exports so both formats reconcile.
- Render permanent, theme-aware data labels on full-sized financial chart series while preserving hover tooltips; KPI mini sparklines stay text-free to prevent overflow.
- Use shared crisp, theme-aware SVG chart typography and collision-spaced leader-line callouts alongside legends for compact donuts so slice values remain visible without overlap.
- Keep forecasting comparisons on the shared forecast rows; label only milestones in the line view and retain month-by-month details in the hover tooltip to prevent chart clutter.
- Dataset derivation is shared across all useDataset/useDatasetPeek callers via one module-level cache; heavy per-page aggregations over 2,000+ rows run in setTimeout-chunked slices so the main thread never stalls.
- Use the shared Command Center metric helpers for operating-spend classification and runway; reuse workspace closing cash rather than introducing a separate opening balance, and scale budget/actual axes independently.

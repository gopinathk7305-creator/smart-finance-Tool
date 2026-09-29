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

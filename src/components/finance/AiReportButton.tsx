import { ChevronDown, Download, FileText, Image as ImageIcon, Loader2, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/lib/auth";
import { ALL, useOrg } from "@/lib/orgs";
import { generateReportNarrative } from "@/lib/report-ai.functions";
import {
  fallbackNarrative,
  generateReportPdf,
  generateSnapshotPdf,
  type ReportNarrative,
  type ReportSpec,
} from "@/lib/report-doc";

export type ReportSpecInput = Omit<ReportSpec, "org" | "vendor">;

interface Props {
  /** built lazily so the PDF always uses the latest on-screen numbers */
  build: () => ReportSpecInput;
  label?: string;
  variant?: "default" | "outline" | "secondary" | "ghost";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
}

/** the live page container captured for the visual snapshot */
function captureTarget(): HTMLElement | null {
  return (
    document.querySelector<HTMLElement>("[data-page-capture]") ??
    document.querySelector<HTMLElement>("main")
  );
}

export function AiReportButton({
  build,
  label = "Export Options",
  variant = "outline",
  size = "sm",
  className,
}: Props) {
  const { session } = useAuth();
  const { orgName, vendor } = useOrg();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [snapping, setSnapping] = useState(false);
  const [spec, setSpec] = useState<ReportSpec | null>(null);
  const [narrative, setNarrative] = useState<ReportNarrative | null>(null);

  const fullSpec = (): ReportSpec => ({
    ...build(),
    org: orgName === "All organizations" ? "All Entities (Consolidated)" : orgName,
    ...(vendor && vendor !== ALL ? { vendor } : {}),
  });

  const snapshot = async () => {
    const el = captureTarget();
    if (!el) {
      toast.error("Nothing on screen to capture yet.");
      return;
    }
    setSnapping(true);
    const id = toast.loading("Capturing high-resolution dashboard snapshot…");
    try {
      await generateSnapshotPdf(fullSpec(), el);
      toast.success("Visual dashboard snapshot downloaded", { id });
    } catch {
      toast.error("Snapshot export failed", { id });
    } finally {
      setSnapping(false);
    }
  };

  const analyse = async () => {
    const full = fullSpec();
    setSpec(full);
    setNarrative(null);
    setOpen(true);
    setBusy(true);
    try {
      if (!session) {
        setNarrative(fallbackNarrative(full));
        toast.info("Sign in for the AI-written summary — using data-derived commentary.");
      } else {
        const res = await generateReportNarrative({
          data: {
            page: full.page,
            reportName: full.reportName,
            org: full.org,
            ...(full.vendor ? { vendor: full.vendor } : {}),
            fy: full.fy,
            kpis: full.kpis,
            facts: full.facts,
          },
        });
        setNarrative(res.summary ? res : fallbackNarrative(full));
      }
    } catch (err) {
      setNarrative(fallbackNarrative(full));
      toast.error(err instanceof Error ? err.message : "AI analysis failed — using page data.");
    } finally {
      setBusy(false);
    }
  };

  const download = async () => {
    if (!spec || !narrative) return;
    setDownloading(true);
    const id = toast.loading("Generating Formal AI Executive Report…");
    try {
      await generateReportPdf(spec, narrative);
      toast.success(`${spec.reportName} document downloaded`, { id });
      setOpen(false);
    } catch {
      toast.error("PDF generation failed", { id });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant={variant} size={size} className={className} disabled={snapping}>
            {snapping ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Download className="size-4" />
            )}
            {label}
            <ChevronDown className="size-3.5 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-80">
          <DropdownMenuLabel>PDF export options</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="flex-col items-start gap-0.5 py-2.5"
            onSelect={() => void snapshot()}
          >
            <span className="flex items-center gap-2 text-sm font-medium">
              <ImageIcon className="size-4 text-brand" /> Visual Dashboard Snapshot
            </span>
            <span className="pl-6 text-xs text-muted-foreground">
              High-resolution capture of this page, charts and KPI cards included.
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem
            className="flex-col items-start gap-0.5 py-2.5"
            onSelect={() => void analyse()}
          >
            <span className="flex items-center gap-2 text-sm font-medium">
              <FileText className="size-4 text-brand" /> Formal Executive Document
            </span>
            <span className="pl-6 text-xs text-muted-foreground">
              AI-written narrative, structured tables, sign-off block, letterhead.
            </span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Formal Executive Document</DialogTitle>
            <DialogDescription>
              {spec ? `${spec.reportName} · ${spec.org} · ${spec.fy}` : ""}
            </DialogDescription>
          </DialogHeader>

          {busy && (
            <div className="flex items-center gap-3 rounded-xl border border-border bg-secondary/60 p-4 text-sm">
              <Loader2 className="size-4 animate-spin text-brand" />
              Generating Formal AI Executive Report…
            </div>
          )}

          {!busy && narrative && (
            <div className="space-y-4">
              <div className="space-y-3 text-sm leading-relaxed">
                {narrative.summary.split(/\n\n+/).map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>

              {narrative.takeaways.length > 0 && (
                <div className="rounded-xl border-l-4 border-brand bg-brand-soft p-4">
                  <p className="mb-2 flex items-center gap-2 text-xs font-bold tracking-wide text-brand uppercase">
                    <Sparkles className="size-3.5" /> Executive takeaways
                  </p>
                  <ul className="list-disc space-y-1 pl-5 text-sm">
                    {narrative.takeaways.map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ul>
                </div>
              )}

              {spec && (
                <p className="text-xs text-muted-foreground">
                  Document includes {spec.tables.length} structured data table
                  {spec.tables.length === 1 ? "" : "s"}, corporate letterhead, page numbers,
                  confidentiality notice and a Finance Head sign-off block. KPI boxes and charts are
                  intentionally excluded — use the visual snapshot export for those.
                </p>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void download()} disabled={busy || downloading || !narrative}>
              {downloading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Download className="size-4" />
              )}
              Download Document
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

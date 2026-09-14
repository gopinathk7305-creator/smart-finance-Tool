import { FileText, Loader2, Download, Sparkles } from "lucide-react";
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
import { useAuth } from "@/lib/auth";
import { ALL, useOrg } from "@/lib/orgs";
import { generateReportNarrative } from "@/lib/report-ai.functions";
import {
  fallbackNarrative,
  generateReportPdf,
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

export function AiReportButton({
  build,
  label = "Download AI Report",
  variant = "outline",
  size = "sm",
  className,
}: Props) {
  const { session } = useAuth();
  const { orgName, vendor } = useOrg();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [spec, setSpec] = useState<ReportSpec | null>(null);
  const [narrative, setNarrative] = useState<ReportNarrative | null>(null);

  const analyse = async () => {
    const full: ReportSpec = {
      ...build(),
      org: orgName === "All organizations" ? "All Entities (Consolidated)" : orgName,
      ...(vendor && vendor !== ALL ? { vendor } : {}),
    };
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
    try {
      await generateReportPdf(spec, narrative);
      toast.success(`${spec.reportName} PDF downloaded`);
      setOpen(false);
    } catch {
      toast.error("PDF generation failed");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <>
      <Button variant={variant} size={size} className={className} onClick={() => void analyse()}>
        <FileText className="size-4" /> {label}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Report Preview</DialogTitle>
            <DialogDescription>
              {spec ? `${spec.reportName} · ${spec.org} · ${spec.fy}` : ""}
            </DialogDescription>
          </DialogHeader>

          {busy && (
            <div className="flex items-center gap-3 rounded-lg border border-border bg-secondary/50 p-4 text-sm">
              <Loader2 className="size-4 animate-spin text-brand" />
              AI is analyzing data and generating document…
            </div>
          )}

          {!busy && narrative && (
            <div className="space-y-4">
              <div className="space-y-2 text-sm leading-relaxed">
                {narrative.summary.split(/\n\n+/).map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>

              {narrative.takeaways.length > 0 && (
                <div className="rounded-lg border border-brand/40 bg-brand-soft p-4">
                  <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-brand">
                    <Sparkles className="size-3.5" /> Key takeaways
                  </p>
                  <ul className="list-disc space-y-1 pl-5 text-sm">
                    {narrative.takeaways.map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ul>
                </div>
              )}

              {spec && spec.kpis.length > 0 && (
                <div className="grid gap-2 sm:grid-cols-2">
                  {spec.kpis.map((k) => (
                    <div key={k.label} className="rounded-md border border-border px-3 py-2">
                      <p className="text-xs text-muted-foreground">{k.label}</p>
                      <p className="tabular text-sm font-semibold">
                        {k.value}
                        {k.delta ? <span className="ml-2 text-xs text-brand">{k.delta}</span> : null}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {spec && (
                <p className="text-xs text-muted-foreground">
                  Document includes {spec.tables.length} data table
                  {spec.tables.length === 1 ? "" : "s"}
                  {spec.chartEl ? " and page charts" : ""}, with page numbers, confidentiality notice
                  and sign-off block.
                </p>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void download()} disabled={busy || downloading || !narrative}>
              {downloading ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
              Download PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

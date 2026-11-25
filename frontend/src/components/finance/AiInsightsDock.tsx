// Floating "AI Insights" button + the automated AI Executive Dataset Insights modal.
// Rendered once inside AppShell so it is available on every page.

import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { AlertTriangle, FileDown, LayoutDashboard, ListChecks, Sparkles, TrendingUp, Zap } from "lucide-react";
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
import { useDatasetPeek } from "@/lib/dataset";
import { explainDataset } from "@/lib/ai.functions";
import { inr } from "@/lib/finance-data";
import { useInsights, type DatasetInsights } from "@/lib/insights";
import { useOrg } from "@/lib/orgs";
import { generateReportPdf, type ReportSpec } from "@/lib/report-doc";

export function AiInsightsDock() {
  const { open, setOpen, openInsights, insights, sourceFile } = useInsights();
  const { user } = useAuth();
  const { orgName } = useOrg();
  const { live } = useDatasetPeek();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  const ai = useQuery({
    queryKey: ["dataset-insight-ai", insights.recordCount, Math.round(insights.revenue), Math.round(insights.expense)],
    enabled: open && !!user && insights.recordCount > 0,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const res = await explainDataset({
        data: {
          org: orgName,
          recordCount: insights.recordCount,
          revenue: insights.revenue,
          expense: insights.expense,
          net: insights.net,
          margin: insights.margin,
          from: insights.from,
          to: insights.to,
          runway: insights.runway,
          drivers: insights.drivers,
          spend: insights.spend,
          risks: insights.risks,
        },
      });
      return res.text;
    },
  });

  const overview =
    (user && ai.data) ||
    `${orgName} recorded ${inr(insights.revenue)} revenue against ${inr(insights.expense)} of expenses across ${insights.recordCount} records from ${insights.from} to ${insights.to}. Net position is ${inr(insights.net)} at a ${insights.margin.toFixed(1)}% margin, with an estimated ${insights.runway.toFixed(1)}-month cash runway.`;

  const exportPdf = async () => {
    setBusy(true);
    try {
      const spec: ReportSpec = {
        page: "dashboard",
        reportName: "AI Executive Dataset Insights",
        org: orgName,
        fy: "FY 2026-27",
        facts: overview,
        kpis: [
          { label: "Total Revenue", value: inr(insights.revenue) },
          { label: "Net Expenses", value: inr(insights.expense) },
          { label: "Net Position", value: inr(insights.net), delta: `${insights.margin.toFixed(1)}% margin` },
          { label: "Records Ingested", value: String(insights.recordCount) },
        ],
        tables: [
          {
            title: "Top Revenue Drivers",
            columns: ["Client", "Revenue"],
            rows: insights.drivers.map((d) => [d.label, inr(d.value)]),
            numericFrom: 1,
          },
          {
            title: "Largest Expense Categories",
            columns: ["Category", "Spend"],
            rows: insights.spend.map((d) => [d.label, inr(d.value)]),
            numericFrom: 1,
          },
          {
            title: "Risk & Anomaly Register",
            columns: ["#", "Observation"],
            rows: insights.risks.map((r, i) => [i + 1, r]),
          },
          {
            title: "Recommended Next Steps",
            columns: ["#", "Action"],
            rows: insights.actions.map((r, i) => [i + 1, r]),
          },
        ],
        complianceNote:
          "AI-generated dataset insight summary. Figures are derived from ingested records and require Finance Head verification.",
      };
      await generateReportPdf(spec, {
        summary: overview,
        takeaways: [...insights.risks.slice(0, 2), ...insights.actions.slice(0, 2)],
      });
      toast.success("Insight summary downloaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not export the insight summary");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        data-export-hide
        onClick={() => openInsights()}
        className="fixed right-5 bottom-5 z-40 gap-2 rounded-full px-5 shadow-lg"
      >
        <Zap className="size-4" /> AI Insights
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="size-5 text-brand" /> AI Executive Dataset Insights
            </DialogTitle>
            <DialogDescription>
              {sourceFile ? `${sourceFile} — ` : ""}
              {live ? "Live cloud data" : "Sample data"} · {orgName} · {insights.recordCount} records
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <section className="rounded-lg border border-border bg-muted/40 p-3">
              <h3 className="mb-1 flex items-center gap-2 text-xs font-semibold tracking-wide uppercase">
                <Sparkles className="size-3.5 text-brand" /> Executive overview
              </h3>
              <p className="text-sm leading-relaxed">
                {ai.isLoading && user ? "Preparing the AI narrative…" : overview}
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Kpi label="Revenue" value={inr(insights.revenue, true)} />
                <Kpi label="Expenses" value={inr(insights.expense, true)} />
                <Kpi label="Net" value={inr(insights.net, true)} />
                <Kpi label="Runway" value={`${insights.runway.toFixed(1)}m`} />
              </div>
            </section>

            <Block icon={TrendingUp} title="Key opportunities & positives" tone="text-success">
              {insights.drivers.length === 0 && insights.spend.length === 0 ? (
                <li>No revenue rows found yet — upload a transactions file to see drivers.</li>
              ) : (
                <>
                  {insights.drivers.map((d) => (
                    <li key={d.label}>
                      {d.label} contributed {inr(d.value)} of revenue.
                    </li>
                  ))}
                  {insights.margin > 0 && (
                    <li>Net margin is holding at {insights.margin.toFixed(1)}% for the ingested period.</li>
                  )}
                </>
              )}
            </Block>

            <Block icon={AlertTriangle} title="Critical risk & anomaly warnings" tone="text-danger">
              {insights.risks.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </Block>

            <Block icon={ListChecks} title="Actionable next steps" tone="text-brand">
              {insights.actions.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </Block>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" disabled={busy} onClick={() => void exportPdf()}>
              <FileDown className="size-4" /> {busy ? "Preparing…" : "Export insights (PDF)"}
            </Button>
            <Button
              onClick={() => {
                setOpen(false);
                void navigate({ to: "/" });
              }}
            >
              <LayoutDashboard className="size-4" /> Explore dashboard
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background p-2">
      <p className="tabular text-sm font-bold">{value}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}

function Block({
  icon: Icon,
  title,
  tone,
  children,
}: {
  icon: typeof TrendingUp;
  title: string;
  tone: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border p-3">
      <h3 className={`mb-2 flex items-center gap-2 text-xs font-semibold tracking-wide uppercase ${tone}`}>
        <Icon className="size-3.5" /> {title}
      </h3>
      <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">{children}</ul>
    </section>
  );
}

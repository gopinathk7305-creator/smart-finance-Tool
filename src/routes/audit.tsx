import { createFileRoute } from "@tanstack/react-router";
import { AlertOctagon, CheckCircle2, Copy, ShieldAlert, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AiReportButton } from "@/components/finance/AiReportButton";
import { AppShell } from "@/components/finance/AppShell";
import { KpiCard } from "@/components/finance/KpiCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  auditFindings,
  immutableAuditTrail,
  type AuditFinding,
  type AuditStatus,
} from "@/lib/enterprise-data";
import { scanLedgerWithAi } from "@/lib/ai.functions";
import { useDataset } from "@/lib/dataset";
import { downloadCSV, inr } from "@/lib/finance-data";

export const Route = createFileRoute("/audit")({
  head: () => ({
    meta: [
      { title: "Internal Audit & Compliance — Finance IQ" },
      {
        name: "description",
        content:
          "Forensic audit engine flagging duplicate invoices, round-sum payments, out-of-hours postings and category variances.",
      },
      { property: "og:title", content: "Internal Audit & Compliance — Finance IQ" },
      {
        property: "og:description",
        content: "Review, approve or escalate flagged transactions with an immutable audit trail.",
      },
    ],
  }),
  component: AuditPage,
});

const STATUS_LABEL: Record<AuditStatus, string> = {
  open: "Open",
  approved: "Approved",
  investigating: "Flagged for investigation",
  rejected: "Rejected",
};

function AuditPage() {
  const { txns, live } = useDataset();
  const ruleFindings = useMemo(() => auditFindings(live ? txns : undefined), [txns, live]);
  const [aiFindings, setAiFindings] = useState<AuditFinding[]>([]);
  const [scanning, setScanning] = useState(false);
  const [statuses, setStatuses] = useState<Record<string, AuditStatus>>({});
  const [ruleFilter, setRuleFilter] = useState("all");

  const findings = useMemo(() => [...aiFindings, ...ruleFindings], [aiFindings, ruleFindings]);

  const runAiScan = async () => {
    setScanning(true);
    try {
      const res = await scanLedgerWithAi({
        data: {
          rows: txns.map((t) => ({
            id: t.id,
            date: t.date,
            category: t.category,
            type: t.type,
            amount: t.amount,
            vendor_client: t.vendor_client,
            status: t.status,
          })),
        },
      });
      const mapped: AuditFinding[] = res.findings.map((f, i) => ({
        id: `AI-${i + 1}`,
        rule: f.rule,
        severity: f.severity,
        party: f.party,
        date: f.date,
        amount: Number(f.amount) || 0,
        detail: f.detail,
      }));
      setAiFindings(mapped);
      toast.success(
        mapped.length ? `AI scan flagged ${mapped.length} items` : "AI scan found no new anomalies",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "AI scan failed.");
    } finally {
      setScanning(false);
    }
  };

  const rules = Array.from(new Set(findings.map((f) => f.rule)));
  const visible = findings.filter((f) => ruleFilter === "all" || f.rule === ruleFilter);
  const statusOf = (id: string) => statuses[id] ?? "open";

  const set = (id: string, s: AuditStatus) => {
    setStatuses((p) => ({ ...p, [id]: s }));
    toast.success(`${id} marked ${STATUS_LABEL[s].toLowerCase()}`);
  };

  const open = findings.filter((f) => statusOf(f.id) === "open").length;
  const high = findings.filter((f) => f.severity === "high").length;
  const exposure = findings.reduce((s, f) => s + f.amount, 0);
  const duplicates = findings.filter((f) => f.rule === "Duplicate invoice").length;

  return (
    <AppShell title="Internal Audit & Compliance" subtitle={live ? "Scanning your uploaded ledger" : "Sample ledger · upload transactions for a real scan"}>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total Exceptions" value={String(findings.length)} icon={ShieldAlert} tone="warning" hint={`${open} unresolved`} />
        <KpiCard label="High Severity" value={String(high)} icon={AlertOctagon} tone="danger" hint="Immediate review" />
        <KpiCard label="Duplicate Invoices" value={String(duplicates)} icon={Copy} tone="danger" hint="Same vendor & amount ≤ 7 days" />
        <KpiCard label="Flagged Value" value={inr(exposure, true)} icon={CheckCircle2} tone="neutral" hint="Total exposure" />
      </div>

      <Card className="mt-4 border-border shadow-card">
        <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-base">Audit Exception Checklist</CardTitle>
            <CardDescription>{visible.length} items from the rule engine</CardDescription>
          </div>
          <div className="flex gap-2">
            <Select value={ruleFilter} onValueChange={setRuleFilter}>
              <SelectTrigger className="w-56 bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All rules</SelectItem>
                {rules.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={() => void runAiScan()} disabled={scanning}>
              <Sparkles className="size-4" />
              {scanning ? "Scanning…" : "AI scan ledger"}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                downloadCSV(
                  "audit-exception-log.csv",
                  findings.map((f) => ({ ...f, status: statusOf(f.id) })),
                );
                toast.success("Audit exception log exported");
              }}
            >
              Export log
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Rule</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Party / Category</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Finding</TableHead>
                  <TableHead className="text-right">Resolution</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((f) => {
                  const s = statusOf(f.id);
                  return (
                    <TableRow key={f.id}>
                      <TableCell className="font-medium">{f.id}</TableCell>
                      <TableCell>{f.rule}</TableCell>
                      <TableCell>
                        <Badge
                          variant={f.severity === "high" ? "destructive" : "secondary"}
                          className="capitalize"
                        >
                          {f.severity}
                        </Badge>
                      </TableCell>
                      <TableCell>{f.party}</TableCell>
                      <TableCell className="tabular whitespace-nowrap">{f.date}</TableCell>
                      <TableCell className="tabular text-right">{inr(f.amount)}</TableCell>
                      <TableCell className="max-w-[320px] text-xs text-muted-foreground">
                        {f.detail}
                      </TableCell>
                      <TableCell className="text-right">
                        {s === "open" ? (
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="outline" onClick={() => set(f.id, "approved")}>
                              Approve
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => set(f.id, "investigating")}>
                              Investigate
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => set(f.id, "rejected")}>
                              Reject
                            </Button>
                          </div>
                        ) : (
                          <span className="text-xs font-semibold">{STATUS_LABEL[s]}</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-4 border-border shadow-card">
        <CardHeader>
          <CardTitle className="text-base">Immutable Audit Trail</CardTitle>
          <CardDescription>Who changed what and when — append-only</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {immutableAuditTrail.map((l) => (
              <div
                key={l.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-border px-3 py-2 text-sm"
              >
                <span className="tabular text-xs text-muted-foreground">{l.timestamp}</span>
                <span className="font-medium">{l.email}</span>
                <span className="text-muted-foreground">{l.action}</span>
                <Badge variant="outline" className="ml-auto">
                  {l.module}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </AppShell>
  );
}

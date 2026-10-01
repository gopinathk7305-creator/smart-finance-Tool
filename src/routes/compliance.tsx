import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CalendarClock, CheckCircle2, IndianRupee, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AiReportButton } from "@/components/finance/AiReportButton";
import { AppShell } from "@/components/finance/AppShell";
import { KpiCard } from "@/components/finance/KpiCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useCategories } from "@/lib/categories";
import {
  FY_SEQUENCE,
  FILING_STATUS_LABEL,
  buildFilings,
  lateCharge,
  statusOf,
  type FiledRecord,
  type FilingRow,
  type FilingStatus,
} from "@/lib/compliance";
import { useDataset } from "@/lib/dataset";
import { grossPay, inr, monthlySummary, totals } from "@/lib/finance-data";
import { ALL, useOrg } from "@/lib/orgs";
import { useActiveDataset } from "@/lib/active-dataset";
import { corporateTax } from "@/lib/tax";

export const Route = createFileRoute("/compliance")({
  head: () => ({
    meta: [
      { title: "Statutory Compliance & Filings Tracker — Finance IQ" },
      {
        name: "description",
        content:
          "Track GSTR-1, GSTR-3B, TDS, PF and ESI challans and quarterly advance tax with due dates, filing status and late-fee estimates.",
      },
      { property: "og:title", content: "Statutory Compliance & Filings Tracker — Finance IQ" },
      {
        property: "og:description",
        content: "Indian statutory filing calendar with amounts derived from your own ledger and payroll.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CompliancePage,
});

const STATUS_STYLE: Record<FilingStatus, string> = {
  filed: "bg-success-soft text-success hover:bg-success-soft",
  pending: "bg-warning-soft text-warning hover:bg-warning-soft",
  overdue: "bg-danger-soft text-danger hover:bg-danger-soft",
  upcoming: "bg-secondary text-muted-foreground hover:bg-secondary",
};

const START_YEAR = 2026;
const GST_RATE = 0.18;

function CompliancePage() {
  const { user } = useAuth();
  const { orgId, orgName } = useOrg();
  const { activeFile } = useActiveDataset();
  const { txns, pays, live } = useDataset();
  const { cogsNames } = useCategories();
  const queryClient = useQueryClient();

  const [filter, setFilter] = useState<"all" | FilingStatus>("all");
  const [target, setTarget] = useState<FilingRow | null>(null);
  const [ack, setAck] = useState("");
  const [filedDate, setFiledDate] = useState(() => new Date().toISOString().slice(0, 10));

  const today = new Date().toISOString().slice(0, 10);

  const { data: filedRows } = useQuery({
    queryKey: ["compliance-filings", user?.id ?? "anon", activeFile ?? "all"],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("compliance_filings").select("*");
      return data ?? [];
    },
  });

  const filed = useMemo(() => {
    const map = new Map<string, FiledRecord>();
    (filedRows ?? [])
      .filter((r) => orgId === ALL || r.org_id === orgId || r.org_id === null)
      .forEach((r) =>
        map.set(r.filing_key, {
          id: r.id,
          filing_key: r.filing_key,
          period: r.period,
          ack_number: r.ack_number,
          filed_date: r.filed_date,
          amount: Number(r.amount),
        }),
      );
    return map;
  }, [filedRows, orgId]);

  const t = totals(txns, cogsNames);
  const tax = corporateTax(t.ebitda - t.depreciation - t.interest);

  const rows = useMemo(() => {
    const series = monthlySummary(txns);
    const monthlyTds = pays.reduce((s, p) => s + p.tds_deduction, 0);
    const monthlyPfEsi = pays.reduce(
      (s, p) => s + p.basic_pay * 0.12 + grossPay(p) * 0.0325,
      0,
    );

    const gstOutput = FY_SEQUENCE.map((m) => (series[m.monthIndex]?.revenue ?? 0) * GST_RATE);
    const inputCredit = FY_SEQUENCE.map((m) => (series[m.monthIndex]?.expense ?? 0) * GST_RATE);
    const tds = FY_SEQUENCE.map((m) => (series[m.monthIndex]?.revenue ? monthlyTds : monthlyTds));
    const pfEsi = FY_SEQUENCE.map(() => monthlyPfEsi);

    return buildFilings({
      startYear: START_YEAR,
      gstOutput,
      inputCredit,
      tds,
      pfEsi,
      annualTax: tax.total,
    });
  }, [txns, pays, tax.total]);

  const decorated = rows.map((r) => ({
    row: r,
    status: statusOf(r, filed, today),
    charge: lateCharge(r, today),
    record: filed.get(r.key),
  }));

  const visible = decorated.filter((d) => filter === "all" || d.status === filter);
  const overdue = decorated.filter((d) => d.status === "overdue");
  const pending = decorated.filter((d) => d.status === "pending");
  const filedCount = decorated.filter((d) => d.status === "filed").length;
  const lateExposure = overdue.reduce((s, d) => s + d.charge.total, 0);
  const overdueAmount = overdue.reduce((s, d) => s + d.row.amount, 0);

  const markFiled = useMutation({
    mutationFn: async (args: { row: FilingRow; ack: string; date: string }) => {
      if (!user) throw new Error("Sign in to record a filing.");
      const { error } = await supabase.from("compliance_filings").insert({
        user_id: user.id,
        org_id: orgId === ALL ? null : orgId,
        filing_key: args.row.key,
        filing_type: args.row.form,
        period: args.row.period,
        due_date: args.row.dueDate,
        amount: args.row.amount,
        status: "filed",
        ack_number: args.ack,
        filed_date: args.date,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["compliance-filings"] });
      toast.success("Filing recorded");
      setTarget(null);
      setAck("");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not record that filing."),
  });

  const buildReport = () => ({
    page: "compliance" as const,
    reportName: "Statutory Compliance & Filings Status Report",
    fy: `FY ${START_YEAR}-${String(START_YEAR + 1).slice(2)}`,
    kpis: [
      { label: "Filings Tracked", value: String(rows.length), delta: `${filedCount} filed` },
      { label: "Overdue Filings", value: String(overdue.length), delta: inr(overdueAmount, true) },
      { label: "Due Within 15 Days", value: String(pending.length), delta: "Action required" },
      { label: "Late Fee / Interest Risk", value: inr(lateExposure, true), delta: "Indicative" },
    ],
    tables: [
      {
        title: "Statutory Filing Calendar",
        columns: ["Form", "Period", "Due date", "Amount", "Status", "Acknowledgment"],
        numericFrom: 3,
        rows: decorated.map((d) => [
          d.row.form,
          d.row.period,
          d.row.dueDate,
          inr(d.row.amount),
          FILING_STATUS_LABEL[d.status],
          d.record?.ack_number || "—",
        ]),
      },
      {
        title: "Corporate Tax Computation Behind Advance Tax",
        columns: ["Particulars", "Amount"],
        numericFrom: 1,
        rows: [
          ["Taxable profit (EBIT)", inr(tax.ebt)],
          [`Base corporate tax @ ${(tax.rate * 100).toFixed(0)}%`, inr(tax.base)],
          [`Surcharge @ ${tax.surchargePct}%`, inr(tax.surcharge)],
          ["Health & education cess @ 4%", inr(tax.cess)],
          ["Total tax payable", inr(tax.total)],
          ["Effective tax rate", `${tax.effectiveRate.toFixed(2)}%`],
        ],
      },
    ],
    facts: `Compliance position for ${orgName}. ${rows.length} statutory obligations tracked: ${filedCount} filed, ${overdue.length} overdue carrying ${inr(overdueAmount)} of tax and ${inr(lateExposure)} of indicative late fee and interest, ${pending.length} due within fifteen days. GST output is computed at 18% on monthly sales with input credit on purchases, TDS from payroll deductions, PF at 12% and ESI at 3.25% of payroll, and advance corporate tax at 15%, 45%, 75% and 100% cumulative instalments of ${inr(tax.total)} estimated annual liability (effective rate ${tax.effectiveRate.toFixed(2)}%). Data source: ${live ? "uploaded ledger and payroll" : "demo dataset"}.`,
    complianceNote:
      "Compliance Certificate: filing amounts are system-derived estimates and must be reconciled with GST portal and TRACES data before submission.",
    chartEl: null,
  });

  return (
    <AppShell
      title="Statutory Compliance & Filings Tracker"
      subtitle={`${orgName} · FY ${START_YEAR}-${String(START_YEAR + 1).slice(2)} — GST, TDS, PF/ESI and advance tax`}
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Filings Tracked" value={String(rows.length)} icon={CalendarClock} hint={`${filedCount} filed`} />
        <KpiCard
          label="Overdue"
          value={String(overdue.length)}
          icon={AlertTriangle}
          tone={overdue.length ? "danger" : "success"}
          hint={inr(overdueAmount, true)}
        />
        <KpiCard label="Due in 15 Days" value={String(pending.length)} icon={ShieldCheck} tone="warning" hint="Act now" />
        <KpiCard
          label="Late Fee / Interest Risk"
          value={inr(lateExposure, true)}
          icon={IndianRupee}
          tone={lateExposure ? "danger" : "neutral"}
          hint="Indicative estimate"
        />
      </div>

      <Card className="mt-4 border-border shadow-card">
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-base">Filing Calendar</CardTitle>
            <CardDescription>
              Amounts derived from your ledger and payroll — {visible.length} obligations shown
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
              <SelectTrigger className="w-40 bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="upcoming">Upcoming</SelectItem>
                <SelectItem value="filed">Filed</SelectItem>
              </SelectContent>
            </Select>
            <AiReportButton build={buildReport} size="default" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Form</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Due date</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Late fee / interest</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((d) => (
                  <TableRow key={d.row.key} className={d.status === "overdue" ? "bg-danger-soft/40" : undefined}>
                    <TableCell className="font-medium">
                      {d.row.form}
                      <span className="block text-[11px] text-muted-foreground">{d.row.description}</span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{d.row.period}</TableCell>
                    <TableCell className="tabular whitespace-nowrap">{d.row.dueDate}</TableCell>
                    <TableCell className="tabular text-right">{inr(d.row.amount)}</TableCell>
                    <TableCell>
                      <Badge className={STATUS_STYLE[d.status]}>{FILING_STATUS_LABEL[d.status]}</Badge>
                    </TableCell>
                    <TableCell className="tabular text-right text-xs">
                      {d.status === "overdue" ? (
                        <span className="text-danger">
                          {inr(d.charge.total)}
                          <span className="block text-[10px] text-muted-foreground">
                            {d.charge.days} days late · {d.charge.note}
                          </span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {d.status === "filed" ? (
                        <span className="inline-flex items-center gap-1 text-xs text-success">
                          <CheckCircle2 className="size-3.5" />
                          {d.record?.ack_number || "Filed"}
                        </span>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!user}
                          onClick={() => {
                            setTarget(d.row);
                            setAck("");
                          }}
                        >
                          Mark as Filed
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {visible.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                      No filings in this status.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          {!user && (
            <p className="mt-3 text-xs text-muted-foreground">
              Sign in to record filings against your organization.
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="mt-4 border-border shadow-card">
        <CardHeader>
          <CardTitle className="text-base">Advance Tax Basis</CardTitle>
          <CardDescription>
            Estimated annual liability {inr(tax.total)} · effective rate {tax.effectiveRate.toFixed(2)}%
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <Line label="Taxable profit (EBIT)" value={inr(tax.ebt)} />
          <Line label={`Base corporate tax @ ${(tax.rate * 100).toFixed(0)}%`} value={inr(tax.base)} />
          <Line label={`Surcharge @ ${tax.surchargePct}%`} value={inr(tax.surcharge)} />
          <Line label="Health & education cess @ 4%" value={inr(tax.cess)} />
          <div className="mt-2 flex justify-between rounded-md bg-primary px-3 py-2 font-bold text-primary-foreground">
            <span>Total tax payable</span>
            <span className="tabular">{inr(tax.total)}</span>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!target} onOpenChange={(o) => !o && setTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Mark {target?.form} — {target?.period} as filed
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="ack">Acknowledgment number</Label>
              <Input
                id="ack"
                autoFocus
                placeholder="AA290426123456X"
                value={ack}
                onChange={(e) => setAck(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="filed-date">Filing date</Label>
              <Input
                id="filed-date"
                type="date"
                value={filedDate}
                onChange={(e) => setFiledDate(e.target.value)}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Amount recorded: {target ? inr(target.amount) : "—"} · due {target?.dueDate}
            </p>
          </div>
          <DialogFooter>
            <Button
              disabled={markFiled.isPending}
              onClick={() => {
                if (!target) return;
                if (!ack.trim()) {
                  toast.error("Enter the acknowledgment number from the portal.");
                  return;
                }
                markFiled.mutate({ row: target, ack: ack.trim(), date: filedDate });
              }}
            >
              {markFiled.isPending ? "Saving…" : "Record filing"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between rounded-md px-3 py-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular font-medium">{value}</span>
    </div>
  );
}

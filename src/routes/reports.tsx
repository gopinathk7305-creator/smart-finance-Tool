import { createFileRoute } from "@tanstack/react-router";
import { Download, FileSpreadsheet, FileText, Image as ImageIcon, Loader2 } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/finance/AppShell";
import { ActiveDatasetBanner } from "@/components/finance/ActiveDatasetBanner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import {
  downloadCSV,
  grossPay,
  inr,
  monthlySummary,
  totals,
  type ArApRecord,
  type BudgetTarget,
  type PayrollRecord,
  type Transaction,
} from "@/lib/finance-data";
import { auditFindings, computeTax, gstSummary } from "@/lib/enterprise-data";
import { useAuth } from "@/lib/auth";
import { useDataset } from "@/lib/dataset";
import { useActiveDataset } from "@/lib/active-dataset";
import { ModuleSkeleton } from "@/components/finance/ModuleSkeleton";
import { downloadReportWorkbook } from "@/lib/excel-export";
import { ALL, useOrg } from "@/lib/orgs";
import { corporateTax } from "@/lib/tax";
import { generateReportNarrative } from "@/lib/report-ai.functions";
import {
  fallbackNarrative,
  generateReportPdf,
  generateSnapshotPdf,
  type ReportNarrative,
  type ReportSpec,
} from "@/lib/report-doc";

export const Route = createFileRoute("/reports")({
  head: () => ({
    meta: [
      { title: "Report Builder — Finance IQ" },
      {
        name: "description",
        content:
          "Interactive Indian-FY report builder: P&L, executive summary, payroll tax, audit log, AR/AP aging and GST liability with CSV and AI PDF export.",
      },
      { property: "og:title", content: "Report Builder — Finance IQ" },
      {
        property: "og:description",
        content:
          "Slice financial reports by quarter and vendor, preview live and export CSV or a formal AI executive PDF.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReportsPage,
});

const REPORTS = {
  pnl: "Profit & Loss Statement (P&L)",
  summary: "Executive Financial Summary",
  payroll: "Statutory Compliance & Payroll Tax Sheet",
  audit: "Audit Exception & Risk Log",
  aging: "AR / AP Aging Analysis",
  gst: "GST Liability & Filing Summary",
} as const;

type ReportKey = keyof typeof REPORTS;

const RANGES = {
  ytd: "YTD FY 2026-27",
  q1: "Q1 (Apr-Jun 2026)",
  q2: "Q2 (Jul-Sep 2026)",
  q3: "Q3 (Oct-Dec 2026)",
  q4: "Q4 (Jan-Mar 2027)",
  custom: "Custom Range",
} as const;

type RangeKey = keyof typeof RANGES;

/** Indian FY 2026-27 quarter windows as inclusive ISO date bounds. */
const QUARTER_BOUNDS: Record<Exclude<RangeKey, "ytd" | "custom">, [string, string]> = {
  q1: ["2026-04-01", "2026-06-30"],
  q2: ["2026-07-01", "2026-09-30"],
  q3: ["2026-10-01", "2026-12-31"],
  q4: ["2027-01-01", "2027-03-31"],
};

function windowFor(range: RangeKey, from: string, to: string): [string, string] | null {
  if (range === "ytd") return null;
  if (range === "custom") return from && to ? [from, to] : null;
  return QUARTER_BOUNDS[range];
}

const inWindow = (iso: string, bounds: [string, string] | null) =>
  !bounds || (iso.slice(0, 10) >= bounds[0] && iso.slice(0, 10) <= bounds[1]);

function agingBand(record: ArApRecord) {
  if (record.status === "settled") return "Current";
  const days = Math.floor((Date.UTC(2026, 11, 20) - Date.parse(record.due_date)) / 86_400_000);
  if (days <= 0) return "Current";
  if (days <= 30) return "1-30 Days";
  if (days <= 60) return "31-60 Days";
  if (days <= 90) return "61-90 Days";
  return "90+ Days";
}

function buildRows(
  key: ReportKey,
  txns: Transaction[],
  pays: PayrollRecord[],
  buds: BudgetTarget[],
  araps: ArApRecord[],
): Record<string, unknown>[] {
  const t = totals(txns);
  const ebit = t.ebitda - t.depreciation - t.interest;
  const tx = corporateTax(ebit, 0.25, "7");
  if (key === "pnl")
    return [
      { line: "Gross Revenue (excl. GST)", amount: t.revenue },
      { line: "Cost of Goods Sold", amount: -t.cogs },
      { line: "Gross Profit", amount: t.grossProfit },
      { line: "Operating Expenses", amount: -t.opex },
      { line: "EBITDA", amount: t.ebitda },
      { line: "Depreciation & Amortisation", amount: -t.depreciation },
      { line: "Finance Cost", amount: -t.interest },
      { line: "EBIT (Taxable Profit)", amount: ebit },
      { line: "Corporate Tax @ 25%", amount: -Math.round(tx.base) },
      { line: "Surcharge @ 7%", amount: -Math.round(tx.surcharge) },
      { line: "Health & Education Cess @ 4%", amount: -Math.round(tx.cess) },
      { line: "Net Profit After Tax", amount: Math.round(tx.netProfit) },
    ];
  if (key === "summary")
    return [
      { metric: "Operating Revenue", amount: t.revenue, management_view: "Income generated" },
      { metric: "Cost of Goods Sold", amount: t.cogs, management_view: "Direct operating cost" },
      { metric: "Operating Expenses", amount: t.opex, management_view: "Indirect operating cost" },
      { metric: "EBITDA", amount: t.ebitda, management_view: "Operating earnings" },
      {
        metric: "Net Profit After Tax",
        amount: Math.round(tx.netProfit),
        management_view: "Post-tax earnings",
      },
      {
        metric: "Approved Budget",
        amount: buds.reduce((sum, b) => sum + b.budgeted_amount, 0),
        management_view: "Annual expense allocation",
      },
    ];
  if (key === "payroll")
    return pays.map((p) => {
      const tax = computeTax(p);
      return {
        employee_id: p.employee_id,
        name: p.name,
        department: p.department,
        gross_pay: tax.gross,
        pf_12_percent: tax.pf,
        esi: tax.esi,
        tds_with_cess: tax.monthlyTds,
        net_pay: tax.net,
      };
    });
  if (key === "audit")
    return auditFindings(txns).map((f) => ({
      id: f.id,
      rule: f.rule,
      severity: f.severity,
      party: f.party,
      date: f.date,
      amount: f.amount,
      finding: f.detail,
      recommended_action:
        f.severity === "high"
          ? "Hold and investigate"
          : f.severity === "medium"
            ? "Verify documents"
            : "Manager review",
      approval_status: "Open",
    }));
  if (key === "gst") {
    const g = gstSummary(t.revenue, t.expense);
    return [
      { particulars: "Taxable Outward Supplies (Revenue)", amount: t.revenue },
      { particulars: "Output GST @ 18% (GSTR-1)", amount: g.outputGst },
      { particulars: "Eligible Input Tax Credit", amount: g.inputCredit },
      { particulars: "Net GST Payable (GSTR-3B)", amount: g.payable },
      { particulars: "Taxable Inward Supplies (Expenses)", amount: t.expense },
    ];
  }
  const bands = ["Current", "1-30 Days", "31-60 Days", "61-90 Days", "90+ Days"];
  return (["AR", "AP"] as const).flatMap((type) =>
    bands.map((band) => {
      const matches = araps.filter((r) => r.type === type && agingBand(r) === band);
      return {
        type,
        aging_bucket: band,
        invoice_count: matches.length,
        outstanding_amount: matches
          .filter((r) => r.status === "outstanding")
          .reduce((sum, r) => sum + r.amount, 0),
      };
    }),
  );
}

const PAGE_KEY: Record<ReportKey, ReportSpec["page"]> = {
  pnl: "pnl",
  summary: "reports",
  payroll: "payroll",
  audit: "audit",
  aging: "reports",
  gst: "compliance",
};

function ReportsPage() {
  const { session } = useAuth();
  const { orgName, vendor, setVendor } = useOrg();
  const { txns, pays, buds, araps, vendors } = useDataset();
  const [report, setReport] = useState<ReportKey>("pnl");
  const [range, setRange] = useState<RangeKey>("ytd");
  const [from, setFrom] = useState("2026-04-01");
  const [to, setTo] = useState("2027-03-31");
  const [busy, setBusy] = useState<null | "csv" | "xlsx" | "snapshot" | "formal">(null);
  const { syncing } = useActiveDataset();
  const [modal, setModal] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);

  const bounds = windowFor(range, from, to);

  const scoped = useMemo(() => {
    return {
      txns: txns.filter((t) => inWindow(t.date, bounds)),
      pays: bounds
        ? pays.filter((p) => {
            const d = Date.parse(`${p.month_year}-01`);
            return Number.isNaN(d)
              ? true
              : new Date(d).toISOString().slice(0, 10) >= bounds[0] &&
                  new Date(d).toISOString().slice(0, 10) <= bounds[1];
          })
        : pays,
      buds,
      araps: araps.filter((r) => inWindow(r.invoice_date, bounds)),
    };
  }, [txns, pays, buds, araps, bounds]);

  const rows = buildRows(report, scoped.txns, scoped.pays, scoped.buds, scoped.araps);
  const preview = rows.slice(0, 30);
  const columns = Object.keys(rows[0] ?? {});
  const rangeLabel = range === "custom" ? `${from} to ${to}` : RANGES[range];

  const buildReport = (key: ReportKey = report): Omit<ReportSpec, "org" | "vendor"> => {
    const reportRows = buildRows(key, scoped.txns, scoped.pays, scoped.buds, scoped.araps);
    const t = totals(scoped.txns);
    const ebit = t.ebitda - t.depreciation - t.interest;
    const tx = corporateTax(ebit, 0.25, "7");
    const g = gstSummary(t.revenue, t.expense);
    const months = monthlySummary(scoped.txns);
    const finalCash = months.at(-1)?.cash ?? 0;
    const monthlyBurn =
      months.slice(-3).reduce((sum, m) => sum + Math.max(0, m.expense - m.revenue), 0) / 3;
    const overdue = scoped.araps.filter(
      (r) => r.status === "outstanding" && agingBand(r) !== "Current",
    );
    const overdueValue = overdue.reduce((sum, r) => sum + r.amount, 0);
    const titles: Record<ReportKey, string> = {
      pnl: "Profit & Loss Statement",
      summary: "Executive Financial Summary",
      payroll: "Detailed Salary & Statutory Tax Register",
      audit: "Forensic Audit Trail & Risk Register",
      aging: "AR/AP Aging Analysis",
      gst: "GST Liability & Filing Summary",
    };
    const facts: Record<ReportKey, string> = {
      pnl: `Period ${rangeLabel}. Operating income ${inr(t.revenue)}, COGS ${inr(t.cogs)}, gross profit ${inr(t.grossProfit)}, operating expenses ${inr(t.opex)}, EBITDA ${inr(t.ebitda)}, depreciation ${inr(t.depreciation)}, finance cost ${inr(t.interest)}, EBIT ${inr(ebit)}. Corporate tax 25% ${inr(tx.base)} plus 7% surcharge ${inr(tx.surcharge)} plus 4% cess ${inr(tx.cess)} equals ${inr(tx.total)} at an effective rate of ${tx.effectiveRate.toFixed(2)}%. Net profit after tax ${inr(tx.netProfit)}.`,
      summary: `Period ${rangeLabel}. Management overview: revenue ${inr(t.revenue)}, expenses ${inr(t.expense)}, net profit after tax ${inr(tx.netProfit)}, closing modeled cash ${inr(finalCash)}, recent monthly cash burn ${inr(monthlyBurn)}.`,
      payroll: `Period ${rangeLabel}. Salary register covers ${scoped.pays.length} employees. Gross pay ${inr(scoped.pays.reduce((s, p) => s + grossPay(p), 0))}, PF at 12% ${inr(scoped.pays.reduce((s, p) => s + computeTax(p).pf, 0))}, ESI ${inr(scoped.pays.reduce((s, p) => s + computeTax(p).esi, 0))}, slab-wise TDS including 4% cess ${inr(scoped.pays.reduce((s, p) => s + computeTax(p).monthlyTds, 0))}, net take-home ${inr(scoped.pays.reduce((s, p) => s + computeTax(p).net, 0))}.`,
      audit: `Period ${rangeLabel}. Forensic review of ${scoped.txns.length} transactions identified ${reportRows.length} exceptions. Every exception remains open until approved by the audit owner.`,
      aging: `Period ${rangeLabel}. Receivables and payables reviewed: ${scoped.araps.length}. Overdue invoices: ${overdue.length}, total overdue exposure ${inr(overdueValue)}. Beyond 90 days: ${inr(overdue.filter((r) => agingBand(r) === "90+ Days").reduce((s, r) => s + r.amount, 0))}.`,
      gst: `Period ${rangeLabel}. Taxable outward supplies ${inr(t.revenue)} carry output GST at 18% of ${inr(g.outputGst)}. Eligible input tax credit is ${inr(g.inputCredit)}, leaving net GST payable of ${inr(g.payable)} for GSTR-3B. GSTR-1 is due on the 11th and GSTR-3B on the 20th of the following month.`,
    };
    const kpisByReport: Record<ReportKey, { label: string; value: string; delta?: string }[]> = {
      pnl: [
        { label: "Revenue", value: inr(t.revenue, true) },
        { label: "EBITDA", value: inr(t.ebitda, true) },
        { label: "Tax Payable", value: inr(tx.total, true), delta: "25%+7%+4%" },
        { label: "Net Profit", value: inr(tx.netProfit, true) },
      ],
      summary: [
        { label: "Revenue", value: inr(t.revenue, true) },
        { label: "Expenses", value: inr(t.expense, true) },
        { label: "Closing Cash", value: inr(finalCash, true) },
        { label: "Net Profit", value: inr(tx.netProfit, true) },
      ],
      payroll: [
        { label: "Employees", value: String(scoped.pays.length) },
        { label: "Gross Pay", value: inr(scoped.pays.reduce((s, p) => s + grossPay(p), 0), true) },
        { label: "PF 12%", value: inr(scoped.pays.reduce((s, p) => s + computeTax(p).pf, 0), true) },
        {
          label: "Net Take-home",
          value: inr(scoped.pays.reduce((s, p) => s + computeTax(p).net, 0), true),
        },
      ],
      audit: [
        { label: "Transactions", value: String(scoped.txns.length) },
        { label: "Exceptions", value: String(reportRows.length) },
        {
          label: "High Risk",
          value: String(reportRows.filter((r) => r["severity"] === "high").length),
        },
        {
          label: "Exposure",
          value: inr(reportRows.reduce((s, r) => s + Number(r["amount"] ?? 0), 0), true),
        },
      ],
      aging: [
        {
          label: "Open Invoices",
          value: String(scoped.araps.filter((r) => r.status === "outstanding").length),
        },
        { label: "Overdue Value", value: inr(overdueValue, true) },
        {
          label: "90+ Days",
          value: inr(
            overdue.filter((r) => agingBand(r) === "90+ Days").reduce((s, r) => s + r.amount, 0),
            true,
          ),
        },
        {
          label: "AR Balance",
          value: inr(
            scoped.araps
              .filter((r) => r.type === "AR" && r.status === "outstanding")
              .reduce((s, r) => s + r.amount, 0),
            true,
          ),
        },
      ],
      gst: [
        { label: "Output GST", value: inr(g.outputGst, true), delta: "18%" },
        { label: "Input Credit", value: inr(g.inputCredit, true) },
        { label: "Net Payable", value: inr(g.payable, true) },
        { label: "Taxable Supplies", value: inr(t.revenue, true) },
      ],
    };

    const cols = Object.keys(reportRows[0] ?? {});
    return {
      page: PAGE_KEY[key],
      reportName: titles[key],
      fy: "FY 2026-27",
      kpis: kpisByReport[key],
      tables: [
        {
          title: `${titles[key]} — ${rangeLabel}`,
          columns: cols.map((c) => c.replace(/_/g, " ")),
          numericFrom: key === "audit" ? 5 : key === "payroll" ? 3 : 1,
          rows: reportRows.map((r) =>
            cols.map((c) =>
              typeof r[c] === "number" && c !== "aging_bucket" && c !== "invoice_count"
                ? inr(Number(r[c]))
                : String(r[c] ?? ""),
            ),
          ),
        },
      ],
      facts: facts[key],
      ...(key === "payroll"
        ? {
            complianceNote:
              "Compliance Certificate: PF, ESI, slab-wise TDS and 4% cess computations are subject to Finance Head verification before statutory filing.",
          }
        : {}),
    };
  };

  const fullSpec = (key: ReportKey): ReportSpec => ({
    ...buildReport(key),
    org: orgName === "All organizations" ? "All Entities (Consolidated)" : orgName,
    ...(vendor !== ALL ? { vendor } : {}),
  });

  const exportCsv = () => {
    downloadCSV(`${report}-${range}.csv`, rows);
    toast.success(`${REPORTS[report]} CSV downloaded`);
    setModal(false);
  };

  const exportExcel = async () => {
    setBusy("xlsx");
    try {
      await downloadReportWorkbook(fullSpec(report));
      toast.success(`${REPORTS[report]} Excel workbook downloaded`);
      setModal(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Excel export failed");
    } finally {
      setBusy(null);
    }
  };

  const exportSnapshot = async () => {
    const el = previewRef.current;
    if (!el) return;
    setBusy("snapshot");
    const id = toast.loading("Capturing visual dashboard snapshot…");
    try {
      await generateSnapshotPdf(fullSpec(report), el);
      toast.success("Snapshot PDF downloaded", { id });
      setModal(false);
    } catch {
      toast.error("Snapshot export failed", { id });
    } finally {
      setBusy(null);
    }
  };

  const exportFormal = async () => {
    const full = fullSpec(report);
    setBusy("formal");
    const id = toast.loading(`Generating formal ${REPORTS[report]} PDF…`);
    try {
      let narrative: ReportNarrative = fallbackNarrative(full);
      if (session) {
        const result = await generateReportNarrative({
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
        if (result.summary) narrative = result;
      }
      await generateReportPdf(full, narrative);
      toast.success(`${REPORTS[report]} PDF downloaded`, { id });
      setModal(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "PDF generation failed", { id });
    } finally {
      setBusy(null);
    }
  };

  if (syncing)
    return (
      <AppShell title="Report Builder" subtitle="Loading the selected dataset…">
        <ModuleSkeleton />
      </AppShell>
    );

  return (
    <AppShell title="Report Builder" subtitle="Slice, preview and export board-ready reports">
      <ActiveDatasetBanner />
      <div className="grid gap-4 lg:grid-cols-10">
        {/* Left: slicers */}
        <Card className="border-border shadow-card lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-base">Report slicers</CardTitle>
            <CardDescription>Report type, period and entity</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label>Report type</Label>
              <Select value={report} onValueChange={(v) => setReport(v as ReportKey)}>
                <SelectTrigger className="bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(REPORTS) as ReportKey[]).map((k, i) => (
                    <SelectItem key={k} value={k}>
                      {i + 1}. {REPORTS[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Date range</Label>
              <div className="flex flex-wrap gap-1.5">
                {(Object.keys(RANGES) as RangeKey[]).map((k) => (
                  <Button
                    key={k}
                    size="sm"
                    variant={range === k ? "default" : "outline"}
                    className="h-7 px-2.5 text-xs"
                    onClick={() => setRange(k)}
                  >
                    {k === "ytd" ? "YTD FY 2026-27" : k === "custom" ? "Custom" : k.toUpperCase()}
                  </Button>
                ))}
              </div>
              {range === "custom" && (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                  <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Entity / vendor</Label>
              <Select value={vendor} onValueChange={setVendor}>
                <SelectTrigger className="bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All vendors &amp; clients</SelectItem>
                  {vendors.map((v) => (
                    <SelectItem key={v} value={v}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 border-t border-border pt-4">
              <Label>Quick download</Label>
              <Button variant="outline" className="w-full justify-start" onClick={exportCsv}>
                <FileSpreadsheet className="size-4" /> Export CSV
              </Button>
              <Button variant="outline" className="w-full justify-start" disabled={busy !== null} onClick={() => void exportExcel()}>
                {busy === "xlsx" ? <Loader2 className="size-4 animate-spin" /> : <FileSpreadsheet className="size-4" />}
                Export Financial Summary Excel
              </Button>
              <Button
                className="w-full justify-start"
                disabled={busy !== null}
                onClick={() => void exportFormal()}
              >
                {busy === "formal" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <FileText className="size-4" />
                )}
                Export Formal PDF Report
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Right: live preview */}
        <Card className="border-border shadow-card lg:col-span-7">
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">{REPORTS[report]} Preview</CardTitle>
              <CardDescription>
                FY 2026-27 · {rangeLabel} · {vendor === ALL ? "all vendors" : vendor} ·{" "}
                {rows.length} record{rows.length === 1 ? "" : "s"}
              </CardDescription>
            </div>
            <Button data-export-hide onClick={() => setModal(true)} disabled={busy !== null}>
              <Download className="size-4" /> Download Report
            </Button>
          </CardHeader>
          <CardContent>
            <div ref={previewRef}>
              <div className="mb-3 border-b border-border pb-2">
                <p className="text-sm font-bold">
                  {orgName} · {REPORTS[report]}
                </p>
                <p className="text-xs text-muted-foreground">
                  Indian Financial Year 2026-27 · {rangeLabel} · generated{" "}
                  {new Date().toLocaleDateString("en-IN")}
                </p>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {columns.map((h, i) => (
                        <TableHead key={h} className={i === 0 ? "capitalize" : "capitalize text-right"}>
                          {h.replace(/_/g, " ")}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.map((r, i) => (
                      <TableRow key={i}>
                        {columns.map((k) => {
                          const v = r[k];
                          const numeric = typeof v === "number" && k !== "aging_bucket";
                          return (
                            <TableCell
                              key={k}
                              className={
                                numeric
                                  ? "text-right font-mono tabular-nums whitespace-nowrap"
                                  : "whitespace-nowrap"
                              }
                            >
                              {numeric && k !== "invoice_count" ? inr(Number(v)) : String(v ?? "")}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                    {preview.length === 0 && (
                      <TableRow>
                        <TableCell className="py-8 text-center text-sm text-muted-foreground">
                          No records in this period — upload data or widen the date range.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
              {rows.length > preview.length && (
                <p className="pt-3 text-xs text-muted-foreground">
                  Showing first {preview.length} of {rows.length} rows. Exports include every row.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={modal} onOpenChange={setModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Select export options</DialogTitle>
            <DialogDescription>
              {REPORTS[report]} · FY 2026-27 · {rangeLabel}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Button
              variant="outline"
              onClick={exportCsv}
              className="h-auto w-full justify-start gap-3 p-3 text-left"
            >
              <FileSpreadsheet className="mt-0.5 size-5 text-brand" />
              <span>
                <span className="block text-sm font-semibold">CSV / Excel Spreadsheet</span>
                <span className="block text-xs text-muted-foreground">
                  Raw data format for financial analysis.
                </span>
              </span>
            </Button>
            <Button
              variant="outline"
              disabled={busy !== null}
              onClick={() => void exportExcel()}
              className="h-auto w-full justify-start gap-3 p-3 text-left"
            >
              {busy === "xlsx" ? <Loader2 className="mt-0.5 size-5 animate-spin text-brand" /> : <FileSpreadsheet className="mt-0.5 size-5 text-brand" />}
              <span>
                <span className="block text-sm font-semibold">Financial Summary Workbook (Excel)</span>
                <span className="block text-xs text-muted-foreground">Formatted summary and complete detail worksheets.</span>
              </span>
            </Button>
            <Button
              variant="outline"
              disabled={busy !== null}
              onClick={() => void exportSnapshot()}
              className="h-auto w-full justify-start gap-3 p-3 text-left"
            >
              {busy === "snapshot" ? (
                <Loader2 className="mt-0.5 size-5 animate-spin text-brand" />
              ) : (
                <ImageIcon className="mt-0.5 size-5 text-brand" />
              )}
              <span>
                <span className="block text-sm font-semibold">Visual Dashboard Snapshot (PDF)</span>
                <span className="block text-xs text-muted-foreground">
                  Includes the live preview styling exactly as shown.
                </span>
              </span>
            </Button>
            <Button
              variant="outline"
              disabled={busy !== null}
              onClick={() => void exportFormal()}
              className="h-auto w-full justify-start gap-3 p-3 text-left"
            >
              {busy === "formal" ? (
                <Loader2 className="mt-0.5 size-5 animate-spin text-brand" />
              ) : (
                <FileText className="mt-0.5 size-5 text-brand" />
              )}
              <span>
                <span className="block text-sm font-semibold">
                  Formal AI Executive Document (PDF)
                </span>
                <span className="block text-xs text-muted-foreground">
                  Multi-page letterhead report with AI insights and audit notes.
                </span>
              </span>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

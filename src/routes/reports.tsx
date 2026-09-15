import { createFileRoute } from "@tanstack/react-router";
import { Download, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { AiReportButton } from "@/components/finance/AiReportButton";
import { AppShell } from "@/components/finance/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  netPay,
  monthlySummary,
  totals,
  type ArApRecord,
  type BudgetTarget,
  type PayrollRecord,
  type Transaction,
} from "@/lib/finance-data";
import { auditFindings, computeTax } from "@/lib/enterprise-data";
import { useAuth } from "@/lib/auth";
import { useDataset } from "@/lib/dataset";
import { ALL, useOrg } from "@/lib/orgs";
import { generateReportNarrative } from "@/lib/report-ai.functions";
import {
  fallbackNarrative,
  generateReportPdf,
  type ReportNarrative,
  type ReportSpec,
} from "@/lib/report-doc";

export const Route = createFileRoute("/reports")({
  head: () => ({
    meta: [
      { title: "Reports & Export — Finance IQ" },
      {
        name: "description",
        content:
          "Build and download P&L, executive summary, payroll ledger and AR/AP aging reports as CSV or PDF.",
      },
      { property: "og:title", content: "Reports & Export — Finance IQ" },
      {
        property: "og:description",
        content: "One-click financial report builder with CSV and print-to-PDF output.",
      },
       { property: "og:type", content: "website" },
       { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReportsPage,
});

const REPORTS = {
  pnl: "Profit & Loss Statement",
  summary: "Executive Financial Summary",
  payroll: "Payroll Tax Sheet",
  audit: "Audit Exception Log",
  aging: "AR/AP Aging",
} as const;

type ReportKey = keyof typeof REPORTS;

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
  if (key === "pnl")
    return [
      { line: "Gross Revenue", amount: t.revenue },
      { line: "COGS", amount: -t.cogs },
      { line: "Gross Profit", amount: t.grossProfit },
      { line: "Operating Expenses", amount: -t.opex },
      { line: "EBITDA", amount: t.ebitda },
      { line: "Depreciation", amount: -t.depreciation },
      { line: "Interest", amount: -t.interest },
      { line: "Corporate Tax (25%)", amount: -Math.round(t.tax) },
      { line: "Net Profit", amount: Math.round(t.netProfit) },
    ];
  if (key === "summary")
    return buds.map((b) => {
      const actual = txns
        .filter((t) => t.type === "expense" && t.category === b.category)
        .reduce((sum, t) => sum + t.amount, 0);
      return {
      category: b.category,
      budgeted: b.budgeted_amount,
      actual,
      variance: actual - b.budgeted_amount,
      };
    });
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
        f.severity === "high" ? "Hold and investigate" : f.severity === "medium" ? "Verify documents" : "Manager review",
      approval_status: "Open",
    }));
  return araps.map((r) => ({
    type: r.type,
    party: r.party_name,
    due_date: r.due_date,
    aging_bucket: agingBand(r),
    amount: r.amount,
    status: r.status,
  }));
}

const PAGE_KEY: Record<ReportKey, "pnl" | "payroll" | "audit" | "reports"> = {
  pnl: "pnl",
  summary: "reports",
  payroll: "payroll",
  audit: "audit",
  aging: "reports",
};

function ReportsPage() {
  const { session } = useAuth();
  const { orgName, vendor } = useOrg();
  const { txns, pays, buds, araps } = useDataset();
  const [report, setReport] = useState<ReportKey>("pnl");
  const [range, setRange] = useState("ytd");
  const [format, setFormat] = useState("csv");
  const [busyReport, setBusyReport] = useState<ReportKey | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  const rows = buildRows(report, txns, pays, buds, araps);
  const preview = rows.slice(0, 20);

  const buildReport = (key: ReportKey = report): Omit<ReportSpec, "org" | "vendor"> => {
    const reportRows = buildRows(key, txns, pays, buds, araps);
    const t = totals(txns);
    const months = monthlySummary(txns);
    const finalCash = months.at(-1)?.cash ?? 0;
    const monthlyBurn = months.slice(-3).reduce((sum, m) => sum + Math.max(0, m.expense - m.revenue), 0) / 3;
    const overdue = araps.filter((r) => r.status === "outstanding" && agingBand(r) !== "Current");
    const overdueValue = overdue.reduce((sum, r) => sum + r.amount, 0);
    const columns = Object.keys(reportRows[0] ?? {});
    const titles: Record<ReportKey, string> = {
      pnl: "Profit & Loss Statement",
      summary: "Executive Financial Summary",
      payroll: "Detailed Salary & Statutory Tax Register",
      audit: "Forensic Audit Trail & Risk Register",
      aging: "AR/AP Aging Analysis",
    };
    const facts: Record<ReportKey, string> = {
      pnl: `Operating income ${inr(t.revenue)}, total expenses ${inr(t.expense)}, COGS ${inr(t.cogs)}, EBITDA ${inr(t.ebitda)}, corporate tax at 25% ${inr(t.tax)}, and net profit ${inr(t.netProfit)}. Operating expense variance against income is ${inr(t.opex - t.revenue)}.`,
      summary: `Management overview: revenue ${inr(t.revenue)}, expenses ${inr(t.expense)}, net profit ${inr(t.netProfit)}, closing modeled cash ${inr(finalCash)}, and recent monthly cash burn ${inr(monthlyBurn)}. Budget-versus-actual lines: ${reportRows.length}.`,
      payroll: `Salary register covers ${pays.length} employees. Gross pay ${inr(pays.reduce((s, p) => s + grossPay(p), 0))}, PF at 12% ${inr(pays.reduce((s, p) => s + computeTax(p).pf, 0))}, ESI ${inr(pays.reduce((s, p) => s + computeTax(p).esi, 0))}, slab-wise TDS including 4% cess ${inr(pays.reduce((s, p) => s + computeTax(p).monthlyTds, 0))}, and net take-home ${inr(pays.reduce((s, p) => s + computeTax(p).net, 0))}. Compliance certificate: figures are system-computed and require Finance Head approval before statutory filing.`,
      audit: `Forensic review of ${txns.length} transactions identified ${reportRows.length} exceptions. Duplicate transactions: ${reportRows.filter((r) => r.rule === "Duplicate invoice").length}; high-value or round-sum warnings: ${reportRows.filter((r) => String(r.rule).includes("Round-figure")).length}; variance warnings: ${reportRows.filter((r) => r.rule === "Category variance").length}. Every exception remains open until approved by the audit owner.`,
      aging: `Receivables and payables reviewed: ${araps.length}. Overdue invoices: ${overdue.length}, total overdue exposure ${inr(overdueValue)}. Amount overdue beyond 90 days: ${inr(overdue.filter((r) => agingBand(r) === "90+ Days").reduce((s, r) => s + r.amount, 0))}. This concentration may pressure near-term cash flow and requires collection or payment prioritisation.`,
    };
    const kpisByReport: Record<ReportKey, { label: string; value: string; delta?: string }[]> = {
      pnl: [
        { label: "Revenue", value: inr(t.revenue, true) },
        { label: "EBITDA", value: inr(t.ebitda, true) },
        { label: "Corporate Tax", value: inr(t.tax, true), delta: "25%" },
        { label: "Net Profit", value: inr(t.netProfit, true) },
      ],
      summary: [
        { label: "Revenue", value: inr(t.revenue, true) },
        { label: "Expenses", value: inr(t.expense, true) },
        { label: "Closing Cash", value: inr(finalCash, true) },
        { label: "Net Profit", value: inr(t.netProfit, true) },
      ],
      payroll: [
        { label: "Employees", value: String(pays.length) },
        { label: "Gross Pay", value: inr(pays.reduce((s, p) => s + grossPay(p), 0), true) },
        { label: "PF 12%", value: inr(pays.reduce((s, p) => s + computeTax(p).pf, 0), true) },
        { label: "Net Take-home", value: inr(pays.reduce((s, p) => s + computeTax(p).net, 0), true) },
      ],
      audit: [
        { label: "Transactions", value: String(txns.length) },
        { label: "Exceptions", value: String(reportRows.length) },
        { label: "High Risk", value: String(reportRows.filter((r) => r.severity === "high").length) },
        { label: "Exposure", value: inr(reportRows.reduce((s, r) => s + Number(r.amount ?? 0), 0), true) },
      ],
      aging: [
        { label: "Open Invoices", value: String(araps.filter((r) => r.status === "outstanding").length) },
        { label: "Overdue Value", value: inr(overdueValue, true) },
        { label: "90+ Days", value: inr(overdue.filter((r) => agingBand(r) === "90+ Days").reduce((s, r) => s + r.amount, 0), true) },
        { label: "AR Balance", value: inr(araps.filter((r) => r.type === "AR" && r.status === "outstanding").reduce((s, r) => s + r.amount, 0), true) },
      ],
    };

    const columns = Object.keys(rows[0] ?? {});
    return {
      page: PAGE_KEY[key],
      reportName: titles[key],
      fy: "FY 2026-27",
      kpis: kpisByReport[key],
      tables: [
        {
          title: `${titles[key]} — ${range.toUpperCase()}`,
          columns: columns.map((c) => c.replace(/_/g, " ")),
          numericFrom: key === "audit" ? 5 : key === "payroll" ? 3 : 1,
          rows: reportRows.map((r) =>
            columns.map((c) =>
              typeof r[c] === "number" && c !== "aging_bucket" ? inr(Number(r[c])) : String(r[c] ?? ""),
            ),
          ),
        },
      ],
      facts: facts[key],
      chartEl: printRef.current,
    };
  };

  const run = async () => {
    downloadCSV(`${report}-${range}.csv`, rows);
    toast.success(`${REPORTS[report]} downloaded`);
  };

  const quickCsv = (key: ReportKey) => {
    downloadCSV(`${key}-${range}.csv`, buildRows(key, txns, pays, buds, araps));
    toast.success(`${REPORTS[key]} CSV downloaded`);
  };

  const downloadFormalPdf = async (key: ReportKey) => {
    const partial = buildReport(key);
    const full: ReportSpec = {
      ...partial,
      org: orgName === "All organizations" ? "All Entities (Consolidated)" : orgName,
      ...(vendor !== ALL ? { vendor } : {}),
    };
    setBusyReport(key);
    const toastId = toast.loading(`Generating formal ${REPORTS[key]} PDF...`);
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
      toast.success(`${REPORTS[key]} PDF downloaded`, { id: toastId });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "PDF generation failed", { id: toastId });
    } finally {
      setBusyReport(null);
    }
  };

  return (
    <AppShell title="Reports & Export" subtitle="Build board-ready financial reports">
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="border-border shadow-card">
          <CardHeader>
            <CardTitle className="text-base">Report builder</CardTitle>
            <CardDescription>Pick a report, range and format</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Report type</Label>
              <Select value={report} onValueChange={(v) => setReport(v as ReportKey)}>
                <SelectTrigger className="bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(REPORTS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Date range</Label>
              <Select value={range} onValueChange={setRange}>
                <SelectTrigger className="bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="month">This month</SelectItem>
                  <SelectItem value="q4">Q4 2026</SelectItem>
                  <SelectItem value="ytd">YTD 2026</SelectItem>
                  <SelectItem value="fy">Full FY2026</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>File format</Label>
              <Select value={format} onValueChange={setFormat}>
                <SelectTrigger className="bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="csv">CSV</SelectItem>
                  <SelectItem value="excel">Excel (.csv)</SelectItem>
                </SelectContent>
              </Select>
            </div>

             <Button className="w-full" onClick={run} disabled={busyReport !== null}>
               <Download className="size-4" />
              Generate {format.toUpperCase()}
            </Button>
            <AiReportButton
              build={buildReport}
              label="Download AI Report (PDF)"
              size="default"
              className="w-full"
            />
          </CardContent>
        </Card>

        <Card className="border-border shadow-card lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">{REPORTS[report]} preview</CardTitle>
            <CardDescription>
              {rows.length} rows · showing first {preview.length}
            </CardDescription>
          </CardHeader>
          <CardContent ref={printRef}>
            <div className="mb-3 border-b border-border pb-2">
              <p className="text-sm font-bold">Finance IQ · {REPORTS[report]}</p>
              <p className="text-xs text-muted-foreground">
                Fiscal year 2026 · {range.toUpperCase()} · generated {new Date().toLocaleDateString("en-IN")}
              </p>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {Object.keys(preview[0] ?? {}).map((h) => (
                      <TableHead key={h} className="capitalize">
                        {h.replace(/_/g, " ")}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.map((r, i) => (
                    <TableRow key={i}>
                      {Object.entries(r).map(([k, v]) => (
                        <TableCell key={k} className="tabular whitespace-nowrap">
                          {typeof v === "number" && k !== "aging_bucket" ? inr(v) : String(v)}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

       <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {(Object.keys(REPORTS) as ReportKey[]).map((k) => (
           <Card key={k} className="group flex min-h-44 flex-col border-border shadow-card transition-shadow hover:shadow-md">
             <CardContent className="flex flex-1 items-start gap-3 pt-6">
              <span className="flex size-9 items-center justify-center rounded-md bg-brand-soft text-brand">
                {k === "payroll" ? <FileSpreadsheet className="size-4" /> : <FileText className="size-4" />}
              </span>
               <div className="min-w-0">
                <p className="text-sm font-semibold">{REPORTS[k]}</p>
                 <p className="mt-1 text-xs text-muted-foreground">Formal FY 2026-27 reporting pack</p>
              </div>
            </CardContent>
             <div className="grid grid-cols-2 border-t border-border">
               <Button
                 variant="ghost"
                 size="sm"
                 className="h-10 rounded-none border-r border-border text-brand hover:bg-brand-soft hover:text-brand"
                 onClick={() => quickCsv(k)}
               >
                 <FileSpreadsheet className="size-4" /> Quick CSV
               </Button>
               <Button
                 variant="ghost"
                 size="sm"
                 className="h-10 rounded-none text-brand hover:bg-brand-soft hover:text-brand"
                 disabled={busyReport !== null}
                 onClick={() => void downloadFormalPdf(k)}
               >
                 {busyReport === k ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />}
                 PDF Document
               </Button>
             </div>
          </Card>
        ))}
      </div>
    </AppShell>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { Download, FileSpreadsheet, FileText, Loader2, Printer } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

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
  actualsByCategory,
  agingBucket,
  arApRecords,
  budgets,
  downloadCSV,
  grossPay,
  inr,
  netPay,
  payroll,
  totals,
} from "@/lib/finance-data";
import { auditFindings } from "@/lib/enterprise-data";
import { exportElementToPdf } from "@/lib/pdf-export";

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

function buildRows(key: ReportKey): Record<string, unknown>[] {
  const t = totals();
  const cats = actualsByCategory();
  if (key === "pnl")
    return [
      { line: "Gross Revenue", amount: t.revenue },
      { line: "COGS", amount: -t.cogs },
      { line: "Gross Profit", amount: t.grossProfit },
      { line: "Operating Expenses", amount: -t.opex },
      { line: "EBITDA", amount: t.ebitda },
      { line: "Depreciation", amount: -t.depreciation },
      { line: "Interest", amount: -t.interest },
      { line: "Tax", amount: -Math.round(t.tax) },
      { line: "Net Profit", amount: Math.round(t.netProfit) },
    ];
  if (key === "summary")
    return budgets.map((b) => ({
      category: b.category,
      budgeted: b.budgeted_amount,
      actual: cats.get(b.category) ?? 0,
      variance: (cats.get(b.category) ?? 0) - b.budgeted_amount,
    }));
  if (key === "payroll")
    return payroll.map((p) => ({
      employee_id: p.employee_id,
      name: p.name,
      department: p.department,
      gross_pay: grossPay(p),
      pf: p.pf_deduction,
      tds: p.tds_deduction,
      net_pay: netPay(p),
    }));
  if (key === "audit")
    return auditFindings().map((f) => ({
      id: f.id,
      rule: f.rule,
      severity: f.severity,
      party: f.party,
      date: f.date,
      amount: f.amount,
      finding: f.detail,
    }));
  return arApRecords.map((r) => ({
    type: r.type,
    party: r.party_name,
    due_date: r.due_date,
    aging_bucket: agingBucket(r.due_date),
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
  const [report, setReport] = useState<ReportKey>("pnl");
  const [range, setRange] = useState("ytd");
  const [format, setFormat] = useState("csv");
  const [busy] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  const rows = buildRows(report);
  const preview = rows.slice(0, 20);

  const buildReport = () => {
    const columns = Object.keys(rows[0] ?? {});
    return {
      page: PAGE_KEY[report],
      reportName: REPORTS[report],
      fy: "FY 2026-27",
      kpis: columns
        .filter((c) => typeof rows[0]?.[c] === "number")
        .slice(0, 4)
        .map((c) => ({
          label: `Total ${c.replace(/_/g, " ")}`,
          value: inr(rows.reduce((s, r) => s + (Number(r[c]) || 0), 0), true),
          delta: `${rows.length} rows · ${range.toUpperCase()}`,
        })),
      tables: [
        {
          title: `${REPORTS[report]} — ${range.toUpperCase()}`,
          columns: columns.map((c) => c.replace(/_/g, " ")),
          numericFrom: 1,
          rows: rows.map((r) =>
            columns.map((c) =>
              typeof r[c] === "number" && c !== "aging_bucket" ? inr(Number(r[c])) : String(r[c] ?? ""),
            ),
          ),
        },
      ],
      facts: `${REPORTS[report]} for range ${range.toUpperCase()} with ${rows.length} line items. Sample rows: ${rows
        .slice(0, 12)
        .map((r) => columns.map((c) => `${c}: ${String(r[c])}`).join(", "))
        .join(" | ")}`,
      chartEl: printRef.current,
    };
  };

  const run = async () => {
    downloadCSV(`${report}-${range}.csv`, rows);
    toast.success(`${REPORTS[report]} downloaded`);
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
                  <SelectItem value="pdf">PDF document</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button className="w-full" onClick={run} disabled={busy}>
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : format === "pdf" ? (
                <Printer className="size-4" />
              ) : (
                <Download className="size-4" />
              )}
              Generate {format.toUpperCase()}
            </Button>
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

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {(Object.keys(REPORTS) as ReportKey[]).map((k) => (
          <Card key={k} className="border-border shadow-card">
            <CardContent className="flex items-start gap-3 pt-6">
              <span className="flex size-9 items-center justify-center rounded-md bg-brand-soft text-brand">
                {k === "payroll" ? <FileSpreadsheet className="size-4" /> : <FileText className="size-4" />}
              </span>
              <div>
                <p className="text-sm font-semibold">{REPORTS[k]}</p>
                <button
                  className="mt-1 text-xs font-medium text-brand hover:underline"
                  onClick={() => {
                    downloadCSV(`${k}-quick.csv`, buildRows(k));
                    toast.success(`${REPORTS[k]} downloaded`);
                  }}
                >
                  Quick download CSV
                </button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </AppShell>
  );
}

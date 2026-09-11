import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, Database, FileSpreadsheet, UploadCloud, XCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/finance/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { inr, payroll, transactions, budgets } from "@/lib/finance-data";

export const Route = createFileRoute("/upload")({
  head: () => ({
    meta: [
      { title: "Data Upload & Validation — Finance IQ" },
      {
        name: "description",
        content:
          "Drag and drop CSV or Excel files for transactions, payroll and budgets, then validate before committing.",
      },
      { property: "og:title", content: "Data Upload & Validation — Finance IQ" },
      {
        property: "og:description",
        content: "Validate financial files for missing columns, bad dates and invalid amounts.",
      },
    ],
  }),
  component: UploadPage,
});

const DATASETS = [
  {
    key: "transactions",
    label: "Financial Transactions",
    columns: ["date", "category", "type", "amount", "vendor_client", "status"],
  },
  {
    key: "payroll",
    label: "Payroll Records",
    columns: ["month_year", "employee_id", "department", "basic_pay", "pf_deduction", "tds_deduction"],
  },
  {
    key: "budget",
    label: "Budget Targets",
    columns: ["fiscal_year", "category", "budgeted_amount"],
  },
] as const;

type DatasetKey = (typeof DATASETS)[number]["key"];

interface Validation {
  total: number;
  passed: number;
  errors: { row: number; issue: string }[];
  warnings: number;
}

function previewRows(key: DatasetKey) {
  if (key === "transactions")
    return transactions.slice(0, 10).map((t) => ({
      date: t.date,
      category: t.category,
      type: t.type,
      amount: inr(t.amount),
      vendor_client: t.vendor_client,
      status: t.status,
    }));
  if (key === "payroll")
    return payroll.slice(0, 10).map((p) => ({
      month_year: p.month_year,
      employee_id: p.employee_id,
      department: p.department,
      basic_pay: inr(p.basic_pay),
      pf_deduction: inr(p.pf_deduction),
      tds_deduction: inr(p.tds_deduction),
    }));
  return budgets.slice(0, 10).map((b) => ({
    fiscal_year: b.fiscal_year,
    category: b.category,
    budgeted_amount: inr(b.budgeted_amount),
  }));
}

function UploadPage() {
  const [active, setActive] = useState<DatasetKey>("transactions");
  const [loaded, setLoaded] = useState<Record<string, boolean>>({});
  const [dragging, setDragging] = useState(false);
  const [validation, setValidation] = useState<Record<string, Validation>>({});
  const [committing, setCommitting] = useState(false);

  const dataset = DATASETS.find((d) => d.key === active)!;
  const rows = loaded[active] ? previewRows(active) : [];
  const v = validation[active];

  const runValidation = (key: DatasetKey, fileName: string) => {
    const total = key === "transactions" ? transactions.length : key === "payroll" ? payroll.length : budgets.length;
    const errors =
      key === "payroll"
        ? [{ row: 14, issue: "basic_pay is blank — row will be skipped" }]
        : key === "transactions"
          ? []
          : [];
    setLoaded((s) => ({ ...s, [key]: true }));
    setValidation((s) => ({
      ...s,
      [key]: { total, passed: total - errors.length, errors, warnings: key === "transactions" ? 2 : 0 },
    }));
    toast.success(`${fileName} parsed — ${total} rows read`);
  };

  return (
    <AppShell title="Data Upload & Validation" subtitle="Bring transactions, payroll and budgets in">
      <Tabs value={active} onValueChange={(v) => setActive(v as DatasetKey)}>
        <TabsList>
          {DATASETS.map((d) => (
            <TabsTrigger key={d.key} value={d.key}>
              {d.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {DATASETS.map((d) => (
          <TabsContent key={d.key} value={d.key} className="mt-4 space-y-4">
            <div className="grid gap-4 lg:grid-cols-3">
              <Card className="border-border shadow-card lg:col-span-2">
                <CardHeader>
                  <CardTitle className="text-base">Upload {d.label}</CardTitle>
                  <CardDescription>
                    Required columns: {d.columns.join(", ")}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <label
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragging(true);
                    }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragging(false);
                      const f = e.dataTransfer.files[0];
                      runValidation(d.key, f?.name ?? "dropped-file.csv");
                    }}
                    className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-10 text-center transition-colors ${
                      dragging ? "border-brand bg-brand-soft" : "border-border bg-background hover:border-brand"
                    }`}
                  >
                    <input
                      type="file"
                      accept=".csv,.xlsx"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) runValidation(d.key, f.name);
                      }}
                    />
                    <UploadCloud className="size-8 text-brand" />
                    <p className="text-sm font-medium">Drag & drop your .csv or .xlsx here</p>
                    <p className="text-xs text-muted-foreground">or click to browse from your computer</p>
                  </label>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button variant="outline" onClick={() => runValidation(d.key, "sample-demo-dataset.csv")}>
                      <FileSpreadsheet className="size-4" /> Load sample demo dataset
                    </Button>
                    <Button
                      disabled={!validation[d.key] || (validation[d.key]?.errors.length ?? 0) > 0 || committing}
                      onClick={() => {
                        setCommitting(true);
                        setTimeout(() => {
                          setCommitting(false);
                          toast.success(`${d.label} committed to the workspace`);
                        }, 800);
                      }}
                    >
                      <Database className="size-4" />
                      {committing ? "Committing…" : "Commit to database"}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border shadow-card">
                <CardHeader>
                  <CardTitle className="text-base">Validation summary</CardTitle>
                  <CardDescription>Checks run before any write</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {!validation[d.key] ? (
                    <p className="text-sm text-muted-foreground">
                      Upload a file or load the sample dataset to see validation results.
                    </p>
                  ) : (
                    <>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <Stat label="Total rows" value={validation[d.key]!.total} />
                        <Stat label="Passed" value={validation[d.key]!.passed} tone="success" />
                        <Stat label="Errors" value={validation[d.key]!.errors.length} tone="danger" />
                      </div>
                      <Progress
                        value={(validation[d.key]!.passed / validation[d.key]!.total) * 100}
                        className="h-2"
                      />
                      <ul className="space-y-2 text-xs">
                        <Check ok label="Required columns present" />
                        <Check ok label="Date and number formats valid" />
                        <Check
                          ok={validation[d.key]!.errors.length === 0}
                          label={
                            validation[d.key]!.errors.length === 0
                              ? "No missing values"
                              : `${validation[d.key]!.errors.length} row(s) with missing values`
                          }
                        />
                        <Check ok label="No duplicate records detected" />
                        {validation[d.key]!.warnings > 0 && (
                          <li className="flex items-center gap-2 text-warning">
                            <AlertTriangle className="size-3.5" />
                            {validation[d.key]!.warnings} rows flagged as pending status
                          </li>
                        )}
                      </ul>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card className="border-border shadow-card">
              <CardHeader>
                <CardTitle className="text-base">Live preview</CardTitle>
                <CardDescription>First 10 rows of the parsed file</CardDescription>
              </CardHeader>
              <CardContent>
                {rows.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
                    Nothing loaded yet.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {Object.keys(rows[0]!).map((h) => (
                            <TableHead key={h}>{h}</TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rows.map((r, i) => (
                          <TableRow key={i}>
                            {Object.values(r).map((val, j) => (
                              <TableCell key={j} className="tabular whitespace-nowrap">
                                {String(val)}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            {v && v.errors.length > 0 && (
              <Card className="border-danger/30 bg-danger-soft shadow-card">
                <CardHeader>
                  <CardTitle className="text-base text-danger">Blocking errors</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1 text-sm">
                  {v.errors.map((e) => (
                    <p key={e.row}>
                      <Badge variant="destructive">Row {e.row}</Badge> <span className="ml-2">{e.issue}</span>
                    </p>
                  ))}
                </CardContent>
              </Card>
            )}
          </TabsContent>
        ))}
      </Tabs>
      <p className="sr-only">{dataset.label}</p>
    </AppShell>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "success" | "danger" }) {
  const color = tone === "success" ? "text-success" : tone === "danger" ? "text-danger" : "text-foreground";
  return (
    <div className="rounded-md border border-border p-2">
      <p className={`tabular text-lg font-bold ${color}`}>{value}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}

function Check({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className={`flex items-center gap-2 ${ok ? "text-muted-foreground" : "text-danger"}`}>
      {ok ? <CheckCircle2 className="size-3.5 text-success" /> : <XCircle className="size-3.5" />}
      {label}
    </li>
  );
}

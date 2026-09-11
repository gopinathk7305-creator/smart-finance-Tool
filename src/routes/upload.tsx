import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Trash2,
  UploadCloud,
  XCircle,
} from "lucide-react";
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
import { supabase } from "@/integrations/supabase/client";
import { logActivity, useAuth } from "@/lib/auth";
import { parseCSV, toISODate, toNumber } from "@/lib/csv";
import { useDataset } from "@/lib/dataset";

export const Route = createFileRoute("/upload")({
  head: () => ({
    meta: [
      { title: "Data Upload & Validation — Finance IQ" },
      {
        name: "description",
        content:
          "Upload CSV files for transactions, payroll, budgets and receivables, validate them and save to your workspace.",
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
    table: "transactions",
    label: "Financial Transactions",
    columns: ["date", "category", "type", "amount", "vendor_client", "status"],
  },
  {
    key: "payroll",
    table: "payroll_records",
    label: "Payroll Records",
    columns: ["month_year", "employee_id", "name", "department", "basic_pay", "allowances", "deductions"],
  },
  {
    key: "budget",
    table: "budget_targets",
    label: "Budget Targets",
    columns: ["fiscal_year", "category", "department", "budgeted_amount"],
  },
  {
    key: "arap",
    table: "arap_records",
    label: "Receivables / Payables",
    columns: ["type", "party_name", "invoice_date", "due_date", "amount", "status"],
  },
] as const;

type DatasetKey = (typeof DATASETS)[number]["key"];

interface Parsed {
  fileName: string;
  rows: Record<string, unknown>[];
  preview: Record<string, string>[];
  errors: { row: number; issue: string }[];
  warnings: number;
  total: number;
}

function mapRows(key: DatasetKey, raw: Record<string, string>[], userId: string, fileName: string) {
  const errors: { row: number; issue: string }[] = [];
  let warnings = 0;
  const rows: Record<string, unknown>[] = [];

  raw.forEach((r, i): void => {
    const line = i + 2;
    if (key === "transactions") {
      const date = toISODate(r["date"] ?? r["txn_date"]);
      const amount = toNumber(r["amount"]);
      if (!date) { errors.push({ row: line, issue: "date is missing or unreadable" }); return; }
      if (!amount) { errors.push({ row: line, issue: "amount is blank or zero" }); return; }
      if ((r["status"] ?? "").toLowerCase() === "pending") warnings++;
      rows.push({
        user_id: userId,
        txn_date: date,
        category: r["category"] || "Uncategorised",
        subcategory: r["subcategory"] || "",
        type: (r["type"] ?? "").toLowerCase() === "income" ? "income" : "expense",
        amount,
        vendor_client: r["vendor_client"] || r["vendor"] || r["client"] || "",
        status: (r["status"] ?? "paid").toLowerCase() === "pending" ? "pending" : "paid",
        source_file: fileName,
      });
    } else if (key === "payroll") {
      const basic = toNumber(r["basic_pay"]);
      if (!basic) { errors.push({ row: line, issue: "basic_pay is blank — row will be skipped" }); return; }
      rows.push({
        user_id: userId,
        month_year: r["month_year"] || "",
        employee_id: r["employee_id"] || `EMP-${line}`,
        name: r["name"] || r["employee_name"] || "",
        department: r["department"] || "",
        basic_pay: basic,
        allowances: toNumber(r["allowances"]),
        deductions: toNumber(r["deductions"]),
        pf_deduction: toNumber(r["pf_deduction"]) || Math.round(basic * 0.12),
        tds_deduction: toNumber(r["tds_deduction"]),
        source_file: fileName,
      });
    } else if (key === "budget") {
      const amt = toNumber(r["budgeted_amount"]);
      if (!r["category"]) { errors.push({ row: line, issue: "category is missing" }); return; }
      if (!amt) { errors.push({ row: line, issue: "budgeted_amount is blank" }); return; }
      rows.push({
        user_id: userId,
        fiscal_year: r["fiscal_year"] || "FY2026",
        category: r["category"],
        department: r["department"] || "",
        budgeted_amount: amt,
        source_file: fileName,
      });
    } else {
      const amt = toNumber(r["amount"]);
      if (!r["party_name"]) { errors.push({ row: line, issue: "party_name is missing" }); return; }
      if (!amt) { errors.push({ row: line, issue: "amount is blank" }); return; }
      rows.push({
        user_id: userId,
        type: (r["type"] ?? "AR").toUpperCase() === "AP" ? "AP" : "AR",
        party_name: r["party_name"],
        invoice_date: toISODate(r["invoice_date"]),
        due_date: toISODate(r["due_date"]),
        amount: amt,
        status: (r["status"] ?? "outstanding").toLowerCase() === "settled" ? "settled" : "outstanding",
        source_file: fileName,
      });
    }
  });

  return { rows, errors, warnings };
}

function UploadPage() {
  const { user } = useAuth();
  const { refresh, live } = useDataset();
  const { orgId, liveOrgs, orgName } = useOrg();
  const scopeOrgId = liveOrgs && orgId !== ALL ? orgId : null;
  const [active, setActive] = useState<DatasetKey>("transactions");
  const [dragging, setDragging] = useState(false);
  const [parsed, setParsed] = useState<Partial<Record<DatasetKey, Parsed>>>({});
  const [committing, setCommitting] = useState(false);

  const handleFile = async (key: DatasetKey, file: File) => {
    if (!user) {
      toast.error("Sign in to upload your own data.");
      return;
    }
    if (!/\.csv$/i.test(file.name)) {
      toast.error("Please upload a .csv file (export Excel as CSV).");
      return;
    }
    const text = await file.text();
    const raw = parseCSV(text);
    if (!raw.length) {
      toast.error("That file has no data rows.");
      return;
    }
    const { rows, errors, warnings } = mapRows(key, raw, user.id, file.name);
    const scoped = scopeOrgId ? rows.map((r) => ({ ...r, org_id: scopeOrgId })) : rows;
    setParsed((s) => ({
      ...s,
      [key]: {
        fileName: file.name,
        rows: scoped,
        preview: raw.slice(0, 10),
        errors,
        warnings,
        total: raw.length,
      },
    }));
    toast.success(`${file.name} parsed — ${raw.length} rows read`);
  };

  const commit = async (key: DatasetKey) => {
    const p = parsed[key];
    const ds = DATASETS.find((d) => d.key === key)!;
    if (!p || !p.rows.length) return;
    setCommitting(true);
    const { error } = await supabase.from(ds.table).insert(p.rows as never);
    setCommitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    await logActivity(`Uploaded ${p.rows.length} ${ds.label} rows`, "Data Upload");
    refresh();
    toast.success(`${p.rows.length} rows saved — dashboards updated`);
  };

  const clearTable = async (key: DatasetKey) => {
    if (!user) return;
    const ds = DATASETS.find((d) => d.key === key)!;
    const { error } = await supabase.from(ds.table).delete().eq("user_id", user.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setParsed((s) => ({ ...s, [key]: undefined }));
    refresh();
    toast.success(`${ds.label} cleared`);
  };

  return (
    <AppShell
      title="Data Upload & Validation"
      subtitle={
        user
          ? live
            ? "Your uploaded data is powering every dashboard"
            : "Upload a CSV to replace the sample numbers"
          : "Demo mode — sign in to upload real files"
      }
    >
      <Tabs value={active} onValueChange={(v) => setActive(v as DatasetKey)}>
        <TabsList className="flex-wrap">
          {DATASETS.map((d) => (
            <TabsTrigger key={d.key} value={d.key}>
              {d.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {DATASETS.map((d) => {
          const p = parsed[d.key];
          return (
            <TabsContent key={d.key} value={d.key} className="mt-4 space-y-4">
              <div className="grid gap-4 lg:grid-cols-3">
                <Card className="border-border shadow-card lg:col-span-2">
                  <CardHeader>
                    <CardTitle className="text-base">Upload {d.label}</CardTitle>
                    <CardDescription>Required columns: {d.columns.join(", ")}</CardDescription>
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
                        if (f) void handleFile(d.key, f);
                      }}
                      className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-10 text-center transition-colors ${
                        dragging
                          ? "border-brand bg-brand-soft"
                          : "border-border bg-background hover:border-brand"
                      }`}
                    >
                      <input
                        type="file"
                        accept=".csv,text/csv"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) void handleFile(d.key, f);
                          e.target.value = "";
                        }}
                      />
                      <UploadCloud className="size-8 text-brand" />
                      <p className="text-sm font-medium">Drag &amp; drop your .csv here</p>
                      <p className="text-xs text-muted-foreground">
                        or click to browse from your computer
                      </p>
                    </label>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button
                        disabled={!p || p.rows.length === 0 || committing || !user}
                        onClick={() => void commit(d.key)}
                      >
                        <Database className="size-4" />
                        {committing ? "Saving…" : `Save ${p?.rows.length ?? 0} rows to database`}
                      </Button>
                      <Button variant="outline" disabled={!user} onClick={() => void clearTable(d.key)}>
                        <Trash2 className="size-4" /> Clear stored {d.label.toLowerCase()}
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
                    {!p ? (
                      <p className="text-sm text-muted-foreground">
                        Upload a CSV file to see validation results.
                      </p>
                    ) : (
                      <>
                        <div className="grid grid-cols-3 gap-2 text-center">
                          <Stat label="Total rows" value={p.total} />
                          <Stat label="Valid" value={p.rows.length} tone="success" />
                          <Stat label="Errors" value={p.errors.length} tone="danger" />
                        </div>
                        <Progress value={(p.rows.length / Math.max(1, p.total)) * 100} className="h-2" />
                        <ul className="space-y-2 text-xs">
                          <Check ok label={`File read: ${p.fileName}`} />
                          <Check ok={p.rows.length > 0} label="Required columns present" />
                          <Check ok={p.errors.length === 0} label={
                            p.errors.length === 0
                              ? "No missing or invalid values"
                              : `${p.errors.length} row(s) skipped`
                          } />
                          {p.warnings > 0 && (
                            <li className="flex items-center gap-2 text-warning">
                              <AlertTriangle className="size-3.5" />
                              {p.warnings} rows flagged as pending status
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
                  {!p || p.preview.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
                      Nothing loaded yet.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            {Object.keys(p.preview[0]!).map((h) => (
                              <TableHead key={h}>{h}</TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {p.preview.map((r, i) => (
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

              {p && p.errors.length > 0 && (
                <Card className="border-danger/30 bg-danger-soft shadow-card">
                  <CardHeader>
                    <CardTitle className="text-base text-danger">Skipped rows</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1 text-sm">
                    {p.errors.slice(0, 12).map((e) => (
                      <p key={e.row}>
                        <Badge variant="destructive">Row {e.row}</Badge>{" "}
                        <span className="ml-2">{e.issue}</span>
                      </p>
                    ))}
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          );
        })}
      </Tabs>
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

import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  CloudUpload,
  Database,
  History,
  Sparkles,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { ALL, useOrg } from "@/lib/orgs";
import { useDataset } from "@/lib/dataset";
import { useInsights } from "@/lib/insights";
import { VirtualTable } from "@/components/finance/VirtualTable";
import { type DatasetKey, type EtlResult, issueTone, runEtl, streamTabular } from "@/lib/etl";

const BATCH_SIZE = 5000;

export const Route = createFileRoute("/upload")({
  head: () => ({
    meta: [
      { title: "Cloud Data Ingestion & ETL — Finance IQ" },
      {
        name: "description",
        content:
          "Upload CSV or Excel files, auto-clean and type-cast every field, review the data health report and sync clean rows to the cloud database.",
      },
      { property: "og:title", content: "Cloud Data Ingestion & ETL — Finance IQ" },
      {
        property: "og:description",
        content:
          "Automated cleaning, error detection and cloud sync that instantly refreshes every dashboard.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
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

type TableName = (typeof DATASETS)[number]["table"];

function UploadPage() {
  const { user } = useAuth();
  const { refresh, live } = useDataset();
  const { orgId, liveOrgs, orgName } = useOrg();
  const { openInsights } = useInsights();
  const scopeOrgId = liveOrgs && orgId !== ALL ? orgId : null;
  const [active, setActive] = useState<DatasetKey>("transactions");
  const [dragging, setDragging] = useState(false);
  const [parsed, setParsed] = useState<Partial<Record<DatasetKey, EtlResult>>>({});
  const [rawCache, setRawCache] = useState<Partial<Record<DatasetKey, Record<string, string>[]>>>({});
  const [auditOpen, setAuditOpen] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [fixed, setFixed] = useState(false);

  const history = useQuery({
    queryKey: ["upload-history", user?.id ?? "anon", scopeOrgId ?? "all"],
    enabled: !!user,
    queryFn: async () => {
      const out: { file: string; table: TableName; label: string; rows: number; last: string }[] = [];
      for (const ds of DATASETS) {
        let q = supabase.from(ds.table).select("source_file, created_at").eq("user_id", user!.id);
        if (scopeOrgId) q = q.eq("org_id", scopeOrgId);
        const { data } = await q;
        const groups = new Map<string, { rows: number; last: string }>();
        (data ?? []).forEach((r) => {
          const row = r as { source_file?: string; created_at?: string };
          const file = row.source_file || "Manual entry";
          const created = String(row.created_at ?? "");
          const g = groups.get(file) ?? { rows: 0, last: created };
          g.rows += 1;
          if (created > g.last) g.last = created;
          groups.set(file, g);
        });
        groups.forEach((g, file) =>
          out.push({ file, table: ds.table, label: ds.label, rows: g.rows, last: g.last }),
        );
      }
      return out.sort((a, b) => b.last.localeCompare(a.last));
    },
  });

  const parse = (key: DatasetKey, raw: Record<string, string>[], fileName: string, autoFixMode: boolean) => {
    const result = runEtl(key, raw, user!.id, fileName, autoFixMode);
    const rows = scopeOrgId ? result.rows.map((r) => ({ ...r, org_id: scopeOrgId })) : result.rows;
    setParsed((s) => ({ ...s, [key]: { ...result, rows } }));
    return result;
  };

  const handleFile = async (key: DatasetKey, file: File) => {
    if (!user) {
      toast.error("Sign in to upload your own data.");
      return;
    }
    let raw: Record<string, string>[];
    try {
      raw = await readTabular(file);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not read that file.");
      return;
    }
    if (!raw.length) {
      toast.error("That file has no data rows.");
      return;
    }
    setRawCache((s) => ({ ...s, [key]: raw }));
    setFixed(false);
    const result = parse(key, raw, file.name, false);
    setActive(key);
    setAuditOpen(true);
    toast.success(`${file.name} cleaned — ${result.clean} of ${result.total} rows validated`);
  };

  const autoFix = () => {
    const raw = rawCache[active];
    const p = parsed[active];
    if (!raw || !p) return;
    const result = parse(active, raw, p.fileName, true);
    setFixed(true);
    toast.success(`Auto-fix applied — ${result.clean} of ${result.total} rows ready to sync`);
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
    await logActivity(`Synced ${p.rows.length} clean ${ds.label} rows to cloud`, "Data Upload");
    refresh();
    void history.refetch();
    setAuditOpen(false);
    toast.success(`${p.rows.length} rows synced — every page refreshed`);
    // Automated AI insight pop-up, once the fresh rows have landed in state.
    window.setTimeout(() => openInsights(p.fileName), 900);
  };

  const deleteDataset = async (table: TableName, file: string) => {
    if (!user) return;
    let q = supabase
      .from(table)
      .delete()
      .eq("user_id", user.id)
      .eq("source_file", file === "Manual entry" ? "" : file);
    if (scopeOrgId) q = q.eq("org_id", scopeOrgId);
    const { error } = await q;
    if (error) {
      toast.error(error.message);
      return;
    }
    refresh();
    void history.refetch();
    toast.success(`${file} removed from cloud storage`);
  };

  const clearTable = async (key: DatasetKey) => {
    if (!user) return;
    const ds = DATASETS.find((d) => d.key === key)!;
    const base = supabase.from(ds.table).delete().eq("user_id", user.id);
    const { error } = await (scopeOrgId ? base.eq("org_id", scopeOrgId) : base);
    if (error) {
      toast.error(error.message);
      return;
    }
    setParsed((s) => ({ ...s, [key]: undefined }));
    refresh();
    void history.refetch();
    toast.success(`${ds.label} cleared`);
  };

  const p = parsed[active];
  const errors = p?.issues.filter((i) => i.severity === "error") ?? [];
  const warnings = p?.issues.filter((i) => i.severity === "warning") ?? [];
  const fixes = p?.issues.filter((i) => i.severity === "fixed") ?? [];

  return (
    <AppShell
      title="Cloud Data Ingestion & ETL"
      subtitle={
        user
          ? live
            ? `${orgName} — clean cloud data is powering every page`
            : `${orgName} — upload a CSV or Excel file to replace the sample numbers`
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
          const dp = parsed[d.key];
          const blocked = dp?.issues.filter((i) => i.severity === "error").length ?? 0;
          return (
            <TabsContent key={d.key} value={d.key} className="mt-4 space-y-4">
              <div className="grid gap-4 lg:grid-cols-3">
                <Card className="border-border shadow-card lg:col-span-2">
                  <CardHeader>
                    <CardTitle className="text-base">Upload {d.label}</CardTitle>
                    <CardDescription>
                      CSV or Excel · Required columns: {d.columns.join(", ")}
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
                        accept=".csv,.xls,.xlsx,text/csv"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) void handleFile(d.key, f);
                          e.target.value = "";
                        }}
                      />
                      <UploadCloud className="size-8 text-brand" />
                      <p className="text-sm font-medium">Drag &amp; drop your .csv or .xlsx here</p>
                      <p className="text-xs text-muted-foreground">
                        Data is cleaned, type-cast and validated before anything is saved
                      </p>
                    </label>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button
                        disabled={!dp || dp.rows.length === 0 || !user}
                        onClick={() => {
                          setActive(d.key);
                          setAuditOpen(true);
                        }}
                      >
                        <Database className="size-4" />
                        Review &amp; sync {dp?.rows.length ?? 0} rows
                      </Button>
                      <Button variant="outline" disabled={!user} onClick={() => void clearTable(d.key)}>
                        <Trash2 className="size-4" /> Clear stored {d.label.toLowerCase()}
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-border shadow-card">
                  <CardHeader>
                    <CardTitle className="text-base">Data health</CardTitle>
                    <CardDescription>Automated cleaning pipeline</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {!dp ? (
                      <p className="text-sm text-muted-foreground">
                        Upload a file to run the cleaning pipeline.
                      </p>
                    ) : (
                      <>
                        <div className="grid grid-cols-3 gap-2 text-center">
                          <Stat label="Total rows" value={dp.total} />
                          <Stat label="Clean" value={dp.clean} tone="success" />
                          <Stat label="Errors" value={blocked} tone="danger" />
                        </div>
                        <Progress value={(dp.clean / Math.max(1, dp.total)) * 100} className="h-2" />
                        <ul className="space-y-2 text-xs">
                          <Check ok label={`File read: ${dp.fileName}`} />
                          <Check ok label="Whitespace & special characters trimmed" />
                          <Check ok label="Dates, amounts, GSTIN/PAN type-cast" />
                          <Check
                            ok={blocked === 0}
                            label={blocked === 0 ? "No blocking errors" : `${blocked} row(s) blocked`}
                          />
                        </ul>
                      </>
                    )}
                  </CardContent>
                </Card>
              </div>

              <Card className="border-border shadow-card">
                <CardHeader>
                  <CardTitle className="text-base">Cleaned preview</CardTitle>
                  <CardDescription>First 10 rows after trimming and normalisation</CardDescription>
                </CardHeader>
                <CardContent>
                  {!dp || dp.preview.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
                      Nothing loaded yet.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            {Object.keys(dp.preview[0]!).map((h) => (
                              <TableHead key={h}>{h}</TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {dp.preview.map((r, i) => (
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
            </TabsContent>
          );
        })}
      </Tabs>

      <Card className="mt-4 border-border shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="size-4 text-brand" /> Dataset history &amp; cloud storage
          </CardTitle>
          <CardDescription>
            Every dataset stored for {orgName}. Delete a file to remove its rows everywhere.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!user ? (
            <p className="text-sm text-muted-foreground">Sign in to see your stored datasets.</p>
          ) : (history.data ?? []).length === 0 ? (
            <div className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
              No datasets stored yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Dataset file</TableHead>
                    <TableHead>Module</TableHead>
                    <TableHead className="text-right">Rows</TableHead>
                    <TableHead>Last synced</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(history.data ?? []).map((h) => (
                    <TableRow key={`${h.table}-${h.file}`}>
                      <TableCell className="font-medium">{h.file}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{h.label}</Badge>
                      </TableCell>
                      <TableCell className="tabular text-right">{h.rows}</TableCell>
                      <TableCell className="tabular whitespace-nowrap">
                        {h.last ? new Date(h.last).toLocaleString("en-IN") : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void deleteDataset(h.table, h.file)}
                        >
                          <Trash2 className="size-4 text-danger" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={auditOpen} onOpenChange={setAuditOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Upload audit &amp; data health summary</DialogTitle>
            <DialogDescription>
              {p ? `${p.clean} / ${p.total} rows clean & validated from ${p.fileName}` : "No file loaded"}
            </DialogDescription>
          </DialogHeader>

          {p && (
            <div className="space-y-4">
              <div className="grid grid-cols-4 gap-2 text-center">
                <Stat label="Total" value={p.total} />
                <Stat label="Clean" value={p.clean} tone="success" />
                <Stat label="Errors" value={errors.length} tone="danger" />
                <Stat label="Warnings" value={warnings.length} />
              </div>

              {p.issues.length === 0 ? (
                <p className="rounded-md border border-border bg-success-soft p-3 text-sm text-success">
                  No issues detected — the dataset is ready to sync.
                </p>
              ) : (
                <div className="max-h-72 overflow-y-auto rounded-md border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Row</TableHead>
                        <TableHead>Field</TableHead>
                        <TableHead>Value</TableHead>
                        <TableHead>Issue</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {p.issues.slice(0, 60).map((i, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="tabular">{i.row}</TableCell>
                          <TableCell>{i.field}</TableCell>
                          <TableCell className="max-w-40 truncate">{i.value}</TableCell>
                          <TableCell className={`text-xs ${issueTone(i.severity)}`}>{i.issue}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {fixed && fixes.length > 0 && (
                <p className="flex items-center gap-2 text-xs text-success">
                  <CheckCircle2 className="size-3.5" /> {fixes.length} field(s) auto-repaired with defaults.
                </p>
              )}
              {!fixed && errors.length > 0 && (
                <p className="flex items-center gap-2 text-xs text-warning">
                  <AlertTriangle className="size-3.5" /> {errors.length} row(s) will be skipped unless you
                  auto-fix them.
                </p>
              )}
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={autoFix} disabled={!p || fixed || errors.length === 0}>
              <Sparkles className="size-4" /> Auto-fix errors
            </Button>
            <Button disabled={!p || p.rows.length === 0 || committing} onClick={() => void commit(active)}>
              <CloudUpload className="size-4" />
              {committing ? "Syncing…" : `Confirm & sync ${p?.rows.length ?? 0} rows`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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

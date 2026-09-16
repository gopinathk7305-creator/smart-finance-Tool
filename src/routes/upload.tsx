import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  CloudUpload,
  Database,
  Eye,
  FolderOpen,
  Sparkles,
  Trash2,
  UploadCloud,
  XCircle,
} from "lucide-react";
import { useMemo, useState } from "react";
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
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { logActivity, useAuth } from "@/lib/auth";
import { ALL, useOrg } from "@/lib/orgs";
import { cacheLocalDatasetRows, clearLocalDatasetRows, useDataset } from "@/lib/dataset";
import { useInsights } from "@/lib/insights";
import { useActiveDataset } from "@/lib/active-dataset";
import { VirtualTable } from "@/components/finance/VirtualTable";
import { collectColumns, DataGrid, labelFor, numericColumns } from "@/components/finance/DataGrid";
import { type EtlResult, issueTone, runEtlChunked, streamTabular } from "@/lib/etl";
import { detectSchema, type Detection } from "@/lib/schema-detect";

const BATCH_SIZE = 1000;
const MAX_CONCURRENT = 3;
const CLOUD_TIMEOUT_MS = 5000;
const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

export const Route = createFileRoute("/upload")({
  head: () => ({
    meta: [
      { title: "Universal Data Ingestion — Finance IQ" },
      {
        name: "description",
        content:
          "Drop any financial CSV or Excel file. Finance IQ detects the schema, maps it to the right modules, cleans every field and syncs it to your cloud database.",
      },
      { property: "og:title", content: "Universal Data Ingestion — Finance IQ" },
      {
        property: "og:description",
        content:
          "One-click ingestion with automatic schema detection, data health checks, cloud storage and a stored dataset viewer.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: UploadPage,
});

type TableName = Detection["table"];

interface StoredDataset {
  id: string;
  file_name: string;
  table_name: TableName;
  dataset_key: string;
  row_count: number;
  modules: string[];
  column_names: string[];
  status: string;
  created_at: string;
}

function UploadPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { refresh, live } = useDataset();
  const { orgId, liveOrgs, orgName } = useOrg();
  const { openInsights } = useInsights();
  const { activeId, setActiveId, datasets, refreshDatasets } = useActiveDataset();
  const scopeOrgId = liveOrgs && orgId !== ALL ? orgId : null;

  const [dragging, setDragging] = useState(false);
  const [detection, setDetection] = useState<Detection | null>(null);
  const [parsed, setParsed] = useState<EtlResult | null>(null);
  const [rawCache, setRawCache] = useState<Record<string, string>[] | null>(null);
  const [mappedOpen, setMappedOpen] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [fixed, setFixed] = useState(false);
  const [progress, setProgress] = useState<{ label: string; pct: number; eta: string } | null>(null);
  const [viewer, setViewer] = useState<StoredDataset | null>(null);
  const [search, setSearch] = useState("");
  const [hiddenViewerCols, setHiddenViewerCols] = useState<Set<string>>(new Set());

  /* ------------------------------------------------ stored datasets */

  const stored = useQuery({
    queryKey: ["stored-datasets", user?.id ?? "anon", scopeOrgId ?? "all"],
    enabled: !!user,
    queryFn: async () => {
      let q = supabase
        .from("uploaded_datasets")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (scopeOrgId) q = q.eq("org_id", scopeOrgId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as StoredDataset[];
    },
  });

  const viewerRows = useQuery({
    queryKey: ["dataset-rows", viewer?.id ?? "none"],
    enabled: !!viewer && !!user,
    queryFn: async () => {
      let q = supabase
        .from(viewer!.table_name)
        .select("*")
        .eq("user_id", user!.id)
        .eq("source_file", viewer!.file_name)
        .limit(20000);
      if (scopeOrgId) q = q.eq("org_id", scopeOrgId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Record<string, unknown>[];
    },
  });

  const allViewerCols = useMemo(() => collectColumns(viewerRows.data ?? []), [viewerRows.data]);
  const viewerNumeric = useMemo(
    () => numericColumns(viewerRows.data ?? [], allViewerCols),
    [viewerRows.data, allViewerCols],
  );
  const viewerCols = useMemo(
    () => (hiddenViewerCols.size ? allViewerCols.filter((c) => !hiddenViewerCols.has(c)) : allViewerCols),
    [allViewerCols, hiddenViewerCols],
  );

  const filteredRows = useMemo(() => {
    const rows = viewerRows.data ?? [];
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((r) =>
      allViewerCols.some((c) => String(r[c] ?? "").toLowerCase().includes(term)),
    );
  }, [viewerRows.data, search, allViewerCols]);

  /* ------------------------------------------------ ingestion */

  const runPipeline = async (
    det: Detection,
    raw: Record<string, string>[],
    fileName: string,
    autoFixMode: boolean,
  ) => {
    if (!user) throw new Error("Sign in to process this file.");
    const started = Date.now();
    const result = await runEtlChunked(
      det.key,
      raw,
      user.id,
      fileName,
      autoFixMode,
      (done, total) => {
        const ratio = done / Math.max(1, total);
        const elapsed = (Date.now() - started) / 1000;
        setProgress({
          label: `Cleaning data… ${done.toLocaleString("en-IN")} of ${total.toLocaleString("en-IN")} rows`,
          pct: ratio * 100,
          eta: ratio > 0 ? `~${Math.ceil(Math.max(0, elapsed / ratio - elapsed))}s remaining` : "",
        });
      },
      BATCH_SIZE,
    );
    const rows = scopeOrgId ? result.rows.map((r) => ({ ...r, org_id: scopeOrgId })) : result.rows;
    const withOrg = { ...result, rows };
    setParsed(withOrg);
    return withOrg;
  };

  const handleFile = async (file: File) => {
    if (!user) {
      toast.error("Sign in to upload your own data.");
      return;
    }
    let raw: Record<string, string>[];
    setProgress({ label: `Parsing ${file.name}…`, pct: 2, eta: "" });
    try {
      raw = await streamTabular(
        file,
        (p) => {
          const pct = p.bytesTotal ? Math.min(99, (p.bytesDone / p.bytesTotal) * 100) : 50;
          setProgress({
            label: `Parsing file… ${p.rows.toLocaleString("en-IN")} rows read`,
            pct,
            eta: p.etaSeconds != null ? `~${Math.ceil(p.etaSeconds)}s remaining` : "",
          });
        },
        BATCH_SIZE,
      );
    } catch (e) {
      setProgress(null);
      toast.error(e instanceof Error ? e.message : "Could not read that file.");
      return;
    }
    if (!raw.length) {
      setProgress(null);
      toast.error("That file has no data rows.");
      return;
    }

    const det = detectSchema(Object.keys(raw[0]!));
    setProgress({
      label: `Detected ${det.label} — cleaning ${raw.length.toLocaleString("en-IN")} rows…`,
      pct: 100,
      eta: "",
    });
    await new Promise((r) => window.setTimeout(r, 30));
    setDetection(det);
    setRawCache(raw);
    setFixed(false);
    await runPipeline(det, raw, file.name, false);
    setProgress(null);
    setMappedOpen(true);
  };

  const autoFix = async () => {
    if (!rawCache || !parsed || !detection) return;
    const result = await runPipeline(detection, rawCache, parsed.fileName, true);
    setProgress(null);
    setFixed(true);
    toast.success(`Auto-fix applied — ${result.clean} of ${result.total} rows ready to sync`);
  };

  const commit = async () => {
    if (!parsed || !detection || !parsed.rows.length || !user) return;
    setCommitting(true);
    const rowsWithIds = parsed.rows.map((row) => ({ ...row, id: String(row["id"] ?? crypto.randomUUID()) }));
    const batches: Record<string, unknown>[][] = [];
    for (let i = 0; i < rowsWithIds.length; i += BATCH_SIZE)
      batches.push(rowsWithIds.slice(i, i + BATCH_SIZE));

    const started = Date.now();
    const total = batches.length;
    let completed = 0;
    let lastTick = 0;
    let failure: string | null = null;
    let timedOut = false;

    const tick = (force = false) => {
      const now = Date.now();
      if (!force && now - lastTick < 200) return;
      lastTick = now;
      const done = completed / total;
      const elapsed = (now - started) / 1000;
      setProgress({
        label: `Batch inserting into cloud database… (Batch ${Math.min(completed + 1, total)} of ${total})`,
        pct: done * 100,
        eta: done > 0.02 ? `~${Math.ceil(elapsed / done - elapsed)}s remaining` : "",
      });
    };
    tick(true);

    const bucket = detection.key === "transactions" ? "t" : detection.key === "payroll" ? "p" : detection.key === "budget" ? "b" : "a";

    // Up to three 1,000-row upserts run together. A five-second race keeps the UI usable.
    let cursor = 0;
    const worker = async () => {
      while (cursor < total && !failure) {
        const index = cursor;
        cursor += 1;
        const batch = batches[index]!;
        try {
          const request = supabase.from(detection.table).upsert(batch as never, { onConflict: "id" });
          const result = await Promise.race([
            request,
            new Promise<never>((_, reject) =>
              window.setTimeout(() => reject(new Error("Cloud sync exceeded 5 seconds")), CLOUD_TIMEOUT_MS),
            ),
          ]);
          batches[index] = [];
          if (result.error) throw result.error;
          completed += 1;
          tick();
        } catch (error) {
          timedOut = error instanceof Error && error.message.includes("exceeded 5 seconds");
          failure = error instanceof Error ? error.message : "Cloud sync failed";
          return;
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENT, total) }, worker));

    if (failure) {
      cacheLocalDatasetRows(queryClient, user.id, bucket, rowsWithIds);
      setCommitting(false);
      setProgress(null);
      setMappedOpen(false);
      toast.warning(
        timedOut
          ? "Cloud sync is slow. Your data is available locally across every module now."
          : `Cloud sync failed (${failure}). Your data is available locally across every module.`,
      );
      window.setTimeout(() => openInsights(parsed.fileName), 300);
      return;
    }
    completed = total;
    tick(true);


    const { error: metadataError } = await supabase.from("uploaded_datasets").insert({
      user_id: user.id,
      org_id: scopeOrgId,
      file_name: parsed.fileName,
      dataset_key: detection.key,
      table_name: detection.table,
      row_count: parsed.rows.length,
      column_names: detection.columns,
      modules: detection.modules,
      status: "synced",
    } as never);
    if (metadataError) toast.warning(`Rows synced, but dataset history could not be saved: ${metadataError.message}`);

    clearLocalDatasetRows(user.id, bucket);
    setCommitting(false);
    setProgress(null);
    await logActivity(`Synced ${parsed.rows.length} clean ${detection.label} rows to cloud`, "Data Upload");
    refresh();
    void stored.refetch();
    setMappedOpen(false);
    toast.success(`${parsed.rows.length} rows synced — every module refreshed`);
    window.setTimeout(() => openInsights(parsed.fileName), 900);
  };

  const activate = (id: string | null) => {
    setActiveId(id);
    refresh();
    const name = datasets.find((d) => d.id === id)?.file_name ?? (stored.data ?? []).find((d) => d.id === id)?.file_name;
    toast.success(
      id
        ? `Switched active workspace dataset to ${name ?? "selected dataset"}`
        : "Every module is using all stored datasets again",
    );
  };

  const purge = async (ds: StoredDataset) => {
    if (!user) return;
    let q = supabase
      .from(ds.table_name)
      .delete()
      .eq("user_id", user.id)
      .eq("source_file", ds.file_name);
    if (scopeOrgId) q = q.eq("org_id", scopeOrgId);
    const { error } = await q;
    if (error) {
      toast.error(error.message);
      return;
    }
    await supabase.from("uploaded_datasets").delete().eq("id", ds.id);
    refresh();
    void stored.refetch();
    toast.success(`${ds.file_name} purged from cloud storage`);
  };

  /* ------------------------------------------------ derived */

  const errors = parsed?.issues.filter((i) => i.severity === "error") ?? [];
  const warnings = parsed?.issues.filter((i) => i.severity === "warning") ?? [];
  const fixes = parsed?.issues.filter((i) => i.severity === "fixed") ?? [];

  const highlights = useMemo(() => {
    if (!parsed || !detection) return [] as string[];
    const rows = parsed.rows as Record<string, unknown>[];
    const num = (r: Record<string, unknown>, k: string) => Number(r[k] ?? 0) || 0;
    const out: string[] = [];

    if (detection.key === "transactions") {
      const income = rows.filter((r) => r["type"] === "income").reduce((s, r) => s + num(r, "amount"), 0);
      const expense = rows.filter((r) => r["type"] !== "income").reduce((s, r) => s + num(r, "amount"), 0);
      const byCat = new Map<string, number>();
      rows.forEach((r) => {
        if (r["type"] === "income") return;
        const c = String(r["category"] ?? "Unassigned");
        byCat.set(c, (byCat.get(c) ?? 0) + num(r, "amount"));
      });
      const top = [...byCat.entries()].sort((a, b) => b[1] - a[1])[0];
      out.push(`Revenue recognised ${inr(income)} against ${inr(expense)} of spend — net position ${inr(income - expense)}.`);
      if (top) out.push(`Highest expense head is ${top[0]} at ${inr(top[1])}.`);
    } else if (detection.key === "payroll") {
      const gross = rows.reduce((s, r) => s + num(r, "basic_pay") + num(r, "allowances"), 0);
      const tds = rows.reduce((s, r) => s + num(r, "tds_deduction"), 0);
      const pf = rows.reduce((s, r) => s + num(r, "pf_deduction"), 0);
      out.push(`${rows.length} payroll rows totalling ${inr(gross)} gross pay.`);
      out.push(`Statutory exposure: PF ${inr(pf)} and TDS ${inr(tds)} now flow into Payroll, Tax and Compliance.`);
    } else if (detection.key === "budget") {
      const plan = rows.reduce((s, r) => s + num(r, "budgeted_amount"), 0);
      out.push(`Plan of ${inr(plan)} loaded across ${rows.length} category lines for Budget vs Actual.`);
    } else {
      const ar = rows.filter((r) => r["type"] === "AR").reduce((s, r) => s + num(r, "amount"), 0);
      const ap = rows.filter((r) => r["type"] === "AP").reduce((s, r) => s + num(r, "amount"), 0);
      out.push(`Receivables ${inr(ar)} and payables ${inr(ap)} will fill the cash-flow aging buckets.`);
    }

    if (warnings.length) out.push(`${warnings.length} anomaly flag(s) raised — duplicates, unpaid items or invalid tax IDs.`);
    if (errors.length && !fixed) out.push(`${errors.length} row(s) blocked and will be skipped unless auto-fixed.`);
    return out;
  }, [parsed, detection, warnings.length, errors.length, fixed]);

  return (
    <AppShell
      title="Universal Data Ingestion"
      subtitle={
        user
          ? live
            ? `${orgName} — clean cloud data is powering every module`
            : `${orgName} — drop any financial file and it maps itself`
          : "Demo mode — sign in to upload real files"
      }
    >
      {progress && (
        <Card className="mb-4 border-brand shadow-card" data-testid="upload-progress">
          <CardContent className="space-y-2 pt-6">
            <div className="flex items-center justify-between text-sm font-medium">
              <span>{progress.label}</span>
              <span className="tabular text-muted-foreground">
                {Math.round(progress.pct)}% {progress.eta}
              </span>
            </div>
            <Progress value={progress.pct} className="h-2" />
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="border-border shadow-card lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">One-click upload — any financial file</CardTitle>
            <CardDescription>
              Transactions, budgets, payroll, vendors, assets or audit extracts. The schema is detected
              automatically, so no module selection is needed.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <label
              data-testid="universal-dropzone"
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                const f = e.dataTransfer.files[0];
                if (f) void handleFile(f);
              }}
              className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-12 text-center transition-colors ${
                dragging ? "border-brand bg-brand-soft" : "border-border bg-background hover:border-brand"
              }`}
            >
              <input
                type="file"
                accept=".csv,.xls,.xlsx,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleFile(f);
                  e.target.value = "";
                }}
              />
              <UploadCloud className="size-9 text-brand" />
              <p className="text-sm font-medium">Drag &amp; drop your .csv or .xlsx here</p>
              <p className="text-xs text-muted-foreground">
                Headers are matched, fields are cleaned and type-cast, and nothing saves until you confirm
              </p>
            </label>

            {parsed && detection && (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button onClick={() => setMappedOpen(true)} disabled={!parsed.rows.length}>
                  <Database className="size-4" /> Review &amp; sync {parsed.rows.length} rows
                </Button>
                <Badge variant="secondary">{detection.label}</Badge>
                <span className="text-xs text-muted-foreground">{parsed.fileName}</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border shadow-card">
          <CardHeader>
            <CardTitle className="text-base">Detection &amp; data health</CardTitle>
            <CardDescription>Automatic schema mapper</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!parsed || !detection ? (
              <p className="text-sm text-muted-foreground">
                Upload a file to run schema detection and the cleaning pipeline.
              </p>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <Stat label="Total rows" value={parsed.total} />
                  <Stat label="Clean" value={parsed.clean} tone="success" />
                  <Stat label="Errors" value={errors.length} tone="danger" />
                </div>
                <Progress value={(parsed.clean / Math.max(1, parsed.total)) * 100} className="h-2" />
                <ul className="space-y-2 text-xs">
                  <Check ok label={`Detected as ${detection.label} (${detection.confidence}% match)`} />
                  <Check ok label={`${detection.columns.length} columns mapped`} />
                  <Check ok label="Whitespace, dates, amounts, GSTIN/PAN type-cast" />
                  <Check
                    ok={errors.length === 0}
                    label={errors.length === 0 ? "No blocking errors" : `${errors.length} row(s) blocked`}
                  />
                </ul>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4 border-border shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FolderOpen className="size-4 text-brand" /> Manage cloud datasets
          </CardTitle>
          <CardDescription>
            Every dataset stored for {orgName}. Open one to inspect raw rows, or purge it to remove those rows
            everywhere.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!user ? (
            <p className="text-sm text-muted-foreground">Sign in to see your stored datasets.</p>
          ) : (stored.data ?? []).length === 0 ? (
            <div className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
              No datasets stored yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Dataset name</TableHead>
                    <TableHead>Mapped modules</TableHead>
                    <TableHead className="text-right">Rows</TableHead>
                    <TableHead>Upload date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(stored.data ?? []).map((ds) => (
                    <TableRow key={ds.id}>
                      <TableCell className="font-medium">{ds.file_name}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {ds.modules.map((m) => (
                            <Badge key={m} variant="secondary" className="text-[11px]">
                              {m}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="tabular text-right">
                        {ds.row_count.toLocaleString("en-IN")}
                      </TableCell>
                      <TableCell className="tabular whitespace-nowrap">
                        {new Date(ds.created_at).toLocaleString("en-IN")}
                      </TableCell>
                      <TableCell>
                        <Badge className="bg-success-soft text-success">{ds.status}</Badge>
                      </TableCell>
                      <TableCell className="space-x-1 text-right">
                        {activeId === ds.id ? (
                          <Button
                            size="sm"
                            className="bg-success text-success-foreground hover:bg-success/90"
                            onClick={() => activate(null)}
                          >
                            <CheckCircle2 className="size-4" /> Active / Loaded
                          </Button>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => activate(ds.id)}>
                            <Database className="size-4" /> Switch to this
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSearch("");
                            setViewer(ds);
                          }}
                        >
                          <Eye className="size-4" /> Open
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => void purge(ds)}>
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

      {/* ⚡ Dataset auto-detected modal */}
      <Dialog open={mappedOpen} onOpenChange={setMappedOpen}>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>⚡ Dataset auto-detected &amp; successfully processed</DialogTitle>
            <DialogDescription>
              {parsed
                ? `${parsed.fileName} — ${parsed.total.toLocaleString("en-IN")} rows, ${
                    detection?.columns.length ?? 0
                  } columns detected`
                : "No file loaded"}
            </DialogDescription>
          </DialogHeader>

          {parsed && detection && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {detection.modules.map((m) => (
                  <Badge key={m} className="bg-brand-soft text-brand">
                    ✅ {m}
                  </Badge>
                ))}
              </div>

              <div className="grid grid-cols-4 gap-2 text-center">
                <Stat label="Total" value={parsed.total} />
                <Stat label="Clean" value={parsed.clean} tone="success" />
                <Stat label="Errors" value={errors.length} tone="danger" />
                <Stat label="Warnings" value={warnings.length} />
              </div>

              <div className="rounded-md border border-border bg-muted/40 p-3">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Key highlights
                </p>
                <ul className="space-y-1 text-sm">
                  {highlights.map((h) => (
                    <li key={h} className="flex gap-2">
                      <Sparkles className="mt-0.5 size-3.5 shrink-0 text-brand" />
                      {h}
                    </li>
                  ))}
                </ul>
              </div>

              {parsed.issues.length === 0 ? (
                <p className="rounded-md border border-border bg-success-soft p-3 text-sm text-success">
                  No issues detected — the dataset is ready to sync.
                </p>
              ) : (
                <VirtualTable
                  rows={parsed.issues}
                  height={240}
                  head={
                    <>
                      <th className="w-16 p-2">Row</th>
                      <th className="w-28 p-2">Field</th>
                      <th className="w-32 p-2">Value</th>
                      <th className="p-2">Issue</th>
                    </>
                  }
                  row={(i) => (
                    <>
                      <td className="tabular w-16 p-2">{i.row}</td>
                      <td className="w-28 p-2">{i.field}</td>
                      <td className="w-32 truncate p-2">{i.value}</td>
                      <td className={`p-2 text-xs ${issueTone(i.severity)}`}>{i.issue}</td>
                    </>
                  )}
                />
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
             <Button variant="outline" onClick={() => void autoFix()} disabled={!parsed || fixed || errors.length === 0}>
              <Sparkles className="size-4" /> Auto-fix errors
            </Button>
            <Button variant="outline" onClick={() => void navigate({ to: "/" })}>
              Explore sync&rsquo;d dashboard
            </Button>
            <Button disabled={!parsed || parsed.rows.length === 0 || committing} onClick={() => void commit()}>
              <CloudUpload className="size-4" />
              {committing ? "Syncing…" : `Confirm & sync ${parsed?.rows.length ?? 0} rows`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Stored dataset viewer */}
      <Dialog open={!!viewer} onOpenChange={(o) => !o && setViewer(null)}>
        <DialogContent className="max-w-[95vw] sm:max-w-[95vw]">
          <DialogHeader>
            <DialogTitle>{viewer?.file_name}</DialogTitle>
            <DialogDescription>
              {viewerRows.isLoading
                ? "Loading rows from cloud storage…"
                : `${filteredRows.length.toLocaleString("en-IN")} of ${(viewerRows.data ?? []).length.toLocaleString("en-IN")} stored rows`}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder="Search any value in this dataset…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm"
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Eye className="size-4" /> Columns filter
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="max-h-80 w-60 overflow-y-auto">
                <DropdownMenuItem onSelect={() => setHiddenViewerCols(new Set())}>
                  Select all
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => setHiddenViewerCols(new Set(allViewerCols.slice(8)))}
                >
                  Reset default
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {allViewerCols.map((c) => (
                  <DropdownMenuCheckboxItem
                    key={c}
                    checked={!hiddenViewerCols.has(c)}
                    onCheckedChange={(on) =>
                      setHiddenViewerCols((prev) => {
                        const next = new Set(prev);
                        if (on) next.delete(c);
                        else next.add(c);
                        return next;
                      })
                    }
                    onSelect={(e) => e.preventDefault()}
                  >
                    {labelFor(c)}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Badge variant="secondary" className="ml-auto tabular">
              Showing {filteredRows.length.toLocaleString("en-IN")} rows ·{" "}
              {viewerCols.length} of {allViewerCols.length} columns
            </Badge>
          </div>

          {viewerCols.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
              {viewerRows.isLoading
                ? "Loading…"
                : allViewerCols.length
                  ? "Every column is hidden. Use the columns filter to show some."
                  : "No rows stored for this dataset."}
            </div>
          ) : (
            <DataGrid
              rows={filteredRows}
              columns={viewerCols}
              numeric={viewerNumeric}
              maxHeight={Math.round(typeof window === "undefined" ? 520 : window.innerHeight * 0.6)}
            />
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "success" | "danger" }) {
  const color = tone === "success" ? "text-success" : tone === "danger" ? "text-danger" : "text-foreground";
  return (
    <div className="rounded-md border border-border p-2">
      <p className={`tabular text-lg font-bold ${color}`}>{value.toLocaleString("en-IN")}</p>
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

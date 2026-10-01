import { createFileRoute } from "@tanstack/react-router";
import { Banknote, Download, Percent, Receipt, Users } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { AiReportButton } from "@/components/finance/AiReportButton";
import { chartLabelProps, moneyDataLabel } from "@/components/finance/ChartDataLabels";
import { ActiveDatasetBanner } from "@/components/finance/ActiveDatasetBanner";
import { AppShell } from "@/components/finance/AppShell";
import { KpiCard } from "@/components/finance/KpiCard";
import { ModuleSkeleton } from "@/components/finance/ModuleSkeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { downloadCSV, grossPay, inr, netPay, type PayrollRecord } from "@/lib/finance-data";
import { useDataset } from "@/lib/dataset";
import { useActiveDataset } from "@/lib/active-dataset";
import { computeTax, type TaxComputation } from "@/lib/enterprise-data";
import { payrollDepartment } from "@/lib/module-derive";
import { explainPayroll } from "@/lib/ai.functions";
import { Sparkles } from "lucide-react";

export const Route = createFileRoute("/payroll")({
  head: () => ({
    meta: [
      { title: "Payroll Analytics — Finance IQ" },
      {
        name: "description",
        content:
          "Gross vs net pay, PF and TDS withholdings and department-level payroll cost distribution.",
      },
      { property: "og:title", content: "Payroll Analytics — Finance IQ" },
      {
        property: "og:description",
        content: "Employee-level payroll ledger with statutory deductions and department analytics.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PayrollPage,
});

function PayrollPage() {
  const { pays: payroll } = useDataset();
  const { syncing } = useActiveDataset();
  const [query, setQuery] = useState("");
  const [taxFor, setTaxFor] = useState<PayrollRecord | null>(null);
  const [regime, setRegime] = useState<"new" | "old">("new");

  const filtered = useMemo(
    () =>
      payroll.filter((p) =>
        `${p.name} ${p.employee_id} ${p.department}`.toLowerCase().includes(query.toLowerCase()),
      ),
    [query, payroll],
  );

  const totalCost = payroll.reduce((s, p) => s + grossPay(p), 0);
  const totalPf = payroll.reduce((s, p) => s + p.pf_deduction, 0);
  const totalTds = payroll.reduce((s, p) => s + p.tds_deduction, 0);
  const avgSalary = payroll.length ? totalCost / payroll.length : 0;

  const byDept = Object.values(
    payroll.reduce<Record<string, { department: string; basic: number; allowances: number; deductions: number; total: number }>>(
      (acc, p) => {
        const department = payrollDepartment({ department: p.department });
        const d = (acc[department] ??= {
          department,
          basic: 0,
          allowances: 0,
          deductions: 0,
          total: 0,
        });
        d.basic += p.basic_pay;
        d.allowances += p.allowances;
        d.deductions += p.pf_deduction + p.tds_deduction + p.deductions;
        d.total = d.basic + d.allowances + d.deductions;
        return acc;
      },
      {},
    ),
  );

  // Renders only the stack total above each bar — no text inside segments.
  const deptTotalBadge = (props: { x?: number | string | undefined; y?: number | string | undefined; index?: number | undefined }) => {
    const x = Number(props.x);
    const y = Number(props.y);
    const item = byDept[Number(props.index)];
    if (!Number.isFinite(x) || !Number.isFinite(y) || !item) return null;
    return (
      <text x={x} y={y} textAnchor="middle" className="chart-data-label">
        {moneyDataLabel(item.total)}
      </text>
    );
  };

  const exportCsv = () => {
    downloadCSV(
      "payroll-dec-2026.csv",
      filtered.map((p) => ({
        employee_id: p.employee_id,
        name: p.name,
        department: p.department,
        basic_pay: p.basic_pay,
        allowances: p.allowances,
        pf: p.pf_deduction,
        tds: p.tds_deduction,
        other_deductions: p.deductions,
        net_pay: netPay(p),
      })),
    );
    toast.success("Payroll sheet exported");
  };

  const chartsRef = useRef<HTMLDivElement>(null);
  const totalNet = payroll.reduce((s, p) => s + netPay(p), 0);
  const totalOther = payroll.reduce((s, p) => s + p.deductions, 0);

  const buildReport = () => ({
    page: "payroll" as const,
    reportName: "Salary Register & Statutory Deductions Summary",
    fy: "FY 2026-27",
    kpis: [
      { label: "Total Payroll Cost (Gross)", value: inr(totalCost, true), delta: `${payroll.length} employees` },
      { label: "Average Salary", value: inr(avgSalary, true), delta: "Per employee / month" },
      { label: "PF / ESI Deductions", value: inr(totalPf, true), delta: "PF 12% · ESI 3.25%" },
      { label: "TDS Withheld", value: inr(totalTds, true), delta: "Remit by 7th" },
    ],
    tables: [
      {
        title: "Employee Salary Register",
        columns: ["Emp ID", "Name", "Department", "Basic", "Allowances", "PF", "TDS", "Net Pay"],
        numericFrom: 3,
        rows: filtered.map((p) => [
          p.employee_id,
          p.name,
          p.department,
          inr(p.basic_pay),
          inr(p.allowances),
          inr(p.pf_deduction),
          inr(p.tds_deduction),
          inr(netPay(p)),
        ]),
      },
      {
        title: "Department-wise Payroll Allocation",
        columns: ["Department", "Basic", "Allowances", "Deductions", "Net Payout"],
        numericFrom: 1,
        rows: byDept.map((d) => [
          d.department,
          inr(d.basic),
          inr(d.allowances),
          inr(d.deductions),
          inr(d.basic + d.allowances - d.deductions),
        ]),
      },
    ],
    facts: `Headcount ${payroll.length}. Gross payroll ${inr(totalCost)}, PF ${inr(totalPf)}, TDS ${inr(totalTds)}, other deductions ${inr(totalOther)}, net take-home ${inr(totalNet)}. Tax regime selected: ${regime}. Statutory basis: employer PF 12% of basic, ESI 3.25%, slab-wise TDS plus 4% health and education cess.`,
    chartEl: chartsRef.current,
  });

  if (syncing)
    return (
      <AppShell title="Payroll Analytics" subtitle="Loading the selected dataset…">
        <ModuleSkeleton />
      </AppShell>
    );

  return (
    <AppShell
      title="Payroll Analytics"
      subtitle={
        payroll.length
          ? `Current payroll run · ${payroll.length} employee${payroll.length === 1 ? "" : "s"} · PF 12%, ESI 3.25%, slab-wise TDS + 4% cess`
          : "No payroll records yet — upload a payroll CSV from Data Upload"
      }
    >
      <ActiveDatasetBanner />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total Payroll Cost" value={inr(totalCost, true)} icon={Banknote} tone="neutral" hint="Gross monthly" />
        <KpiCard label="Average Salary" value={inr(avgSalary, true)} icon={Users} hint="Per employee" />
        <KpiCard label="PF / ESI Deductions" value={inr(totalPf, true)} icon={Percent} tone="warning" hint="Statutory" />
        <KpiCard label="TDS Withheld" value={inr(totalTds, true)} icon={Receipt} tone="danger" hint="Remit by 7th" />
      </div>

      <div ref={chartsRef} className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card className="border-border shadow-card">
          <CardHeader>
            <CardTitle className="text-base">Department-wise Payroll Allocation</CardTitle>
            <CardDescription>Basic, allowances and deductions stacked</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px] min-w-0 overflow-x-auto">
            <div className="h-full min-w-[540px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byDept} margin={{ top: 28, right: 10, bottom: 6, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="department" tickLine={false} axisLine={false} fontSize={12} interval={0} />
                <YAxis tickFormatter={(v) => inr(Number(v), true)} tickLine={false} axisLine={false} fontSize={12} width={70} />
                <Tooltip content={<PayrollAllocationTooltip />} cursor={{ fill: "var(--secondary)" }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="basic" stackId="a" name="Basic" fill="var(--primary)" />
                <Bar dataKey="allowances" stackId="a" name="Allowances" fill="var(--brand)" minPointSize={8} />
                <Bar dataKey="deductions" stackId="a" name="Deductions" fill="var(--warning)" minPointSize={8} radius={[4, 4, 0, 0]}>
                  {/* Total badge sits above the stack; segments themselves stay text-free. */}
                  <LabelList dataKey="total" position="top" offset={4} content={deptTotalBadge} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border shadow-card">
          <CardHeader>
            <CardTitle className="text-base">Gross vs Net Pay by Department</CardTitle>
            <CardDescription>Take-home after statutory deductions</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                margin={{ top: 24 }}
                data={byDept.map((d) => ({
                  department: d.department,
                  gross: d.basic + d.allowances,
                  net: d.basic + d.allowances - d.deductions,
                }))}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="department" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis tickFormatter={(v) => inr(Number(v), true)} tickLine={false} axisLine={false} fontSize={12} width={70} />
                <Tooltip formatter={(v) => inr(Number(v))} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="gross" name="Gross" fill="var(--brand)" radius={[4, 4, 0, 0]}>
                  <LabelList dataKey="gross" position="top" offset={5} {...chartLabelProps} formatter={moneyDataLabel} />
                </Bar>
                <Bar dataKey="net" name="Net" fill="var(--success)" radius={[4, 4, 0, 0]}>
                  <LabelList dataKey="net" position="top" offset={5} {...chartLabelProps} formatter={moneyDataLabel} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4 border-border shadow-card">
        <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-base">Employee Payroll Ledger</CardTitle>
            <CardDescription>{filtered.length} records</CardDescription>
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="Search employee or department"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-56 bg-background"
            />
            <Button variant="outline" onClick={exportCsv}>
              <Download className="size-4" /> Export CSV
            </Button>
            <AiReportButton build={buildReport} size="default" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead className="text-right">Basic</TableHead>
                  <TableHead className="text-right">Allowances</TableHead>
                  <TableHead className="text-right">PF</TableHead>
                  <TableHead className="text-right">TDS</TableHead>
                  <TableHead className="text-right">Other</TableHead>
                  <TableHead className="text-right">Net Pay</TableHead>
                  <TableHead className="text-right">Tax</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.employee_id}</TableCell>
                    <TableCell>{p.name}</TableCell>
                    <TableCell className="text-muted-foreground">{p.department}</TableCell>
                    <TableCell className="tabular text-right">{inr(p.basic_pay)}</TableCell>
                    <TableCell className="tabular text-right">{inr(p.allowances)}</TableCell>
                    <TableCell className="tabular text-right text-warning">{inr(p.pf_deduction)}</TableCell>
                    <TableCell className="tabular text-right text-warning">{inr(p.tds_deduction)}</TableCell>
                    <TableCell className="tabular text-right">{inr(p.deductions)}</TableCell>
                    <TableCell className="tabular text-right font-semibold">{inr(netPay(p))}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => setTaxFor(p)}>
                        View Tax Breakdown
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} className="py-10 text-center text-sm text-muted-foreground">
                      {payroll.length === 0
                        ? "No payroll records for this entity yet — upload a payroll CSV from Data Upload."
                        : `No employees match “${query}”.`}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <TaxDialog record={taxFor} regime={regime} setRegime={setRegime} onClose={() => setTaxFor(null)} />
    </AppShell>
  );
}

function precisePayrollAmount(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "−" : "";
  if (abs >= 1_00_00_000) return `${sign}₹${(abs / 1_00_00_000).toFixed(2)}Cr`;
  if (abs >= 1_00_000) return `${sign}₹${(abs / 1_00_000).toFixed(2)}L`;
  return inr(value);
}

function PayrollAllocationTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: ReadonlyArray<{ name?: string; value?: number | string }>;
  label?: string | number;
}) {
  if (!active || !payload?.length) return null;
  const colors: Record<string, string> = {
    Basic: "bg-primary",
    Allowances: "bg-brand",
    Deductions: "bg-warning",
  };
  return (
    <div className="min-w-44 rounded-md border border-border bg-popover p-3 text-popover-foreground shadow-md">
      <p className="mb-2 text-xs font-semibold">{label}</p>
      {payload.map((item) => (
        <div key={item.name} className="flex items-center justify-between gap-5 py-0.5 text-xs">
          <span className="flex items-center gap-2">
            <span className={`size-2.5 rounded-sm ${colors[item.name ?? ""] ?? "bg-muted"}`} />
            {item.name}
          </span>
          <span className="tabular font-semibold">{precisePayrollAmount(Number(item.value) || 0)}</span>
        </div>
      ))}
    </div>
  );
}

function TaxDialog({
  record,
  regime,
  setRegime,
  onClose,
}: {
  record: PayrollRecord | null;
  regime: "new" | "old";
  setRegime: (r: "new" | "old") => void;
  onClose: () => void;
}) {
  if (!record) return null;
  const c = computeTax(record, regime);

  const Line = ({ label, value, tone }: { label: string; value: string; tone?: string }) => (
    <div className="flex items-center justify-between border-b border-border py-2 text-sm last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className={`tabular font-medium ${tone ?? ""}`}>{value}</span>
    </div>
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Tax breakdown — {record.name}</DialogTitle>
          <DialogDescription>
            {record.employee_id} · {record.department} · December 2026
          </DialogDescription>
        </DialogHeader>

        <Tabs value={regime} onValueChange={(v) => setRegime(v as "new" | "old")}>
          <TabsList>
            <TabsTrigger value="new">New regime</TabsTrigger>
            <TabsTrigger value="old">Old regime</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="mt-2">
          <p className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Monthly salary build-up
          </p>
          <Line label="Basic pay" value={inr(record.basic_pay)} />
          <Line label="Allowances" value={inr(record.allowances)} />
          <Line label="Gross salary" value={inr(c.gross)} tone="font-semibold" />
          <Line label="Employee PF (12% of basic)" value={`- ${inr(c.pf)}`} tone="text-warning" />
          <Line
            label={`ESI (0.75% ${c.esi ? "" : "— not applicable, gross > ₹21,000"})`}
            value={`- ${inr(c.esi)}`}
            tone="text-warning"
          />
        </div>

        <div>
          <p className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Annual income tax slabs ({regime === "new" ? "New" : "Old"} regime)
          </p>
          <div className="rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Slab</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                  <TableHead className="text-right">Taxable</TableHead>
                  <TableHead className="text-right">Tax</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {c.rows.map((r) => (
                  <TableRow key={r.from}>
                    <TableCell className="tabular">
                      {inr(r.from)} – {r.to === Infinity ? "above" : inr(r.to)}
                    </TableCell>
                    <TableCell className="tabular text-right">{(r.rate * 100).toFixed(0)}%</TableCell>
                    <TableCell className="tabular text-right">{inr(r.taxable)}</TableCell>
                    <TableCell className="tabular text-right font-medium">{inr(r.tax)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="mt-2">
            <Line label="Taxable annual income (after standard deduction)" value={inr(c.annualGross)} />
            <Line label="Health & education cess (4%)" value={inr(c.cess)} />
            <Line label="Annual tax liability" value={inr(c.annualTax)} tone="font-semibold" />
            <Line label="Monthly TDS" value={`- ${inr(c.monthlyTds)}`} tone="text-danger" />
          </div>
        </div>

        <AiExplain record={record} regime={regime} c={c} />

        <div className="rounded-lg bg-secondary p-3">
          <Line label="Other deductions" value={`- ${inr(c.otherDeductions)}`} />
          <div className="flex items-center justify-between pt-2">
            <span className="text-sm font-semibold">Net take-home salary</span>
            <span className="tabular text-lg font-bold text-success">{inr(c.net)}</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AiExplain({
  record,
  regime,
  c,
}: {
  record: PayrollRecord;
  regime: "new" | "old";
  c: TaxComputation;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      const res = await explainPayroll({
        data: {
          name: record.name,
          department: record.department,
          regime,
          gross: c.gross,
          basic: record.basic_pay,
          allowances: record.allowances,
          pf: c.pf,
          esi: c.esi,
          taxableIncome: c.annualGross,
          annualTax: c.annualTax,
          cess: c.cess,
          monthlyTds: c.monthlyTds,
          netPay: c.net,
        },
      });
      setText(res.text);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not generate the explanation.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold">Plain-English explanation</p>
        <Button size="sm" variant="outline" onClick={() => void run()} disabled={busy}>
          <Sparkles className="size-4" />
          {busy ? "Thinking…" : text ? "Regenerate" : "Explain this payslip"}
        </Button>
      </div>
      {text && <p className="mt-2 text-sm whitespace-pre-wrap text-muted-foreground">{text}</p>}
    </div>
  );
}

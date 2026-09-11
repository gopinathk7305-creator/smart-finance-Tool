import { createFileRoute } from "@tanstack/react-router";
import { Banknote, Download, Percent, Receipt, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { AppShell } from "@/components/finance/AppShell";
import { KpiCard } from "@/components/finance/KpiCard";
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
import { downloadCSV, grossPay, inr, netPay, payroll, type PayrollRecord } from "@/lib/finance-data";
import { computeTax } from "@/lib/enterprise-data";

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
    ],
  }),
  component: PayrollPage,
});

function PayrollPage() {
  const [query, setQuery] = useState("");
  const [taxFor, setTaxFor] = useState<PayrollRecord | null>(null);
  const [regime, setRegime] = useState<"new" | "old">("new");

  const filtered = useMemo(
    () =>
      payroll.filter((p) =>
        `${p.name} ${p.employee_id} ${p.department}`.toLowerCase().includes(query.toLowerCase()),
      ),
    [query],
  );

  const totalCost = payroll.reduce((s, p) => s + grossPay(p), 0);
  const totalPf = payroll.reduce((s, p) => s + p.pf_deduction, 0);
  const totalTds = payroll.reduce((s, p) => s + p.tds_deduction, 0);
  const avgSalary = totalCost / payroll.length;

  const byDept = Object.values(
    payroll.reduce<Record<string, { department: string; basic: number; allowances: number; deductions: number }>>(
      (acc, p) => {
        const d = (acc[p.department] ??= {
          department: p.department,
          basic: 0,
          allowances: 0,
          deductions: 0,
        });
        d.basic += p.basic_pay;
        d.allowances += p.allowances;
        d.deductions += p.pf_deduction + p.tds_deduction + p.deductions;
        return acc;
      },
      {},
    ),
  );

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

  return (
    <AppShell title="Payroll Analytics" subtitle="December 2026 payroll run · 25 employees">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total Payroll Cost" value={inr(totalCost, true)} icon={Banknote} tone="neutral" hint="Gross monthly" />
        <KpiCard label="Average Salary" value={inr(avgSalary, true)} icon={Users} hint="Per employee" />
        <KpiCard label="PF / ESI Deductions" value={inr(totalPf, true)} icon={Percent} tone="warning" hint="Statutory" />
        <KpiCard label="TDS Withheld" value={inr(totalTds, true)} icon={Receipt} tone="danger" hint="Remit by 7th" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card className="border-border shadow-card">
          <CardHeader>
            <CardTitle className="text-base">Department-wise Payroll Allocation</CardTitle>
            <CardDescription>Basic, allowances and deductions stacked</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byDept}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="department" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis tickFormatter={(v) => inr(Number(v), true)} tickLine={false} axisLine={false} fontSize={12} width={70} />
                <Tooltip formatter={(v) => inr(Number(v))} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="basic" stackId="a" name="Basic" fill="var(--primary)" />
                <Bar dataKey="allowances" stackId="a" name="Allowances" fill="var(--brand)" />
                <Bar dataKey="deductions" stackId="a" name="Deductions" fill="var(--warning)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
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
                <Bar dataKey="gross" name="Gross" fill="var(--brand)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="net" name="Net" fill="var(--success)" radius={[4, 4, 0, 0]} />
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
                      No employees match “{query}”.
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

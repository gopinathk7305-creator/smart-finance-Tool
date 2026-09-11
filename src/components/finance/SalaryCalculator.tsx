import { Calculator, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { computeTax } from "@/lib/enterprise-data";
import { inr, type PayrollRecord } from "@/lib/finance-data";
import { explainPayroll } from "@/lib/ai.functions";

function Line({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border py-2 text-sm last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className={`tabular font-medium ${tone ?? ""}`}>{value}</span>
    </div>
  );
}

export function SalaryCalculator() {
  const [name, setName] = useState("New Employee");
  const [department, setDepartment] = useState("Finance");
  const [basic, setBasic] = useState("60000");
  const [allowances, setAllowances] = useState("25000");
  const [other, setOther] = useState("0");
  const [regime, setRegime] = useState<"new" | "old">("new");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const num = (v: string) => {
    const n = Number(v.replace(/[^0-9.]/g, ""));
    return Number.isFinite(n) ? n : 0;
  };

  const record: PayrollRecord = useMemo(
    () => ({
      id: "calc",
      month_year: "Dec 2026",
      employee_id: "CALC",
      name: name || "Employee",
      department: department || "General",
      basic_pay: num(basic),
      allowances: num(allowances),
      deductions: num(other),
      pf_deduction: 0,
      tds_deduction: 0,
    }),
    [name, department, basic, allowances, other],
  );

  const c = useMemo(() => computeTax(record, regime), [record, regime]);

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
    <Card className="mt-4 border-border shadow-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Calculator className="size-4" /> Salary Breakdown Calculator
        </CardTitle>
        <CardDescription>
          Enter a monthly salary to see PF, ESI, slab-wise tax, cess and net take-home
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="calc-name">Employee name</Label>
              <Input id="calc-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="calc-dept">Department</Label>
              <Input id="calc-dept" value={department} onChange={(e) => setDepartment(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="calc-basic">Monthly basic pay (₹)</Label>
              <Input id="calc-basic" inputMode="numeric" value={basic} onChange={(e) => setBasic(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="calc-allow">Monthly allowances (₹)</Label>
              <Input
                id="calc-allow"
                inputMode="numeric"
                value={allowances}
                onChange={(e) => setAllowances(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="calc-other">Other deductions (₹)</Label>
              <Input id="calc-other" inputMode="numeric" value={other} onChange={(e) => setOther(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Tax regime</Label>
              <Tabs value={regime} onValueChange={(v) => setRegime(v as "new" | "old")}>
                <TabsList className="w-full">
                  <TabsTrigger value="new" className="flex-1">
                    New
                  </TabsTrigger>
                  <TabsTrigger value="old" className="flex-1">
                    Old
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </div>

          <div className="rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Annual slab</TableHead>
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
        </div>

        <div>
          <Line label="Gross salary (monthly)" value={inr(c.gross)} tone="font-semibold" />
          <Line label="Employee PF (12% of basic)" value={`- ${inr(c.pf)}`} tone="text-warning" />
          <Line
            label={`ESI (0.75%${c.esi ? "" : " — not applicable, gross > ₹21,000"})`}
            value={`- ${inr(c.esi)}`}
            tone="text-warning"
          />
          <Line label="Taxable annual income (after standard deduction)" value={inr(c.annualGross)} />
          <Line label="Health & education cess (4%)" value={inr(c.cess)} />
          <Line label="Annual tax liability" value={inr(c.annualTax)} tone="font-semibold" />
          <Line label="Monthly TDS" value={`- ${inr(c.monthlyTds)}`} tone="text-danger" />
          <Line label="Other deductions" value={`- ${inr(c.otherDeductions)}`} />
          <div className="mt-3 flex items-center justify-between rounded-lg bg-secondary p-3">
            <span className="text-sm font-semibold">Net take-home salary</span>
            <span className="tabular text-lg font-bold text-success">{inr(c.net)}</span>
          </div>

          <div className="mt-3 rounded-lg border border-border p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold">Plain-English explanation</p>
              <Button size="sm" variant="outline" onClick={() => void run()} disabled={busy}>
                <Sparkles className="size-4" />
                {busy ? "Thinking…" : text ? "Regenerate" : "Explain this salary"}
              </Button>
            </div>
            {text && <p className="mt-2 text-sm whitespace-pre-wrap text-muted-foreground">{text}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

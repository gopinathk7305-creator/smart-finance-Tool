import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowDownCircle, ArrowUpCircle, Banknote, Building2 } from "lucide-react";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { AppShell } from "@/components/finance/AppShell";
import { ActiveDatasetBanner } from "@/components/finance/ActiveDatasetBanner";
import { KpiCard } from "@/components/finance/KpiCard";
import { ModuleSkeleton } from "@/components/finance/ModuleSkeleton";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AGING_BUCKETS, agingBucket, inr, monthlySummary } from "@/lib/finance-data";
import { useDataset } from "@/lib/dataset";
import { useActiveDataset } from "@/lib/active-dataset";

export const Route = createFileRoute("/cashflow")({
  head: () => ({
    meta: [
      { title: "Cash Flow & AR/AP — Finance IQ" },
      {
        name: "description",
        content:
          "Operating, investing and financing cash flows plus receivable and payable aging buckets.",
      },
      { property: "og:title", content: "Cash Flow & AR/AP — Finance IQ" },
      {
        property: "og:description",
        content: "Aging analysis for receivables and payables with cash flow summary.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CashFlowPage,
});

function CashFlowPage() {
  const [status, setStatus] = useState("all");
  const { txns, araps: arApRecords, live } = useDataset();
  const { syncing } = useActiveDataset();
  const series = useMemo(() => monthlySummary(txns), [txns]);
  const flow = useMemo(() => {
    const investingWords = /capex|asset|equipment|machinery|property|investment|acquisition/i;
    const financingWords = /loan|equity|capital|funding|borrow|dividend|interest/i;
    return txns.reduce(
      (acc, txn) => {
        const label = `${txn.category} ${txn.subcategory}`;
        const signed = txn.type === "income" ? txn.amount : -txn.amount;
        if (investingWords.test(label)) acc.investing += signed;
        else if (financingWords.test(label)) acc.financing += signed;
        else acc.operating += signed;
        return acc;
      },
      { operating: 0, investing: 0, financing: 0 },
    );
  }, [txns]);
  const { operating, investing, financing } = flow;
  const net = operating + investing + financing;
  const recent = series.filter((m) => m.revenue || m.expense).slice(-3);
  const monthlyBurn = recent.length
    ? recent.reduce((s, m) => s + Math.max(0, m.expense - m.revenue), 0) / recent.length
    : 0;

  const bucketData = (type: "AR" | "AP") =>
    AGING_BUCKETS.map((bucket) => ({
      bucket,
      amount: arApRecords
        .filter((r) => r.type === type && r.status === "outstanding" && agingBucket(r.due_date) === bucket)
        .reduce((s, r) => s + r.amount, 0),
    }));

  const rowsFor = (type: "AR" | "AP") =>
    arApRecords.filter((r) => r.type === type && (status === "all" || r.status === status));

  if (syncing)
    return (
      <AppShell title="Cash Flow & AR/AP" subtitle="Loading the selected dataset…">
        <ModuleSkeleton />
      </AppShell>
    );

  return (
    <AppShell title="Cash Flow & AR/AP" subtitle={`Liquidity, receivables and payables · ${live ? "live workspace" : "demo data"}`}>
      <ActiveDatasetBanner />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Operating Cash Flow" value={inr(operating, true)} icon={ArrowUpCircle} tone="success" />
        <KpiCard label="Investing Cash Flow" value={inr(investing, true)} icon={Building2} tone="warning" />
        <KpiCard label="Financing Cash Flow" value={inr(financing, true)} icon={Banknote} />
        <KpiCard
          label="Net Cash Delta"
          value={inr(net, true)}
          icon={net >= 0 ? ArrowUpCircle : ArrowDownCircle}
          tone={net >= 0 ? "success" : "danger"}
        />
      </div>

      <Card className="mt-4 border-border shadow-card">
        <CardHeader>
          <CardTitle className="text-base">Monthly Cash Outflow & Burn</CardTitle>
          <CardDescription>
            Active ledger inflows and outflows · recent average burn {inr(monthlyBurn, true)}
          </CardDescription>
        </CardHeader>
        <CardContent className="h-[300px]">
          {series.some((m) => m.revenue || m.expense) ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis tickFormatter={(v) => inr(Number(v), true)} tickLine={false} axisLine={false} fontSize={12} width={70} />
                <Tooltip formatter={(v) => inr(Number(v))} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="revenue" name="Cash inflow" stroke="var(--success)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="expense" name="Cash outflow" stroke="var(--danger)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              No dated cash movements are available in this sheet.
            </div>
          )}
        </CardContent>
      </Card>

      {arApRecords.length === 0 && (
        <Card className="mt-4 border-warning/30 bg-warning-soft shadow-card">
          <CardHeader>
            <CardTitle className="text-base">No receivables or payables loaded</CardTitle>
            <CardDescription>
              Upload a receivables / payables CSV (party name, type AR or AP, invoice date, due date,
              amount, status) on the Data Upload page and these aging buckets fill automatically.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link to="/upload" className="text-sm font-semibold text-brand underline">
              Go to Data Upload
            </Link>
          </CardContent>
        </Card>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {(["AR", "AP"] as const).map((type) => (
          <Card key={type} className="border-border shadow-card">
            <CardHeader>
              <CardTitle className="text-base">
                {type === "AR" ? "Accounts Receivable" : "Accounts Payable"} Aging
              </CardTitle>
              <CardDescription>Outstanding balance by bucket (days past due)</CardDescription>
            </CardHeader>
            <CardContent className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={bucketData(type)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="bucket" tickLine={false} axisLine={false} fontSize={12} />
                  <YAxis tickFormatter={(v) => inr(Number(v), true)} tickLine={false} axisLine={false} fontSize={12} width={70} />
                  <Tooltip formatter={(v) => inr(Number(v))} />
                  <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                    {bucketData(type).map((_, i) => (
                      <Cell
                        key={i}
                        fill={
                          i === 0
                            ? "var(--success)"
                            : i === 1
                              ? "var(--brand)"
                              : i === 2
                                ? "var(--warning)"
                                : "var(--danger)"
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="mt-4 border-border shadow-card">
        <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-base">Invoice Ledger</CardTitle>
            <CardDescription>Receivables and payables with aging</CardDescription>
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-40 bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="outstanding">Outstanding</SelectItem>
              <SelectItem value="settled">Settled</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="AR">
            <TabsList>
              <TabsTrigger value="AR">Receivables</TabsTrigger>
              <TabsTrigger value="AP">Payables</TabsTrigger>
            </TabsList>
            {(["AR", "AP"] as const).map((type) => (
              <TabsContent key={type} value={type} className="mt-4">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Party</TableHead>
                        <TableHead>Invoice date</TableHead>
                        <TableHead>Due date</TableHead>
                        <TableHead>Aging</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="text-right">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rowsFor(type).map((r) => {
                        const bucket = agingBucket(r.due_date);
                        return (
                          <TableRow key={r.id}>
                            <TableCell className="font-medium">{r.party_name}</TableCell>
                            <TableCell className="tabular text-muted-foreground">{r.invoice_date}</TableCell>
                            <TableCell className="tabular text-muted-foreground">{r.due_date}</TableCell>
                            <TableCell>
                              <Badge variant={bucket === "0-30" ? "success" : bucket === "31-60" ? "brand" : bucket === "61-90" ? "warning" : "danger"}>{bucket} days</Badge>
                            </TableCell>
                            <TableCell className="tabular text-right font-semibold">{inr(r.amount)}</TableCell>
                            <TableCell className="text-right text-xs text-muted-foreground capitalize">
                              {r.status}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {rowsFor(type).length === 0 && (
                        <TableRow>
                          <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                            No invoices for this filter.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>
    </AppShell>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { Loader2, Plus, Tags, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/finance/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { useAuth } from "@/lib/auth";
import { KIND_LABEL, useCategories, type CategoryKind } from "@/lib/categories";
import { useDataset } from "@/lib/dataset";
import { actualsByCategory, inr } from "@/lib/finance-data";
import { useOrg } from "@/lib/orgs";

export const Route = createFileRoute("/categories")({
  head: () => ({
    meta: [
      { title: "Expense Categories — Finance IQ" },
      {
        name: "description",
        content:
          "Define your own expense categories and how each one rolls up into the P&L and the 12-month forecast.",
      },
      { property: "og:title", content: "Expense Categories — Finance IQ" },
      {
        property: "og:description",
        content: "Custom cost-of-goods, operating expense and payroll buckets for your entity.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CategoriesPage,
});

const KINDS: CategoryKind[] = ["cogs", "opex", "payroll"];

function CategoriesPage() {
  const { session } = useAuth();
  const { orgName } = useOrg();
  const { txns } = useDataset();
  const { categories, live, loading, saving, add, update, remove, seedDefaults } = useCategories();

  const [name, setName] = useState("");
  const [kind, setKind] = useState<CategoryKind>("opex");

  const spend = actualsByCategory(txns);
  const uncategorised = [...spend.keys()].filter(
    (c) => !categories.some((cat) => cat.name.toLowerCase() === c.toLowerCase()),
  );

  const guard = () => {
    if (!session) {
      toast.error("Sign in to save your own categories — demo mode is read-only.");
      return false;
    }
    return true;
  };

  const onAdd = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (!guard()) return;
    if (categories.some((c) => c.name.toLowerCase() === trimmed.toLowerCase())) {
      toast.error("That category already exists.");
      return;
    }
    try {
      await add(trimmed, kind);
      setName("");
      toast.success(`${trimmed} added — P&L and Forecasting now use it.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the category.");
    }
  };

  const onKind = async (id: string, next: CategoryKind) => {
    if (!guard()) return;
    try {
      await update(id, { kind: next });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update the category.");
    }
  };

  const onRemove = async (id: string, label: string) => {
    if (!guard()) return;
    try {
      await remove(id);
      toast.success(`${label} removed.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove the category.");
    }
  };

  return (
    <AppShell
      title="Expense Categories"
      subtitle={`${orgName} · ${live ? "your own categories" : "starter categories"} · used by P&L and Forecasting`}
    >
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="border-border shadow-card lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Your expense types</CardTitle>
            <CardDescription>
              Each type rolls up into the P&amp;L and drives the forecast: cost of goods sold sits
              above gross profit, operating expenses and payroll sit below it.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Category</TableHead>
                    <TableHead>Rolls up as</TableHead>
                    <TableHead className="text-right">Spend to date</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {categories.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell>
                        <Select
                          value={c.kind}
                          onValueChange={(v) => void onKind(c.id, v as CategoryKind)}
                        >
                          <SelectTrigger className="h-8 w-[220px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {KINDS.map((k) => (
                              <SelectItem key={k} value={k}>
                                {KIND_LABEL[k]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="tabular text-right">
                        {inr(spend.get(c.name) ?? 0)}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={saving}
                          onClick={() => void onRemove(c.id, c.name)}
                          aria-label={`Remove ${c.name}`}
                        >
                          <Trash2 className="h-4 w-4 text-danger" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="border-border shadow-card">
            <CardHeader>
              <CardTitle className="text-base">Add a category</CardTitle>
              <CardDescription>Name it the way it appears in your uploaded ledger.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="cat-name">Category name</Label>
                <Input
                  id="cat-name"
                  value={name}
                  placeholder="e.g. Freight & Logistics"
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Rolls up as</Label>
                <Select value={kind} onValueChange={(v) => setKind(v as CategoryKind)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {KINDS.map((k) => (
                      <SelectItem key={k} value={k}>
                        {KIND_LABEL[k]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button className="w-full" disabled={saving} onClick={() => void onAdd()}>
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                Add category
              </Button>
              {!live && (
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={saving}
                  onClick={() => {
                    if (!guard()) return;
                    void seedDefaults().then(() => toast.success("Starter categories saved."));
                  }}
                >
                  Save starter list as mine
                </Button>
              )}
            </CardContent>
          </Card>

          <Card className="border-border shadow-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Tags className="h-4 w-4" /> Seen in your ledger
              </CardTitle>
              <CardDescription>
                Categories present in uploaded transactions but not defined here. They still count as
                operating expenses.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {uncategorised.length === 0 ? (
                <p className="text-sm text-muted-foreground">Everything is mapped.</p>
              ) : (
                uncategorised.map((c) => (
                  <Badge key={c} variant="secondary" className="cursor-pointer" onClick={() => setName(c)}>
                    {c}
                  </Badge>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

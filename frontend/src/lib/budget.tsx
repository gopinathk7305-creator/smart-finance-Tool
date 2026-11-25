import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

import { api } from "@/services/api";
import { useAuth } from "@/lib/auth";
import { useDataset } from "@/lib/dataset";
import { ALL, useOrg } from "@/lib/orgs";
import type { BudgetTarget } from "@/lib/finance-data";

export const FISCAL_YEARS = ["FY 2026-27", "FY 2027-28"] as const;

export interface BudgetDraft {
  fiscal_year: string;
  category: string;
  department: string;
  budgeted_amount: number;
  /** "Annual" or an FY month label (Apr…Mar) for a month-specific target. */
  month?: string;
}

export interface BudgetApi {
  rows: BudgetTarget[];
  /** planned annual spend keyed by category name (lower-cased) */
  byCategory: Map<string, number>;
  /** month-specific planned spend keyed by FY month label (Apr…Mar) */
  byMonth: Map<string, number>;
  /** planned spend from rows tagged "Annual" only */
  annualTotal: number;
  plannedTotal: number;
  live: boolean;
  loading: boolean;
  saving: boolean;
  fiscalYears: string[];
  add: (draft: BudgetDraft) => Promise<void>;
  update: (id: string, amount: number) => Promise<void>;
  remove: (id: string) => Promise<void>;
  refresh: () => void;
}

/** Planned budget rows for the selected organization, filtered to one fiscal year. */
export function useBudget(fiscalYear?: string): BudgetApi {
  const { user } = useAuth();
  const { orgId } = useOrg();
  const { buds, live, loading, refresh } = useDataset();
  const queryClient = useQueryClient();

  const rows = useMemo(
    () => (fiscalYear ? buds.filter((b) => !b.fiscal_year || b.fiscal_year === fiscalYear) : buds),
    [buds, fiscalYear],
  );

  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach((r) =>
      map.set(r.category.toLowerCase(), (map.get(r.category.toLowerCase()) ?? 0) + r.budgeted_amount),
    );
    return map;
  }, [rows]);

  // Month-specific targets (rows tagged with an FY month rather than "Annual").
  const byMonth = useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach((r) => {
      const m = r.month ?? "Annual";
      if (m === "Annual") return;
      map.set(m, (map.get(m) ?? 0) + r.budgeted_amount);
    });
    return map;
  }, [rows]);

  const annualTotal = useMemo(
    () => rows.filter((r) => (r.month ?? "Annual") === "Annual").reduce((s, r) => s + r.budgeted_amount, 0),
    [rows],
  );

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["dataset"] });
  }, [queryClient]);

  const insert = useMutation({
    mutationFn: async (draft: BudgetDraft) => {
      if (!user) throw new Error("Sign in to save your own budget.");
      await api.budgets.create({
        category: draft.category,
        budgeted_amount: draft.budgeted_amount,
        month_year: draft.month ?? "Annual",
      });
    },
    onSuccess: invalidate,
  });

  const patch = useMutation({
    mutationFn: async (args: { id: string; amount: number }) => {
      await api.patch(`/budgets/${args.id}/`, { budgeted_amount: args.amount });
    },
    onSuccess: invalidate,
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      await api.budgets.delete(id);
    },
    onSuccess: invalidate,
  });

  const fiscalYears = useMemo(() => {
    const set = new Set<string>(FISCAL_YEARS);
    buds.forEach((b) => set.add(b.fiscal_year));
    return [...set];
  }, [buds]);

  return {
    rows,
    byCategory,
    byMonth,
    annualTotal,
    plannedTotal: rows.reduce((s, r) => s + r.budgeted_amount, 0),
    live,
    loading,
    saving: insert.isPending || patch.isPending || del.isPending,
    fiscalYears,
    add: async (draft) => {
      await insert.mutateAsync(draft);
    },
    update: async (id, amount) => {
      await patch.mutateAsync({ id, amount });
    },
    remove: async (id) => {
      await del.mutateAsync(id);
    },
    refresh,
  };
}

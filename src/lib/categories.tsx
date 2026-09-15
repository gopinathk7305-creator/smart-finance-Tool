import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { ALL, useOrg } from "@/lib/orgs";

/** How a category rolls up into the P&L and the forecast model. */
export type CategoryKind = "cogs" | "opex" | "payroll";

export const KIND_LABEL: Record<CategoryKind, string> = {
  cogs: "Cost of goods sold",
  opex: "Operating expense",
  payroll: "Payroll & people cost",
};

export interface ExpenseCategory {
  id: string;
  name: string;
  kind: CategoryKind;
  sort_order: number;
}

/** Used until the user defines their own list. */
export const DEFAULT_CATEGORIES: Omit<ExpenseCategory, "id">[] = [
  { name: "Payroll", kind: "payroll", sort_order: 0 },
  { name: "COGS", kind: "cogs", sort_order: 1 },
  { name: "Software Subscriptions", kind: "opex", sort_order: 2 },
  { name: "Office Rent", kind: "opex", sort_order: 3 },
  { name: "Marketing", kind: "opex", sort_order: 4 },
  { name: "Utilities", kind: "opex", sort_order: 5 },
  { name: "Legal", kind: "opex", sort_order: 6 },
];

const asKind = (v: string): CategoryKind =>
  v === "cogs" || v === "payroll" ? v : "opex";

export interface CategoriesApi {
  categories: ExpenseCategory[];
  /** true when the list comes from the user's own definitions */
  live: boolean;
  loading: boolean;
  saving: boolean;
  names: string[];
  cogsNames: string[];
  opexNames: string[];
  payrollNames: string[];
  kindOf: (category: string) => CategoryKind;
  add: (name: string, kind: CategoryKind) => Promise<void>;
  update: (id: string, patch: { name?: string; kind?: CategoryKind }) => Promise<void>;
  remove: (id: string) => Promise<void>;
  /** writes the default list to the database for the selected entity */
  seedDefaults: () => Promise<void>;
}

export function useCategories(): CategoriesApi {
  const { user } = useAuth();
  const { orgId } = useOrg();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["expense-categories", user?.id ?? "anon"],
    queryFn: async () => {
      const { data: rows } = await supabase
        .from("expense_categories")
        .select("*")
        .order("sort_order");
      return rows ?? [];
    },
    enabled: !!user,
  });

  const rows = useMemo(
    () => (data ?? []).filter((r) => orgId === ALL || r.org_id === orgId || r.org_id === null),
    [data, orgId],
  );

  const live = rows.length > 0;

  const categories: ExpenseCategory[] = useMemo(
    () =>
      live
        ? rows.map((r) => ({
            id: r.id,
            name: r.name,
            kind: asKind(r.kind),
            sort_order: r.sort_order,
          }))
        : DEFAULT_CATEGORIES.map((c) => ({ ...c, id: `default-${c.name}` })),
    [live, rows],
  );

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["expense-categories"] });
  }, [queryClient]);

  const insert = useMutation({
    mutationFn: async (payload: { name: string; kind: CategoryKind; sort_order: number }[]) => {
      if (!user) throw new Error("Sign in to define your own categories.");
      const { error } = await supabase.from("expense_categories").insert(
        payload.map((p) => ({
          ...p,
          user_id: user.id,
          org_id: orgId === ALL ? null : orgId,
        })),
      );
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const patch = useMutation({
    mutationFn: async (args: { id: string; patch: { name?: string; kind?: CategoryKind } }) => {
      const { error } = await supabase
        .from("expense_categories")
        .update(args.patch)
        .eq("id", args.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("expense_categories").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const namesOf = (kind: CategoryKind) =>
    categories.filter((c) => c.kind === kind).map((c) => c.name);

  const kindOf = useCallback(
    (category: string): CategoryKind =>
      categories.find((c) => c.name.toLowerCase() === category.toLowerCase())?.kind ?? "opex",
    [categories],
  );

  return {
    categories,
    live,
    loading: !!user && isLoading,
    saving: insert.isPending || patch.isPending || del.isPending,
    names: categories.map((c) => c.name),
    cogsNames: namesOf("cogs"),
    opexNames: namesOf("opex"),
    payrollNames: namesOf("payroll"),
    kindOf,
    add: async (name, kind) => {
      const base = live
        ? [{ name, kind, sort_order: categories.length }]
        : [
            ...DEFAULT_CATEGORIES,
            { name, kind, sort_order: DEFAULT_CATEGORIES.length },
          ];
      await insert.mutateAsync(base);
    },
    update: async (id, p) => {
      await patch.mutateAsync({ id, patch: p });
    },
    remove: async (id) => {
      await del.mutateAsync(id);
    },
    seedDefaults: async () => {
      await insert.mutateAsync(DEFAULT_CATEGORIES.map((c) => ({ ...c })));
    },
  };
}

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

import { supabase } from "@/integrations/supabase/client";
import { useActiveDataset } from "@/lib/active-dataset";
import { useAuth } from "@/lib/auth";
import type { MonthlySummary } from "@/lib/finance-data";

interface MonthlyRow {
  month_index: number;
  month_label: string;
  revenue: number | string;
  expense: number | string;
  profit: number | string;
  cash: number | string;
}

const toSeries = (rows: MonthlyRow[]): MonthlySummary[] =>
  rows
    .slice()
    .sort((a, b) => a.month_index - b.month_index)
    .map((r) => ({
      month: r.month_label,
      revenue: Number(r.revenue) || 0,
      expense: Number(r.expense) || 0,
      profit: Number(r.profit) || 0,
      cash: Number(r.cash) || 0,
    }));

const hasValues = (series: MonthlySummary[]) =>
  series.some((m) => m.revenue !== 0 || m.expense !== 0);

/**
 * Reads the precomputed monthly Revenue / Expense / cash-balance table for one
 * dataset. The maths is done once in Postgres (`refresh_dataset_monthly`) and
 * cached for 10 minutes, so the dashboard renders its charts from a 12-row
 * payload instead of re-aggregating 50,000 rows in the browser.
 */
export function useMonthlyCache(sourceFile: string | null) {
  const { user } = useAuth();
  const key = sourceFile ?? "__all__";

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["dataset-monthly", user?.id ?? "anon", key],
    enabled: !!user,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<MonthlySummary[]> => {
      const { data: rows } = await supabase
        .from("dataset_monthly")
        .select("month_index,month_label,revenue,expense,profit,cash")
        .eq("source_file", key)
        .order("month_index");
      const cached = toSeries((rows ?? []) as MonthlyRow[]);
      if (hasValues(cached)) return cached;

      // Nothing precomputed yet (or all zeroes) — build it server-side once.
      const args: { p_source_file?: string } = {};
      if (sourceFile) args.p_source_file = sourceFile;
      const { data: fresh, error } = await supabase.rpc("refresh_dataset_monthly", args);
      if (error) return cached;
      return toSeries((fresh ?? []) as MonthlyRow[]);
    },
  });

  return {
    series: data ?? [],
    ready: !!data && hasValues(data),
    loading: isLoading,
    refreshing: isFetching,
  };
}

/**
 * Precomputed series for the active dataset with a client-side fallback for
 * datasets whose figures are derived in the browser (local rows, demo data or
 * files whose columns are auto-mapped rather than stored canonically).
 */
export function useActiveMonthlySeries(fallback: MonthlySummary[]) {
  const { activeFile } = useActiveDataset();
  const queryClient = useQueryClient();
  const cache = useMonthlyCache(activeFile);

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["dataset-monthly"] });
  }, [queryClient]);

  const series = useMemo(
    () => (cache.ready ? cache.series : fallback),
    [cache.ready, cache.series, fallback],
  );

  return { series, precomputed: cache.ready, loading: cache.loading, refresh };
}

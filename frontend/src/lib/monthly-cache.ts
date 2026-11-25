import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

import { api } from "@/services/api";
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
export function useMonthlyCache(sourceFile: string | null, enabled = true) {
  const { user } = useAuth();
  const key = sourceFile ?? "__all__";

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["dataset-monthly", user?.id ?? "anon", key],
    enabled: !!user && enabled,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<MonthlySummary[]> => {
      try {
        const rows = await api.analytics.monthly();
        return (rows ?? []).map((r, i) => ({
          month_index: i + 1,
          month_label: r.month,
          revenue: Number(r.income) || 0,
          expense: Number(r.expense) || 0,
          profit: Number(r.net) || 0,
          cash: 2500000 + (Number(r.net) || 0),
        }));
      } catch {
        return [];
      }
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

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

const ACTIVE_KEY = "financeiq.active-dataset";

export interface DatasetSummary {
  id: string;
  file_name: string;
  table_name: string;
  dataset_key: string;
  row_count: number;
  modules: string[];
  column_names: string[];
  created_at: string;
}

interface ActiveDatasetValue {
  datasets: DatasetSummary[];
  activeId: string | null;
  active: DatasetSummary | null;
  /** file name used to isolate rows across every module */
  activeFile: string | null;
  loading: boolean;
  /** true while a dataset switch is propagating to every module */
  syncing: boolean;
  setActiveId: (id: string | null) => void;
  refreshDatasets: () => void;
}

const ActiveDatasetContext = createContext<ActiveDatasetValue>({
  datasets: [],
  activeId: null,
  active: null,
  activeFile: null,
  loading: false,
  syncing: false,
  setActiveId: () => {},
  refreshDatasets: () => {},
});

export function ActiveDatasetProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activeId, setActiveIdState] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(ACTIVE_KEY);
    if (saved) setActiveIdState(saved);
    setHydrated(true);
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ["dataset-registry", user?.id ?? "anon"],
    enabled: !!user,
    queryFn: async () => {
      const { data: rows } = await supabase
        .from("uploaded_datasets")
        .select("id,file_name,table_name,dataset_key,row_count,modules,column_names,created_at")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      return (rows ?? []) as unknown as DatasetSummary[];
    },
  });

  const datasets = data ?? [];

  const setActiveId = useCallback(
    (id: string | null) => {
      // "" records an explicit "all datasets" choice so it survives reloads.
      window.localStorage.setItem(ACTIVE_KEY, id ?? "");
      setActiveIdState(id);
      // Only the module currently on screen refetches; every other module
      // stays stale and reloads lazily when the user opens it. Keeps a 50k-row
      // switch instant instead of blocking on 11 modules at once.
      setSyncing(true);
      queryClient.invalidateQueries({ queryKey: ["dataset"], refetchType: "active" });
      queryClient.invalidateQueries({ queryKey: ["dataset-summary"], refetchType: "active" });
      window.setTimeout(() => setSyncing(false), 300);
    },
    [queryClient],
  );

  // Default: the most recently uploaded dataset drives the workspace.
  useEffect(() => {
    if (!hydrated || activeId || datasets.length === 0) return;
    if (window.localStorage.getItem(ACTIVE_KEY) === "") return;
    setActiveIdState(datasets[0]!.id);
    window.localStorage.setItem(ACTIVE_KEY, datasets[0]!.id);
  }, [hydrated, activeId, datasets]);

  const refreshDatasets = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["dataset-registry"] });
  }, [queryClient]);

  const value = useMemo<ActiveDatasetValue>(() => {
    const active = datasets.find((d) => d.id === activeId) ?? null;
    return {
      datasets,
      activeId: active?.id ?? null,
      active,
      activeFile: active?.file_name ?? null,
      loading: !!user && isLoading,
      syncing,
      setActiveId,
      refreshDatasets,
    };
  }, [datasets, activeId, user, isLoading, syncing, setActiveId, refreshDatasets]);

  return <ActiveDatasetContext.Provider value={value}>{children}</ActiveDatasetContext.Provider>;
}

export const useActiveDataset = () => useContext(ActiveDatasetContext);

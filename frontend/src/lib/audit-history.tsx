import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

import { api } from "@/services/api";
import { useAuth } from "@/lib/auth";
import { ALL, useOrg } from "@/lib/orgs";
import { useActiveDataset } from "@/lib/active-dataset";

export type FindingStatus = "open" | "reviewed" | "closed";

export const FINDING_STATUS_LABEL: Record<FindingStatus, string> = {
  open: "Open",
  reviewed: "Reviewed",
  closed: "Closed",
};

export interface StoredFinding {
  id: string;
  rule: string;
  severity: string;
  party: string;
  date: string;
  amount: number;
  detail: string;
  status: FindingStatus;
  origin: string;
  fingerprint: string;
  created_at: string;
}

export interface FindingInput {
  rule: string;
  severity: string;
  party: string;
  date: string;
  amount: number;
  detail: string;
  origin: string;
}

export const fingerprintOf = (f: FindingInput) =>
  `${f.rule}|${f.party}|${f.date}|${Math.round(f.amount)}`.toLowerCase();

const asStatus = (v: string): FindingStatus =>
  v === "reviewed" || v === "closed" ? v : "open";

export interface AuditHistoryApi {
  history: StoredFinding[];
  live: boolean;
  loading: boolean;
  saving: boolean;
  /** inserts only findings whose fingerprint is not already stored */
  persist: (findings: FindingInput[]) => Promise<number>;
  setStatus: (id: string, status: FindingStatus) => Promise<void>;
}

/** Audit findings stored against the account and the active organization. */
export function useAuditHistory(): AuditHistoryApi {
  const { user } = useAuth();
  const { orgId } = useOrg();
  const { activeFile } = useActiveDataset();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    // active dataset in the key so a header switch re-reads findings
    queryKey: ["audit-findings", user?.id ?? "anon", activeFile ?? "all"],
    enabled: !!user,
    queryFn: async () => {
      try {
        const rows = await api.compliance.findings();
        return rows ?? [];
      } catch {
        return [];
      }
    },
  });

  const scoped = useMemo(
    () => (data ?? []).filter((r) => orgId === ALL || r.org_id === orgId || r.org_id === null),
    [data, orgId],
  );

  const history: StoredFinding[] = useMemo(
    () =>
      scoped.map((r) => ({
        id: r.id,
        rule: r.rule,
        severity: r.severity,
        party: r.party,
        date: r.finding_date ?? "",
        amount: Number(r.amount),
        detail: r.detail,
        status: asStatus(r.status),
        origin: r.origin,
        fingerprint: r.fingerprint,
        created_at: r.created_at,
      })),
    [scoped],
  );

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["audit-findings"] });
  }, [queryClient]);

  const insert = useMutation({
    mutationFn: async (findings: FindingInput[]) => {
      if (!user) throw new Error("Sign in to keep an audit history.");
      for (const f of findings) {
        await api.compliance.createFinding({
          rule: f.rule,
          severity: f.severity,
          party: f.party,
          amount: f.amount,
          detail: f.detail,
          finding_date: f.date || null,
          status: "open",
        });
      }
      return findings.length;
    },
    onSuccess: invalidate,
  });

  const patch = useMutation({
    mutationFn: async (args: { id: string; status: FindingStatus }) => {
      await api.patch(`/compliance/findings/${args.id}/`, { status: args.status });
    },
    onSuccess: invalidate,
  });

  return {
    history,
    live: !!user,
    loading: !!user && isLoading,
    saving: insert.isPending || patch.isPending,
    persist: async (findings) => insert.mutateAsync(findings),
    setStatus: async (id, status) => {
      await patch.mutateAsync({ id, status });
    },
  };
}

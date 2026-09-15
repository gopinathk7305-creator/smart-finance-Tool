import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { ALL, useOrg } from "@/lib/orgs";

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
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["audit-findings", user?.id ?? "anon"],
    enabled: !!user,
    queryFn: async () => {
      const { data: rows } = await supabase
        .from("audit_findings")
        .select("*")
        .order("created_at", { ascending: false });
      return rows ?? [];
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
      const known = new Set(history.map((h) => h.fingerprint));
      const fresh = findings.filter((f) => !known.has(fingerprintOf(f)));
      if (!fresh.length) return 0;
      const { error } = await supabase.from("audit_findings").insert(
        fresh.map((f) => ({
          user_id: user.id,
          org_id: orgId === ALL ? null : orgId,
          rule: f.rule,
          severity: f.severity,
          party: f.party,
          finding_date: f.date || null,
          amount: f.amount,
          detail: f.detail,
          origin: f.origin,
          status: "open",
          fingerprint: fingerprintOf(f),
        })),
      );
      if (error) throw error;
      return fresh.length;
    },
    onSuccess: invalidate,
  });

  const patch = useMutation({
    mutationFn: async (args: { id: string; status: FindingStatus }) => {
      const { error } = await supabase
        .from("audit_findings")
        .update({ status: args.status })
        .eq("id", args.id);
      if (error) throw error;
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

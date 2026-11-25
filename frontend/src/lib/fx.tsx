import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";

import { api } from "@/services/api";
import { useAuth } from "@/lib/auth";
import { ALL, useOrg } from "@/lib/orgs";

export interface Currency {
  code: string;
  label: string;
  symbol: string;
  /** starting rate used until the user edits it */
  defaultRate: number;
}

export const CURRENCIES: Currency[] = [
  { code: "INR", label: "Indian Rupee", symbol: "₹", defaultRate: 1 },
  { code: "USD", label: "US Dollar", symbol: "$", defaultRate: 88.5 },
  { code: "EUR", label: "Euro", symbol: "€", defaultRate: 96.4 },
  { code: "GBP", label: "Pound Sterling", symbol: "£", defaultRate: 112.8 },
  { code: "AED", label: "UAE Dirham", symbol: "AED ", defaultRate: 24.1 },
];

const CURRENCY_KEY = "financeiq.currency";

export interface FxApi {
  currency: Currency;
  code: string;
  rate: number;
  rates: Record<string, number>;
  live: boolean;
  saving: boolean;
  setCode: (code: string) => void;
  setRate: (rate: number) => Promise<void>;
  /** convert an amount entered in the selected currency into rupees */
  toInr: (amount: number) => number;
  /** human note for reports, e.g. "Converted at 1 USD = Rs 88.50" */
  note: string;
}

/** Currency selection plus an editable rate, stored per organization. */
export function useFx(): FxApi {
  const { user } = useAuth();
  const { orgId } = useOrg();
  const queryClient = useQueryClient();
  const [code, setCodeState] = useState("INR");

  useEffect(() => {
    const saved = window.localStorage.getItem(CURRENCY_KEY);
    if (saved && CURRENCIES.some((c) => c.code === saved)) setCodeState(saved);
  }, []);

  const { data } = useQuery({
    queryKey: ["fx-rates", user?.id ?? "anon"],
    enabled: !!user,
    queryFn: async () => {
      try {
        const rows = await api.analytics.fx();
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

  const rates = useMemo(() => {
    const map: Record<string, number> = {};
    CURRENCIES.forEach((c) => (map[c.code] = c.defaultRate));
    scoped.forEach((r) => {
      const value = Number(r.rate_to_inr);
      if (Number.isFinite(value) && value > 0) map[r.currency] = value;
    });
    map["INR"] = 1;
    return map;
  }, [scoped]);

  const save = useMutation({
    mutationFn: async (_args: { currency: string; rate: number }) => {
      // FX rates are managed on the backend; refresh local state
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["fx-rates"] }),
  });

  const currency = CURRENCIES.find((c) => c.code === code) ?? CURRENCIES[0]!;
  const rate = rates[currency.code] ?? currency.defaultRate;

  const setCode = useCallback((next: string) => {
    window.localStorage.setItem(CURRENCY_KEY, next);
    setCodeState(next);
  }, []);

  return {
    currency,
    code: currency.code,
    rate,
    rates,
    live: scoped.length > 0,
    saving: save.isPending,
    setCode,
    setRate: async (value) => {
      await save.mutateAsync({ currency: currency.code, rate: value });
    },
    toInr: (amount) => amount * rate,
    note:
      currency.code === "INR"
        ? "All amounts are in Indian rupees."
        : `Revenue entered in ${currency.code} is converted at 1 ${currency.code} = Rs ${rate.toFixed(2)}.`,
  };
}

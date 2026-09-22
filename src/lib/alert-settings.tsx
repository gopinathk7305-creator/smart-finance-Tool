// User-configurable thresholds for the Live Financial Alerts panel.
// Stored per browser so every module reads the same rules.

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export interface AlertSettings {
  /** flag a month-on-month expense jump at or above this % */
  expenseSpikePct: number;
  /** flag a month-on-month revenue drop at or below this % (positive number) */
  revenueDropPct: number;
  /** flag a single category taking this share of spend or more */
  concentrationPct: number;
  /** warn when net margin falls below this % */
  minMarginPct: number;
  /** celebrate when net margin is at or above this % */
  healthyMarginPct: number;
  /** flag any month whose closing cash balance falls below this rupee figure */
  cashFloor: number;
  /** flag when the dataset's risk-flag count exceeds this number */
  riskFlagLimit: number;
  /** include overdue / unpaid row alerts */
  overdueEnabled: boolean;
  /** include duplicate-entry alerts */
  duplicatesEnabled: boolean;
}

export const DEFAULT_ALERT_SETTINGS: AlertSettings = {
  expenseSpikePct: 20,
  revenueDropPct: 15,
  concentrationPct: 40,
  minMarginPct: 0,
  healthyMarginPct: 20,
  cashFloor: 0,
  riskFlagLimit: 0,
  overdueEnabled: true,
  duplicatesEnabled: true,
};

const KEY = "financeiq.alert-settings";

function load(): AlertSettings {
  if (typeof window === "undefined") return DEFAULT_ALERT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_ALERT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<AlertSettings>;
    return { ...DEFAULT_ALERT_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_ALERT_SETTINGS;
  }
}

interface Ctx {
  settings: AlertSettings;
  update: (patch: Partial<AlertSettings>) => void;
  reset: () => void;
}

const AlertCtx = createContext<Ctx | null>(null);

export function AlertSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AlertSettings>(DEFAULT_ALERT_SETTINGS);

  // Read after hydration so server and client markup match.
  useEffect(() => setSettings(load()), []);

  const value = useMemo<Ctx>(
    () => ({
      settings,
      update: (patch) =>
        setSettings((prev) => {
          const next = { ...prev, ...patch };
          try {
            window.localStorage.setItem(KEY, JSON.stringify(next));
          } catch {
            /* storage unavailable — keep in-memory value */
          }
          return next;
        }),
      reset: () => {
        try {
          window.localStorage.removeItem(KEY);
        } catch {
          /* ignore */
        }
        setSettings(DEFAULT_ALERT_SETTINGS);
      },
    }),
    [settings],
  );

  return <AlertCtx.Provider value={value}>{children}</AlertCtx.Provider>;
}

export function useAlertSettings(): Ctx {
  const ctx = useContext(AlertCtx);
  const [settings, setSettings] = useState<AlertSettings>(DEFAULT_ALERT_SETTINGS);
  const fallback = useMemo<Ctx>(
    () => ({
      settings,
      update: (patch) => setSettings((prev) => ({ ...prev, ...patch })),
      reset: () => setSettings(DEFAULT_ALERT_SETTINGS),
    }),
    [settings],
  );
  return ctx ?? fallback;
}

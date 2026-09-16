import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

const RANGE_KEY = "financeiq.date-range";

export type RangePreset =
  | "all"
  | "fy-current"
  | "fy-previous"
  | "ytd"
  | "q1"
  | "q2"
  | "q3"
  | "q4"
  | "custom";

export interface DateRange {
  /** inclusive ISO date, null = unbounded */
  start: string | null;
  /** inclusive ISO date, null = unbounded */
  end: string | null;
  label: string;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Indian fiscal year starting April 1st that contains the given date. */
export function fiscalYearStart(d = new Date()): number {
  return d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
}

export function fyLabel(startYear: number): string {
  return `FY ${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

function quarter(startYear: number, q: 1 | 2 | 3 | 4): DateRange {
  const startMonth = 3 + (q - 1) * 3; // Apr, Jul, Oct, Jan
  const y = startMonth > 11 ? startYear + 1 : startYear;
  const m = startMonth % 12;
  const start = new Date(Date.UTC(y, m, 1));
  const end = new Date(Date.UTC(y, m + 3, 0));
  return { start: iso(start), end: iso(end), label: `Q${q} ${fyLabel(startYear)}` };
}

export function resolveRange(preset: RangePreset, custom: { start: string; end: string }): DateRange {
  const now = new Date();
  const fy = fiscalYearStart(now);
  switch (preset) {
    case "fy-current":
      return { start: `${fy}-04-01`, end: `${fy + 1}-03-31`, label: fyLabel(fy) };
    case "fy-previous":
      return { start: `${fy - 1}-04-01`, end: `${fy}-03-31`, label: fyLabel(fy - 1) };
    case "ytd":
      return { start: `${fy}-04-01`, end: iso(now), label: `YTD ${fyLabel(fy)}` };
    case "q1":
      return quarter(fy, 1);
    case "q2":
      return quarter(fy, 2);
    case "q3":
      return quarter(fy, 3);
    case "q4":
      return quarter(fy, 4);
    case "custom":
      return {
        start: custom.start || null,
        end: custom.end || null,
        label:
          custom.start || custom.end
            ? `${custom.start || "start"} → ${custom.end || "today"}`
            : "Custom date range",
      };
    default:
      return { start: null, end: null, label: "All time" };
  }
}

/** Pulls an ISO-ish date out of the many shapes uploads produce. */
export function normaliseDate(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return iso(value);
  const s = String(value).trim();
  if (!s) return null;
  const isoMatch = s.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3] ?? "01"}`;
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) return iso(parsed);
  return null;
}

export function inRange(value: unknown, range: DateRange): boolean {
  if (!range.start && !range.end) return true;
  const d = normaliseDate(value);
  if (!d) return true; // never hide rows we cannot date
  if (range.start && d < range.start) return false;
  if (range.end && d > range.end) return false;
  return true;
}

interface WorkspaceValue {
  preset: RangePreset;
  custom: { start: string; end: string };
  range: DateRange;
  setPreset: (p: RangePreset) => void;
  setCustom: (c: { start: string; end: string }) => void;
  resetRange: () => void;
}

const WorkspaceContext = createContext<WorkspaceValue>({
  preset: "all",
  custom: { start: "", end: "" },
  range: { start: null, end: null, label: "All time" },
  setPreset: () => {},
  setCustom: () => {},
  resetRange: () => {},
});

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [preset, setPresetState] = useState<RangePreset>("all");
  const [custom, setCustomState] = useState({ start: "", end: "" });

  useEffect(() => {
    const saved = window.localStorage.getItem(RANGE_KEY);
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved) as { preset?: RangePreset; custom?: { start: string; end: string } };
      if (parsed.preset) setPresetState(parsed.preset);
      if (parsed.custom) setCustomState(parsed.custom);
    } catch {
      /* ignore malformed storage */
    }
  }, []);

  const persist = useCallback((p: RangePreset, c: { start: string; end: string }) => {
    window.localStorage.setItem(RANGE_KEY, JSON.stringify({ preset: p, custom: c }));
  }, []);

  const setPreset = useCallback(
    (p: RangePreset) => {
      setPresetState(p);
      persist(p, custom);
    },
    [custom, persist],
  );

  const setCustom = useCallback(
    (c: { start: string; end: string }) => {
      setCustomState(c);
      setPresetState("custom");
      persist("custom", c);
    },
    [persist],
  );

  const resetRange = useCallback(() => {
    setPresetState("all");
    setCustomState({ start: "", end: "" });
    persist("all", { start: "", end: "" });
  }, [persist]);

  const value = useMemo<WorkspaceValue>(
    () => ({ preset, custom, range: resolveRange(preset, custom), setPreset, setCustom, resetRange }),
    [preset, custom, setPreset, setCustom, resetRange],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export const useWorkspace = () => useContext(WorkspaceContext);

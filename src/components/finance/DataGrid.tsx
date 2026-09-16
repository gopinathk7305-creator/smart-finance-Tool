import { useVirtualizer } from "@tanstack/react-virtual";
import { useMemo, useRef } from "react";

const HIDDEN = new Set(["user_id", "org_id", "source_file"]);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}([T ]|$)/;

/** Collects every column present across the dataset, not just the first row. */
export function collectColumns(rows: Record<string, unknown>[], sample = 200): string[] {
  const seen: string[] = [];
  const set = new Set<string>();
  rows.slice(0, sample).forEach((r) => {
    Object.keys(r ?? {}).forEach((k) => {
      if (HIDDEN.has(k) || set.has(k)) return;
      set.add(k);
      seen.push(k);
    });
  });
  return seen;
}

export function labelFor(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\bpct\b/gi, "%")
    .replace(/\bid\b/gi, "ID")
    .replace(/\bgst\b/gi, "GST")
    .replace(/\btds\b/gi, "TDS")
    .replace(/\bpf\b/gi, "PF")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function isNumeric(value: unknown): boolean {
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "string" || !value.trim()) return false;
  return /^-?\d+(\.\d+)?$/.test(value.trim());
}

/** Decides alignment per column from the first non-empty values it sees. */
export function numericColumns(rows: Record<string, unknown>[], cols: string[]): Set<string> {
  const out = new Set<string>();
  cols.forEach((c) => {
    let checked = 0;
    let numeric = 0;
    for (const r of rows) {
      const v = r?.[c];
      if (v === null || v === undefined || v === "") continue;
      checked += 1;
      if (isNumeric(v)) numeric += 1;
      if (checked >= 20) break;
    }
    if (checked > 0 && numeric === checked) out.add(c);
  });
  return out;
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return JSON.stringify(value);
  const s = String(value);
  if (ISO_DATE.test(s)) {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
    }
  }
  if (typeof value === "number") return value.toLocaleString("en-IN", { maximumFractionDigits: 2 });
  return s;
}

interface DataGridProps {
  rows: Record<string, unknown>[];
  columns: string[];
  numeric?: Set<string>;
  rowHeight?: number;
  maxHeight?: number;
  columnWidth?: number;
}

/**
 * Virtualized grid that renders any number of columns with horizontal +
 * vertical scrolling and a sticky header.
 */
export function DataGrid({
  rows,
  columns,
  numeric,
  rowHeight = 38,
  maxHeight = 520,
  columnWidth = 170,
}: DataGridProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: 14,
  });
  const items = virtualizer.getVirtualItems();
  const numericSet = useMemo(() => numeric ?? numericColumns(rows, columns), [numeric, rows, columns]);
  const totalWidth = columns.length * columnWidth;

  return (
    <div
      ref={parentRef}
      className="w-full overflow-auto rounded-xl border border-border shadow-card"
      style={{ maxHeight }}
    >
      <div style={{ width: totalWidth, minWidth: "100%" }}>
        <div className="sticky top-0 z-10 flex bg-foreground text-background">
          {columns.map((c) => (
            <div
              key={c}
              className="shrink-0 truncate px-3 py-2 text-xs font-semibold uppercase tracking-wide"
              style={{ width: columnWidth, textAlign: numericSet.has(c) ? "right" : "left" }}
              title={labelFor(c)}
            >
              {labelFor(c)}
            </div>
          ))}
        </div>
        <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
          {items.map((v) => {
            const r = rows[v.index]!;
            return (
              <div
                key={v.key}
                className="flex border-t border-border hover:bg-muted/40"
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: v.size,
                  transform: `translateY(${v.start}px)`,
                }}
              >
                {columns.map((c) => {
                  const isNum = numericSet.has(c);
                  const text = formatCell(r?.[c]);
                  return (
                    <div
                      key={c}
                      className={`shrink-0 truncate px-3 py-2 text-sm ${isNum ? "tabular" : ""}`}
                      style={{ width: columnWidth, textAlign: isNum ? "right" : "left" }}
                      title={text}
                    >
                      {text}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Budget/tracker sheets often lay months out as columns (Entity | Jan | Feb … Dec).
// unpivotMonthColumns turns each month cell into its own dated expense row so the
// rest of the dashboard (mapper, charts, KPIs) works unchanged.
import { parseNum } from "@/lib/column-map";

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const monthIndex = (key: string) => {
  const k = key.trim().toLowerCase().replace(/[^a-z]/g, "");
  if (k.length < 3) return -1;
  return MONTHS.findIndex((m) => k === m || (k.startsWith(m) && k.length <= 9));
};

export function monthColumns(rows: Record<string, unknown>[]): { col: string; idx: number }[] {
  const keys = new Set<string>();
  rows.slice(0, 50).forEach((r) => Object.keys(r ?? {}).forEach((k) => keys.add(k)));
  const found = [...keys].map((col) => ({ col, idx: monthIndex(col) })).filter((m) => m.idx >= 0);
  return found.length >= 3 ? found : [];
}

export function unpivotMonthColumns(rows: Record<string, unknown>[], year = new Date().getFullYear()) {
  const months = monthColumns(rows);
  if (!months.length) return rows;
  const monthSet = new Set(months.map((m) => m.col));
  const out: Record<string, unknown>[] = [];
  for (const row of rows) {
    const textCols = Object.keys(row).filter((k) => {
      if (monthSet.has(k) || /^(no|sno|s_no|sr|sr_no|id|#)$/i.test(k)) return false;
      const v = String(row[k] ?? "").trim();
      return v !== "" && !Number.isFinite(Number(parseNum(v)));
    });
    const category = String(row[textCols[0] ?? ""] ?? "").trim() || "Uncategorised";
    const location = textCols[1] ? String(row[textCols[1]] ?? "").trim() : "";
    for (const { col, idx } of months) {
      const amount = Math.abs(Number(parseNum(row[col])) || 0);
      if (!amount) continue;
      out.push({
        date: `${year}-${String(idx + 1).padStart(2, "0")}-01`,
        category,
        ...(location ? { location } : {}),
        type: "expense",
        expense_amount: amount,
      });
    }
  }
  return out.length ? out : rows;
}

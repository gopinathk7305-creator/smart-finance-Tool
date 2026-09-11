// Minimal, dependency-free CSV parser that handles quoted fields.

export function parseCSV(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  const pushField = () => {
    row.push(field.trim());
    field = "";
  };
  const pushRow = () => {
    pushField();
    if (row.some((c) => c !== "")) rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ",") pushField();
    else if (c === "\n") pushRow();
    else if (c !== "\r") field += c;
  }
  pushRow();

  const header = rows.shift();
  if (!header) return [];
  const keys = header.map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  return rows.map((r) => {
    const obj: Record<string, string> = {};
    keys.forEach((k, i) => (obj[k] = r[i] ?? ""));
    return obj;
  });
}

export const toNumber = (v: string | undefined) => {
  const n = Number(String(v ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

export function toISODate(v: string | undefined): string | null {
  const raw = String(v ?? "").trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const dmy = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2]!.padStart(2, "0")}-${dmy[1]!.padStart(2, "0")}`;
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString().slice(0, 10);
}

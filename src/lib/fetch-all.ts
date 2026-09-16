// Supabase/PostgREST caps a single response at 1,000 rows. Every dataset read
// pages through .range() until the last partial page arrives, so 15,000 or
// 50,000 row files load completely.

export const PAGE_SIZE = 1000;

interface PageResult<T> {
  data: T[] | null;
  error: { message: string } | null;
}

export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<PageResult<T>>,
  pageSize = PAGE_SIZE,
  maxRows = 200_000,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < maxRows; from += pageSize) {
    const { data, error } = await page(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < pageSize) break;
  }
  return out;
}

/** Merges the stored raw upload payload back onto a row so every original column renders. */
export function withRawColumns<T extends Record<string, unknown>>(row: T): Record<string, unknown> {
  const { raw_data: raw, ...rest } = row as Record<string, unknown>;
  if (!raw || typeof raw !== "object") return rest;
  return { ...(raw as Record<string, unknown>), ...rest };
}

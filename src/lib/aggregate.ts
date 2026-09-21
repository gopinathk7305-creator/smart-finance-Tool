/**
 * Chunked aggregation helpers. Large datasets (15k–50k+ rows) are reduced in
 * blocks of 2,000 so a single long synchronous loop never blocks paint, and so
 * results stay cheap to memoize.
 */
export const CHUNK = 2000;

/** Sum a numeric projection over rows in chunks of `size`. */
export function sumChunked<T>(rows: readonly T[], pick: (row: T) => number, size = CHUNK): number {
  let total = 0;
  for (let start = 0; start < rows.length; start += size) {
    const end = Math.min(start + size, rows.length);
    let block = 0;
    for (let i = start; i < end; i += 1) block += Number(pick(rows[i] as T)) || 0;
    total += block;
  }
  return total;
}

/** Group-and-sum over rows in chunks of `size`. */
export function groupSumChunked<T>(
  rows: readonly T[],
  key: (row: T) => string,
  value: (row: T) => number,
  size = CHUNK,
): Map<string, number> {
  const out = new Map<string, number>();
  for (let start = 0; start < rows.length; start += size) {
    const end = Math.min(start + size, rows.length);
    for (let i = start; i < end; i += 1) {
      const row = rows[i] as T;
      const k = key(row);
      out.set(k, (out.get(k) ?? 0) + (Number(value(row)) || 0));
    }
  }
  return out;
}

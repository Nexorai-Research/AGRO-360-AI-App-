/** Units from the AI engines are statistics (not ledger quantities): shown with at most 1 place, never used in arithmetic. */
export const units = (n: number | null | undefined): string =>
  n === null || n === undefined || !Number.isFinite(n) ? '-' : String(Math.round(n * 10) / 10);

/** A share such as 0.23 as "23%". */
export const pct = (n: number | null | undefined): string =>
  n === null || n === undefined || !Number.isFinite(n) ? '-' : `${Math.round(n * 100)}%`;

/** An estimate in rupees from the AI engines (a plain number on the wire), shown with Indian grouping. Display only. */
export const rupee = (n: number | null | undefined): string =>
  n === null || n === undefined || !Number.isFinite(n)
    ? '-'
    : `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

/** Payload fields shown on a recommendation card: short readable values only, never ids, hashes or nested data. */
export function payloadRows(p: Record<string, unknown>): [string, string][] {
  const out: [string, string][] = [];
  for (const [key, v] of Object.entries(p)) {
    if (/hash|token|id$/i.test(key)) continue;
    if (typeof v === 'string' && v.length <= 80) out.push([key, v]);
    else if (typeof v === 'number' || typeof v === 'boolean') out.push([key, String(v)]);
  }
  return out.slice(0, 12);
}

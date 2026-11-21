import { Decimal } from 'decimal.js';
import { dec } from '@/money';

// Web parity phase 31: the search and filters the web puts over its lists (filteredTable): a search box, a status filter, a date range, and
// for bills "Paid by". Pure rules over rows that are already loaded; the server still decides what a row may do.

export interface ListFilter {
  q: string;
  status: string;
  from: string;
  to: string;
  paidBy: string;
}
export const emptyFilter = (): ListFilter => ({ q: '', status: '', from: '', to: '', paidBy: '' });
export const isFiltered = (f: ListFilter) => Boolean(f.q.trim() || f.status || f.from || f.to || f.paidBy);

export interface Accessors<T> {
  /** Everything the search box reads (number, name, amount...). */
  text: (r: T) => string;
  status?: (r: T) => string | null | undefined;
  /** A day as YYYY-MM-DD, or a timestamp; only its first 10 letters count. */
  date?: (r: T) => string | null | undefined;
  paidBy?: (r: T) => string[];
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const isDay = (d: string) => DAY.test(d) && new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d;

/** The date range of a list: both days real, From not after To (an empty side is open). */
export function rangeProblem(from: string, to: string): 'format' | 'order' | null {
  const f = from.trim();
  const t = to.trim();
  if ((f && !isDay(f)) || (t && !isDay(t))) return 'format';
  if (f && t && f > t) return 'order';
  return null;
}

export function filterRows<T>(rows: T[], f: ListFilter, a: Accessors<T>): T[] {
  const needle = f.q.trim().toLowerCase();
  const bad = rangeProblem(f.from, f.to) !== null;
  return rows.filter((r) => {
    if (needle && !a.text(r).toLowerCase().includes(needle)) return false;
    if (f.status && a.status && a.status(r) !== f.status) return false;
    if (f.paidBy && a.paidBy && !a.paidBy(r).includes(f.paidBy)) return false;
    if (a.date && !bad) {
      const d = (a.date(r) ?? '').slice(0, 10);
      if (f.from.trim() && (!d || d < f.from.trim())) return false;
      if (f.to.trim() && (!d || d > f.to.trim())) return false;
    }
    return true;
  });
}
/** The distinct values of a column, sorted, for a status filter that offers only what the list has. */
export const distinct = <T>(rows: T[], pick: (r: T) => string | null | undefined): string[] =>
  [...new Set(rows.map(pick).filter((v): v is string => Boolean(v)))].sort();

/**
 * How a bill was paid, the split of the web's Home "How customers paid": any credit part is CREDIT, any UPI / card / bank part is DIGITAL,
 * and what is left is CASH. Money is compared as decimals, never as floating point.
 */
export function paidKinds(i: {
  total: string;
  creditAmount: string;
  tenderMode?: string | null;
}): ('CASH' | 'DIGITAL' | 'CREDIT')[] {
  const total = dec(i.total || '0');
  const credit = Decimal.min(dec(i.creditAmount || '0'), total);
  const rest = total.minus(credit);
  const digital = /(upi|card|bank|neft|rtgs|imps|wallet|online|qr|cheque)/i.test(String(i.tenderMode ?? ''));
  const kinds: ('CASH' | 'DIGITAL' | 'CREDIT')[] = [];
  if (credit.gt(0)) kinds.push('CREDIT');
  if (digital && rest.gt(0)) kinds.push('DIGITAL');
  if (!digital && rest.gt(0)) kinds.push('CASH');
  return kinds;
}

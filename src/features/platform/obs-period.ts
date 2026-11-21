// Web parity phase 27: the period of the observability pages (apps/web/src/pages/observability.js). Either the last N days, or a chosen
// range of calendar days (from and to, both included). Only the days the activity is kept for can be chosen: 90 days up to today.

export interface Period {
  /** The last N days, used when no range is chosen (and always on one person's page, which only knows days). */
  days: string;
  /** A chosen range as YYYY-MM-DD; both empty means "the last N days". */
  from: string;
  to: string;
}
export const KEPT_DAYS = 90;
export const defaultPeriod = (): Period => ({ days: '30', from: '', to: '' });
export const isCustom = (p: Period) => Boolean(p.from && p.to);
/** The query the API takes: from and to for a range, days otherwise. */
export const periodQuery = (p: Period): Record<string, string> =>
  isCustom(p) ? { from: p.from, to: p.to } : { days: p.days };
/** One key for the cache: a new period is a new question. */
export const periodKey = (p: Period) => (isCustom(p) ? `${p.from}..${p.to}` : p.days);

const isDay = (d: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(d) &&
  !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) &&
  new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d;
export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
/** The first day that can still be chosen (today and the 89 days before it). */
export const earliestDay = (today: string) => addDays(today, -(KEPT_DAYS - 1));

export type RangeError = 'both' | 'format' | 'order' | 'future' | 'old';
/** The web's checks, in its order: both dates, From not after To, nothing in the future, nothing older than the activity kept. */
export function rangeError(from: string, to: string, today: string): RangeError | null {
  const f = from.trim();
  const t = to.trim();
  if (!f || !t) return 'both';
  if (!isDay(f) || !isDay(t)) return 'format';
  if (f > t) return 'order';
  if (t > today || f > today) return 'future';
  if (f < earliestDay(today)) return 'old';
  return null;
}

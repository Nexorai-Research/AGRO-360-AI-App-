import { Decimal } from 'decimal.js';

// The API sends money and quantities as strings. They are only ever handled as Decimal, never as float.
Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export type Amount = string;

export const dec = (v: Amount | number | Decimal): Decimal => new Decimal(v);
export const add = (a: Amount, b: Amount): Amount => dec(a).plus(b).toFixed(2);
export const sub = (a: Amount, b: Amount): Amount => dec(a).minus(b).toFixed(2);
export const mul = (a: Amount, b: Amount, places = 2): Amount => dec(a).times(b).toFixed(places);
export const sum = (xs: Amount[]): Amount => xs.reduce((t, x) => t.plus(x), new Decimal(0)).toFixed(2);
export const isZero = (a: Amount) => dec(a).isZero();
export const cmp = (a: Amount, b: Amount) => dec(a).comparedTo(b);

/** Shown instead of an amount that is missing or not a number. */
export const NO_VALUE = '–';
const decOrNull = (v: unknown): Decimal | null => {
  if (v === null || v === undefined || v === '') return null;
  try {
    const d = new Decimal(v as string);
    return d.isFinite() ? d : null;
  } catch {
    return null;
  }
};

/**
 * Indian digit grouping (12,34,567.50) done on the string, so no float rounding can touch it.
 * Display only: a missing or broken amount shows "–" instead of breaking the screen (found testing the running app, 20 November
 * 2026). Arithmetic (`dec`, `add`, ...) stays strict, so a wrong amount is never hidden inside a calculation.
 */
export function formatINR(a: Amount | number | null | undefined, places = 2): string {
  const v = decOrNull(a);
  if (!v) return NO_VALUE;
  const neg = v.isNegative();
  const [int = '0', frac = ''] = v.abs().toFixed(places).split('.');
  const last3 = int.slice(-3);
  const rest = int.slice(0, -3);
  const grouped = rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${last3}` : last3;
  return `${neg ? '-' : ''}₹${grouped}${places ? `.${frac}` : ''}`;
}

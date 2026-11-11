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

/** Indian digit grouping (12,34,567.50) done on the string, so no float rounding can touch it. */
export function formatINR(a: Amount, places = 2): string {
  const neg = dec(a).isNegative();
  const [int = '0', frac = ''] = dec(a).abs().toFixed(places).split('.');
  const last3 = int.slice(-3);
  const rest = int.slice(0, -3);
  const grouped = rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${last3}` : last3;
  return `${neg ? '-' : ''}₹${grouped}${places ? `.${frac}` : ''}`;
}

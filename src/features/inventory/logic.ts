import { dec } from '@/money';

const SIGNED_QTY = /^-?\d+(\.\d{1,3})?$/;
const QTY = /^\d+(\.\d{1,3})?$/;
const COST = /^\d+(\.\d{1,4})?$/;
export type QtyCheck = 'ok' | 'format' | 'zero' | 'tooMany';

/** Signed adjustment quantity, compared as decimals: not zero, at most 3 places, a decrease cannot go below what is on hand. */
export function checkDelta(raw: string, onHand: string): QtyCheck {
  const v = raw.trim();
  if (!SIGNED_QTY.test(v)) return 'format';
  const d = dec(v);
  if (d.isZero()) return 'zero';
  if (d.isNegative() && d.abs().gt(onHand)) return 'tooMany';
  return 'ok';
}
/** Transfer / damage quantity: more than zero, at most 3 places, not above what is on hand when that is known. */
export function checkQty(raw: string, onHand?: string): QtyCheck {
  const v = raw.trim();
  if (!QTY.test(v)) return 'format';
  if (!dec(v).gt(0)) return 'zero';
  if (onHand !== undefined && dec(v).gt(onHand)) return 'tooMany';
  return 'ok';
}
export const validCost = (v: string) => v.trim() === '' || COST.test(v.trim());
/** Stock found (an increase) may carry a unit cost; a decrease never does. */
export const costAllowed = (delta: string) => SIGNED_QTY.test(delta.trim()) && dec(delta.trim()).gt(0);

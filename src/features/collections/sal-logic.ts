import { dec } from '@/money';
import { validAmount } from './extras-logic';

// Same limits as the server (modules/credit/src/domain/collections.ts and credit.ts). Money is only compared as Decimal.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const validDate = (v: string): boolean => {
  const s = v.trim();
  if (!DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};
export const validOptionalDate = (v: string): boolean => v.trim() === '' || validDate(v);

/** A bounce needs a reason of 3 to 500 letters; date and bank charge are optional (charge up to 2 places, 0 or more). */
export type BounceError = 'reason' | 'date' | 'charge';
export function bounceErrors(f: { reason: string; date: string; charge: string }): BounceError[] {
  const e: BounceError[] = [];
  const r = f.reason.trim().length;
  if (r < 3 || r > 500) e.push('reason');
  if (!validOptionalDate(f.date)) e.push('date');
  const c = f.charge.trim();
  if (c !== '' && !(/^\d+(\.\d{1,2})?$/.test(c) && dec(c).lte('999999999'))) e.push('charge');
  return e;
}
export function buildBounce(f: { reason: string; date: string; charge: string }) {
  return {
    reason: f.reason.trim(),
    ...(f.date.trim() ? { date: f.date.trim() } : {}),
    ...(f.charge.trim() && dec(f.charge.trim()).gt(0) ? { charge: dec(f.charge.trim()).toFixed(2) } : {}),
  };
}

/** A credit limit is 0 (cash only) or more, up to 4 places, at most 999999999999. */
export const validLimit = (v: string): boolean => {
  const s = v.trim();
  return /^\d+(\.\d{1,4})?$/.test(s) && dec(s).lte('999999999999');
};
export const validReason = (v: string, min = 3, max = 500): boolean =>
  v.trim().length >= min && v.trim().length <= max;

export type WriteOffError = 'customer' | 'amount' | 'reason' | 'evidence';
export function writeOffErrors(f: {
  customerId: string;
  amount: string;
  reason: string;
  evidence: string;
}): WriteOffError[] {
  const e: WriteOffError[] = [];
  if (!f.customerId) e.push('customer');
  if (!validAmount(f.amount)) e.push('amount');
  if (!validReason(f.reason)) e.push('reason');
  if (!validReason(f.evidence, 10, 2000)) e.push('evidence');
  return e;
}
export type RecoveryError = 'amount' | 'mode' | 'date';
export function recoveryErrors(f: { amount: string; modeCode: string; date: string }): RecoveryError[] {
  const e: RecoveryError[] = [];
  if (!validAmount(f.amount)) e.push('amount');
  if (!f.modeCode || f.modeCode === 'CREDIT') e.push('mode');
  if (!validDate(f.date)) e.push('date');
  return e;
}

/** Name of an officer for the assignment list. */
export const staffName = (u: { fullName?: string | null; username?: string; id: string }) =>
  u.fullName || u.username || u.id.slice(-6);

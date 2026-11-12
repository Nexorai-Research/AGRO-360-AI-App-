import { dec } from '@/money';
import type { Outcome, OutcomeBody, PromiseBody } from './extras-api';
import { todayIST } from './receipt';

// Same limits as the server (modules/credit/src/domain/collections.ts): amount above 0, at most 2 places, at most 999999999999;
// a promise needs a date after today; a dispute needs a note. Compared as Decimal.
const AMOUNT_RE = /^\d+(\.\d{1,2})?$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX = '999999999999';

export const validAmount = (v: string): boolean =>
  AMOUNT_RE.test(v.trim()) && dec(v.trim()).gt(0) && dec(v.trim()).lte(MAX);
export const validFutureDate = (v: string, today: string = todayIST()): boolean => {
  const s = v.trim();
  if (!DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s && s > today;
};

export type OutcomeError = 'amount' | 'date' | 'note' | 'noteLong';

export function outcomeErrors(
  o: Outcome,
  f: { note: string; amount: string; date: string },
  today?: string,
): OutcomeError[] {
  const e: OutcomeError[] = [];
  if (f.note.trim().length > 500) e.push('noteLong');
  if (o === 'PROMISE') {
    if (!validAmount(f.amount)) e.push('amount');
    if (!validFutureDate(f.date, today)) e.push('date');
  }
  if (o === 'DISPUTE' && f.note.trim() === '') e.push('note');
  return e;
}

/** Amount and date are only sent for a promise; a blank note is left out. */
export function buildOutcome(o: Outcome, f: { note: string; amount: string; date: string }): OutcomeBody {
  return {
    outcome: o,
    ...(f.note.trim() ? { note: f.note.trim() } : {}),
    ...(o === 'PROMISE' ? { promiseAmount: f.amount.trim(), promiseDate: f.date.trim() } : {}),
  };
}

export type PromiseError = 'customer' | 'amount' | 'date' | 'noteLong';
export function promiseErrors(
  f: { customerId: string; amount: string; date: string; note: string },
  today?: string,
): PromiseError[] {
  const e: PromiseError[] = [];
  if (!f.customerId) e.push('customer');
  if (!validAmount(f.amount)) e.push('amount');
  if (!validFutureDate(f.date, today)) e.push('date');
  if (f.note.trim().length > 500) e.push('noteLong');
  return e;
}
export const buildPromise = (f: { amount: string; date: string; note: string }): PromiseBody => ({
  amount: f.amount.trim(),
  promiseDate: f.date.trim(),
  ...(f.note.trim() ? { note: f.note.trim() } : {}),
});

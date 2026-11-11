import { dec } from '@/money';

// Pure checks for the HR forms. The server checks everything again; these only save a round trip and explain the mistake.

export const isDate = (v: string): boolean => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim());
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
};

export const isPeriod = (v: string): boolean => /^\d{4}-(0[1-9]|1[0-2])$/.test(v.trim());

export type LeaveError = 'type' | 'from' | 'to' | 'order' | 'year' | 'half';
export function checkLeave(f: { typeId: string; from: string; to: string; half: boolean }): LeaveError | null {
  if (!f.typeId) return 'type';
  if (!isDate(f.from)) return 'from';
  if (!isDate(f.to)) return 'to';
  if (f.to < f.from) return 'order';
  if (f.from.slice(0, 4) !== f.to.slice(0, 4)) return 'year';
  if (f.half && f.from !== f.to) return 'half';
  return null;
}

const AMOUNT_RE = /^\d+(\.\d{1,2})?$/;
export type AmountError = 'required' | 'format' | 'zero' | 'max';
/** Money is a decimal string, at most 2 places, above zero and within the server limit of 1,00,00,000. Checked as a decimal, never a float. */
export function checkAmount(raw: string): AmountError | null {
  const v = raw.trim();
  if (v === '') return 'required';
  if (!AMOUNT_RE.test(v)) return 'format';
  const d = dec(v);
  if (d.isZero()) return 'zero';
  if (d.greaterThan('10000000')) return 'max';
  return null;
}

/** Installments is a whole number from 1 to 60. */
export const checkInstallments = (raw: string): boolean =>
  /^\d{1,2}$/.test(raw.trim()) && Number(raw) >= 1 && Number(raw) <= 60;

export type VisitError = 'place' | 'outcome';
export function checkVisit(f: { village: string; beatId: string; outcome: string }): VisitError | null {
  if (!f.village.trim() && !f.beatId) return 'place';
  if (!f.outcome) return 'outcome';
  return null;
}

/** A rejection needs a reason of at least 3 characters. */
export const validRejectNote = (v: string): boolean => v.trim().length >= 3;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "2026-11-03" -> "3 Nov 2026", without a time zone. */
export function shortDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  const name = MONTHS[Number(m) - 1];
  return name && y && d ? `${Number(d)} ${name} ${y}` : iso;
}

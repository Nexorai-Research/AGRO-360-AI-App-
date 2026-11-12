import { dec } from '@/money';

// Pure rules for the user, role and document forms. They mirror the server rules so a bad value is caught before sending;
// the server still decides.

export const USERNAME_RE = /^[A-Za-z0-9._-]{3,40}$/;
export const validUsername = (v: string) => USERNAME_RE.test(v.trim());
export const validFullName = (v: string) => v.trim().length >= 2 && v.trim().length <= 120;

/** Removes spaces, dashes, a +91 or 91 prefix and a leading 0, the same shapes the server accepts. */
export function normalizeMobile(v: string): string {
  let s = v.replace(/[\s-]/g, '');
  if (s.startsWith('+91')) s = s.slice(3);
  else if (s.length === 12 && s.startsWith('91')) s = s.slice(2);
  else if (s.length === 11 && s.startsWith('0')) s = s.slice(1);
  return s;
}
export const validMobile = (v: string) => {
  const m = normalizeMobile(v);
  return /^[6-9]\d{9}$/.test(m) && !/^(\d)\1{9}$/.test(m);
};
export const validEmail = (v: string) => v.trim() === '' || (v.trim().length <= 254 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.trim()));

export const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x) => b.includes(x));
export const toggleId = (list: readonly string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

export const LIMIT_KEYS = [
  'line_discount_pct',
  'bill_discount_pct',
  'price_override_pct',
  'credit_override_amount',
  'po_value_without_approval',
  'stock_adjustment_value',
  'cash_refund_amount',
  'credit_limit_amount',
] as const;
export type LimitKey = (typeof LIMIT_KEYS)[number];

/** Empty means "not set". Otherwise a non-negative decimal with at most 4 fraction digits; percentages cannot pass 100. */
export function validLimit(key: string, v: string): boolean {
  const s = v.trim();
  if (s === '') return true;
  if (!/^\d{1,15}(\.\d{1,4})?$/.test(s)) return false;
  return !key.endsWith('_pct') || dec(s).lte(100);
}

export const validRoleName = (v: string) => v.trim().length >= 2 && v.trim().length <= 80;

export interface PermissionView {
  code: string;
  module: string;
  description: string;
  enabled: boolean;
}
export const areaOf = (code: string) => code.split('.')[0] ?? code;
export function groupByArea<T extends { code: string }>(items: readonly T[]): [string, T[]][] {
  const m = new Map<string, T[]>();
  for (const p of items) m.set(areaOf(p.code), [...(m.get(areaOf(p.code)) ?? []), p]);
  return [...m];
}
/** A permission can be switched on only if its module is in the plan and you hold it yourself; one the role already has can always be switched off. */
export const canGrant = (p: PermissionView, held: (code: string) => boolean) => p.enabled && held(p.code);

export const DOC_EXTENSIONS = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'jpg', 'jpeg', 'png'] as const;
export const DOC_MAX_BYTES = 4 * 1024 * 1024;
export const extensionOk = (name: string) => (DOC_EXTENSIONS as readonly string[]).includes((name.split('.').pop() ?? '').toLowerCase());
export const validDocTitle = (v: string) => v.trim().length >= 1 && v.trim().length <= 200;
export const validExpiry = (v: string) => {
  if (v === '') return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
};

export const DATE_FORMATS = ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'] as const;
export const THEMES = ['light', 'dark'] as const;
export const validPrinter = (v: string) => v.trim().length <= 100;

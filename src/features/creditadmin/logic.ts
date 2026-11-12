import { dec } from '@/money';
import { validDate } from '../collections/sal-logic';
import type { CreditSettings, ReminderRule, SettingsBody } from './api';

// Same limits as the server (modules/credit/src/domain/collections.ts). Money and rates stay decimal strings.

const isDec = (v: string, dp: number, max: string, positive = false): boolean => {
  const s = v.trim();
  if (!new RegExp(`^\\d+(\\.\\d{1,${dp}})?$`).test(s)) return false;
  const d = dec(s);
  return d.lte(max) && (!positive || d.gt(0));
};

export interface SettingsForm {
  interestEnabled: boolean;
  interestRatePa: string;
  interestGraceDays: string;
  interestFirst: boolean;
  autoHoldEnabled: boolean;
  holdOverdueDays: string;
  holdOverdueAmount: string;
  holdOnBounce: boolean;
  bounceCharge: string;
  settlementLimit: string;
}
export const settingsToForm = (s: CreditSettings): SettingsForm => ({
  interestEnabled: s.interestEnabled,
  interestRatePa: dec(s.interestRatePa).toString(),
  interestGraceDays: String(s.interestGraceDays),
  interestFirst: s.interestFirst,
  autoHoldEnabled: s.autoHoldEnabled,
  holdOverdueDays: s.holdOverdueDays === null ? '' : String(s.holdOverdueDays),
  holdOverdueAmount: s.holdOverdueAmount === null ? '' : dec(s.holdOverdueAmount).toString(),
  holdOnBounce: s.holdOnBounce,
  bounceCharge: dec(s.bounceCharge).toString(),
  settlementLimit: s.settlementLimit === null ? '' : dec(s.settlementLimit).toString(),
});

export type SettingsError = 'rate' | 'grace' | 'holdDays' | 'holdAmount' | 'bounceCharge' | 'settlementLimit';
export function settingsErrors(f: SettingsForm): SettingsError[] {
  const e: SettingsError[] = [];
  const rate = f.interestRatePa.trim() === '' ? '0' : f.interestRatePa;
  if (!isDec(rate, 4, '100')) e.push('rate');
  const g = f.interestGraceDays.trim() === '' ? '0' : f.interestGraceDays.trim();
  if (!/^\d+$/.test(g) || Number(g) > 365) e.push('grace');
  const hd = f.holdOverdueDays.trim();
  if (hd !== '' && (!/^\d+$/.test(hd) || Number(hd) < 1 || Number(hd) > 3650)) e.push('holdDays');
  const ha = f.holdOverdueAmount.trim();
  if (ha !== '' && !isDec(ha, 4, '999999999999', true)) e.push('holdAmount');
  const bc = f.bounceCharge.trim() === '' ? '0' : f.bounceCharge;
  if (!isDec(bc, 4, '999999999')) e.push('bounceCharge');
  const sl = f.settlementLimit.trim();
  if (sl !== '' && !isDec(sl, 4, '999999999999')) e.push('settlementLimit');
  return e;
}
export function buildSettings(f: SettingsForm): SettingsBody {
  const t = (v: string) => v.trim();
  return {
    interestEnabled: f.interestEnabled,
    interestRatePa: t(f.interestRatePa) === '' ? '0' : t(f.interestRatePa),
    interestGraceDays: t(f.interestGraceDays) === '' ? 0 : Number(t(f.interestGraceDays)),
    interestFirst: f.interestFirst,
    autoHoldEnabled: f.autoHoldEnabled,
    holdOverdueDays: t(f.holdOverdueDays) === '' ? null : Number(t(f.holdOverdueDays)),
    holdOverdueAmount: t(f.holdOverdueAmount) === '' ? null : t(f.holdOverdueAmount),
    holdOnBounce: f.holdOnBounce,
    bounceCharge: t(f.bounceCharge) === '' ? '0' : t(f.bounceCharge),
    settlementLimit: t(f.settlementLimit) === '' ? null : t(f.settlementLimit),
  };
}

export const validPeriodTo = (v: string): boolean => validDate(v);
export const validReasonText = (v: string): boolean => v.trim().length >= 3 && v.trim().length <= 500;

export interface RuleForm {
  name: string;
  offsetDays: string;
  channel: 'SMS' | 'WHATSAPP';
  bodyEn: string;
  bodyHi: string;
  bodyMr: string;
  active: boolean;
}
export const emptyRule = (): RuleForm => ({
  name: '',
  offsetDays: '0',
  channel: 'SMS',
  bodyEn: '',
  bodyHi: '',
  bodyMr: '',
  active: true,
});
export const ruleToForm = (r: ReminderRule): RuleForm => ({
  name: r.name,
  offsetDays: String(r.offsetDays),
  channel: r.channel,
  bodyEn: r.bodyEn,
  bodyHi: r.bodyHi ?? '',
  bodyMr: r.bodyMr ?? '',
  active: r.active,
});
export type RuleError = 'name' | 'offset' | 'bodyEn' | 'bodyHi' | 'bodyMr';
export function ruleErrors(f: RuleForm): RuleError[] {
  const e: RuleError[] = [];
  const n = f.name.trim().length;
  if (n < 2 || n > 60) e.push('name');
  const o = f.offsetDays.trim();
  if (!/^-?\d+$/.test(o) || Number(o) < -30 || Number(o) > 365) e.push('offset');
  const b = f.bodyEn.trim().length;
  if (b < 5 || b > 500) e.push('bodyEn');
  if (f.bodyHi.trim().length > 500) e.push('bodyHi');
  if (f.bodyMr.trim().length > 500) e.push('bodyMr');
  return e;
}
export const buildRule = (f: RuleForm, id: string | null): ReminderRule => ({
  id,
  name: f.name.trim(),
  offsetDays: Number(f.offsetDays.trim()),
  channel: f.channel,
  bodyEn: f.bodyEn.trim(),
  bodyHi: f.bodyHi.trim() || null,
  bodyMr: f.bodyMr.trim() || null,
  active: f.active,
});
/** The server allows 12 rules in all. */
export const MAX_RULES = 12;

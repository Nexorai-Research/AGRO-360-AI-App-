import { dec } from '@/money';
import { validDate } from '../collections/sal-logic';
import type { FinSettings } from './fx-api';

// Same limits as the server (modules/finance/src/domain/finance.ts and finance-b.ts). Money stays a decimal string.
export { validDate };
const money2 = (v: string): boolean => /^\d+(\.\d{1,2})?$/.test(v.trim()) && dec(v.trim()).gt(0);
export const validMoney = money2;
export const validReason10 = (v: string): boolean => v.trim().length >= 10 && v.trim().length <= 500;

// ---- settings ----
export interface SettingsForm {
  journalApprovalAmount: string;
  cashPaymentLimit: string;
  attachmentRequiredAbove: string;
  expenseApprovalAmount: string;
  expenseBasis: 'CASH' | 'ACCRUAL';
  requireCostCentre: boolean;
}
const show = (v: string | null) => (v === null ? '' : dec(v).toFixed(2));
export const settingsToForm = (s: FinSettings): SettingsForm => ({
  journalApprovalAmount: show(s.journalApprovalAmount),
  cashPaymentLimit: show(s.cashPaymentLimit),
  attachmentRequiredAbove: show(s.attachmentRequiredAbove),
  expenseApprovalAmount: show(s.expenseApprovalAmount),
  expenseBasis: s.expenseBasis,
  requireCostCentre: s.requireCostCentre,
});
const AMOUNTS = [
  'journalApprovalAmount',
  'cashPaymentLimit',
  'attachmentRequiredAbove',
  'expenseApprovalAmount',
] as const;
export type AmountKey = (typeof AMOUNTS)[number];
export const settingsErrors = (f: SettingsForm): AmountKey[] =>
  AMOUNTS.filter((k) => f[k].trim() !== '' && !money2(f[k]));
export function settingsBody(f: SettingsForm) {
  const n = (v: string) => (v.trim() === '' ? null : v.trim());
  return {
    journalApprovalAmount: n(f.journalApprovalAmount),
    cashPaymentLimit: n(f.cashPaymentLimit),
    attachmentRequiredAbove: n(f.attachmentRequiredAbove),
    expenseApprovalAmount: n(f.expenseApprovalAmount),
    expenseBasis: f.expenseBasis,
    requireCostCentre: f.requireCostCentre,
  };
}

// ---- opening balances ----
export interface OpeningLine {
  accountId: string;
  label: string;
  side: 'debit' | 'credit';
  amount: string;
}
export const openingTotals = (lines: OpeningLine[]) => {
  const d = lines.filter((l) => l.side === 'debit').reduce((t, l) => t.plus(l.amount), dec(0));
  const c = lines.filter((l) => l.side === 'credit').reduce((t, l) => t.plus(l.amount), dec(0));
  return {
    debit: d.toFixed(2),
    credit: c.toFixed(2),
    plug: d.minus(c).abs().toFixed(2),
    plugSide: d.gte(c) ? 'credit' : 'debit',
  };
};
export type OpeningError = 'date' | 'lines';
export const openingErrors = (asOn: string, lines: OpeningLine[], today: string): OpeningError[] => {
  const e: OpeningError[] = [];
  if (!validDate(asOn) || asOn.trim() > today) e.push('date');
  if (lines.length === 0) e.push('lines');
  return e;
};
export const openingBody = (asOn: string, lines: OpeningLine[]) => ({
  asOn: asOn.trim(),
  lines: lines.map((l) => ({ accountId: l.accountId, [l.side]: dec(l.amount).toFixed(2) })),
});

// ---- export ----
export const exportErrors = (from: string, to: string): ('from' | 'to')[] => {
  const e: ('from' | 'to')[] = [];
  if (!validDate(from)) e.push('from');
  if (!validDate(to) || (validDate(from) && to.trim() < from.trim())) e.push('to');
  return e;
};
export const mappingItems = (names: Record<string, string>) =>
  Object.entries(names)
    .map(([accountId, v]) => [accountId, v.trim()] as const)
    .filter(([, v]) => v !== '')
    .map(([accountId, v]) => ({ accountId, externalCode: v, externalName: v }));
export const validLedgerName = (v: string): boolean => v.trim().length <= 100;

// ---- intercompany ----
export interface InterForm {
  fromBranch: string;
  toBranch: string;
  cashAccountId: string;
  amount: string;
  date: string;
  description: string;
}
export type InterError = 'from' | 'to' | 'same' | 'cash' | 'amount' | 'date' | 'what';
export function interErrors(f: InterForm): InterError[] {
  const e: InterError[] = [];
  if (f.fromBranch === '') e.push('from');
  if (f.toBranch === '') e.push('to');
  else if (f.fromBranch === f.toBranch) e.push('same');
  if (f.cashAccountId === '') e.push('cash');
  if (!money2(f.amount)) e.push('amount');
  if (f.date.trim() !== '' && !validDate(f.date)) e.push('date');
  const d = f.description.trim().length;
  if (d < 3 || d > 300) e.push('what');
  return e;
}
export const interBody = (f: InterForm) => ({
  fromBranch: f.fromBranch,
  toBranch: f.toBranch,
  cashAccountId: f.cashAccountId,
  amount: dec(f.amount.trim()).toFixed(2),
  description: f.description.trim(),
  ...(f.date.trim() ? { date: f.date.trim() } : {}),
});

// ---- recurring expense ----
export interface TemplateForm {
  name: string;
  accountId: string;
  payee: string;
  amount: string;
  dayOfMonth: string;
  startDate: string;
}
export type TemplateError = 'name' | 'account' | 'payee' | 'amount' | 'day' | 'date';
export function templateErrors(f: TemplateForm): TemplateError[] {
  const e: TemplateError[] = [];
  const n = f.name.trim().length;
  if (n < 2 || n > 80) e.push('name');
  if (f.accountId === '') e.push('account');
  const p = f.payee.trim().length;
  if (p < 2 || p > 100) e.push('payee');
  if (!money2(f.amount)) e.push('amount');
  const d = f.dayOfMonth.trim();
  if (!/^\d+$/.test(d) || Number(d) < 1 || Number(d) > 28) e.push('day');
  if (!validDate(f.startDate)) e.push('date');
  return e;
}
export const templateBody = (f: TemplateForm) => ({
  name: f.name.trim(),
  accountId: f.accountId,
  payee: f.payee.trim(),
  amount: dec(f.amount.trim()).toFixed(2),
  dayOfMonth: Number(f.dayOfMonth.trim()),
  startDate: f.startDate.trim(),
});

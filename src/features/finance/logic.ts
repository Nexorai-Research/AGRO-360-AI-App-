import { dec } from '@/money';
import { isDate } from '../hr/logic';
import type { Account, VoucherKind } from './api';

// Pure checks and body builders. The server checks everything again and decides numbers and permissions.
export { isDate };
const AMOUNT_RE = /^\d+(\.\d{1,2})?$/;
export const validAmount = (v: string): boolean => AMOUNT_RE.test(v.trim()) && dec(v.trim()).gt(0);
export const optionalAmount = (v: string): boolean => v.trim() === '' || AMOUNT_RE.test(v.trim());
export const validReason = (v: string, min = 3): boolean => v.trim().length >= min;

export interface DraftLine {
  accountId: string;
  debit: string;
  credit: string;
  amount: string;
  narration: string;
}
export const emptyLine = (): DraftLine => ({
  accountId: '',
  debit: '',
  credit: '',
  amount: '',
  narration: '',
});

export type VoucherError =
  'date' | 'narration' | 'lines' | 'amount' | 'account' | 'balance' | 'bank' | 'contra' | 'same';
export interface VoucherDraft {
  kind: VoucherKind;
  date: string;
  narration: string;
  branchId: string;
  ref: string;
  lines: DraftLine[];
  bankAccountId: string;
  fromAccountId: string;
  toAccountId: string;
  amount: string;
}

/** Debit total minus credit total of the lines, as a decimal string. */
export function journalDiff(lines: DraftLine[]): string {
  let d = dec(0);
  for (const l of lines) {
    if (l.debit.trim() && AMOUNT_RE.test(l.debit.trim())) d = d.plus(l.debit.trim());
    if (l.credit.trim() && AMOUNT_RE.test(l.credit.trim())) d = d.minus(l.credit.trim());
  }
  return d.toFixed(2);
}

export function checkVoucher(v: VoucherDraft): VoucherError | null {
  if (!isDate(v.date)) return 'date';
  if (v.narration.trim().length < 3) return 'narration';
  if (v.kind === 'CONTRA') {
    if (!v.fromAccountId || !v.toAccountId) return 'contra';
    if (v.fromAccountId === v.toAccountId) return 'same';
    return validAmount(v.amount) ? null : 'amount';
  }
  if (v.kind !== 'JOURNAL' && !v.bankAccountId) return 'bank';
  if (v.lines.length === 0) return 'lines';
  for (const l of v.lines) {
    if (!l.accountId) return 'account';
    if (v.kind === 'JOURNAL') {
      const d = l.debit.trim();
      const c = l.credit.trim();
      if ((d === '') === (c === '')) return 'amount'; // exactly one side
      if (!validAmount(d || c)) return 'amount';
    } else if (!validAmount(l.amount)) return 'amount';
  }
  if (v.kind === 'JOURNAL') {
    if (v.lines.length < 2) return 'lines';
    if (!dec(journalDiff(v.lines)).isZero()) return 'balance';
  }
  return null;
}

export function buildVoucher(v: VoucherDraft): Record<string, unknown> {
  const head = {
    voucherDate: v.date,
    narration: v.narration.trim(),
    ...(v.branchId ? { branchId: v.branchId } : {}),
    ...(v.ref.trim() ? { attachmentRef: v.ref.trim() } : {}),
  };
  const nar = (l: DraftLine) => (l.narration.trim() ? { narration: l.narration.trim() } : {});
  if (v.kind === 'CONTRA')
    return { ...head, fromAccountId: v.fromAccountId, toAccountId: v.toAccountId, amount: v.amount.trim() };
  if (v.kind === 'JOURNAL')
    return {
      ...head,
      lines: v.lines.map((l) => ({
        accountId: l.accountId,
        ...(l.debit.trim() ? { debit: l.debit.trim() } : { credit: l.credit.trim() }),
        ...nar(l),
      })),
    };
  return {
    ...head,
    [v.kind === 'PAYMENT' ? 'paidFromAccountId' : 'receivedIntoAccountId']: v.bankAccountId,
    items: v.lines.map((l) => ({ accountId: l.accountId, amount: l.amount.trim(), ...nar(l) })),
  };
}

export function voucherActions(v: { status: string; needsApproval: boolean }, can: (p: string) => boolean) {
  const draft = v.status === 'DRAFT' && can('finance.voucher.create');
  const pending = v.status === 'PENDING_APPROVAL' && can('finance.voucher.approve');
  return {
    post: draft && !v.needsApproval,
    submit: draft && v.needsApproval,
    cancel: draft,
    approve: pending,
    reject: pending,
    reverse: v.status === 'POSTED' && can('finance.voucher.reverse'),
  };
}

export function expenseActions(e: { status: string }, can: (p: string) => boolean) {
  return {
    submit: e.status === 'DRAFT' && can('finance.expense.create'),
    approve: e.status === 'SUBMITTED' && can('finance.expense.approve'),
    reject: e.status === 'SUBMITTED' && can('finance.expense.approve'),
    pay: e.status === 'APPROVED' && can('finance.expense.pay'),
    reverse: (e.status === 'PAID' || e.status === 'APPROVED') && can('finance.voucher.reverse'),
  };
}

export interface ExpenseDraft {
  date: string;
  accountId: string;
  payee: string;
  amount: string;
  tax: string;
  eligible: boolean;
  docNo: string;
  ref: string;
  branchId: string;
  notes: string;
}
export function buildExpense(f: ExpenseDraft, confirmDuplicate: boolean): Record<string, unknown> {
  return {
    expenseDate: f.date,
    accountId: f.accountId,
    payee: f.payee.trim(),
    amount: f.amount.trim(),
    ...(f.tax.trim() ? { taxAmount: f.tax.trim() } : {}),
    inputTaxEligible: f.eligible,
    ...(f.docNo.trim() ? { documentNo: f.docNo.trim() } : {}),
    ...(f.ref.trim() ? { attachmentRef: f.ref.trim() } : {}),
    ...(f.branchId ? { branchId: f.branchId } : {}),
    ...(f.notes.trim() ? { notes: f.notes.trim() } : {}),
    ...(confirmDuplicate ? { confirmDuplicate: true } : {}),
  };
}
export type ExpenseError = 'date' | 'category' | 'payee' | 'amount' | 'tax';
export function checkExpense(f: ExpenseDraft): ExpenseError | null {
  if (!isDate(f.date)) return 'date';
  if (!f.accountId) return 'category';
  if (!f.payee.trim()) return 'payee';
  if (!validAmount(f.amount)) return 'amount';
  if (!optionalAmount(f.tax)) return 'tax';
  return null;
}

export const expenseAccounts = (xs: Account[]) =>
  xs.filter((a) => a.type === 'EXPENSE' && !a.isControl && !a.cashBank && a.active);
export const cashBankAccounts = (xs: Account[]) => xs.filter((a) => a.cashBank && a.active);
export const postableAccounts = (xs: Account[]) =>
  xs.filter((a) => a.active && !a.isControl && !a.isOpeningPlug);

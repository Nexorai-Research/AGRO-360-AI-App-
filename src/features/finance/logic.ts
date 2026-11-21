import { dec } from '@/money';
import { isDate } from '../hr/logic';
import type { Account, Expense, Voucher, VoucherKind } from './api';

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

// ---- web parity phase 9 (apps/web/src/pages/finance.js voucherEditor, finance-ops.js expense form and budgetsTab) ----
const pos = (x: string | null | undefined) => {
  try {
    return x !== null && x !== undefined && x !== '' && dec(x).gt(0);
  } catch {
    return false;
  }
};
/** A saved draft voucher back into the form, like the web editor: for a payment or receipt the last line is the cash / bank side. */
export function voucherToDraft(v: Voucher): VoucherDraft {
  const lines = v.lines ?? [];
  const base = {
    kind: v.kind as VoucherKind,
    date: v.voucherDate,
    narration: v.narration ?? '',
    branchId: v.branchId ?? '',
    ref: v.attachmentRef ?? '',
    lines: [] as DraftLine[],
    bankAccountId: '',
    fromAccountId: '',
    toAccountId: '',
    amount: '',
  };
  const nar = (n: string | null) => n ?? '';
  if (v.kind === 'CONTRA') {
    const dr = lines.find((l) => pos(l.debit));
    const cr = lines.find((l) => pos(l.credit));
    return {
      ...base,
      fromAccountId: cr?.accountId ?? '',
      toAccountId: dr?.accountId ?? '',
      amount: dr?.debit ?? '',
    };
  }
  if (v.kind === 'PAYMENT' || v.kind === 'RECEIPT') {
    const items = lines.slice(0, -1);
    return {
      ...base,
      bankAccountId: lines[lines.length - 1]?.accountId ?? '',
      lines: (items.length ? items : [null]).map((l) =>
        l
          ? {
              ...emptyLine(),
              accountId: l.accountId,
              amount: pos(l.debit) ? l.debit : l.credit,
              narration: nar(l.narration),
            }
          : emptyLine(),
      ),
    };
  }
  return {
    ...base,
    lines: (lines.length ? lines : [null, null]).map((l) =>
      l
        ? {
            ...emptyLine(),
            accountId: l.accountId,
            debit: pos(l.debit) ? l.debit : '',
            credit: pos(l.credit) ? l.credit : '',
            narration: nar(l.narration),
          }
        : emptyLine(),
    ),
  };
}
export function expenseToDraft(e: Expense): ExpenseDraft {
  return {
    date: e.expenseDate,
    accountId: e.accountId,
    payee: e.payee,
    amount: e.amount,
    tax: pos(e.taxAmount) ? e.taxAmount : '',
    eligible: e.inputTaxEligible,
    docNo: e.documentNo ?? '',
    ref: e.attachmentRef ?? '',
    branchId: e.branchId ?? '',
    notes: e.notes ?? '',
  };
}

/** Cost centre code like the server: 2-20 capital letters, digits or dashes. */
export const COST_CENTRE_CODE = /^[A-Z0-9][A-Z0-9-]{1,19}$/;
export function costCentreErrors(f: { code: string; name: string }): ('code' | 'name')[] {
  const e: ('code' | 'name')[] = [];
  if (!COST_CENTRE_CODE.test(f.code.trim().toUpperCase())) e.push('code');
  if (f.name.trim().length < 2 || f.name.trim().length > 120) e.push('name');
  return e;
}

/** The 12 months of a financial year "2026-27": April 2026 to March 2027, each as the first day. */
export function fyMonths(fyLabel: string): string[] {
  const y = Number(fyLabel.slice(0, 4));
  return Array.from(
    { length: 12 },
    (_, i) => `${i < 9 ? y : y + 1}-${String(((i + 3) % 12) + 1).padStart(2, '0')}-01`,
  );
}
export interface BudgetRow {
  accountId: string;
  monthly: string;
}
export interface BudgetForm {
  name: string;
  fyLabel: string;
  rows: BudgetRow[];
}
export type BudgetError = 'name' | 'year' | 'rows' | 'amount';
export function budgetErrors(f: BudgetForm): BudgetError[] {
  const e: BudgetError[] = [];
  if (f.name.trim().length < 2 || f.name.trim().length > 80) e.push('name');
  if (!/^\d{4}-\d{2}$/.test(f.fyLabel)) e.push('year');
  const used = f.rows.filter((r) => r.accountId || r.monthly.trim());
  if (!used.some((r) => r.accountId && r.monthly.trim())) e.push('rows');
  if (used.some((r) => !r.accountId || !validAmount(r.monthly))) e.push('amount');
  return e;
}
/** Like the web: each account's monthly amount is spread over the 12 months of the year. */
export function budgetBody(f: BudgetForm) {
  const months = fyMonths(f.fyLabel);
  return {
    name: f.name.trim(),
    fyLabel: f.fyLabel,
    lines: f.rows
      .filter((r) => r.accountId && r.monthly.trim())
      .flatMap((r) => months.map((month) => ({ accountId: r.accountId, month, amount: r.monthly.trim() }))),
  };
}

export const expenseAccounts = (xs: Account[]) =>
  xs.filter((a) => a.type === 'EXPENSE' && !a.isControl && !a.cashBank && a.active);
export const cashBankAccounts = (xs: Account[]) => xs.filter((a) => a.cashBank && a.active);
export const postableAccounts = (xs: Account[]) =>
  xs.filter((a) => a.active && !a.isControl && !a.isOpeningPlug);

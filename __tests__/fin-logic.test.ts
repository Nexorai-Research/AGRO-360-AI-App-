import parts from '../i18n-parts/fin.json';
import {
  buildExpense,
  buildVoucher,
  cashBankAccounts,
  checkExpense,
  checkVoucher,
  emptyLine,
  expenseAccounts,
  expenseActions,
  journalDiff,
  optionalAmount,
  postableAccounts,
  validAmount,
  voucherActions,
  type VoucherDraft,
} from '../src/features/finance/logic';
import type { Account } from '../src/features/finance/api';

const draft = (o: Partial<VoucherDraft> = {}): VoucherDraft => ({
  kind: 'JOURNAL',
  date: '2026-11-12',
  narration: 'Rent for November',
  branchId: '',
  ref: '',
  bankAccountId: '',
  fromAccountId: '',
  toAccountId: '',
  amount: '',
  lines: [
    { ...emptyLine(), accountId: 'a1', debit: '500.50' },
    { ...emptyLine(), accountId: 'a2', credit: '500.50' },
  ],
  ...o,
});
const acct = (o: Partial<Account>): Account => ({
  id: 'x',
  code: '1',
  name: 'n',
  type: 'ASSET',
  groupId: null,
  groupName: null,
  isControl: false,
  isSystem: false,
  cashBank: null,
  isOpeningPlug: false,
  active: true,
  description: null,
  version: 1,
  ...o,
});

describe('finance logic', () => {
  test('amounts are decimal strings: 2 places, above zero', () => {
    expect(validAmount('10')).toBe(true);
    expect(validAmount('0.10')).toBe(true);
    expect(validAmount('0')).toBe(false);
    expect(validAmount('1.005')).toBe(false);
    expect(validAmount('-5')).toBe(false);
    expect(validAmount('1e3')).toBe(false);
    expect(optionalAmount('')).toBe(true);
    expect(optionalAmount('1.234')).toBe(false);
  });
  test('journal difference is exact (no float drift)', () => {
    const l = (debit: string, credit: string) => ({ ...emptyLine(), debit, credit });
    expect(journalDiff([l('0.10', ''), l('0.20', ''), l('', '0.30')])).toBe('0.00');
    expect(journalDiff([l('100', ''), l('', '99.99')])).toBe('0.01');
  });
  test('a balanced journal passes and an unbalanced one is refused', () => {
    expect(checkVoucher(draft())).toBeNull();
    expect(
      checkVoucher(
        draft({
          lines: [
            { ...emptyLine(), accountId: 'a1', debit: '5' },
            { ...emptyLine(), accountId: 'a2', credit: '4' },
          ],
        }),
      ),
    ).toBe('balance');
  });
  test('journal checks: date, narration, lines, account, one side only', () => {
    expect(checkVoucher(draft({ date: '12-11-2026' }))).toBe('date');
    expect(checkVoucher(draft({ narration: 'x' }))).toBe('narration');
    expect(checkVoucher(draft({ lines: [] }))).toBe('lines');
    expect(checkVoucher(draft({ lines: [{ ...emptyLine(), accountId: 'a1', debit: '5' }] }))).toBe('lines');
    expect(
      checkVoucher(
        draft({
          lines: [
            { ...emptyLine(), debit: '5' },
            { ...emptyLine(), accountId: 'a2', credit: '5' },
          ],
        }),
      ),
    ).toBe('account');
    expect(
      checkVoucher(
        draft({
          lines: [
            { ...emptyLine(), accountId: 'a1', debit: '5', credit: '5' },
            { ...emptyLine(), accountId: 'a2', credit: '5' },
          ],
        }),
      ),
    ).toBe('amount');
  });
  test('payment, receipt and contra need their cash or bank account', () => {
    const items = [{ ...emptyLine(), accountId: 'a1', amount: '10' }];
    expect(checkVoucher(draft({ kind: 'PAYMENT', lines: items }))).toBe('bank');
    expect(checkVoucher(draft({ kind: 'PAYMENT', lines: items, bankAccountId: 'c1' }))).toBeNull();
    expect(
      checkVoucher(draft({ kind: 'RECEIPT', lines: [{ ...items[0]!, amount: '0' }], bankAccountId: 'c1' })),
    ).toBe('amount');
    expect(checkVoucher(draft({ kind: 'CONTRA', amount: '10' }))).toBe('contra');
    expect(
      checkVoucher(draft({ kind: 'CONTRA', amount: '10', fromAccountId: 'c1', toAccountId: 'c1' })),
    ).toBe('same');
    expect(
      checkVoucher(draft({ kind: 'CONTRA', amount: '10', fromAccountId: 'c1', toAccountId: 'c2' })),
    ).toBeNull();
  });
  test('voucher bodies match the server shapes and leave blanks out', () => {
    expect(buildVoucher(draft())).toEqual({
      voucherDate: '2026-11-12',
      narration: 'Rent for November',
      lines: [
        { accountId: 'a1', debit: '500.50' },
        { accountId: 'a2', credit: '500.50' },
      ],
    });
    expect(
      buildVoucher(
        draft({
          kind: 'PAYMENT',
          bankAccountId: 'c1',
          ref: ' B-9 ',
          branchId: 'b1',
          lines: [{ ...emptyLine(), accountId: 'a1', amount: '10', narration: ' tea ' }],
        }),
      ),
    ).toEqual({
      voucherDate: '2026-11-12',
      narration: 'Rent for November',
      branchId: 'b1',
      attachmentRef: 'B-9',
      paidFromAccountId: 'c1',
      items: [{ accountId: 'a1', amount: '10', narration: 'tea' }],
    });
    expect(
      buildVoucher(
        draft({
          kind: 'RECEIPT',
          bankAccountId: 'c1',
          lines: [{ ...emptyLine(), accountId: 'a1', amount: '10' }],
        }),
      ),
    ).toHaveProperty('receivedIntoAccountId', 'c1');
    expect(
      buildVoucher(draft({ kind: 'CONTRA', fromAccountId: 'c1', toAccountId: 'c2', amount: '99.00' })),
    ).toEqual({
      voucherDate: '2026-11-12',
      narration: 'Rent for November',
      fromAccountId: 'c1',
      toAccountId: 'c2',
      amount: '99.00',
    });
  });
  test('voucher buttons follow status, approval need and permission', () => {
    const all = () => true;
    expect(voucherActions({ status: 'DRAFT', needsApproval: false }, all)).toMatchObject({
      post: true,
      submit: false,
      cancel: true,
    });
    expect(voucherActions({ status: 'DRAFT', needsApproval: true }, all)).toMatchObject({
      post: false,
      submit: true,
    });
    expect(voucherActions({ status: 'PENDING_APPROVAL', needsApproval: true }, all)).toMatchObject({
      approve: true,
      reject: true,
      post: false,
    });
    expect(voucherActions({ status: 'POSTED', needsApproval: false }, all)).toMatchObject({
      reverse: true,
      cancel: false,
    });
    expect(voucherActions({ status: 'POSTED', needsApproval: false }, () => false).reverse).toBe(false);
    expect(
      voucherActions({ status: 'DRAFT', needsApproval: false }, (p) => p === 'finance.voucher.approve').post,
    ).toBe(false);
  });
  test('expense buttons and body', () => {
    const all = () => true;
    expect(expenseActions({ status: 'DRAFT' }, all).submit).toBe(true);
    expect(expenseActions({ status: 'SUBMITTED' }, all)).toMatchObject({ approve: true, reject: true });
    expect(expenseActions({ status: 'APPROVED' }, all)).toMatchObject({ pay: true, reverse: true });
    expect(expenseActions({ status: 'PAID' }, all)).toMatchObject({ pay: false, reverse: true });
    expect(expenseActions({ status: 'APPROVED' }, (p) => p === 'finance.expense.approve').pay).toBe(false);
    const d = {
      date: '2026-11-12',
      accountId: 'e1',
      payee: ' Raju ',
      amount: '100',
      tax: '',
      eligible: true,
      docNo: '',
      ref: '',
      branchId: '',
      notes: '',
    };
    expect(buildExpense(d, false)).toEqual({
      expenseDate: '2026-11-12',
      accountId: 'e1',
      payee: 'Raju',
      amount: '100',
      inputTaxEligible: true,
    });
    expect(buildExpense({ ...d, tax: '18', docNo: 'B1' }, true)).toMatchObject({
      taxAmount: '18',
      documentNo: 'B1',
      confirmDuplicate: true,
    });
    expect(checkExpense(d)).toBeNull();
    expect(checkExpense({ ...d, amount: '0' })).toBe('amount');
    expect(checkExpense({ ...d, tax: '1.234' })).toBe('tax');
    expect(checkExpense({ ...d, payee: ' ' })).toBe('payee');
    expect(checkExpense({ ...d, accountId: '' })).toBe('category');
  });
  test('account pickers hide control, plug, inactive and wrong-type accounts', () => {
    const xs = [
      acct({ id: '1', cashBank: 'CASH' }),
      acct({ id: '2', type: 'EXPENSE' }),
      acct({ id: '3', type: 'EXPENSE', isControl: true }),
      acct({ id: '4', isOpeningPlug: true }),
      acct({ id: '5', type: 'EXPENSE', active: false }),
    ];
    expect(cashBankAccounts(xs).map((a) => a.id)).toEqual(['1']);
    expect(expenseAccounts(xs).map((a) => a.id)).toEqual(['2']);
    expect(postableAccounts(xs).map((a) => a.id)).toEqual(['1', '2']);
  });
  test('Hindi and Marathi have exactly the English keys', () => {
    const keys = (o: unknown, p = ''): string[] =>
      Object.entries(o as Record<string, unknown>).flatMap(([k, v]) =>
        typeof v === 'object' && v ? keys(v, `${p}${k}.`) : [`${p}${k}`],
      );
    const en = keys(parts.en).sort();
    expect(keys(parts.hi).sort()).toEqual(en);
    expect(keys(parts.mr).sort()).toEqual(en);
    expect(en.length).toBeGreaterThan(250);
  });
});

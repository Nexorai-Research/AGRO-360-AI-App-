import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setLanguage } from '../src/i18n';
import VouchersScreen from '../src/features/finance/VouchersScreen';
import ChartScreen from '../src/features/finance/ChartScreen';
import { NewBudget } from '../src/features/finance/NewBudget';
import {
  budgetBody,
  budgetErrors,
  costCentreErrors,
  expenseToDraft,
  fyMonths,
  voucherToDraft,
} from '../src/features/finance/logic';
import type { Expense, Voucher } from '../src/features/finance/api';
import { NewLeaveType, leaveTypeBody, leaveTypeErrors } from '../src/features/hr/NewLeaveType';
import {
  ShopLicences,
  licenceBody,
  licenceErrors,
  type LicenceForm,
} from '../src/features/admin/ShopLicences';
import { fetchStatementHtml, statementPdf } from '../src/features/customers/statement-pdf';
import { PurchaseReportsScreen } from '../src/features/stk/PurchaseScreens';

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockPut = jest.fn();
const mockPatch = jest.fn();
const mockPrint = jest.fn();
const mockShare = jest.fn();
let mockMe: { userId: string; roles: string[]; permissions?: string[] };
let mockId = 0;
jest.mock('../src/auth/AuthProvider', () => ({
  useAuth: () => ({
    status: 'signedIn',
    me: mockMe,
    client: {
      get: (...a: unknown[]) => mockGet(...a),
      post: (...a: unknown[]) => mockPost(...a),
      put: (...a: unknown[]) => mockPut(...a),
      patch: (...a: unknown[]) => mockPatch(...a),
    },
  }),
}));
jest.mock('../src/device', () => ({ newId: () => `key-${++mockId}` }));
jest.mock('expo-print', () => ({ printToFileAsync: (...a: unknown[]) => mockPrint(...a) }));
jest.mock('expo-sharing', () => ({
  isAvailableAsync: () => Promise.resolve(true),
  shareAsync: (...a: unknown[]) => mockShare(...a),
}));

let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);
beforeEach(async () => {
  [mockGet, mockPost, mockPut, mockPatch, mockPrint, mockShare].forEach((m) => m.mockReset());
  mockId = 0;
  mockMe = { userId: 'u-1', roles: [], permissions: undefined };
  client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retryDelay: 0 } } });
  await setLanguage('en');
});
const fake = () => ({ get: mockGet, post: mockPost }) as never;
const line = (accountId: string, debit: string, credit: string, narration: string | null = null) => ({
  lineNo: 1,
  accountId,
  accountCode: accountId,
  accountName: accountId,
  debit,
  credit,
  narration,
});
const voucher = (kind: string, lines: ReturnType<typeof line>[]): Voucher => ({
  id: 'v1',
  voucherNo: 'JV-7',
  kind,
  status: 'DRAFT',
  voucherDate: '2026-11-10',
  narration: 'Rent for November',
  total: '5000.00',
  journalId: null,
  createdBy: null,
  decisionNote: null,
  reverseReason: null,
  version: 3,
  needsApproval: false,
  lines,
  branchId: 'b1',
  attachmentRef: 'R-1',
});

describe('logic', () => {
  test('a draft voucher goes back into the form like the web editor', () => {
    const pay = voucherToDraft(
      voucher('PAYMENT', [line('rent', '5000.00', '0.00', 'Nov'), line('cash', '0.00', '5000.00')]),
    );
    expect(pay).toMatchObject({ kind: 'PAYMENT', bankAccountId: 'cash', branchId: 'b1', ref: 'R-1' });
    expect(pay.lines).toEqual([
      { accountId: 'rent', debit: '', credit: '', amount: '5000.00', narration: 'Nov' },
    ]);
    const contra = voucherToDraft(
      voucher('CONTRA', [line('bank', '200.00', '0.00'), line('cash', '0.00', '200.00')]),
    );
    expect(contra).toMatchObject({ fromAccountId: 'cash', toAccountId: 'bank', amount: '200.00' });
    const jv = voucherToDraft(voucher('JOURNAL', [line('a', '10.00', '0.00'), line('b', '0.00', '10.00')]));
    expect(jv.lines.map((l) => [l.debit, l.credit])).toEqual([
      ['10.00', ''],
      ['', '10.00'],
    ]);
  });
  test('a draft expense goes back into the form', () => {
    const e = {
      expenseDate: '2026-11-01',
      accountId: 'acc',
      payee: 'MSEB',
      amount: '900.00',
      taxAmount: '0.00',
      inputTaxEligible: false,
      documentNo: null,
      attachmentRef: 'slip',
      branchId: null,
      notes: null,
    } as unknown as Expense;
    expect(expenseToDraft(e)).toEqual({
      date: '2026-11-01',
      accountId: 'acc',
      payee: 'MSEB',
      amount: '900.00',
      tax: '',
      eligible: false,
      docNo: '',
      ref: 'slip',
      branchId: '',
      notes: '',
    });
  });
  test('cost centre code and name like the server', () => {
    expect(costCentreErrors({ code: 'van-1', name: 'Delivery van' })).toEqual([]);
    expect(costCentreErrors({ code: '-X', name: 'V' })).toEqual(['code', 'name']);
  });
  test('budget: the monthly amount is spread over April to March', () => {
    expect(fyMonths('2026-27')[0]).toBe('2026-04-01');
    expect(fyMonths('2026-27')[11]).toBe('2027-03-01');
    const f = {
      name: 'Annual budget',
      fyLabel: '2026-27',
      rows: [
        { accountId: 'sales', monthly: '100000' },
        { accountId: '', monthly: '' },
      ],
    };
    expect(budgetErrors(f)).toEqual([]);
    const b = budgetBody(f);
    expect(b.lines).toHaveLength(12);
    expect(b.lines[5]).toEqual({ accountId: 'sales', month: '2026-09-01', amount: '100000' });
    expect(budgetErrors({ ...f, rows: [{ accountId: 'sales', monthly: '0' }] })).toEqual(['amount']);
    expect(budgetErrors({ ...f, fyLabel: '', rows: [] })).toEqual(['year', 'rows']);
  });
  test('leave type and licence rules', () => {
    const lt = { code: 'el', name: 'Earned leave', yearlyQuota: '18', paid: true, carryForward: true };
    expect(leaveTypeErrors(lt)).toEqual([]);
    expect(leaveTypeBody(lt).code).toBe('EL');
    expect(leaveTypeErrors({ ...lt, code: 'E', yearlyQuota: '400' })).toEqual(['code', 'quota']);
    const lf: LicenceForm = {
      branchId: 'b1',
      licenceType: 'SEED',
      number: 'SL/22',
      issuingAuthority: 'Agri Dept',
      validFrom: '2026-04-01',
      validTo: '2027-03-31',
      categories: 'SEED, VEG',
      status: 'ACTIVE',
    };
    expect(licenceErrors(lf, false)).toEqual([]);
    expect(licenceBody(lf, false)).toEqual({
      branchId: 'b1',
      licenceType: 'SEED',
      number: 'SL/22',
      issuingAuthority: 'Agri Dept',
      validFrom: '2026-04-01',
      validTo: '2027-03-31',
      categories: ['SEED', 'VEG'],
    });
    expect(licenceBody({ ...lf, status: 'REVOKED' }, true)).toEqual({
      issuingAuthority: 'Agri Dept',
      validFrom: '2026-04-01',
      validTo: '2027-03-31',
      categories: ['SEED', 'VEG'],
      status: 'REVOKED',
    });
    expect(licenceErrors({ ...lf, validTo: '2026-01-01', categories: '' }, true)).toEqual([
      'order',
      'categories',
    ]);
  });
  test('statement: the HTML is read and turned into a shared PDF', async () => {
    mockGet.mockResolvedValue('<html>statement</html>');
    mockPrint.mockResolvedValue({ uri: 'file:///st.pdf' });
    await fetchStatementHtml(fake(), 'c-1', 'mr');
    expect(mockGet).toHaveBeenCalledWith('/customers/c-1/statement.html', {
      as: 'text',
      query: { language: 'mr' },
    });
    expect(await statementPdf(fake(), 'c-1', '')).toBe(true);
    expect(mockPrint).toHaveBeenCalledWith({ html: '<html>statement</html>' });
    expect(mockShare).toHaveBeenCalledWith(
      'file:///st.pdf',
      expect.objectContaining({ mimeType: 'application/pdf' }),
    );
  });
});

describe('screens', () => {
  test('a draft voucher is edited and saved with PUT and its version', async () => {
    const v = voucher('PAYMENT', [line('rent', '5000.00', '0.00'), line('cash', '0.00', '5000.00')]);
    mockGet.mockImplementation((p: string) => {
      if (p === '/finance/vouchers') return Promise.resolve({ items: [v] });
      if (p === '/finance/vouchers/v1') return Promise.resolve(v);
      if (p === '/finance/accounts')
        return Promise.resolve({
          items: [
            {
              id: 'rent',
              code: '6100',
              name: 'Rent',
              type: 'EXPENSE',
              active: true,
              isControl: false,
              cashBank: null,
            },
            {
              id: 'cash',
              code: '1100',
              name: 'Cash',
              type: 'ASSET',
              active: true,
              isControl: false,
              cashBank: 'CASH',
            },
          ],
        });
      return Promise.resolve({ items: [] });
    });
    mockPut.mockResolvedValue({ ...v, version: 4 });
    await render(<VouchersScreen />, { wrapper });
    await fireEvent.press(await screen.findByLabelText('JV-7'));
    await fireEvent.press(await screen.findByText('Edit draft'));
    await fireEvent.changeText(
      await screen.findByLabelText('Narration (what it is for)'),
      'Rent for Nov 2026',
    );
    await fireEvent.press(screen.getByText('Save as draft'));
    await waitFor(() => expect(mockPut).toHaveBeenCalledTimes(1));
    const [path, opts] = mockPut.mock.calls[0];
    expect(path).toBe('/finance/vouchers/v1');
    expect(opts.version).toBe(3);
    expect(opts.body).toMatchObject({
      voucherDate: '2026-11-10',
      narration: 'Rent for Nov 2026',
      branchId: 'b1',
      paidFromAccountId: 'cash',
      items: [{ accountId: 'rent', amount: '5000.00' }],
    });
  });
  test('no edit on a voucher without finance.voucher.create', async () => {
    mockMe = { userId: 'u-1', roles: [], permissions: ['finance.account.view'] };
    const v = voucher('JOURNAL', [line('a', '10.00', '0.00'), line('b', '0.00', '10.00')]);
    mockGet.mockImplementation((p: string) =>
      Promise.resolve(p === '/finance/vouchers/v1' ? v : { items: p === '/finance/vouchers' ? [v] : [] }),
    );
    await render(<VouchersScreen />, { wrapper });
    await fireEvent.press(await screen.findByLabelText('JV-7'));
    await screen.findByText('Rent for November');
    expect(screen.queryByText('Edit draft')).toBeNull();
  });
  test('cost centres: add one, switch one off with its version', async () => {
    const cc = { id: 'cc1', code: 'VAN-1', name: 'Van', active: true, version: 2 };
    mockGet.mockImplementation((p: string) =>
      Promise.resolve({ items: p === '/finance/cost-centres' ? [cc] : [] }),
    );
    mockPost.mockResolvedValue({});
    mockPatch.mockResolvedValue({});
    await render(<ChartScreen />, { wrapper });
    await fireEvent.press(await screen.findByLabelText('Cost centres'));
    await fireEvent.press(await screen.findByText('Switch off VAN-1'));
    await waitFor(() => expect(mockPatch).toHaveBeenCalledTimes(1));
    expect(mockPatch.mock.calls[0][0]).toBe('/finance/cost-centres/cc1');
    expect(mockPatch.mock.calls[0][1]).toMatchObject({ body: { active: false }, version: 2 });
    await fireEvent.press(screen.getByText('Add cost centre'));
    await fireEvent.changeText(screen.getByLabelText('Code'), 'field-1');
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Field team');
    await fireEvent.press(screen.getByText('Add'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    expect(mockPost.mock.calls[0][0]).toBe('/finance/cost-centres');
    expect(mockPost.mock.calls[0][1].body).toEqual({ code: 'FIELD-1', name: 'Field team' });
  });
  test('new budget: year and account chosen, 12 lines sent', async () => {
    mockGet.mockImplementation((p: string) => {
      if (p === '/finance/periods')
        return Promise.resolve({ items: [{ id: 'y', label: '2026-27', periods: [] }] });
      if (p === '/finance/accounts')
        return Promise.resolve({
          items: [
            { id: 'sales', code: '4000', name: 'Sales', type: 'INCOME', active: true, isControl: false },
          ],
        });
      return Promise.resolve({ items: [] });
    });
    mockPost.mockResolvedValue({});
    await render(<NewBudget />, { wrapper });
    await fireEvent.press(screen.getByText('New budget'));
    await fireEvent.press(await screen.findByLabelText('2026-27'));
    await fireEvent.press((await screen.findAllByLabelText('4000 Sales'))[0]!);
    await fireEvent.changeText(screen.getByLabelText('Monthly amount 1'), '50000');
    await fireEvent.press(screen.getByText('Save as draft'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    expect(mockPost.mock.calls[0][0]).toBe('/finance/budgets');
    expect(mockPost.mock.calls[0][1].body.lines).toHaveLength(12);
  });
  test('new leave type only for a leave approver', async () => {
    mockPost.mockResolvedValue({});
    await render(<NewLeaveType />, { wrapper });
    await fireEvent.press(screen.getByText('New leave type'));
    await fireEvent.changeText(screen.getByLabelText('Code'), 'el');
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Earned leave');
    await fireEvent.changeText(screen.getByLabelText('Days per year'), '18');
    await fireEvent.press(screen.getByText('Save'));
    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith('/hr/leave-types', {
        body: { code: 'EL', name: 'Earned leave', yearlyQuota: '18', paid: true, carryForward: false },
        idempotencyKey: 'key-1',
      }),
    );
  });
  test('no new leave type without hr.leave.approve', async () => {
    mockMe = { userId: 'u-1', roles: [], permissions: ['hr.leave.self'] };
    await render(<NewLeaveType />, { wrapper });
    expect(screen.queryByText('New leave type')).toBeNull();
  });
  test('shop licences: listed, added for a branch', async () => {
    mockGet.mockResolvedValue({
      items: [
        {
          id: 'l1',
          branchId: 'b1',
          licenceType: 'FERTILIZER',
          number: 'FL/9',
          issuingAuthority: 'Agri Dept',
          validFrom: '2026-04-01',
          validTo: '2027-03-31',
          categories: ['FERT'],
          state: 'VALID',
          recordStatus: 'ACTIVE',
          version: 1,
        },
      ],
    });
    mockPost.mockResolvedValue({});
    await render(<ShopLicences branches={[{ id: 'b1', name: 'Pune' }]} />, { wrapper });
    expect(await screen.findByText('FL/9')).toBeTruthy();
    await fireEvent.press(screen.getByText('Add licence'));
    await fireEvent.press(screen.getByLabelText('Pune'));
    await fireEvent.press(screen.getByLabelText('Seed'));
    await fireEvent.changeText(screen.getByLabelText('Licence number'), 'SL/22');
    await fireEvent.changeText(screen.getByLabelText('Issuing authority'), 'Agri Dept');
    await fireEvent.changeText(screen.getByLabelText('Valid from'), '2026-04-01');
    await fireEvent.changeText(screen.getByLabelText('Valid to'), '2027-03-31');
    await fireEvent.changeText(
      screen.getByLabelText('Permitted product categories (comma separated codes)'),
      'SEED',
    );
    await fireEvent.press(screen.getByText('Save licence'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    expect(mockPost.mock.calls[0][0]).toBe('/licences');
    expect(mockPost.mock.calls[0][1].body).toMatchObject({
      branchId: 'b1',
      licenceType: 'SEED',
      number: 'SL/22',
      categories: ['SEED'],
    });
  });
  test('purchase reports: unbilled receipts', async () => {
    mockGet.mockImplementation((p: string) =>
      Promise.resolve(
        p === '/procurement/reports/grni'
          ? {
              asOf: '2026-11-19',
              rows: [
                {
                  grnId: 'g1',
                  number: 'GRN-4',
                  supplierName: 'Kisan Traders',
                  receiptDate: '2026-11-02',
                  accepted: '1000.00',
                  billed: '400.00',
                  unbilled: '600.00',
                },
              ],
              total: '600.00',
              glBalance: '600.00',
              variance: '0.00',
              reconciled: true,
            }
          : { items: [], rows: [] },
      ),
    );
    await render(<PurchaseReportsScreen />, { wrapper });
    await fireEvent.press(await screen.findByLabelText('Unbilled receipts'));
    expect(await screen.findByText('GRN-4 · Kisan Traders')).toBeTruthy();
    expect(screen.getByText('The books agree with the receipts.')).toBeTruthy();
  });
});

import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import parts from '../i18n-parts/fx.json';
import { i18n, setLanguage } from '../src/i18n';
import FinSettingsScreen from '../src/features/finance/FinSettingsScreen';
import OpeningScreen from '../src/features/finance/OpeningScreen';
import YearEndScreen from '../src/features/finance/YearEndScreen';
import ExportScreen from '../src/features/finance/ExportScreen';
import InterScreen from '../src/features/finance/InterScreen';
import TemplatesScreen from '../src/features/finance/TemplatesScreen';
import {
  exportErrors,
  interBody,
  interErrors,
  mappingItems,
  openingBody,
  openingErrors,
  openingTotals,
  settingsBody,
  settingsErrors,
  templateBody,
  templateErrors,
} from '../src/features/finance/fx-logic';

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockPut = jest.fn();
const mockPatch = jest.fn();
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
    signIn: jest.fn(),
    signOut: jest.fn(),
  }),
}));
jest.mock('../src/device', () => ({ newId: () => `key-${++mockId}` }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  Stack: { Screen: () => null },
}));
const mockShare = jest.fn();
jest.mock('../src/features/admin/usr-files', () => ({ saveAndShare: (...a: unknown[]) => mockShare(...a) }));

let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);
beforeAll(() => {
  for (const lg of ['en', 'hi', 'mr'] as const)
    i18n.addResourceBundle(lg, 'translation', (parts as Record<string, object>)[lg], true, true);
});
beforeEach(async () => {
  [mockGet, mockPost, mockPut, mockPatch, mockShare].forEach((m) => m.mockReset());
  mockId = 0;
  mockMe = { userId: 'u-1', roles: [], permissions: undefined };
  client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retryDelay: 0 } } });
  await setLanguage('en');
});
const route = (map: Record<string, unknown>) =>
  mockGet.mockImplementation((p: string) =>
    p in map ? Promise.resolve(map[p]) : Promise.reject(new Error(`unexpected GET ${p}`)),
  );

describe('logic', () => {
  test('settings: blank means no limit, amounts are strings', () => {
    const f = {
      journalApprovalAmount: '50000',
      cashPaymentLimit: '',
      attachmentRequiredAbove: '',
      expenseApprovalAmount: '0',
      expenseBasis: 'ACCRUAL' as const,
      requireCostCentre: true,
    };
    expect(settingsErrors(f)).toEqual(['expenseApprovalAmount']);
    expect(settingsBody({ ...f, expenseApprovalAmount: '' })).toEqual({
      journalApprovalAmount: '50000',
      cashPaymentLimit: null,
      attachmentRequiredAbove: null,
      expenseApprovalAmount: null,
      expenseBasis: 'ACCRUAL',
      requireCostCentre: true,
    });
  });
  test('opening: totals use decimals and say which side takes the difference', () => {
    const l = [
      { accountId: 'a', label: 'Cash', side: 'debit' as const, amount: '0.10' },
      { accountId: 'b', label: 'Cash2', side: 'debit' as const, amount: '0.20' },
      { accountId: 'c', label: 'Loan', side: 'credit' as const, amount: '0.25' },
    ];
    expect(openingTotals(l)).toEqual({ debit: '0.30', credit: '0.25', plug: '0.05', plugSide: 'credit' });
    expect(openingBody(' 2026-03-31 ', l).lines[0]).toEqual({ accountId: 'a', debit: '0.10' });
    expect(openingErrors('2027-01-01', [], '2026-11-12')).toEqual(['date', 'lines']);
  });
  test('export, intercompany, template', () => {
    expect(exportErrors('2026-04-01', '2026-03-01')).toEqual(['to']);
    expect(mappingItems({ a: ' Cash ', b: ' ' })).toEqual([
      { accountId: 'a', externalCode: 'Cash', externalName: 'Cash' },
    ]);
    const f = {
      fromBranch: 'b1',
      toBranch: 'b1',
      cashAccountId: '',
      amount: '0',
      date: '',
      description: 'x',
    };
    expect(interErrors(f)).toEqual(['same', 'cash', 'amount', 'what']);
    expect(
      interBody({ ...f, toBranch: 'b2', cashAccountId: 'c', amount: '10', description: ' stock cash ' }),
    ).toEqual({
      fromBranch: 'b1',
      toBranch: 'b2',
      cashAccountId: 'c',
      amount: '10.00',
      description: 'stock cash',
    });
    const t = {
      name: 'Rent',
      accountId: 'a',
      payee: 'Owner',
      amount: '12000',
      dayOfMonth: '29',
      startDate: '2026-12-01',
    };
    expect(templateErrors(t)).toEqual(['day']);
    expect(templateBody({ ...t, dayOfMonth: '5' })).toEqual({
      name: 'Rent',
      accountId: 'a',
      payee: 'Owner',
      amount: '12000.00',
      dayOfMonth: 5,
      startDate: '2026-12-01',
    });
  });
});

describe('settings screen', () => {
  const set = {
    journalApprovalAmount: '50000.00',
    cashPaymentLimit: null,
    requireCostCentre: false,
    attachmentRequiredAbove: null,
    expenseBasis: 'CASH',
    expenseApprovalAmount: null,
    version: 3,
  };
  test('saves with the version', async () => {
    route({ '/finance/settings': set });
    mockPut.mockResolvedValue({});
    await render(<FinSettingsScreen />, { wrapper });
    await fireEvent.press(await screen.findByText('Change settings'));
    await fireEvent.changeText(screen.getByLabelText('Warn when a cash payment is above'), '0');
    await fireEvent.press(screen.getByText('Save'));
    expect(await screen.findByText(/Leave empty for no limit/)).toBeTruthy();
    expect(mockPut).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText('Warn when a cash payment is above'), '20000');
    await fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(mockPut).toHaveBeenCalledTimes(1));
    expect(mockPut.mock.calls[0][0]).toBe('/finance/settings');
    expect(mockPut.mock.calls[0][1].version).toBe(3);
    expect(mockPut.mock.calls[0][1].body.cashPaymentLimit).toBe('20000');
    expect(mockPut.mock.calls[0][1].idempotencyKey).toBeTruthy();
  });
  test('no change button without the manage permission', async () => {
    mockMe = { userId: 'u-1', roles: [], permissions: ['finance.account.view'] };
    route({ '/finance/settings': set });
    await render(<FinSettingsScreen />, { wrapper });
    await screen.findByText(/Voucher amount/);
    expect(screen.queryByText('Change settings')).toBeNull();
  });
  test('denied without view', async () => {
    mockMe = { userId: 'u-1', roles: [], permissions: [] };
    await render(<FinSettingsScreen />, { wrapper });
    expect(await screen.findByText('You do not have permission for this screen.')).toBeTruthy();
    expect(mockGet).not.toHaveBeenCalled();
  });
});

describe('opening balances', () => {
  test('add lines, show the difference, send decimal strings', async () => {
    route({
      '/finance/opening-balances': { voucher: null },
      '/finance/accounts': {
        items: [
          { id: 'a1', code: '1000', name: 'Cash', type: 'ASSET' },
          { id: 'a2', code: '3000', name: 'Capital', type: 'EQUITY' },
        ],
      },
    });
    mockPost.mockResolvedValue({});
    await render(<OpeningScreen />, { wrapper });
    await fireEvent.changeText(await screen.findByLabelText(/As on/), '2026-03-31');
    await fireEvent.press(screen.getByText('Save opening balances'));
    expect(await screen.findByText('Add at least one balance.')).toBeTruthy();
    await fireEvent.press(await screen.findByLabelText('1000 Cash'));
    await fireEvent.changeText(screen.getByLabelText('Amount'), '100.5');
    await fireEvent.press(screen.getByText('Add this balance'));
    expect(await screen.findByText(/Debit ₹100.50|Debit.*100\.50/)).toBeTruthy();
    await fireEvent.press(screen.getByText('Save opening balances'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    expect(mockPost.mock.calls[0][1].body).toEqual({
      asOn: '2026-03-31',
      lines: [{ accountId: 'a1', debit: '100.50' }],
    });
  });
  test('entered balances can be reversed with a reason, unless locked', async () => {
    const v = {
      id: 'v1',
      voucherNo: 'OB-1',
      voucherDate: '2026-03-31',
      lines: [{ accountCode: '1000', accountName: 'Cash', debit: '100.00', credit: '0.00' }],
    };
    route({ '/finance/opening-balances': { voucher: v, locked: false } });
    mockPost.mockResolvedValue({});
    await render(<OpeningScreen />, { wrapper });
    await fireEvent.press(await screen.findByText('Reverse opening balances'));
    await fireEvent.changeText(screen.getByLabelText('Reason (at least 10 letters)'), 'short');
    await fireEvent.press(screen.getByText('Confirm reverse'));
    expect(await screen.findByText('Give a reason of 10 to 500 letters.')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Reason (at least 10 letters)'), 'entered a wrong date');
    await fireEvent.press(screen.getByText('Confirm reverse'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    expect(mockPost.mock.calls[0][0]).toBe('/finance/vouchers/v1/reverse');
  });
  test('locked: no reverse button', async () => {
    route({
      '/finance/opening-balances': {
        voucher: { id: 'v1', voucherNo: 'OB-1', voucherDate: '2026-03-31', lines: [] },
        locked: true,
      },
    });
    await render(<OpeningScreen />, { wrapper });
    await screen.findByText(/A period has been closed/);
    expect(screen.queryByText('Reverse opening balances')).toBeNull();
  });
});

describe('year end', () => {
  const ye = (over = {}) => ({
    fyId: 'fy1',
    fyLabel: 'FY 2025-26',
    startDate: '2025-04-01',
    endDate: '2026-03-31',
    status: 'OPEN',
    closed: null,
    canClose: true,
    checks: [{ key: 'k', label: 'Bank reconciled', ok: false, blocking: true, detail: '2 lines open' }],
    ...over,
  });
  test('shows checks and closes with a reason', async () => {
    route({
      '/finance/periods': { items: [{ id: 'fy1', label: 'FY 2025-26', status: 'OPEN' }] },
      '/finance/year-end/fy1': ye(),
    });
    mockPost.mockResolvedValue({});
    await render(<YearEndScreen />, { wrapper });
    expect(await screen.findByText(/blocks closing · 2 lines open/)).toBeTruthy();
    await fireEvent.press(screen.getByText('Close the year'));
    await fireEvent.changeText(screen.getByLabelText('Reason (at least 10 letters)'), 'year done');
    await fireEvent.press(screen.getByText('Confirm close'));
    expect(await screen.findByText('Give a reason of 10 to 500 letters.')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Reason (at least 10 letters)'), 'accounts finalised');
    await fireEvent.press(screen.getByText('Confirm close'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    expect(mockPost.mock.calls[0][0]).toBe('/finance/year-end/fy1/close');
    expect(mockPost.mock.calls[0][1].body).toEqual({ reason: 'accounts finalised' });
  });
  test('closed year shows the result and no close button', async () => {
    route({
      '/finance/periods': { items: [{ id: 'fy1', label: 'FY', status: 'LOCKED' }] },
      '/finance/year-end/fy1': ye({
        closed: { closedOn: '2026-04-10', netProfit: '1500.00', nextFyLabel: 'FY 2026-27' },
        checks: [],
      }),
    });
    await render(<YearEndScreen />, { wrapper });
    expect(await screen.findByText(/Closed on 2026-04-10/)).toBeTruthy();
    expect(screen.queryByText('Close the year')).toBeNull();
  });
});

describe('export', () => {
  const base = {
    '/finance/export/mappings': {
      items: [{ accountId: 'a1', code: '1000', name: 'Cash', externalName: null }],
    },
    '/finance/export/history': {
      items: [
        {
          id: 'e1',
          createdAt: '2026-11-01T10:00:00Z',
          format: 'TALLY',
          from: '2026-04-01',
          to: '2026-09-30',
          rowCount: 40,
        },
      ],
    },
  };
  test('runs the export, shares the file and warns about unmapped accounts', async () => {
    route(base);
    mockShare.mockResolvedValue(true);
    mockPost.mockResolvedValue({
      id: 'e2',
      replay: false,
      rowCount: 12,
      fileName: 'x.csv',
      contentType: 'text/csv',
      content: 'a,b',
      unmappedAccounts: ['Rent'],
    });
    await render(<ExportScreen />, { wrapper });
    await screen.findByText(/TALLY · 2026-04-01/);
    await fireEvent.changeText(screen.getByLabelText('To (YYYY-MM-DD)'), '2020-01-01');
    await fireEvent.press(screen.getByText('Export and share'));
    expect(await screen.findByText(/End date must be a real date/)).toBeTruthy();
    expect(mockPost).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText('To (YYYY-MM-DD)'), '2026-09-30');
    await fireEvent.press(screen.getByText('Export and share'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    expect(mockPost.mock.calls[0][0]).toBe('/finance/export');
    expect(mockPost.mock.calls[0][1].body.format).toBe('GENERIC');
    expect(await screen.findByText(/Not mapped yet: Rent/)).toBeTruthy();
    expect(mockShare).toHaveBeenCalledWith('x.csv', 'text/csv', 'YSxi');
  });
  test('saves only named mappings', async () => {
    route(base);
    mockPut.mockResolvedValue({});
    await render(<ExportScreen />, { wrapper });
    await fireEvent.changeText(await screen.findByLabelText('1000 Cash'), 'Cash in hand');
    await fireEvent.press(screen.getByText('Save mapping'));
    await waitFor(() => expect(mockPut).toHaveBeenCalledTimes(1));
    expect(mockPut.mock.calls[0][1].body.items).toEqual([
      { accountId: 'a1', externalCode: 'Cash in hand', externalName: 'Cash in hand' },
    ]);
  });
  test('needs finance.export.run', async () => {
    mockMe = { userId: 'u-1', roles: [], permissions: ['finance.account.view'] };
    await render(<ExportScreen />, { wrapper });
    expect(await screen.findByText('You do not have permission for this screen.')).toBeTruthy();
    expect(mockGet).not.toHaveBeenCalled();
  });
});

describe('intercompany', () => {
  test('two different branches, a cash ledger and an amount', async () => {
    route({
      '/finance/intercompany': {
        items: [
          {
            id: 'i1',
            txnNo: 'IC-1',
            date: '2026-11-01',
            fromBranch: 'b1',
            toBranch: 'b2',
            amount: '500.00',
            description: 'float',
          },
        ],
      },
      '/branches': {
        items: [
          { id: 'b1', name: 'Main' },
          { id: 'b2', name: 'Village' },
        ],
      },
      '/finance/accounts': { items: [{ id: 'c1', code: '1000', name: 'Cash', type: 'ASSET' }] },
    });
    mockPost.mockResolvedValue({});
    await render(<InterScreen />, { wrapper });
    expect(await screen.findByText(/Main → Village/)).toBeTruthy();
    await fireEvent.press(screen.getByText('New transfer'));
    const mains = await screen.findAllByLabelText('Main');
    await fireEvent.press(mains[0]!);
    await fireEvent.press((await screen.findAllByLabelText('Main'))[1]!);
    await fireEvent.press(screen.getByText('Save'));
    expect(await screen.findByText('The two branches must be different.')).toBeTruthy();
    expect(mockPost).not.toHaveBeenCalled();
    await fireEvent.press((await screen.findAllByLabelText('Village'))[1]!);
    await fireEvent.press(await screen.findByLabelText('1000 Cash'));
    await fireEvent.changeText(screen.getByLabelText('Amount'), '250');
    await fireEvent.changeText(screen.getByLabelText('What for'), 'shop float');
    await fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    expect(mockPost.mock.calls[0][1].body).toEqual({
      fromBranch: 'b1',
      toBranch: 'b2',
      cashAccountId: 'c1',
      amount: '250.00',
      description: 'shop float',
    });
  });
});

describe('recurring expenses', () => {
  const tpl = {
    id: 't1',
    name: 'Rent',
    payee: 'Owner',
    amount: '12000.00',
    dayOfMonth: 5,
    nextDate: '2026-12-05',
    active: true,
    version: 2,
  };
  test('switch off sends the version; generate makes drafts', async () => {
    route({ '/finance/expense-templates': { items: [tpl] } });
    mockPatch.mockResolvedValue({});
    mockPost.mockResolvedValue({ created: 2 });
    await render(<TemplatesScreen />, { wrapper });
    await fireEvent.press(await screen.findByLabelText('Switch off Rent'));
    await waitFor(() => expect(mockPatch).toHaveBeenCalledTimes(1));
    expect(mockPatch.mock.calls[0][0]).toBe('/finance/expense-templates/t1');
    expect(mockPatch.mock.calls[0][1]).toMatchObject({ version: 2, body: { active: false } });
    await fireEvent.press(screen.getByText('Make the drafts that are due'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    expect(mockPost.mock.calls[0][0]).toBe('/finance/expense-templates/generate');
  });
  test('add template validates the day', async () => {
    route({
      '/finance/expense-templates': { items: [] },
      '/finance/accounts': { items: [{ id: 'x1', code: '5100', name: 'Rent expense', type: 'EXPENSE' }] },
    });
    mockPost.mockResolvedValue({});
    await render(<TemplatesScreen />, { wrapper });
    await fireEvent.press(await screen.findByText('Add template'));
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Rent');
    await fireEvent.press(await screen.findByLabelText('5100 Rent expense'));
    await fireEvent.changeText(screen.getByLabelText('Payee'), 'Owner');
    await fireEvent.changeText(screen.getByLabelText('Amount'), '12000');
    await fireEvent.changeText(screen.getByLabelText('Day of the month (1 to 28)'), '30');
    await fireEvent.press(screen.getByText('Save'));
    expect(await screen.findByText('Day must be a whole number from 1 to 28.')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Day of the month (1 to 28)'), '5');
    await fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    expect(mockPost.mock.calls[0][1].body).toMatchObject({
      name: 'Rent',
      accountId: 'x1',
      amount: '12000.00',
      dayOfMonth: 5,
    });
  });
  test('expenses report', async () => {
    route({
      '/finance/expense-templates': { items: [] },
      '/reports/expenses': {
        from: '2026-04-01',
        to: '2026-11-12',
        total: '900.00',
        rows: [{ code: '5100', name: 'Rent', count: 3, amount: '900.00', tax: '0.00' }],
      },
    });
    await render(<TemplatesScreen />, { wrapper });
    await fireEvent.press(await screen.findByText('Expenses by category'));
    expect(await screen.findByText(/5100 Rent/)).toBeTruthy();
  });
});

import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import parts from '../i18n-parts/fin.json';
import { i18n, setLanguage } from '../src/i18n';
import { ApiError } from '../src/api/errors';
import ChartScreen from '../src/features/finance/ChartScreen';

const mockGet = jest.fn();
const mockPost = jest.fn();
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
      patch: (...a: unknown[]) => mockPatch(...a),
    },
  }),
}));
jest.mock('../src/device', () => ({ newId: () => `key-${++mockId}` }));

let qc: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={qc}>{children}</QueryClientProvider>
);
const acct = (o: Record<string, unknown>) => ({
  id: 'a1',
  code: '1000',
  name: 'Cash in hand',
  type: 'ASSET',
  groupId: 'g1',
  groupName: 'Cash and bank',
  isControl: false,
  isSystem: false,
  cashBank: 'CASH',
  isOpeningPlug: false,
  active: true,
  description: null,
  version: 3,
  balance: '2500.75',
  ...o,
});
const base: Record<string, unknown> = {
  '/finance/accounts': {
    items: [
      acct({}),
      acct({
        id: 'a2',
        code: '4000',
        name: 'Sales',
        type: 'INCOME',
        cashBank: null,
        isSystem: true,
        balance: '-90000.00',
        groupName: 'Sales',
      }),
    ],
  },
  '/finance/account-groups': {
    items: [
      { id: 'g1', code: '10', name: 'Cash and bank', type: 'ASSET', parentId: null },
      { id: 'g2', code: '60', name: 'Admin', type: 'EXPENSE', parentId: null },
    ],
  },
  '/reports/general-ledger': {
    from: '2026-08-14',
    to: '2026-11-12',
    opening: '1000.00',
    closing: '2500.75',
    entries: [
      {
        journalId: 'j1',
        date: '2026-11-01',
        voucherNo: 'RV-0001',
        sourceType: 'finance.voucher',
        narration: 'Cash sale',
        purpose: 'VOUCHER',
        debit: '1500.75',
        credit: '0.00',
        running: '2500.75',
      },
    ],
  },
  '/finance/cost-centres': {
    items: [{ id: 'c1', code: 'CC1', name: 'Warehouse', active: true, version: 1 }],
  },
};
const answers = (o: Record<string, unknown> = {}) =>
  mockGet.mockImplementation(async (path: string) => {
    const v = path in o ? o[path] : base[path];
    if (v instanceof Error) throw v;
    return v;
  });
const press = async (label: string, i = 0) => fireEvent.press((await screen.findAllByLabelText(label))[i]!);
const type = async (label: string, text: string) =>
  fireEvent.changeText(await screen.findByLabelText(label), text);

beforeAll(() => {
  for (const lg of ['en', 'hi', 'mr'] as const)
    i18n.addResourceBundle(lg, 'translation', parts[lg], true, true);
});
beforeEach(async () => {
  [mockGet, mockPost, mockPatch].forEach((m) => m.mockReset());
  mockId = 0;
  mockMe = {
    userId: 'u1',
    roles: [],
    permissions: ['finance.account.view', 'finance.account.manage', 'reports.financial'],
  };
  qc = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retryDelay: 0 } } });
  await setLanguage('en');
  answers();
});

describe('chart of accounts', () => {
  test('lists accounts with balance from strings and filters by search and type', async () => {
    await render(<ChartScreen />, { wrapper });
    expect(await screen.findByText('1000 Cash in hand')).toBeTruthy();
    expect(screen.getByText('₹2,500.75')).toBeTruthy();
    expect(screen.getByText('-₹90,000.00')).toBeTruthy();
    expect(mockGet.mock.calls[0]![1].query).toEqual({ balances: 'true' });
    fireEvent.changeText(screen.getByLabelText('Search by code or name'), 'sales');
    await waitFor(() => expect(screen.queryByText('1000 Cash in hand')).toBeNull());
    expect(screen.getByText('4000 Sales')).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText('Search by code or name'), 'zzz');
    expect(await screen.findByText('No accounts match.')).toBeTruthy();
  });
  test('error shows the correlation id and offline shows its own text', async () => {
    answers({ '/finance/accounts': new ApiError(500, { title: 'BOOM', correlationId: 'corr-9' }) });
    await render(<ChartScreen />, { wrapper });
    expect(await screen.findByText(/corr-9/)).toBeTruthy();
  });
  test('offline', async () => {
    answers({ '/finance/accounts': new ApiError(0, null) });
    await render(<ChartScreen />, { wrapper });
    expect(await screen.findByText('No network. Check your connection and try again.')).toBeTruthy();
  });
  test('no permission', async () => {
    mockMe = { userId: 'u1', roles: [], permissions: [] };
    await render(<ChartScreen />, { wrapper });
    expect(await screen.findByText('You do not have permission to see this.')).toBeTruthy();
    expect(mockGet).not.toHaveBeenCalled();
  });
  test('tapping an account shows its ledger with opening, closing and running balance', async () => {
    await render(<ChartScreen />, { wrapper });
    await press('1000 Cash in hand');
    expect(await screen.findByText('RV-0001')).toBeTruthy();
    expect(screen.getByText('₹1,000.00')).toBeTruthy();
    const call = mockGet.mock.calls.find((c) => c[0] === '/reports/general-ledger')!;
    expect(call[1].query.accountId).toBe('a1');
    expect(call[1].query.from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  test('edit sends only the changed shape with If-Match version and one key', async () => {
    await render(<ChartScreen />, { wrapper });
    await press('Edit 1000');
    await type('Name', 'Cash at counter');
    mockPatch.mockResolvedValue(acct({}));
    await press('Save');
    await waitFor(() => expect(mockPatch).toHaveBeenCalled());
    const [path, opts] = mockPatch.mock.calls[0]!;
    expect(path).toBe('/finance/accounts/a1');
    expect(opts.version).toBe(3);
    expect(opts.body).toEqual({ name: 'Cash at counter', description: null, active: true });
    expect(opts.idempotencyKey).toBe('key-1');
    expect(await screen.findByText('Saved.')).toBeTruthy();
  });
  test('a system account cannot be switched off from the phone', async () => {
    await render(<ChartScreen />, { wrapper });
    await press('Edit 4000');
    expect(await screen.findByText(/Automatic postings use this account/)).toBeTruthy();
    expect(screen.queryByLabelText('Active')).toBeNull();
    mockPatch.mockResolvedValue(acct({}));
    await press('Save');
    await waitFor(() =>
      expect(mockPatch.mock.calls[0]![1].body).toEqual({ name: 'Sales', description: null }),
    );
  });
  test('stale version conflict is shown as an error', async () => {
    await render(<ChartScreen />, { wrapper });
    await press('Edit 1000');
    mockPatch.mockRejectedValue(new ApiError(409, { title: 'VERSION_CONFLICT', correlationId: 'corr-2' }));
    await press('Save');
    expect(await screen.findByRole('alert')).toBeTruthy();
  });
  test('add account validates the code and posts type and group', async () => {
    await render(<ChartScreen />, { wrapper });
    await press('Add account');
    await type('Code (digits, like 6050)', 'ab');
    await type('Name', 'Staff tea');
    expect(screen.getByLabelText('Add account').props.accessibilityState?.disabled).toBe(true);
    await type('Code (digits, like 6050)', '6050');
    await press('Expense');
    await press('Admin');
    mockPost.mockResolvedValue(acct({}));
    await press('Add account');
    await waitFor(() => expect(mockPost).toHaveBeenCalled());
    expect(mockPost.mock.calls[0]![0]).toBe('/finance/accounts');
    expect(mockPost.mock.calls[0]![1].body).toEqual({
      code: '6050',
      name: 'Staff tea',
      type: 'EXPENSE',
      groupId: 'g2',
    });
  });
  test('without the manage permission there are no add or edit buttons', async () => {
    mockMe = { userId: 'u1', roles: [], permissions: ['finance.account.view'] };
    await render(<ChartScreen />, { wrapper });
    await screen.findByText('1000 Cash in hand');
    expect(screen.queryByLabelText('Add account')).toBeNull();
    expect(screen.queryByLabelText('Edit 1000')).toBeNull();
  });
  test('cost centres tab', async () => {
    await render(<ChartScreen />, { wrapper });
    await press('Cost centres');
    expect(await screen.findByText('CC1 Warehouse')).toBeTruthy();
  });
  test('Marathi title', async () => {
    await setLanguage('mr');
    await render(<ChartScreen />, { wrapper });
    expect(await screen.findByText('खात्यांची यादी')).toBeTruthy();
  });
});

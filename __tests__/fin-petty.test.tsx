import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import parts from '../i18n-parts/fin.json';
import { i18n, setLanguage } from '../src/i18n';
import { ApiError } from '../src/api/errors';
import PettyScreen from '../src/features/finance/PettyScreen';

const mockGet = jest.fn();
const mockPost = jest.fn();
let mockMe: { userId: string; roles: string[]; permissions?: string[] };
let mockId = 0;
jest.mock('../src/auth/AuthProvider', () => ({
  useAuth: () => ({ status: 'signedIn', me: mockMe, client: { get: (...a: unknown[]) => mockGet(...a), post: (...a: unknown[]) => mockPost(...a) } }),
}));
jest.mock('../src/device', () => ({ newId: () => `key-${++mockId}` }));

let qc: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
const ALL = ['finance.account.view', 'finance.pettycash.manage', 'finance.voucher.approve'];
const fund = {
  id: 'f1', branchId: 'b1', branchName: 'Main', ledgerCode: '1005', floatAmount: '5000.00', custodian: 'Ramesh', balance: '3200.50', toReplenish: '1799.50', active: true, version: 1,
  lastCount: { countedOn: '2026-11-01', difference: '-10.00', status: 'APPROVED' },
};
const accounts = [
  { id: 'x1', code: '6100', name: 'Tea and snacks', type: 'EXPENSE', cashBank: null, isControl: false, active: true },
  { id: 'c2', code: '1010', name: 'SBI current', type: 'ASSET', cashBank: 'BANK', isControl: false, active: true },
];
const base: Record<string, unknown> = {
  '/finance/petty-cash': { items: [fund] },
  '/finance/accounts': { items: accounts },
  '/branches': { items: [{ id: 'b1', name: 'Main' }] },
  '/finance/petty-cash/f1/counts': { items: [{ id: 'k1', fundId: 'f1', countedOn: '2026-11-10', countedAmount: '3190.50', bookAmount: '3200.50', difference: '-10.00', status: 'PENDING_APPROVAL', note: null }] },
};
const answers = (o: Record<string, unknown> = {}) =>
  mockGet.mockImplementation(async (path: string) => {
    const v = path in o ? o[path] : base[path];
    if (v instanceof Error) throw v;
    return v;
  });
const press = async (label: string, i = 0) => fireEvent.press((await screen.findAllByLabelText(label))[i]!);
const type = async (label: string, text: string) => fireEvent.changeText(await screen.findByLabelText(label), text);

beforeAll(() => {
  for (const lg of ['en', 'hi', 'mr'] as const) i18n.addResourceBundle(lg, 'translation', parts[lg], true, true);
});
beforeEach(async () => {
  [mockGet, mockPost].forEach((m) => m.mockReset());
  mockId = 0;
  mockMe = { userId: 'u1', roles: [], permissions: ALL };
  qc = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retryDelay: 0 } } });
  await setLanguage('en');
  answers();
});

describe('petty cash', () => {
  test('shows the float, the box and what to top up in rupees', async () => {
    await render(<PettyScreen />, { wrapper });
    expect(await screen.findByText('Main · 1005')).toBeTruthy();
    expect(screen.getByText('₹3,200.50')).toBeTruthy();
    expect(screen.getByText('₹1,799.50')).toBeTruthy();
    expect(screen.getByText('Last count 1 Nov 2026: difference -₹10.00')).toBeTruthy();
  });
  test('empty', async () => {
    answers({ '/finance/petty-cash': { items: [] } });
    await render(<PettyScreen />, { wrapper });
    expect(await screen.findByText('No petty cash funds yet.')).toBeTruthy();
  });
  test('offline', async () => {
    answers({ '/finance/petty-cash': new ApiError(0, null) });
    await render(<PettyScreen />, { wrapper });
    expect(await screen.findByText('No network. Check your connection and try again.')).toBeTruthy();
  });
  test('error shows the reference', async () => {
    answers({ '/finance/petty-cash': new ApiError(500, { title: 'BOOM', correlationId: 'corr-p1' }) });
    await render(<PettyScreen />, { wrapper });
    expect(await screen.findByText(/corr-p1/)).toBeTruthy();
  });
  test('no permission', async () => {
    mockMe = { userId: 'u1', roles: [], permissions: [] };
    await render(<PettyScreen />, { wrapper });
    expect(await screen.findByText('You do not have permission to see this.')).toBeTruthy();
    expect(mockGet).not.toHaveBeenCalled();
  });
  test('a viewer cannot spend, replenish, count or create', async () => {
    mockMe = { userId: 'u1', roles: [], permissions: ['finance.account.view'] };
    await render(<PettyScreen />, { wrapper });
    await screen.findByText('Main · 1005');
    for (const l of ['Spend from Main', 'Replenish Main', 'Count the box at Main', 'New fund']) expect(screen.queryByLabelText(l)).toBeNull();
    expect(screen.getByLabelText('Counts at Main')).toBeTruthy();
  });
  test('spend posts category, amount and what for with one key', async () => {
    await render(<PettyScreen />, { wrapper });
    await press('Spend from Main');
    await press('6100 Tea and snacks');
    await type('Amount', '45.50');
    await type('What for', 'Tea for staff');
    mockPost.mockResolvedValue({});
    await press('Save');
    await waitFor(() => expect(mockPost).toHaveBeenCalled());
    expect(mockPost.mock.calls[0]![0]).toBe('/finance/petty-cash/f1/expense');
    expect(mockPost.mock.calls[0]![1].body).toEqual({ date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), accountId: 'x1', amount: '45.50', narration: 'Tea for staff' });
    expect(await screen.findByText('Expense posted.')).toBeTruthy();
  });
  test('spend with a bad amount stays disabled', async () => {
    await render(<PettyScreen />, { wrapper });
    await press('Spend from Main');
    await press('6100 Tea and snacks');
    await type('Amount', '4.555');
    await type('What for', 'Tea');
    expect(screen.getByLabelText('Save').props.accessibilityState?.disabled).toBe(true);
  });
  test('replenish chooses the cash or bank ledger', async () => {
    await render(<PettyScreen />, { wrapper });
    await press('Replenish Main');
    await press('1010 SBI current');
    mockPost.mockResolvedValue({});
    await press('Save');
    await waitFor(() => expect(mockPost).toHaveBeenCalled());
    expect(mockPost.mock.calls[0]![0]).toBe('/finance/petty-cash/f1/replenish');
    expect(mockPost.mock.calls[0]![1].body.fromAccountId).toBe('c2');
  });
  test('count sends the counted cash as a string', async () => {
    await render(<PettyScreen />, { wrapper });
    await press('Count the box at Main');
    await type('Cash counted', '3190.50');
    mockPost.mockResolvedValue({ status: 'PENDING_APPROVAL' });
    await press('Save');
    await waitFor(() => expect(mockPost.mock.calls[0]![0]).toBe('/finance/petty-cash/f1/count'));
    expect(mockPost.mock.calls[0]![1].body.countedAmount).toBe('3190.50');
  });
  test('a lost answer on count is retried with the same key', async () => {
    await render(<PettyScreen />, { wrapper });
    await press('Count the box at Main');
    await type('Cash counted', '3190.50');
    mockPost.mockRejectedValueOnce(new ApiError(0, null)).mockResolvedValue({});
    await press('Save');
    await screen.findByText('No network. Check your connection and try again.');
    await press('Save');
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(2));
    expect(mockPost.mock.calls[0]![1].idempotencyKey).toBe(mockPost.mock.calls[1]![1].idempotencyKey);
  });
  test('a pending count can be approved by an approver', async () => {
    await render(<PettyScreen />, { wrapper });
    await press('Counts at Main');
    expect(await screen.findByText('-₹10.00', { exact: true })).toBeTruthy();
    mockPost.mockResolvedValue({});
    await press('Approve count of 10 Nov 2026');
    await waitFor(() => expect(mockPost.mock.calls[0]![0]).toBe('/finance/petty-cash/counts/k1/approve'));
  });
  test('reject a count needs a reason', async () => {
    await render(<PettyScreen />, { wrapper });
    await press('Counts at Main');
    await press('Reject count of 10 Nov 2026');
    await type('Reason for rejecting', 'Count again');
    mockPost.mockResolvedValue({});
    await press('Reject');
    await waitFor(() => expect(mockPost.mock.calls[0]![1].body).toEqual({ note: 'Count again' }));
  });
  test('the approve button is hidden without the approve permission', async () => {
    mockMe = { userId: 'u1', roles: [], permissions: ['finance.account.view', 'finance.pettycash.manage'] };
    await render(<PettyScreen />, { wrapper });
    await press('Counts at Main');
    await screen.findByText('Difference');
    expect(screen.queryByLabelText('Approve count of 10 Nov 2026')).toBeNull();
  });
  test('create a fund', async () => {
    await render(<PettyScreen />, { wrapper });
    await press('New fund');
    await press('Main');
    await type('Float (the amount the box is topped up to)', '5000');
    await type('Custodian', 'Ramesh');
    mockPost.mockResolvedValue(fund);
    await press('Create fund');
    await waitFor(() => expect(mockPost).toHaveBeenCalled());
    expect(mockPost.mock.calls[0]![0]).toBe('/finance/petty-cash');
    expect(mockPost.mock.calls[0]![1].body).toEqual({ branchId: 'b1', floatAmount: '5000', custodian: 'Ramesh' });
  });
  test('Marathi', async () => {
    await setLanguage('mr');
    await render(<PettyScreen />, { wrapper });
    expect(await screen.findByText('किरकोळ रोख')).toBeTruthy();
  });
});

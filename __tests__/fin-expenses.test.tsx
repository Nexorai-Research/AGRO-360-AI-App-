import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import parts from '../i18n-parts/fin.json';
import { i18n, setLanguage } from '../src/i18n';
import { ApiError } from '../src/api/errors';
import ExpensesScreen from '../src/features/finance/ExpensesScreen';

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
const ALL = ['finance.account.view', 'finance.expense.create', 'finance.expense.approve', 'finance.expense.pay', 'finance.voucher.reverse'];
const exp = (o: Record<string, unknown> = {}) => ({
  id: 'e1', expenseNo: 'EX-0001', expenseDate: '2026-11-10', accountId: 'x1', accountCode: '6100', accountName: 'Electricity', payee: 'MSEB', amount: '1000.00', taxAmount: '180.00',
  inputTaxEligible: true, total: '1180.00', documentNo: 'B-77', status: 'DRAFT', needsApproval: false, decisionNote: null, reverseReason: null, version: 2, ...o,
});
const accounts = [
  { id: 'x1', code: '6100', name: 'Electricity', type: 'EXPENSE', cashBank: null, isControl: false, active: true },
  { id: 'c1', code: '1000', name: 'Cash in hand', type: 'ASSET', cashBank: 'CASH', isControl: false, active: true },
  { id: 'c2', code: '1010', name: 'SBI current', type: 'ASSET', cashBank: 'BANK', isControl: false, active: true },
];
const base: Record<string, unknown> = { '/finance/expenses': { items: [exp()] }, '/finance/expenses/e1': exp(), '/finance/accounts': { items: accounts }, '/branches': { items: [{ id: 'b1', name: 'Main' }] } };
const answers = (o: Record<string, unknown> = {}) =>
  mockGet.mockImplementation(async (path: string) => {
    const v = path in o ? o[path] : base[path];
    if (v instanceof Error) throw v;
    return v;
  });
const press = async (label: string, i = 0) => fireEvent.press((await screen.findAllByLabelText(label))[i]!);
const type = async (label: string, text: string) => fireEvent.changeText(await screen.findByLabelText(label), text);
const openDetail = async () => {
  await render(<ExpensesScreen />, { wrapper });
  await press('EX-0001');
  await screen.findByText('₹1,180.00');
};

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

describe('expenses list', () => {
  test('lists with total in rupees, and filters by status in the query', async () => {
    await render(<ExpensesScreen />, { wrapper });
    expect(await screen.findByText('EX-0001 · MSEB')).toBeTruthy();
    expect(screen.getByText('₹1,180.00')).toBeTruthy();
    await press('Paid');
    await waitFor(() => expect(mockGet.mock.calls.some((c) => c[0] === '/finance/expenses' && c[1].query.status === 'PAID')).toBe(true));
  });
  test('empty', async () => {
    answers({ '/finance/expenses': { items: [] } });
    await render(<ExpensesScreen />, { wrapper });
    expect(await screen.findByText('No expenses here.')).toBeTruthy();
  });
  test('offline', async () => {
    answers({ '/finance/expenses': new ApiError(0, null) });
    await render(<ExpensesScreen />, { wrapper });
    expect(await screen.findByText('No network. Check your connection and try again.')).toBeTruthy();
  });
  test('server error shows the correlation id', async () => {
    answers({ '/finance/expenses': new ApiError(500, { title: 'BOOM', correlationId: 'corr-31' }) });
    await render(<ExpensesScreen />, { wrapper });
    expect(await screen.findByText(/corr-31/)).toBeTruthy();
  });
  test('no permission', async () => {
    mockMe = { userId: 'u1', roles: [], permissions: [] };
    await render(<ExpensesScreen />, { wrapper });
    expect(await screen.findByText('You do not have permission to see this.')).toBeTruthy();
  });
  test('Hindi', async () => {
    await setLanguage('hi');
    await render(<ExpensesScreen />, { wrapper });
    expect(await screen.findByText('नया खर्च')).toBeTruthy();
  });
});

describe('expense actions', () => {
  test('submit a draft sends the key once', async () => {
    await openDetail();
    mockPost.mockResolvedValue(exp({ status: 'SUBMITTED' }));
    await press('Submit');
    await waitFor(() => expect(mockPost).toHaveBeenCalled());
    expect(mockPost.mock.calls[0]![0]).toBe('/finance/expenses/e1/submit');
    expect(mockPost.mock.calls[0]![1].idempotencyKey).toBe('key-1');
    expect(await screen.findByText('Submitted.')).toBeTruthy();
  });
  test('approve and reject are for the approver; reject needs a reason', async () => {
    answers({ '/finance/expenses/e1': exp({ status: 'SUBMITTED' }) });
    await openDetail();
    mockPost.mockResolvedValue(exp());
    await press('Reject');
    await type('Reason for rejecting', 'No bill');
    await press('Reject');
    await waitFor(() => expect(mockPost).toHaveBeenCalled());
    expect(mockPost.mock.calls[0]![0]).toBe('/finance/expenses/e1/reject');
    expect(mockPost.mock.calls[0]![1].body).toEqual({ note: 'No bill' });
  });
  test('a user without the approve permission sees no Approve', async () => {
    mockMe = { userId: 'u1', roles: [], permissions: ['finance.account.view', 'finance.expense.create'] };
    answers({ '/finance/expenses/e1': exp({ status: 'SUBMITTED' }) });
    await openDetail();
    expect(screen.queryByLabelText('Approve')).toBeNull();
  });
  test('pay chooses a cash or bank ledger and a date, and sends both', async () => {
    answers({ '/finance/expenses/e1': exp({ status: 'APPROVED' }) });
    await openDetail();
    await press('Pay');
    await press('1010 SBI current');
    mockPost.mockResolvedValue(exp({ status: 'PAID' }));
    fireEvent.changeText(await screen.findByLabelText('Paid on'), '2026-11-11');
    await press('Pay');
    await waitFor(() => expect(mockPost).toHaveBeenCalled());
    expect(mockPost.mock.calls[0]![0]).toBe('/finance/expenses/e1/pay');
    expect(mockPost.mock.calls[0]![1].body).toEqual({ paymentAccountId: 'c2', paidOn: '2026-11-11' });
  });
  test('pay is disabled until a ledger is chosen', async () => {
    answers({ '/finance/expenses/e1': exp({ status: 'APPROVED' }) });
    await openDetail();
    await press('Pay');
    await screen.findByLabelText('Paid on');
    expect(screen.getAllByLabelText('Pay')[0]!.props.accessibilityState?.disabled).toBe(true);
  });
  test('reverse of a paid expense needs a reason', async () => {
    answers({ '/finance/expenses/e1': exp({ status: 'PAID' }) });
    await openDetail();
    await press('Reverse');
    await type('Reason for reversing', 'Paid by mistake');
    mockPost.mockResolvedValue(exp({ status: 'REVERSED' }));
    await press('Reverse');
    await waitFor(() => expect(mockPost.mock.calls[0]![1].body).toEqual({ reason: 'Paid by mistake' }));
  });
});

describe('new expense', () => {
  const fill = async () => {
    await press('New expense');
    await press('6100 Electricity');
    await type('Paid to', 'MSEB');
    await type('Amount before tax', '1000');
    await type('GST on the bill', '180');
  };
  test('creates a draft with the decimal strings as typed and moves to it', async () => {
    await render(<ExpensesScreen />, { wrapper });
    await fill();
    mockPost.mockResolvedValue(exp());
    await press('Save expense');
    await waitFor(() => expect(mockPost).toHaveBeenCalled());
    expect(mockPost.mock.calls[0]![0]).toBe('/finance/expenses');
    expect(mockPost.mock.calls[0]![1].body).toEqual(expect.objectContaining({ accountId: 'x1', payee: 'MSEB', amount: '1000', taxAmount: '180', inputTaxEligible: false }));
    expect(JSON.stringify(mockPost.mock.calls[0]![1])).not.toMatch(/tenant/i);
    expect(await screen.findByText('₹1,180.00')).toBeTruthy();
  });
  test('refuses a zero amount on the phone', async () => {
    await render(<ExpensesScreen />, { wrapper });
    await fill();
    await type('Amount before tax', '0');
    await press('Save expense');
    expect(await screen.findByText('The amount must be above zero with at most 2 decimals.')).toBeTruthy();
    expect(mockPost).not.toHaveBeenCalled();
  });
  test('a possible duplicate asks, then records with confirmDuplicate and a new key', async () => {
    await render(<ExpensesScreen />, { wrapper });
    await fill();
    mockPost.mockRejectedValueOnce(new ApiError(409, { title: 'DUPLICATE_WARNING', correlationId: 'corr-d' })).mockResolvedValue(exp());
    await press('Save expense');
    expect(await screen.findByText(/This looks like an expense already recorded/)).toBeTruthy();
    await press('Record anyway');
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(2));
    expect(mockPost.mock.calls[1]![1].body.confirmDuplicate).toBe(true);
    expect(mockPost.mock.calls[0]![1].body.confirmDuplicate).toBeUndefined();
    expect(mockPost.mock.calls[0]![1].idempotencyKey).not.toBe(mockPost.mock.calls[1]![1].idempotencyKey);
  });
  test('a lost answer is retried with the same key', async () => {
    await render(<ExpensesScreen />, { wrapper });
    await fill();
    mockPost.mockRejectedValueOnce(new ApiError(0, null)).mockResolvedValue(exp());
    await press('Save expense');
    await screen.findByText('No network. Check your connection and try again.');
    await press('Save expense');
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(2));
    expect(mockPost.mock.calls[0]![1].idempotencyKey).toBe(mockPost.mock.calls[1]![1].idempotencyKey);
  });
});

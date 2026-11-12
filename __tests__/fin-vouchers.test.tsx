import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import parts from '../i18n-parts/fin.json';
import { i18n, setLanguage } from '../src/i18n';
import { ApiError } from '../src/api/errors';
import VouchersScreen from '../src/features/finance/VouchersScreen';

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
const ALL = ['finance.account.view', 'finance.voucher.create', 'finance.voucher.approve', 'finance.voucher.reverse'];
const accounts = [
  { id: 'a1', code: '1000', name: 'Cash in hand', type: 'ASSET', cashBank: 'CASH', isControl: false, isOpeningPlug: false, active: true },
  { id: 'a2', code: '4000', name: 'Sales', type: 'INCOME', cashBank: null, isControl: false, isOpeningPlug: false, active: true },
  { id: 'a3', code: '6000', name: 'Rent', type: 'EXPENSE', cashBank: null, isControl: false, isOpeningPlug: false, active: true },
];
const voucher = (o: Record<string, unknown> = {}) => ({
  id: 'v1', voucherNo: 'JV-0001', kind: 'JOURNAL', status: 'DRAFT', voucherDate: '2026-11-10', narration: 'Rent for November', total: '12500.50', journalId: null,
  createdBy: 'u9', decisionNote: null, reverseReason: null, version: 4, needsApproval: false,
  lines: [{ lineNo: 1, accountId: 'a3', accountCode: '6000', accountName: 'Rent', debit: '12500.50', credit: '0.00', narration: null }, { lineNo: 2, accountId: 'a1', accountCode: '1000', accountName: 'Cash in hand', debit: '0.00', credit: '12500.50', narration: null }],
  ...o,
});
const answers = (o: Record<string, unknown> = {}) =>
  mockGet.mockImplementation(async (path: string) => {
    const v = path in o ? o[path] : ({ '/finance/vouchers': { items: [voucher()] }, '/finance/accounts': { items: accounts }, '/branches': { items: [{ id: 'b1', name: 'Main' }] }, '/finance/vouchers/v1': voucher() } as Record<string, unknown>)[path];
    if (v instanceof Error) throw v;
    return v;
  });
const press = async (label: string, i = 0) => fireEvent.press((await screen.findAllByLabelText(label))[i]!);
const type = async (label: string, text: string) => fireEvent.changeText(await screen.findByLabelText(label), text);
const openDetail = async () => {
  await render(<VouchersScreen />, { wrapper });
  await press('JV-0001');
  await screen.findByText('Rent for November');
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

describe('vouchers list', () => {
  test('lists vouchers with rupees from strings', async () => {
    await render(<VouchersScreen />, { wrapper });
    expect(await screen.findByText('JV-0001')).toBeTruthy();
    expect(screen.getByText('₹12,500.50')).toBeTruthy();
    expect(mockGet.mock.calls[0]![0]).toBe('/finance/vouchers');
    expect(mockGet.mock.calls[0]![1].query.limit).toBe(100);
  });
  test('loading, empty, offline, error with correlation id', async () => {
    mockGet.mockReturnValue(new Promise(() => undefined));
    await render(<VouchersScreen />, { wrapper });
    expect(await screen.findByTestId('state-loading')).toBeTruthy();
  });
  test('empty', async () => {
    answers({ '/finance/vouchers': { items: [] } });
    await render(<VouchersScreen />, { wrapper });
    expect(await screen.findByText('No vouchers here.')).toBeTruthy();
  });
  test('offline', async () => {
    answers({ '/finance/vouchers': new ApiError(0, null) });
    await render(<VouchersScreen />, { wrapper });
    expect(await screen.findByText('No network. Check your connection and try again.')).toBeTruthy();
  });
  test('server error shows the correlation id', async () => {
    answers({ '/finance/vouchers': new ApiError(500, { title: 'BOOM', correlationId: 'corr-77' }) });
    await render(<VouchersScreen />, { wrapper });
    expect(await screen.findByText(/corr-77/)).toBeTruthy();
  });
  test('403 from the server shows permission denied', async () => {
    answers({ '/finance/vouchers': new ApiError(403, { title: 'FORBIDDEN' }) });
    await render(<VouchersScreen />, { wrapper });
    expect(await screen.findByText('You do not have permission to see this.')).toBeTruthy();
  });
  test('without the view permission nothing is asked', async () => {
    mockMe = { userId: 'u1', roles: [], permissions: [] };
    await render(<VouchersScreen />, { wrapper });
    expect(await screen.findByText('You do not have permission to see this.')).toBeTruthy();
    expect(mockGet).not.toHaveBeenCalled();
  });
  test('new voucher button only with the create permission', async () => {
    mockMe = { userId: 'u1', roles: [], permissions: ['finance.account.view'] };
    await render(<VouchersScreen />, { wrapper });
    await screen.findByText('JV-0001');
    expect(screen.queryByLabelText('New voucher')).toBeNull();
  });
  test('Hindi title', async () => {
    await setLanguage('hi');
    await render(<VouchersScreen />, { wrapper });
    expect(await screen.findByText('वाउचर और प्रविष्टियाँ')).toBeTruthy();
  });
});

describe('voucher detail and actions', () => {
  test('a draft is posted with one key and the same key on retry after a lost answer', async () => {
    await openDetail();
    mockPost.mockRejectedValueOnce(new ApiError(0, null)).mockResolvedValue(voucher({ status: 'POSTED' }));
    await press('Post');
    expect(await screen.findByText('No network. Check your connection and try again.')).toBeTruthy();
    await press('Post');
    expect(await screen.findByText('Posted.')).toBeTruthy();
    expect(mockPost).toHaveBeenCalledTimes(2);
    expect(mockPost.mock.calls[0]![0]).toBe('/finance/vouchers/v1/post');
    expect(mockPost.mock.calls[0]![1].idempotencyKey).toBe(mockPost.mock.calls[1]![1].idempotencyKey);
  });
  test('a draft that needs approval shows Submit and not Post', async () => {
    answers({ '/finance/vouchers/v1': voucher({ needsApproval: true }) });
    await openDetail();
    expect(screen.queryByLabelText('Post')).toBeNull();
    mockPost.mockResolvedValue(voucher({ status: 'PENDING_APPROVAL' }));
    await press('Submit');
    await waitFor(() => expect(mockPost.mock.calls[0]![0]).toBe('/finance/vouchers/v1/submit'));
  });
  test('reject needs a reason and sends it as the note', async () => {
    answers({ '/finance/vouchers/v1': voucher({ status: 'PENDING_APPROVAL' }) });
    await openDetail();
    await press('Reject');
    expect(screen.getByLabelText('Reject').props.accessibilityState?.disabled).toBe(true);
    await type('Reason for rejecting', 'Wrong account');
    mockPost.mockResolvedValue(voucher({ status: 'REJECTED' }));
    await press('Reject');
    await waitFor(() => expect(mockPost).toHaveBeenCalled());
    expect(mockPost.mock.calls[0]![0]).toBe('/finance/vouchers/v1/reject');
    expect(mockPost.mock.calls[0]![1].body).toEqual({ note: 'Wrong account' });
  });
  test('reverse of a posted voucher sends the reason', async () => {
    answers({ '/finance/vouchers/v1': voucher({ status: 'POSTED' }) });
    await openDetail();
    await press('Reverse');
    await type('Reason for reversing', 'Posted twice');
    mockPost.mockResolvedValue(voucher({ status: 'POSTED' }));
    await press('Reverse');
    await waitFor(() => expect(mockPost).toHaveBeenCalled());
    expect(mockPost.mock.calls[0]![0]).toBe('/finance/vouchers/v1/reverse');
    expect(mockPost.mock.calls[0]![1].body).toEqual({ reason: 'Posted twice' });
  });
  test('without reverse permission no Reverse button', async () => {
    mockMe = { userId: 'u1', roles: [], permissions: ['finance.account.view'] };
    answers({ '/finance/vouchers/v1': voucher({ status: 'POSTED' }) });
    await openDetail();
    expect(screen.queryByLabelText('Reverse')).toBeNull();
  });
});

describe('new voucher', () => {
  const openNew = async () => {
    await render(<VouchersScreen />, { wrapper });
    await press('New voucher');
    await screen.findByLabelText('Narration (what it is for)');
  };
  const fillJournal = async (credit: string) => {
    await type('Narration (what it is for)', 'Rent for November');
    await press('6000 Rent', 0);
    await press('1000 Cash in hand', 1);
    await type('Debit 1', '12500.50');
    await type('Credit 2', credit);
  };
  test('a balanced journal is created with one key; a lost answer is retried with the same key and no tenant id', async () => {
    await openNew();
    await fillJournal('12500.50');
    mockPost.mockRejectedValueOnce(new ApiError(0, null)).mockResolvedValue(voucher());
    await press('Save as draft');
    await screen.findByText('No network. Check your connection and try again.');
    await press('Save as draft');
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(2));
    const [path, opts] = mockPost.mock.calls[0]!;
    expect(path).toBe('/finance/vouchers/journal');
    expect(opts.body).toEqual(expect.objectContaining({ narration: 'Rent for November', lines: [{ accountId: 'a3', debit: '12500.50' }, { accountId: 'a1', credit: '12500.50' }] }));
    expect(JSON.stringify(opts)).not.toMatch(/tenant/i);
    expect(opts.idempotencyKey).toBe(mockPost.mock.calls[1]![1].idempotencyKey);
    expect(await screen.findByText('JV-0001')).toBeTruthy(); // moved to the saved voucher
  });
  test('an unbalanced journal is refused on the phone and nothing is sent', async () => {
    await openNew();
    await fillJournal('12000.00');
    expect(screen.getByText('Debit minus credit: ₹500.50 (must be zero)')).toBeTruthy();
    await press('Save as draft');
    expect(await screen.findByText('Debit and credit must be equal.')).toBeTruthy();
    expect(mockPost).not.toHaveBeenCalled();
  });
  test('a changed body gets a new key', async () => {
    await openNew();
    await fillJournal('12500.50');
    mockPost.mockRejectedValue(new ApiError(0, null));
    await press('Save as draft');
    await screen.findByText('No network. Check your connection and try again.');
    await type('Narration (what it is for)', 'Rent for November again');
    await press('Save as draft');
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(2));
    expect(mockPost.mock.calls[0]![1].idempotencyKey).not.toBe(mockPost.mock.calls[1]![1].idempotencyKey);
  });
  test('a payment voucher posts to the payment route with items and the cash ledger', async () => {
    await openNew();
    await press('Payment');
    await type('Narration (what it is for)', 'Tea and sugar');
    await press('1000 Cash in hand', 0); // paid from
    await press('6000 Rent', 0);
    await type('Amount 1', '150');
    mockPost.mockResolvedValue(voucher({ kind: 'PAYMENT' }));
    await press('Save as draft');
    await waitFor(() => expect(mockPost).toHaveBeenCalled());
    expect(mockPost.mock.calls[0]![0]).toBe('/finance/vouchers/payment');
    expect(mockPost.mock.calls[0]![1].body).toEqual(expect.objectContaining({ paidFromAccountId: 'a1', items: [{ accountId: 'a3', amount: '150' }] }));
  });
  test('a server rejection (locked period) is shown with its reference', async () => {
    await openNew();
    await fillJournal('12500.50');
    mockPost.mockRejectedValue(new ApiError(409, { title: 'PERIOD_LOCKED', correlationId: 'corr-5' }));
    await press('Save as draft');
    expect(await screen.findByText(/corr-5/)).toBeTruthy();
  });
});

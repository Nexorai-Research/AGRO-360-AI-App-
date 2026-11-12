import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import parts from '../i18n-parts/fin.json';
import { i18n, setLanguage } from '../src/i18n';
import { ApiError } from '../src/api/errors';
import BankScreen from '../src/features/finance/BankScreen';

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockPatch = jest.fn();
let mockMe: { userId: string; roles: string[]; permissions?: string[] };
let mockId = 0;
jest.mock('../src/auth/AuthProvider', () => ({
  useAuth: () => ({
    status: 'signedIn',
    me: mockMe,
    client: { get: (...a: unknown[]) => mockGet(...a), post: (...a: unknown[]) => mockPost(...a), patch: (...a: unknown[]) => mockPatch(...a) },
  }),
}));
jest.mock('../src/device', () => ({ newId: () => `key-${++mockId}` }));

let qc: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
const ALL = ['finance.account.view', 'finance.bank.manage', 'finance.bankrec.manage'];
const bank = (o: Record<string, unknown> = {}) => ({
  id: 'bk1', accountId: 'l1', ledgerCode: '1010', ledgerName: 'SBI current', bankName: 'SBI', branchName: 'Nashik', ifsc: 'SBIN0001234', holderName: 'Agro Traders',
  accountNumberMasked: 'XXXX4321', upiVpa: null, active: true, balance: '50000.00', version: 5, ...o,
});
const line = (o: Record<string, unknown>) => ({ id: 'ln1', date: '2026-11-05', narration: 'NEFT Kisan Seeds', reference: 'N123', withdrawal: '0.00', deposit: '2500.00', status: 'SUGGESTED', suggestedJournalLineId: 'jl1', ...o });
const rec = (o: Record<string, unknown> = {}) => ({
  bankAccountId: 'bk1', asOn: '2026-11-12', bookBalance: '50000.00', statementBalance: null, unmatchedBook: [{ journalLineId: 'jl9', date: '2026-11-04', direction: 'IN', amount: '2500.00', narration: 'Receipt', voucherNo: 'RV-9' }, { journalLineId: 'jl8', date: '2026-11-04', direction: 'OUT', amount: '2500.00', narration: 'Pay', voucherNo: 'PV-8' }],
  depositsInTransit: '0.00', outstandingPayments: '0.00', bankOnlyDeposits: '2500.00', bankOnlyWithdrawals: '0.00', adjustedBank: null, adjustedBook: '52500.00', difference: null, reconciled: false, signed: null, ...o,
});
const base: Record<string, unknown> = { '/finance/bank-accounts': { items: [bank()] }, '/finance/bank-statements/lines': { items: [line({})] }, '/finance/bank-reconciliation/bk1': rec() };
const answers = (o: Record<string, unknown> = {}) =>
  mockGet.mockImplementation(async (path: string) => {
    const v = path in o ? o[path] : base[path];
    if (v instanceof Error) throw v;
    return v;
  });
const press = async (label: string, i = 0) => fireEvent.press((await screen.findAllByLabelText(label))[i]!);
const type = async (label: string, text: string) => fireEvent.changeText(await screen.findByLabelText(label), text);
const openRec = async () => {
  await render(<BankScreen />, { wrapper });
  await press('Reconciliation');
  await screen.findByText('Balance in the books');
};

beforeAll(() => {
  for (const lg of ['en', 'hi', 'mr'] as const) i18n.addResourceBundle(lg, 'translation', parts[lg], true, true);
});
beforeEach(async () => {
  [mockGet, mockPost, mockPatch].forEach((m) => m.mockReset());
  mockId = 0;
  mockMe = { userId: 'u1', roles: [], permissions: ALL };
  qc = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retryDelay: 0 } } });
  await setLanguage('en');
  answers();
});

describe('bank accounts', () => {
  test('lists with the masked number only', async () => {
    await render(<BankScreen />, { wrapper });
    expect(await screen.findByText('XXXX4321 · SBIN0001234 · Agro Traders')).toBeTruthy();
    expect(screen.getByText('₹50,000.00')).toBeTruthy();
  });
  test('empty and offline and error with reference', async () => {
    answers({ '/finance/bank-accounts': { items: [] } });
    await render(<BankScreen />, { wrapper });
    expect(await screen.findByText('No bank accounts yet.')).toBeTruthy();
  });
  test('offline', async () => {
    answers({ '/finance/bank-accounts': new ApiError(0, null) });
    await render(<BankScreen />, { wrapper });
    expect(await screen.findByText('No network. Check your connection and try again.')).toBeTruthy();
  });
  test('error', async () => {
    answers({ '/finance/bank-accounts': new ApiError(500, { title: 'BOOM', correlationId: 'corr-b1' }) });
    await render(<BankScreen />, { wrapper });
    expect(await screen.findByText(/corr-b1/)).toBeTruthy();
  });
  test('no permission', async () => {
    mockMe = { userId: 'u1', roles: [], permissions: [] };
    await render(<BankScreen />, { wrapper });
    expect(await screen.findByText('You do not have permission to see this.')).toBeTruthy();
  });
  test('no add or edit without finance.bank.manage', async () => {
    mockMe = { userId: 'u1', roles: [], permissions: ['finance.account.view'] };
    await render(<BankScreen />, { wrapper });
    await screen.findByText('XXXX4321 · SBIN0001234 · Agro Traders');
    expect(screen.queryByLabelText('Add bank account')).toBeNull();
    expect(screen.queryByLabelText('Edit XXXX4321')).toBeNull();
  });
  test('add checks the IFSC and account number, then posts once', async () => {
    await render(<BankScreen />, { wrapper });
    await press('Add bank account');
    await type('Bank', 'HDFC');
    await type('IFSC (like SBIN0001234)', 'bad');
    await type('Account holder', 'Agro Traders');
    await type('Account number', '12345678901');
    expect(screen.getByLabelText('Add bank account').props.accessibilityState?.disabled).toBe(true);
    await type('IFSC (like SBIN0001234)', 'hdfc0001234');
    mockPost.mockResolvedValue(bank());
    await press('Add bank account');
    await waitFor(() => expect(mockPost).toHaveBeenCalled());
    expect(mockPost.mock.calls[0]![0]).toBe('/finance/bank-accounts');
    expect(mockPost.mock.calls[0]![1].body).toEqual({ bankName: 'HDFC', ifsc: 'HDFC0001234', holderName: 'Agro Traders', accountNumber: '12345678901' });
    expect(mockPost.mock.calls[0]![1].idempotencyKey).toBe('key-1');
  });
  test('edit sends the version as If-Match', async () => {
    await render(<BankScreen />, { wrapper });
    await press('Edit XXXX4321');
    await type('Account holder', 'Agro Traders Pvt');
    mockPatch.mockResolvedValue(bank());
    await press('Save');
    await waitFor(() => expect(mockPatch).toHaveBeenCalled());
    expect(mockPatch.mock.calls[0]![0]).toBe('/finance/bank-accounts/bk1');
    expect(mockPatch.mock.calls[0]![1].version).toBe(5);
    expect(mockPatch.mock.calls[0]![1].body).toEqual({ holderName: 'Agro Traders Pvt', upiVpa: null, active: true });
  });
});

describe('reconciliation', () => {
  test('shows book against bank and the open statement lines', async () => {
    await openRec();
    expect(screen.getByText('Not known')).toBeTruthy();
    expect(screen.getByText('₹52,500.00')).toBeTruthy();
    expect(await screen.findByText('NEFT Kisan Seeds')).toBeTruthy();
    const c = mockGet.mock.calls.find((x) => x[0] === '/finance/bank-reconciliation/bk1')!;
    expect(c[1].query.asOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  test('accept a suggested match', async () => {
    await openRec();
    mockPost.mockResolvedValue({});
    await press('Accept match for NEFT Kisan Seeds');
    await waitFor(() => expect(mockPost).toHaveBeenCalled());
    expect(mockPost.mock.calls[0]![0]).toBe('/finance/bank-lines/ln1/accept');
  });
  test('manual match offers only book entries of the same direction and amount', async () => {
    answers({ '/finance/bank-statements/lines': { items: [line({ status: 'UNMATCHED', suggestedJournalLineId: null })] } });
    await openRec();
    await press('Match NEFT Kisan Seeds with a book entry');
    expect(await screen.findByLabelText(/RV-9/)).toBeTruthy();
    expect(screen.queryByLabelText(/PV-8/)).toBeNull();
    mockPost.mockResolvedValue({});
    fireEvent.press(screen.getByLabelText(/RV-9/));
    await waitFor(() => expect(mockPost).toHaveBeenCalled());
    expect(mockPost.mock.calls[0]![0]).toBe('/finance/bank-lines/ln1/match');
    expect(mockPost.mock.calls[0]![1].body).toEqual({ journalLineId: 'jl9' });
  });
  test('unmatch a matched line', async () => {
    answers({ '/finance/bank-statements/lines': { items: [line({ status: 'MATCHED' })] } });
    await openRec();
    mockPost.mockResolvedValue({});
    await press('Unmatch NEFT Kisan Seeds');
    await waitFor(() => expect(mockPost.mock.calls[0]![0]).toBe('/finance/bank-lines/ln1/unmatch'));
  });
  test('sign sends the statement balance as a string; a server refusal is shown', async () => {
    await openRec();
    await type('Closing balance on the statement', '52500.00');
    mockPost.mockResolvedValue({ refused: 'accept or reject the suggested matches before signing' });
    await press('Sign the reconciliation');
    await waitFor(() => expect(mockPost).toHaveBeenCalled());
    expect(mockPost.mock.calls[0]![0]).toBe('/finance/bank-reconciliation/bk1/sign');
    expect(mockPost.mock.calls[0]![1].body).toEqual({ asOn: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), statementBalance: '52500.00' });
    expect(await screen.findByText('accept or reject the suggested matches before signing')).toBeTruthy();
  });
  test('sign is disabled for a bad amount and for a read-only user there is no sign box', async () => {
    await openRec();
    await type('Closing balance on the statement', '52,500');
    expect(screen.getByLabelText('Sign the reconciliation').props.accessibilityState?.disabled).toBe(true);
  });
  test('read-only user cannot sign or match', async () => {
    mockMe = { userId: 'u1', roles: [], permissions: ['finance.account.view'] };
    await openRec();
    await screen.findByText('NEFT Kisan Seeds');
    expect(screen.queryByLabelText('Sign the reconciliation')).toBeNull();
    expect(screen.queryByLabelText('Accept match for NEFT Kisan Seeds')).toBeNull();
  });
  test('a signed reconciliation says so and hides the sign box', async () => {
    answers({ '/finance/bank-reconciliation/bk1': rec({ signed: { signedAt: '2026-11-12T10:00:00Z', statementBalance: '52500.00' }, difference: '0.00', reconciled: true }) });
    await openRec();
    expect(await screen.findByText('Signed on 12 Nov 2026.')).toBeTruthy();
    expect(screen.queryByLabelText('Sign the reconciliation')).toBeNull();
  });
  test('a difference is shown in rupees', async () => {
    answers({ '/finance/bank-reconciliation/bk1': rec({ difference: '120.50', adjustedBank: '52379.50' }) });
    await openRec();
    expect(await screen.findByText('Difference ₹120.50')).toBeTruthy();
  });
  test('run matching again', async () => {
    await openRec();
    mockPost.mockResolvedValue({ autoMatched: 1, suggested: 0, unmatched: 0 });
    await press('Run the matching again');
    await waitFor(() => expect(mockPost.mock.calls[0]![0]).toBe('/finance/bank-statements/bk1/auto-match'));
  });
  test('a bad date is explained and nothing is asked', async () => {
    await openRec();
    mockGet.mockClear();
    await type('As on (YYYY-MM-DD)', '12/11/2026');
    expect(await screen.findByText('Enter the date as YYYY-MM-DD.')).toBeTruthy();
    expect(mockGet.mock.calls.filter((c) => String(c[0]).includes('reconciliation')).length).toBe(0);
  });
  test('Hindi', async () => {
    await setLanguage('hi');
    await render(<BankScreen />, { wrapper });
    expect(await screen.findByText('बैंक खाते और मिलान')).toBeTruthy();
  });
});

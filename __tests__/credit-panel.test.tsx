import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '../src/api/errors';
import { setLanguage } from '../src/i18n';
import { CreditPanel } from '../src/features/customers/CreditPanel';
import { validHoldReason, validLimit, validSeason } from '../src/features/customers/credit-api';

const mockGet = jest.fn();
const mockPut = jest.fn();
const mockPost = jest.fn();
let mockMe: { userId: string; tenantId: string; roles: string[]; permissions?: string[] };
let mockId = 0;
jest.mock('../src/auth/AuthProvider', () => ({
  useAuth: () => ({ me: mockMe, client: { get: (...a: unknown[]) => mockGet(...a), put: (...a: unknown[]) => mockPut(...a), post: (...a: unknown[]) => mockPost(...a) } }),
}));
jest.mock('../src/device', () => ({ newId: () => `key-${++mockId}` }));

let qc: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
let account: Record<string, unknown>;
const review = () => ({
  account,
  history: [{ oldLimit: '10000.0000', newLimit: '20000.0000', reason: 'good payer', changedAt: '2026-10-01T10:00:00.000Z' }],
  holds: [{ action: 'HOLD', source: 'MANUAL', reason: 'cheque bounced', at: '2026-09-01T10:00:00.000Z' }],
});
const ALL = ['customer.ledger.view', 'credit.limit.manage', 'credit.hold'];

beforeEach(async () => {
  [mockGet, mockPut, mockPost].forEach((m) => m.mockReset());
  mockId = 0;
  account = { customerId: 'c1', creditLimit: '20000.0000', seasonLimit: null, termId: null, hold: false, holdReason: null, outstanding: '5000.0000', available: '15000.0000', version: 3 };
  mockGet.mockImplementation(async () => review());
  mockMe = { userId: 'u1', tenantId: 't1', roles: [], permissions: ALL };
  qc = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retryDelay: 0 } } });
  await setLanguage('en');
});
const openPanel = async () => fireEvent.press(await screen.findByLabelText('▸ Credit limit and hold'));

describe('credit checks', () => {
  test('amounts: up to 12 digits and 4 decimals, no sign, no letters', () => {
    expect(validLimit('0')).toBe(true);
    expect(validLimit('25000.50')).toBe(true);
    expect(validLimit('1.23456')).toBe(false);
    expect(validLimit('-5')).toBe(false);
    expect(validLimit('abc')).toBe(false);
    expect(validLimit('1234567890123')).toBe(false);
    expect(validSeason('')).toBe(true);
    expect(validSeason('x')).toBe(false);
  });
  test('hold reason is 3 to 500 letters', () => {
    expect(validHoldReason('ab')).toBe(false);
    expect(validHoldReason('bounced')).toBe(true);
    expect(validHoldReason('x'.repeat(501))).toBe(false);
  });
});

describe('credit panel', () => {
  test('without the ledger permission nothing is shown and nothing is loaded', async () => {
    mockMe = { ...mockMe, permissions: ['customer.view'] };
    await render(<CreditPanel customerId="c1" />, { wrapper });
    expect(screen.queryByLabelText('▸ Credit limit and hold')).toBeNull();
    expect(mockGet).not.toHaveBeenCalled();
  });
  test('closed until opened, then shows the account and the history', async () => {
    await render(<CreditPanel customerId="c1" />, { wrapper });
    await screen.findByLabelText('▸ Credit limit and hold');
    expect(mockGet).not.toHaveBeenCalled();
    await openPanel();
    expect(await screen.findByText(/cheque bounced/)).toBeTruthy();
    expect(screen.getByText(/good payer/)).toBeTruthy();
    expect(mockGet.mock.calls[0]![0]).toBe('/customers/c1/credit');
  });
  test('view-only user sees no action buttons', async () => {
    mockMe = { ...mockMe, permissions: ['customer.ledger.view'] };
    await render(<CreditPanel customerId="c1" />, { wrapper });
    await openPanel();
    await screen.findByText(/cheque bounced/);
    expect(screen.queryByLabelText('Change limit')).toBeNull();
    expect(screen.queryByLabelText('Put on hold')).toBeNull();
  });
  test('change limit: sends decimal strings with the version and one key', async () => {
    mockPut.mockResolvedValue({ ...account, creditLimit: '30000.5000' });
    await render(<CreditPanel customerId="c1" />, { wrapper });
    await openPanel();
    await fireEvent.press(await screen.findByLabelText('Change limit'));
    const field = screen.getByLabelText('Credit limit');
    expect(field.props.value).toBe('20000.00');
    await fireEvent.changeText(field, '30000.50');
    await fireEvent.press(screen.getByLabelText('Save limit'));
    expect(await screen.findByText('Credit limit saved.')).toBeTruthy();
    expect(mockPut).toHaveBeenCalledWith('/customers/c1/credit-limit', { body: { creditLimit: '30000.50', seasonLimit: null }, version: 3, idempotencyKey: 'key-1' });
  });
  test('a bad amount cannot be saved', async () => {
    await render(<CreditPanel customerId="c1" />, { wrapper });
    await openPanel();
    await fireEvent.press(await screen.findByLabelText('Change limit'));
    await fireEvent.changeText(screen.getByLabelText('Credit limit'), '12.34567');
    expect(screen.getByText('Enter an amount, up to 4 decimals.')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Save limit'));
    expect(mockPut).not.toHaveBeenCalled();
  });
  test('limit above the approver limit: refusal shown in words; retry keeps the key', async () => {
    mockPut.mockRejectedValueOnce(new ApiError(0, null, 'c1')).mockRejectedValueOnce(new ApiError(403, { title: 'APPROVAL_REQUIRED' }, 'c2'));
    await render(<CreditPanel customerId="c1" />, { wrapper });
    await openPanel();
    await fireEvent.press(await screen.findByLabelText('Change limit'));
    await fireEvent.changeText(screen.getByLabelText('Credit limit'), '9999999');
    await fireEvent.press(screen.getByLabelText('Save limit'));
    await screen.findByRole('alert');
    await fireEvent.press(screen.getByLabelText('Save limit'));
    expect(await screen.findByText(/above your approval limit/)).toBeTruthy();
    expect(mockPut.mock.calls[0]![1].idempotencyKey).toBe(mockPut.mock.calls[1]![1].idempotencyKey);
  });
  test('hold needs a reason of 3 letters, then posts it', async () => {
    mockPost.mockResolvedValue({ ...account, hold: true });
    await render(<CreditPanel customerId="c1" />, { wrapper });
    await openPanel();
    await fireEvent.press(await screen.findByLabelText('Put on hold'));
    await fireEvent.changeText(screen.getByLabelText('Reason'), 'ab');
    await fireEvent.press(screen.getByLabelText('Put on hold'));
    expect(mockPost).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText('Reason'), 'cheque bounced');
    await fireEvent.press(screen.getByLabelText('Put on hold'));
    expect(await screen.findByText('Credit is on hold.')).toBeTruthy();
    expect(mockPost).toHaveBeenCalledWith('/customers/c1/credit-hold', { body: { reason: 'cheque bounced' }, idempotencyKey: 'key-1' });
  });
  test('a customer on hold shows Release, which posts to credit-release', async () => {
    account = { ...account, hold: true, holdReason: 'cheque bounced' };
    mockPost.mockResolvedValue({ ...account, hold: false });
    await render(<CreditPanel customerId="c1" />, { wrapper });
    await openPanel();
    expect((await screen.findAllByText(/cheque bounced/)).length).toBeGreaterThan(0);
    expect(screen.getByText('Credit hold: cheque bounced')).toBeTruthy();
    expect(screen.queryByLabelText('Put on hold')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Release hold'));
    await fireEvent.changeText(screen.getByLabelText('Reason'), 'paid in full');
    await fireEvent.press(screen.getByLabelText('Release'));
    expect(await screen.findByText('Credit hold released.')).toBeTruthy();
    expect(mockPost.mock.calls[0]![0]).toBe('/customers/c1/credit-release');
  });
  test('stale version is explained', async () => {
    mockPut.mockRejectedValue(new ApiError(409, { title: 'STALE_VERSION' }, 'c9'));
    await render(<CreditPanel customerId="c1" />, { wrapper });
    await openPanel();
    await fireEvent.press(await screen.findByLabelText('Change limit'));
    await fireEvent.changeText(screen.getByLabelText('Credit limit'), '1000');
    await fireEvent.press(screen.getByLabelText('Save limit'));
    expect(await screen.findByText(/Someone else changed this/)).toBeTruthy();
  });
});

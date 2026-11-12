import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '../src/api/errors';
import { setLanguage } from '../src/i18n';
import ShiftsScreen, { validMovement, validReason } from '../src/features/pos/ShiftsScreen';

const mockGet = jest.fn();
const mockPost = jest.fn();
let mockMe: { userId: string; roles: string[]; permissions?: string[] };
let mockId = 0;
const mockClient = {
  get: (...a: unknown[]) => mockGet(...a),
  post: (...a: unknown[]) => mockPost(...a),
  delete: jest.fn(),
};
jest.mock('../src/auth/AuthProvider', () => ({
  useAuth: () => ({
    status: 'signedIn',
    me: mockMe,
    client: mockClient,
    signIn: jest.fn(),
    signOut: jest.fn(),
  }),
}));
jest.mock('../src/device', () => ({ newId: () => `key-${++mockId}` }));

let qc: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={qc}>{children}</QueryClientProvider>
);
const shift = {
  id: 's-1',
  businessDate: '2026-11-11',
  terminal: 'T1',
  openingCash: '500.00',
  expectedCash: '1200.00',
  countedCash: null,
  difference: null,
  status: 'OPEN',
  cashIn: '300.00',
  cashOut: '50.00',
};
const dayRow = {
  id: 'd-1',
  business_date: '2026-11-10',
  note: null,
  summary: { invoices: '12', sales: '15400.50', cash_difference: '-20.00' },
};

beforeEach(async () => {
  [mockGet, mockPost].forEach((m) => m.mockReset());
  mockId = 0;
  mockMe = { userId: 'u-1', roles: [], permissions: undefined };
  qc = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retryDelay: 0 } } });
  await setLanguage('en');
  mockGet.mockImplementation(async (path: string) => {
    if (path === '/pos/shifts') return { items: [shift] };
    if (path === '/pos/day-end') return { items: [dayRow] };
    if (path === '/branches') return { items: [{ id: 'b-1', name: 'Main', status: 'ACTIVE' }] };
    return { items: [] };
  });
  mockPost.mockResolvedValue({});
});

describe('cash movement rules', () => {
  test('amount: above zero, 2 decimals, at most 1,00,00,000, compared as a decimal', () => {
    expect(validMovement('100')).toBe(true);
    expect(validMovement('0.01')).toBe(true);
    expect(validMovement('10000000')).toBe(true);
    expect(validMovement('10000000.01')).toBe(false);
    expect(validMovement('0')).toBe(false);
    expect(validMovement('-5')).toBe(false);
    expect(validMovement('1.234')).toBe(false);
  });
  test('reason: 2 to 200 letters', () => {
    expect(validReason('a')).toBe(false);
    expect(validReason('  ')).toBe(false);
    expect(validReason('Bank deposit')).toBe(true);
    expect(validReason('x'.repeat(201))).toBe(false);
  });
});

describe('shifts: cash in and out', () => {
  test('shows cash in and out already recorded on the shift', async () => {
    await render(<ShiftsScreen />, { wrapper });
    expect(await screen.findByText('Cash in ₹300.00 · cash out ₹50.00')).toBeTruthy();
  });

  test('sends kind, amount as a 2-place string and reason to the shift, with one key', async () => {
    await render(<ShiftsScreen />, { wrapper });
    await screen.findByText('2026-11-11 · T1 · OPEN');
    await fireEvent.press(screen.getByLabelText('Cash in / out'));
    await fireEvent.press(await screen.findByLabelText('Cash out'));
    await fireEvent.changeText(screen.getByLabelText('Amount'), '250');
    await fireEvent.changeText(screen.getByLabelText('Reason'), 'Bank deposit');
    await fireEvent.press(screen.getByLabelText('Save cash movement'));
    expect(await screen.findByText('Cash movement saved.')).toBeTruthy();
    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(mockPost.mock.calls[0]![0]).toBe('/pos/shifts/s-1/cash-movements');
    expect(mockPost.mock.calls[0]![1]).toMatchObject({
      body: { kind: 'CASH_OUT', amount: '250.00', reason: 'Bank deposit' },
      idempotencyKey: 'key-1',
    });
  });

  test('a bad amount or a missing reason blocks saving and shows the message', async () => {
    await render(<ShiftsScreen />, { wrapper });
    await screen.findByText('2026-11-11 · T1 · OPEN');
    await fireEvent.press(screen.getByLabelText('Cash in / out'));
    await fireEvent.changeText(await screen.findByLabelText('Amount'), '0');
    expect(await screen.findByText(/above 0 and up to 1,00,00,000/)).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Amount'), '100');
    await fireEvent.press(screen.getByLabelText('Save cash movement'));
    expect(mockPost).not.toHaveBeenCalled();
  });

  test('a lost answer then a retry reuses the same key; the server refusal is shown', async () => {
    mockPost
      .mockRejectedValueOnce(new ApiError(0, null, 'c-1'))
      .mockRejectedValueOnce(new ApiError(409, { title: 'SHIFT_CLOSED' }, 'c-2'));
    await render(<ShiftsScreen />, { wrapper });
    await screen.findByText('2026-11-11 · T1 · OPEN');
    await fireEvent.press(screen.getByLabelText('Cash in / out'));
    await fireEvent.changeText(await screen.findByLabelText('Amount'), '75');
    await fireEvent.changeText(screen.getByLabelText('Reason'), 'Float top-up');
    await fireEvent.press(screen.getByLabelText('Save cash movement'));
    await screen.findByRole('alert');
    await fireEvent.press(screen.getByLabelText('Save cash movement'));
    expect(await screen.findByText('This shift is already closed.')).toBeTruthy();
    expect(mockPost.mock.calls[0]![1].idempotencyKey).toBe(mockPost.mock.calls[1]![1].idempotencyKey);
  });
});

describe('shifts: day-end history', () => {
  test('lists closed days with sales, bills and cash difference as money strings', async () => {
    await render(<ShiftsScreen />, { wrapper });
    expect(await screen.findByText('Day-end history')).toBeTruthy();
    expect(
      await screen.findByText('2026-11-10 · sales ₹15,400.50 · 12 bills · cash difference -₹20.00'),
    ).toBeTruthy();
  });
  test('says so when no day is closed yet', async () => {
    mockGet.mockImplementation(async (path: string) =>
      path === '/pos/shifts' ? { items: [shift] } : { items: [] },
    );
    await render(<ShiftsScreen />, { wrapper });
    expect(await screen.findByText('No day has been closed yet.')).toBeTruthy();
  });
  test('a failure loading history does not hide the shifts', async () => {
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/pos/shifts') return { items: [shift] };
      if (path === '/pos/day-end') throw new ApiError(500, { title: 'INTERNAL' }, 'c-3');
      return { items: [] };
    });
    await render(<ShiftsScreen />, { wrapper });
    expect(await screen.findByText('Closed days could not be loaded.')).toBeTruthy();
    expect(screen.getByText('2026-11-11 · T1 · OPEN')).toBeTruthy();
  });
  test('history is not asked for without pos.dayend', async () => {
    mockMe = { userId: 'u-1', roles: [], permissions: ['pos.shift'] };
    await render(<ShiftsScreen />, { wrapper });
    await screen.findByText('2026-11-11 · T1 · OPEN');
    expect(screen.queryByText('Day-end history')).toBeNull();
    expect(mockGet.mock.calls.some((c) => c[0] === '/pos/day-end')).toBe(false);
  });
});

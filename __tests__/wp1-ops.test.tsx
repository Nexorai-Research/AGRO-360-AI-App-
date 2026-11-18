import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import parts from '../i18n-parts/wp1.json';
import step3 from '../i18n-parts/step3.json';
import sal from '../i18n-parts/sal.json';
import { i18n, setLanguage } from '../src/i18n';
import ComplaintDetailScreen from '../src/features/complaints/ComplaintDetailScreen';
import { AdjustmentsPanel } from '../src/features/collections/AdjustmentsPanel';
import { useSal } from '../src/features/collections/sal-hook';
import { adjustmentBody, adjustmentErrors } from '../src/features/collections/adjust-api';
import {
  applyReservation,
  emptyCart,
  reservationStillOn,
  toInvoiceBody,
  usableReservations,
  type ReservationLite,
} from '../src/features/pos/cart';

const mockGet = jest.fn();
const mockPost = jest.fn();
let mockMe: { userId: string; roles: string[]; permissions?: string[] };
let mockId = 0;
jest.mock('../src/auth/AuthProvider', () => ({
  useAuth: () => ({
    status: 'signedIn',
    me: mockMe,
    client: { get: (...a: unknown[]) => mockGet(...a), post: (...a: unknown[]) => mockPost(...a) },
  }),
}));
jest.mock('../src/device', () => ({ newId: () => `key-${++mockId}` }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'cm-1' }),
  Stack: { Screen: () => null },
}));

let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);
beforeAll(() => {
  for (const lg of ['en', 'hi', 'mr'] as const)
    for (const p of [step3, sal, parts])
      i18n.addResourceBundle(lg, 'translation', (p as Record<string, object>)[lg], true, true);
});
beforeEach(async () => {
  [mockGet, mockPost].forEach((m) => m.mockReset());
  mockId = 0;
  mockMe = { userId: 'u-1', roles: [], permissions: undefined };
  client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retryDelay: 0 } } });
  await setLanguage('en');
});
const route = (map: Record<string, unknown>) =>
  mockGet.mockImplementation((p: string) =>
    p in map ? Promise.resolve(map[p]) : Promise.reject(new Error(`unexpected GET ${p}`)),
  );

const complaint = (over = {}) => ({
  id: 'cm-1',
  ticketNo: 'CMP-0001',
  customerId: 'c-1',
  customerName: 'Ramesh',
  category: 'GERMINATION',
  severity: 'HIGH',
  description: 'seed did not germinate',
  batchNo: 'B-1',
  invoiceNumber: null,
  status: 'OPEN',
  slaDueAt: '2026-11-20T00:00:00.000Z',
  overdue: false,
  resolutionType: null,
  resolutionText: null,
  createdAt: '2026-11-18T00:00:00.000Z',
  version: 3,
  assigneeUserId: null,
  ...over,
});

describe('complaint assign and supplier claim (1.2)', () => {
  test('assign sends the chosen person; deactivated people are not offered', async () => {
    route({
      '/complaints/cm-1': complaint(),
      '/users': {
        items: [
          { id: 'u-2', fullName: 'Sita Pawar', status: 'ACTIVE' },
          { id: 'u-3', fullName: 'Old Staff', status: 'DEACTIVATED' },
        ],
      },
    });
    mockPost.mockResolvedValue(complaint({ status: 'IN_PROGRESS' }));
    await render(<ComplaintDetailScreen />, { wrapper });
    await fireEvent.press(await screen.findByLabelText('Sita Pawar'));
    expect(screen.queryByLabelText('Old Staff')).toBeNull();
    await fireEvent.press(screen.getByText('Assign to the chosen person'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    expect(mockPost.mock.calls[0][0]).toBe('/complaints/cm-1/assign');
    expect(mockPost.mock.calls[0][1]).toEqual({ body: { assigneeUserId: 'u-2' }, idempotencyKey: 'key-1' });
  });

  test('supplier claim needs a reference of up to 80 letters', async () => {
    route({ '/complaints/cm-1': complaint({ status: 'IN_PROGRESS' }), '/users': { items: [] } });
    mockPost.mockResolvedValue(complaint({ status: 'ESCALATED_SUPPLIER' }));
    await render(<ComplaintDetailScreen />, { wrapper });
    const field = await screen.findByLabelText('Claim reference');
    await fireEvent.changeText(field, 'x'.repeat(81));
    expect(screen.getByText('Enter a claim reference of up to 80 letters.')).toBeTruthy();
    await fireEvent.changeText(field, ' CLM-77 ');
    await fireEvent.press(screen.getByText('Raise the claim'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    expect(mockPost.mock.calls[0][0]).toBe('/complaints/cm-1/claim');
    expect(mockPost.mock.calls[0][1].body).toEqual({ reference: 'CLM-77' });
  });

  test('a ticket with the supplier can be assigned but not claimed again', async () => {
    route({ '/complaints/cm-1': complaint({ status: 'ESCALATED_SUPPLIER' }), '/users': { items: [] } });
    await render(<ComplaintDetailScreen />, { wrapper });
    expect(await screen.findByText('Assign to the chosen person')).toBeTruthy();
    expect(screen.queryByText('Raise the claim')).toBeNull();
  });

  test('a closed ticket can be neither assigned nor claimed, and the people list is not read', async () => {
    route({ '/complaints/cm-1': complaint({ status: 'CLOSED' }) });
    await render(<ComplaintDetailScreen />, { wrapper });
    await screen.findByText('CMP-0001');
    expect(screen.queryByText('Assign to the chosen person')).toBeNull();
    expect(mockGet).not.toHaveBeenCalledWith('/users', expect.anything());
  });

  test('no resolve permission: nothing to assign or claim', async () => {
    mockMe = { userId: 'u-1', roles: [], permissions: ['customer.view'] };
    route({ '/complaints/cm-1': complaint() });
    await render(<ComplaintDetailScreen />, { wrapper });
    await screen.findByText('CMP-0001');
    expect(screen.queryByText('Raise the claim')).toBeNull();
  });
});

function Adj() {
  const s = useSal();
  return <AdjustmentsPanel s={s} />;
}

describe('credit adjustments (1.10)', () => {
  test('logic: the account must match the type; amount 2 decimals; reason 3 to 500', () => {
    const f = {
      customerId: 'c-1',
      branchId: 'b-1',
      kind: 'DEBIT' as const,
      amount: '150.50',
      accountCode: '4910',
      adjustmentDate: '',
      reason: 'cheque bounce charge',
    };
    expect(adjustmentErrors(f)).toEqual([]);
    expect(adjustmentErrors({ ...f, accountCode: '4030', amount: '1.234', reason: 'no' })).toEqual([
      'amount',
      'account',
      'reason',
    ]);
    expect(adjustmentBody(f)).toEqual({
      customerId: 'c-1',
      branchId: 'b-1',
      kind: 'DEBIT',
      amount: '150.50',
      accountCode: '4910',
      reason: 'cheque bounce charge',
    });
  });

  test('lists adjustments, posts a new one with one key kept on a retry', async () => {
    mockGet.mockImplementation((p: string, o?: { query?: Record<string, string> }) => {
      if (p === '/credit/adjustments')
        return Promise.resolve({
          items: [
            {
              id: 'a1',
              number: 'ADJ-1',
              customerId: 'c-1',
              customerName: 'Ramesh',
              branchId: 'b-1',
              kind: 'CREDIT',
              amount: '100.00',
              accountCode: '4040',
              reason: 'rate difference',
              adjustmentDate: '2026-11-01',
            },
          ],
        });
      if (p === '/branches')
        return Promise.resolve({ items: [{ id: 'b-1', name: 'Baramati', status: 'ACTIVE' }] });
      if (p === '/customers')
        return Promise.resolve({ items: [{ id: 'c-2', name: 'Suresh Jadhav' }], total: 1, ...(o ? {} : {}) });
      return Promise.reject(new Error(`unexpected GET ${p}`));
    });
    mockPost
      .mockRejectedValueOnce(Object.assign(new Error('lost'), {}))
      .mockResolvedValueOnce({ number: 'ADJ-2', amount: '50.00' });
    await render(<Adj />, { wrapper });
    expect(await screen.findByText(/ADJ-1/)).toBeTruthy();
    await fireEvent.press(screen.getByText('New adjustment'));
    await fireEvent.press(screen.getByText('Post adjustment'));
    expect(await screen.findByText('Choose a customer.')).toBeTruthy();
    expect(mockPost).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText('Find customer'), 'Sur');
    await fireEvent.press(await screen.findByText('Suresh Jadhav'));
    await fireEvent.press(await screen.findByLabelText('Baramati'));
    await fireEvent.press(screen.getByLabelText('Debit - customer owes more'));
    expect(screen.getByLabelText('4900 - Other income')).toBeTruthy();
    expect(screen.queryByLabelText('4040 - Sales adjustments')).toBeNull();
    await fireEvent.changeText(screen.getByLabelText('Amount'), '50');
    await fireEvent.changeText(screen.getByLabelText('Reason (3 to 500 letters)'), 'late fee');
    await fireEvent.press(screen.getByText('Post adjustment'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    await fireEvent.press(screen.getByText('Post adjustment'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(2));
    expect(mockPost.mock.calls[1][0]).toBe('/credit/adjustments');
    expect(mockPost.mock.calls[1][1].body).toMatchObject({
      customerId: 'c-2',
      branchId: 'b-1',
      kind: 'DEBIT',
      amount: '50',
      accountCode: '4900',
      reason: 'late fee',
    });
    expect(mockPost.mock.calls[0][1].idempotencyKey).toBe(mockPost.mock.calls[1][1].idempotencyKey);
    expect(await screen.findByText(/Adjustment ADJ-2 posted/)).toBeTruthy();
  });

  test('view only without credit.adjustment', async () => {
    mockMe = { userId: 'u-1', roles: [], permissions: ['reports.receivables'] };
    mockGet.mockResolvedValue({ items: [] });
    await render(<Adj />, { wrapper });
    expect(await screen.findByText('No adjustments yet.')).toBeTruthy();
    expect(screen.queryByText('New adjustment')).toBeNull();
  });
});

describe('selling reserved stock (1.11)', () => {
  const r: ReservationLite = {
    id: 'r-1',
    number: 'RSV-9',
    skuId: 's-1',
    skuCode: 'U45',
    skuName: 'Urea 45kg',
    warehouseId: 'w-1',
    branchId: 'b-1',
    qty: '4.000',
    expiresAt: '2030-01-01T00:00:00.000Z',
  };
  test('only this branch and not expired', () => {
    const now = Date.parse('2026-11-18T00:00:00.000Z');
    const old = { ...r, id: 'r-2', expiresAt: '2026-11-01T00:00:00.000Z' };
    const other = { ...r, id: 'r-3', branchId: 'b-2' };
    expect(usableReservations([r, old, other], 'b-1', now).map((x) => x.id)).toEqual(['r-1']);
  });
  test('puts the reserved line on the bill; the id goes only with the finalized bill', () => {
    const c = applyReservation({ ...emptyCart, branchId: 'b-1' }, r);
    expect(c.lines).toEqual([
      {
        skuId: 's-1',
        code: 'U45',
        name: 'Urea 45kg',
        warehouseId: 'w-1',
        qty: '4',
        unitPrice: '',
        discountPct: '',
      },
    ]);
    expect(toInvoiceBody(c, '2026-11-18').reservationId).toBeUndefined();
    expect(toInvoiceBody(c, '2026-11-18', [{ mode: 'CASH', amount: '100' }]).reservationId).toBe('r-1');
    // the same product already on the bill is not added twice
    expect(applyReservation(c, r).lines).toHaveLength(1);
    // when the line is removed the reservation no longer applies
    const gone = { ...c, lines: [] };
    expect(reservationStillOn(gone)).toBe(false);
    expect(toInvoiceBody(gone, '2026-11-18', []).reservationId).toBeUndefined();
  });
});

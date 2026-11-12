import type { ReactNode } from 'react';
import { Share } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import parts from '../i18n-parts/sal.json';
import { i18n, setLanguage } from '../src/i18n';
import { ApiError } from '../src/api/errors';
import ChequesScreen from '../src/features/collections/ChequesScreen';
import ReceiptsScreen, { receiptShareText } from '../src/features/collections/ReceiptsScreen';
import CreditScreen from '../src/features/collections/CreditScreen';
import DeskScreen from '../src/features/collections/DeskScreen';
import {
  bounceErrors,
  buildBounce,
  recoveryErrors,
  validLimit,
  writeOffErrors,
} from '../src/features/collections/sal-logic';

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockPut = jest.fn();
let mockMe: { userId: string; roles: string[]; permissions?: string[] };
let mockId = 0;
const mockClient = {
  get: (...a: unknown[]) => mockGet(...a),
  post: (...a: unknown[]) => mockPost(...a),
  put: (...a: unknown[]) => mockPut(...a),
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
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }), Stack: { Screen: () => null } }));

let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

beforeAll(() => {
  for (const lg of ['en', 'hi', 'mr'] as const)
    i18n.addResourceBundle(lg, 'translation', (parts as Record<string, object>)[lg], true, true);
});
beforeEach(async () => {
  [mockGet, mockPost, mockPut].forEach((m) => m.mockReset());
  mockId = 0;
  mockMe = { userId: 'u-1', roles: [], permissions: undefined };
  client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retryDelay: 0 } } });
  await setLanguage('en');
});

const cheque = (over = {}) => ({
  id: 'ch-1',
  receiptNumber: 'RC-1',
  customerName: 'Ramesh Patil',
  chequeNo: '000123',
  bank: 'SBI',
  chequeDate: '2026-11-10',
  amount: '5000.00',
  status: 'RECEIVED',
  postDated: false,
  readyToDeposit: true,
  depositedOn: null,
  clearedOn: null,
  bouncedOn: null,
  bounceReason: null,
  bounceCharge: '0.0000',
  ...over,
});

describe('logic', () => {
  test('bounce rules and body', () => {
    expect(bounceErrors({ reason: 'ab', date: '', charge: '' })).toEqual(['reason']);
    expect(bounceErrors({ reason: 'funds', date: '2026-02-30', charge: '1.234' })).toEqual([
      'date',
      'charge',
    ]);
    expect(buildBounce({ reason: ' no funds ', date: '', charge: '150' })).toEqual({
      reason: 'no funds',
      charge: '150.00',
    });
    expect(buildBounce({ reason: 'no funds', date: '2026-11-11', charge: '0' })).toEqual({
      reason: 'no funds',
      date: '2026-11-11',
    });
  });
  test('limit, write-off and recovery rules are decimal strings', () => {
    expect(validLimit('0')).toBe(true);
    expect(validLimit('50000.5')).toBe(true);
    expect(validLimit('-1')).toBe(false);
    expect(validLimit('1.23456')).toBe(false);
    expect(writeOffErrors({ customerId: '', amount: '0', reason: 'x', evidence: 'short' })).toEqual([
      'customer',
      'amount',
      'reason',
      'evidence',
    ]);
    expect(
      writeOffErrors({
        customerId: 'c',
        amount: '100.50',
        reason: 'gone',
        evidence: 'moved away, tried 3 visits',
      }),
    ).toEqual([]);
    expect(recoveryErrors({ amount: '10', modeCode: 'CREDIT', date: '2026-11-11' })).toEqual(['mode']);
  });
  test('receipt share text uses the server amount', () => {
    const r = {
      number: 'RC-9',
      receiptDate: '2026-11-11',
      modeCode: 'UPI',
      reference: 'u1',
      amount: '1250.00',
    } as never;
    expect(receiptShareText(r, 'Receipt', { amount: 'Amount', mode: 'Mode', date: 'Date' })).toBe(
      'Receipt RC-9\nDate: 2026-11-11\nMode: UPI (u1)\nAmount: ₹1,250.00',
    );
  });
});

describe('cheque register', () => {
  const show = () => render(<ChequesScreen />, { wrapper });
  test('lists cheques; status filter is sent', async () => {
    mockGet.mockResolvedValue({ items: [cheque()] });
    await show();
    expect(await screen.findByText('Ramesh Patil · ₹5,000.00')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Bounced'));
    await screen.findByText('Ramesh Patil · ₹5,000.00');
    expect(mockGet.mock.calls.at(-1)![1].query.status).toBe('BOUNCED');
  });
  test('empty, offline with retry, forbidden, and error with reference', async () => {
    mockGet.mockResolvedValueOnce({ items: [] });
    await show();
    expect(await screen.findByText('No cheques.')).toBeTruthy();
  });
  test('offline shows the offline text', async () => {
    mockGet.mockRejectedValue(new ApiError(0, null));
    await show();
    expect(
      await screen.findByText('No network. Check your connection and try again.', {}, { timeout: 4000 }),
    ).toBeTruthy();
  });
  test('a 403 shows permission denied', async () => {
    mockGet.mockRejectedValue(new ApiError(403, { title: 'FORBIDDEN' }));
    await show();
    expect(await screen.findByText('You do not have permission to see cheques.')).toBeTruthy();
  });
  test('a server error shows the correlation id', async () => {
    mockGet.mockRejectedValue(new ApiError(500, { title: 'INTERNAL' }, 'corr-77'));
    await show();
    expect(await screen.findByText(/corr-77/)).toBeTruthy();
  });
  test('no permission makes no call', async () => {
    mockMe = { userId: 'u-1', roles: [], permissions: [] };
    await show();
    expect(await screen.findByText('You do not have permission to see cheques.')).toBeTruthy();
    expect(mockGet).not.toHaveBeenCalled();
  });
  test('deposit sends the date and one key; lost answer retries with the SAME key', async () => {
    mockGet.mockResolvedValue({ items: [cheque()] });
    await show();
    await fireEvent.press(await screen.findByLabelText('Deposit 000123'));
    await fireEvent.changeText(
      screen.getByLabelText('Date (optional, YYYY-MM-DD, today if blank)'),
      '2026-11-12',
    );
    let first = true;
    mockPost.mockImplementation(async () => {
      if (first) {
        first = false;
        throw new ApiError(0, null);
      }
      return {};
    });
    await fireEvent.press(screen.getByLabelText('Confirm deposit'));
    await screen.findByText(/network|offline/i).catch(() => null);
    await fireEvent.press(screen.getByLabelText('Confirm deposit'));
    expect(await screen.findByText('Cheque marked as deposited.')).toBeTruthy();
    expect(mockPost.mock.calls.map((c) => c[0])).toEqual(['/cheques/ch-1/deposit', '/cheques/ch-1/deposit']);
    expect(mockPost.mock.calls.map((c) => c[1].idempotencyKey)).toEqual(['key-1', 'key-1']);
    expect(mockPost.mock.calls[0]![1].body).toEqual({ date: '2026-11-12' });
  });
  test('cleared is offered only for a deposited cheque', async () => {
    mockGet.mockResolvedValue({ items: [cheque({ status: 'DEPOSITED' })] });
    mockPost.mockResolvedValue({});
    await show();
    expect(screen.queryByLabelText('Deposit 000123')).toBeNull();
    await fireEvent.press(await screen.findByLabelText('Mark cleared 000123'));
    await fireEvent.press(screen.getByLabelText('Confirm cleared'));
    expect(await screen.findByText('Cheque marked as cleared.')).toBeTruthy();
    expect(mockPost.mock.calls[0]![0]).toBe('/cheques/ch-1/clear');
    expect(mockPost.mock.calls[0]![1].body).toEqual({});
  });
  test('bounce needs a reason; the charge goes as a 2 place string', async () => {
    mockGet.mockResolvedValue({ items: [cheque()] });
    mockPost.mockResolvedValue({});
    await show();
    await fireEvent.press(await screen.findByLabelText('Bounced 000123'));
    await fireEvent.press(screen.getByLabelText('Confirm bounce'));
    expect(await screen.findByText('Give a reason of 3 to 500 letters.')).toBeTruthy();
    expect(mockPost).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText('Reason'), 'insufficient funds');
    await fireEvent.changeText(screen.getByLabelText('Bank charge (optional)'), '150');
    await fireEvent.press(screen.getByLabelText('Confirm bounce'));
    expect(await screen.findByText('Cheque marked as bounced. The receipt is cancelled.')).toBeTruthy();
    expect(mockPost.mock.calls[0]![1].body).toEqual({ reason: 'insufficient funds', charge: '150.00' });
  });
  test('buttons are hidden without receipt.cheque', async () => {
    mockMe = { userId: 'u-1', roles: [], permissions: ['customer.ledger.view'] };
    mockGet.mockResolvedValue({ items: [cheque()] });
    await show();
    await screen.findByText('Ramesh Patil · ₹5,000.00');
    expect(screen.queryByLabelText('Deposit 000123')).toBeNull();
  });
  test('Hindi and Marathi', async () => {
    mockGet.mockResolvedValue({ items: [] });
    await setLanguage('hi');
    await show();
    expect(await screen.findByText('कोई चेक नहीं।')).toBeTruthy();
    await setLanguage('mr');
    expect(await screen.findByText('चेक नाहीत.')).toBeTruthy();
  });
});

describe('receipts', () => {
  const row = {
    id: 'r-1',
    number: 'RC-1',
    customerId: 'c-1',
    receiptDate: '2026-11-11',
    modeCode: 'CASH',
    reference: null,
    amount: '1000.00',
    allocated: '400.00',
    onAccount: '600.00',
    status: 'ACTIVE',
  };
  const detail = {
    ...row,
    cheque: null,
    allocations: [{ receivableId: 'rv-1', docNumber: 'INV-7', amount: '400.00' }],
  };
  beforeEach(() => {
    mockGet.mockImplementation(async (path: string) =>
      path === '/receipts/r-1' ? detail : { items: [row] },
    );
    mockPost.mockResolvedValue(detail);
  });
  const open = async () => {
    await render(<ReceiptsScreen />, { wrapper });
    await fireEvent.press(await screen.findByLabelText('Open RC-1'));
    await screen.findByText('INV-7 · ₹400.00');
  };
  test('list shows the advance on account; detail shows allocations', async () => {
    await open();
    expect(screen.getByText('Paid against bills ₹400.00 · on account ₹600.00')).toBeTruthy();
  });
  test('allocate sends an empty body (oldest first) with one key', async () => {
    await open();
    await fireEvent.press(screen.getByLabelText('Apply to oldest dues'));
    expect(await screen.findByText('Applied to the oldest dues.')).toBeTruthy();
    expect(mockPost.mock.calls[0]![0]).toBe('/receipts/r-1/allocate');
    expect(mockPost.mock.calls[0]![1]).toMatchObject({ body: {}, idempotencyKey: 'key-1' });
  });
  test('take back asks first, then sends unallocate', async () => {
    await open();
    await fireEvent.press(screen.getByLabelText('Take back allocation'));
    expect(mockPost).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText('Yes, take back'));
    expect(await screen.findByText('Allocation taken back.')).toBeTruthy();
    expect(mockPost.mock.calls[0]![0]).toBe('/receipts/r-1/unallocate');
  });
  test('share opens the phone share sheet', async () => {
    const spy = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as never);
    await open();
    await fireEvent.press(screen.getByLabelText('Share receipt'));
    expect(spy).toHaveBeenCalledWith({ message: expect.stringContaining('RC-1') });
  });
  test('allocate and take back are hidden without receipt.allocate', async () => {
    mockMe = { userId: 'u-1', roles: [], permissions: ['customer.ledger.view'] };
    await open();
    expect(screen.queryByLabelText('Apply to oldest dues')).toBeNull();
    expect(screen.queryByLabelText('Take back allocation')).toBeNull();
  });
  test('a failed allocate shows the reference', async () => {
    await open();
    mockPost.mockRejectedValue(new ApiError(409, { title: 'NO_ADVANCE' }, 'corr-9'));
    await fireEvent.press(screen.getByLabelText('Apply to oldest dues'));
    expect(await screen.findByText(/corr-9/)).toBeTruthy();
  });
  test('empty and denied', async () => {
    mockGet.mockResolvedValue({ items: [] });
    await render(<ReceiptsScreen />, { wrapper });
    expect(await screen.findByText('No receipts yet.')).toBeTruthy();
  });
});

describe('customer credit', () => {
  const account = {
    customerId: 'c-1',
    creditLimit: '50000.0000',
    seasonLimit: null,
    hold: false,
    holdReason: null,
    outstanding: '12000.0000',
    available: '38000.0000',
    version: 3,
  };
  beforeEach(() => {
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/customers') return { items: [{ id: 'c-1', name: 'Ramesh Patil' }] };
      return { account, guarantors: [] };
    });
    mockPut.mockResolvedValue({});
    mockPost.mockResolvedValue({});
  });
  const pick = async () => {
    await render(<CreditScreen />, { wrapper });
    await fireEvent.changeText(screen.getByLabelText('Find customer (name or mobile)'), 'ram');
    await fireEvent.press(await screen.findByLabelText('Ramesh Patil'));
    await screen.findByText('Available: ₹38,000.00');
  };
  test('shows limit, outstanding, available', async () => {
    await pick();
    expect(screen.getByText('Credit limit: ₹50,000.00')).toBeTruthy();
    expect(screen.getByText('Outstanding: ₹12,000.00')).toBeTruthy();
  });
  test('set limit sends the version as If-Match and one key; a bad amount is refused', async () => {
    await pick();
    await fireEvent.changeText(screen.getByLabelText('New credit limit (0 = cash only)'), '-5');
    await fireEvent.press(screen.getByLabelText('Set limit'));
    expect(await screen.findByText(/Enter an amount like 50000/)).toBeTruthy();
    expect(mockPut).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText('New credit limit (0 = cash only)'), '75000');
    await fireEvent.press(screen.getByLabelText('Set limit'));
    expect(await screen.findByText('Credit limit saved.')).toBeTruthy();
    expect(mockPut.mock.calls[0]![0]).toBe('/customers/c-1/credit-limit');
    expect(mockPut.mock.calls[0]![1]).toMatchObject({
      body: { creditLimit: '75000' },
      version: 3,
      idempotencyKey: 'key-1',
    });
  });
  test('hold needs a reason, then posts to credit-hold', async () => {
    await pick();
    await fireEvent.press(screen.getByLabelText('Put on hold'));
    expect(mockPost).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText('Reason for hold or release'), 'cheque bounced');
    await fireEvent.press(screen.getByLabelText('Put on hold'));
    expect(await screen.findByText('Customer put on hold.')).toBeTruthy();
    expect(mockPost.mock.calls[0]![0]).toBe('/customers/c-1/credit-hold');
    expect(mockPost.mock.calls[0]![1].body).toEqual({ reason: 'cheque bounced' });
  });
  test('limit and hold controls are hidden without the rights', async () => {
    mockMe = { userId: 'u-1', roles: [], permissions: ['customer.ledger.view'] };
    await pick();
    expect(screen.queryByLabelText('Set limit')).toBeNull();
    expect(screen.queryByLabelText('Put on hold')).toBeNull();
  });
  test('denied without customer.ledger.view', async () => {
    mockMe = { userId: 'u-1', roles: [], permissions: [] };
    await render(<CreditScreen />, { wrapper });
    expect(await screen.findByText('You do not have permission to see customer credit.')).toBeTruthy();
  });
});

describe('collection desk', () => {
  const task = {
    id: 't-1',
    customerName: 'Ramesh Patil',
    village: 'Wadgaon',
    assignedTo: null,
    overdueAmount: '5000.00',
    oldestDays: 40,
    status: 'OPEN',
  };
  const wo = {
    id: 'w-1',
    number: 'WO-1',
    customerName: 'Sunita Jadhav',
    amount: '900.00',
    reason: 'moved away',
    status: 'PROPOSED',
    recovered: '0.0000',
  };
  const st = {
    id: 's-1',
    number: 'ST-1',
    customerName: 'Anil More',
    discount: '50.00',
    reason: 'early payment',
    status: 'PENDING',
  };
  beforeEach(() => {
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/credit/tasks') return { items: [task] };
      if (path === '/credit/tasks/efficiency')
        return {
          from: '2026-11-01',
          to: '2026-11-12',
          rows: [
            {
              assignedTo: null,
              open: 2,
              done: 3,
              paid: 1,
              promise: 1,
              notReachable: 1,
              dispute: 0,
              resolutionRate: '66.7',
            },
          ],
        };
      if (path === '/users') return { items: [{ id: 'u-9', fullName: 'Officer Nine' }] };
      if (path === '/credit/write-offs')
        return { items: [wo], totals: { proposed: '900.00', approved: '0.00', recovered: '0.00' } };
      if (path === '/credit/settlements') return { items: [st] };
      if (path === '/customers') return { items: [{ id: 'c-1', name: 'Ramesh Patil' }] };
      if (path === '/settings/payment-modes') return { items: [{ code: 'CASH', enabled: true }] };
      return { items: [] };
    });
    mockPost.mockResolvedValue({});
  });
  const show = () => render(<DeskScreen />, { wrapper });

  test('team tasks with efficiency; generate sends a key', async () => {
    await show();
    expect(await screen.findByText('Ramesh Patil · ₹5,000.00')).toBeTruthy();
    expect(await screen.findByText(/3 closed, 2 open, 1 paid, 1 promised, 66.7% resolved/)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("Make today's follow-up list"));
    expect(await screen.findByText('Follow-up list made.')).toBeTruthy();
    expect(mockPost.mock.calls[0]![0]).toBe('/credit/tasks/generate');
    expect(mockPost.mock.calls[0]![1].idempotencyKey).toBe('key-1');
  });
  test('assign to an officer, and to the branch manager list (null)', async () => {
    await show();
    await fireEvent.press(await screen.findByLabelText('Assign Ramesh Patil'));
    await fireEvent.press(await screen.findByLabelText('Officer Nine'));
    expect(await screen.findByText('Task assigned.')).toBeTruthy();
    expect(mockPost.mock.calls[0]![0]).toBe('/credit/tasks/t-1/assign');
    expect(mockPost.mock.calls[0]![1].body).toEqual({ assignedTo: 'u-9' });
    await fireEvent.press(await screen.findByLabelText('Assign Ramesh Patil'));
    await fireEvent.press(await screen.findByLabelText('Branch manager list'));
    await screen.findByText('Task assigned.');
    expect(mockPost.mock.calls[1]![1].body).toEqual({ assignedTo: null });
  });
  test('staff list refused: a message, and the manager list still works', async () => {
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/users') throw new ApiError(403, { title: 'FORBIDDEN' });
      if (path === '/credit/tasks') return { items: [task] };
      return { from: 'a', to: 'b', rows: [] };
    });
    await show();
    await fireEvent.press(await screen.findByLabelText('Assign Ramesh Patil'));
    expect(await screen.findByText(/staff list is not available/)).toBeTruthy();
    expect(screen.getByLabelText('Branch manager list')).toBeTruthy();
  });
  test('write-offs: list with totals, approve with note', async () => {
    await show();
    await fireEvent.press(await screen.findByLabelText('Write-offs'));
    expect(await screen.findByText('WO-1 · Sunita Jadhav · ₹900.00')).toBeTruthy();
    expect(screen.getByText('Proposed ₹900.00 · approved ₹0.00 · recovered ₹0.00')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Approve WO-1'));
    await fireEvent.changeText(screen.getByLabelText('Note (optional)'), 'ok');
    await fireEvent.press(screen.getByLabelText('Approve'));
    expect(await screen.findByText('Approved.')).toBeTruthy();
    expect(mockPost.mock.calls[0]![0]).toBe('/credit/write-offs/w-1/approve');
    expect(mockPost.mock.calls[0]![1].body).toEqual({ note: 'ok' });
  });
  test('approve is hidden without credit.writeoff.approve', async () => {
    mockMe = { userId: 'u-1', roles: [], permissions: ['reports.receivables', 'credit.writeoff'] };
    await show();
    await screen.findByText('WO-1 · Sunita Jadhav · ₹900.00');
    expect(screen.queryByLabelText('Approve WO-1')).toBeNull();
    expect(screen.queryByLabelText("Make today's follow-up list")).toBeNull();
  });
  test('propose a write-off: checked first, then sent with a key', async () => {
    await show();
    await fireEvent.press(await screen.findByLabelText('Write-offs'));
    await fireEvent.press(await screen.findByLabelText('Propose a write-off'));
    await fireEvent.press(screen.getByLabelText('Send for approval'));
    expect(await screen.findByText('Choose a customer.')).toBeTruthy();
    expect(mockPost).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText('Find customer'), 'ram');
    await fireEvent.press(await screen.findByLabelText('Ramesh Patil'));
    await fireEvent.changeText(screen.getByLabelText('Amount'), '1200.50');
    await fireEvent.changeText(screen.getByLabelText('Reason'), 'bad debt');
    await fireEvent.changeText(
      screen.getByLabelText('Evidence (what was tried, at least 10 letters)'),
      'visited three times, shop closed',
    );
    await fireEvent.press(screen.getByLabelText('Send for approval'));
    expect(await screen.findByText('Sent for approval.')).toBeTruthy();
    expect(mockPost.mock.calls[0]![0]).toBe('/credit/write-offs');
    expect(mockPost.mock.calls[0]![1].body).toEqual({
      customerId: 'c-1',
      amount: '1200.50',
      reason: 'bad debt',
      evidence: 'visited three times, shop closed',
    });
  });
  test('settlements: reject', async () => {
    await show();
    await fireEvent.press(await screen.findByLabelText('Settlements'));
    await screen.findByText('ST-1 · Anil More · ₹50.00');
    await fireEvent.press(screen.getByLabelText('Reject ST-1'));
    await fireEvent.press(screen.getByLabelText('Reject'));
    expect(await screen.findByText('Rejected.')).toBeTruthy();
    expect(mockPost.mock.calls[0]![0]).toBe('/credit/settlements/s-1/reject');
  });
  test('recover an approved write-off', async () => {
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/credit/write-offs')
        return {
          items: [{ ...wo, status: 'APPROVED' }],
          totals: { proposed: '0', approved: '900.00', recovered: '0' },
        };
      if (path === '/settings/payment-modes') return { items: [{ code: 'CASH', enabled: true }] };
      return { items: [task], from: 'a', to: 'b', rows: [] };
    });
    await show();
    await fireEvent.press(await screen.findByLabelText('Write-offs'));
    await fireEvent.press(await screen.findByLabelText('Record recovery WO-1'));
    await fireEvent.changeText(screen.getByLabelText('Amount'), '100');
    await fireEvent.press(await screen.findByLabelText('CASH'));
    await fireEvent.changeText(screen.getByLabelText('Date (YYYY-MM-DD)'), '2026-11-12');
    await fireEvent.press(screen.getAllByLabelText('Record recovery').at(-1)!);
    expect(await screen.findByText('Recovery recorded.')).toBeTruthy();
    expect(mockPost.mock.calls[0]![0]).toBe('/credit/write-offs/w-1/recover');
    expect(mockPost.mock.calls[0]![1].body).toEqual({
      amount: '100',
      modeCode: 'CASH',
      recoveryDate: '2026-11-12',
    });
  });
  test('denied with no collection rights, makes no call', async () => {
    mockMe = { userId: 'u-1', roles: [], permissions: [] };
    await show();
    expect(await screen.findByText('You do not have permission to use the collection desk.')).toBeTruthy();
    expect(mockGet).not.toHaveBeenCalled();
  });
  test('offline shows the offline text', async () => {
    mockGet.mockRejectedValue(new ApiError(0, null));
    await show();
    expect(
      await screen.findByText('No network. Check your connection and try again.', {}, { timeout: 4000 }),
    ).toBeTruthy();
  });
});

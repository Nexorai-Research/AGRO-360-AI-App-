import type { ReactNode } from 'react';
import { Linking } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '../src/api/errors';
import { setLanguage } from '../src/i18n';
import CollectionsScreen, { byTotalDesc, overdueOf } from '../src/features/collections/CollectionsScreen';
import ReceiptFormScreen from '../src/features/collections/ReceiptFormScreen';
import {
  createKeyKeeper,
  emptyDraft,
  todayIST,
  toBody,
  validateAmount,
  validateDraft,
} from '../src/features/collections/receipt';
import type { AgingReport, CollectionTask, ReceiptView } from '../src/features/collections/api';

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockPush = jest.fn();
const mockBack = jest.fn();
let mockMe: { userId: string; roles: string[]; permissions?: string[]; branchScope?: unknown } | null;
let mockIdCounter = 0;

jest.mock('../src/auth/AuthProvider', () => ({
  useAuth: () => ({
    status: 'signedIn',
    me: mockMe,
    client: { get: mockGet, post: mockPost },
    signIn: jest.fn(),
    signOut: jest.fn(),
  }),
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, back: mockBack }) }));
jest.mock('../src/device', () => ({ newId: () => `key-${++mockIdCounter}` }));

const ALL = ['reports.receivables', 'credit.followup', 'receipt.create'];

const aging = (): AgingReport => ({
  asOn: '2026-11-11',
  rows: [
    {
      customerId: 'c-1',
      customerName: 'Ramesh Patil',
      buckets: { NOT_DUE: '1000.0000', '0-30': '4000.0000' },
      total: '5000.0000',
      onAccount: '0.0000',
    },
    {
      customerId: 'c-2',
      customerName: 'Sunita Jadhav',
      buckets: { NOT_DUE: '0.0000', '61-90': '12500.5000' },
      total: '12500.5000',
      onAccount: '300.0000',
    },
    {
      customerId: 'c-3',
      customerName: 'Anil More',
      buckets: { NOT_DUE: '250.0000' },
      total: '250.0000',
      onAccount: '0.0000',
    },
  ],
  totals: {},
});

const task = (over: Partial<CollectionTask> = {}): CollectionTask => ({
  id: 't-1',
  customerId: 'c-1',
  customerName: 'Ramesh Patil',
  mobile: '9876543210',
  village: 'Baramati',
  branchId: 'b-1',
  assignedTo: null,
  taskDate: '2026-11-11',
  overdueAmount: '4000.0000',
  oldestDays: 45,
  status: 'OPEN',
  outcome: null,
  note: null,
  ...over,
});

let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

beforeEach(async () => {
  mockGet.mockReset();
  mockPost.mockReset();
  mockPush.mockClear();
  mockBack.mockClear();
  mockIdCounter = 0;
  mockMe = { userId: 'u-1', roles: ['COLLECTOR'], permissions: ALL, branchScope: [] };
  client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retryDelay: 0 } } });
  await setLanguage('en');
});

describe('receipt helpers', () => {
  it('checks the amount as a decimal string, not as a float', () => {
    expect(validateAmount('')).toBe('required');
    expect(validateAmount('abc')).toBe('amountFormat');
    expect(validateAmount('1.234')).toBe('amountFormat'); // more than 2 decimals
    expect(validateAmount('-5')).toBe('amountFormat');
    expect(validateAmount('0')).toBe('amountPositive');
    expect(validateAmount('0.00')).toBe('amountPositive');
    expect(validateAmount('1000000000000')).toBe('amountTooBig');
    expect(validateAmount('999999999999')).toBeNull();
    expect(validateAmount('1500')).toBeNull();
    expect(validateAmount('1500.5')).toBeNull();
    expect(validateAmount('0.01')).toBeNull();
  });

  it('asks for the cheque details only with a cheque', () => {
    const base = { ...emptyDraft, customerId: 'c', branchId: 'b', modeCode: 'CASH', amount: '10' };
    expect(validateDraft(base)).toEqual({});
    const cheque = validateDraft({ ...base, modeCode: 'CHEQUE' });
    expect(cheque).toEqual({ chequeNo: 'required', chequeBank: 'required', chequeDate: 'required' });
    expect(
      validateDraft({
        ...base,
        modeCode: 'CHEQUE',
        chequeNo: '1',
        chequeBank: 'SBI',
        chequeDate: '11-11-2026',
      }),
    ).toEqual({ chequeDate: 'chequeDate' });
  });

  it('builds a body without blank optional fields and with a 2 decimal string amount', () => {
    const body = toBody(
      { ...emptyDraft, customerId: 'c', branchId: 'b', modeCode: 'CASH', amount: '1500.5', chequeNo: 'x' },
      '2026-11-11',
    );
    expect(body).toEqual({
      customerId: 'c',
      branchId: 'b',
      receiptDate: '2026-11-11',
      modeCode: 'CASH',
      amount: '1500.50',
    });
    expect(typeof body.amount).toBe('string');
  });

  it('dates a receipt in India time', () => {
    expect(todayIST(Date.parse('2026-11-11T19:00:00Z'))).toBe('2026-11-12'); // 00:30 IST next day
    expect(todayIST(Date.parse('2026-11-11T10:00:00Z'))).toBe('2026-11-11');
  });

  it('keeps one idempotency key while the body is the same and makes a new one when it changes or after success', () => {
    let n = 0;
    const keeper = createKeyKeeper(() => `k${++n}`);
    const a = toBody(
      { ...emptyDraft, customerId: 'c', branchId: 'b', modeCode: 'CASH', amount: '10' },
      '2026-11-11',
    );
    expect(keeper.keyFor(a)).toBe('k1');
    expect(keeper.keyFor({ ...a })).toBe('k1');
    expect(keeper.keyFor({ ...a, amount: '11.00' })).toBe('k2');
    keeper.reset();
    expect(keeper.keyFor(a)).toBe('k3');
  });
});

describe('outstanding list helpers', () => {
  it('sorts the biggest dues first and computes the overdue part with decimals', () => {
    const rows = byTotalDesc(aging().rows);
    expect(rows.map((r) => r.customerName)).toEqual(['Sunita Jadhav', 'Ramesh Patil', 'Anil More']);
    expect(overdueOf(rows[0]!)).toBe('12500.50');
    expect(overdueOf(rows[1]!)).toBe('4000.00');
    expect(overdueOf(rows[2]!)).toBe('0.00'); // only "not due yet"
  });
});

describe('collections screen', () => {
  const show = () => render(<CollectionsScreen />, { wrapper });

  it('shows dues with the biggest first, totals as Indian rupees, and the as-on date', async () => {
    mockGet.mockResolvedValue(aging());
    await show();
    expect(await screen.findByText('Sunita Jadhav')).toBeTruthy();
    expect(mockGet).toHaveBeenCalledWith('/reports/receivables/aging', expect.anything());
    expect(screen.getByText('₹17,750.50')).toBeTruthy(); // total outstanding: 5000 + 12500.50 + 250
    expect(screen.getByText('₹12,500.50')).toBeTruthy(); // Sunita's row amount
    expect(screen.getByText('Advance on account ₹300.00')).toBeTruthy();
    expect(screen.getByText('As on 2026-11-11')).toBeTruthy();
  });

  it('opens the receipt form from the button', async () => {
    mockGet.mockResolvedValue(aging());
    await show();
    await screen.findByText('Sunita Jadhav');
    await fireEvent.press(screen.getByLabelText('Receive payment'));
    expect(mockPush).toHaveBeenCalledWith('/collections/receipt-new');
  });

  it('shows a loading state first', async () => {
    mockGet.mockReturnValue(new Promise(() => {}));
    await show();
    expect(await screen.findAllByText('Loading...')).not.toHaveLength(0);
  });

  it('shows an empty message when nothing is outstanding', async () => {
    mockGet.mockResolvedValue({ asOn: '2026-11-11', rows: [], totals: {} });
    await show();
    expect(await screen.findByText('No outstanding dues. Nothing to collect right now.')).toBeTruthy();
  });

  it('shows a translated error with the correlation id and retries on tap', async () => {
    mockGet.mockRejectedValueOnce(new ApiError(500, { title: 'INTERNAL', correlationId: 'corr-7' }));
    await show();
    expect(await screen.findByText('Something went wrong. Code INTERNAL, reference corr-7.')).toBeTruthy();
    mockGet.mockResolvedValueOnce(aging());
    await fireEvent.press(screen.getByLabelText('Try again'));
    expect(await screen.findByText('Sunita Jadhav')).toBeTruthy();
    expect(mockGet).toHaveBeenCalledTimes(2);
  });

  it('keeps the old dues on screen with an "as of" time when a refresh fails for lack of network', async () => {
    mockGet.mockResolvedValueOnce(aging());
    await show();
    await screen.findByText('Sunita Jadhav');
    mockGet.mockRejectedValue(new ApiError(0, null));
    await act(async () => {
      await screen.getByTestId('collections-list').props.refreshControl.props.onRefresh();
    });
    await waitFor(() => expect(screen.getByText(/You are offline\. Showing data as of/)).toBeTruthy());
    expect(screen.getByText('Sunita Jadhav')).toBeTruthy();
  });

  it('shows permission denied without calling the server when the role holds none of the rights', async () => {
    mockMe = { userId: 'u-1', roles: [], permissions: [] };
    await show();
    expect(await screen.findByText('Your role does not allow this screen.')).toBeTruthy();
    expect(mockGet).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Receive payment')).toBeNull();
  });

  it('shows permission denied when the server answers 403', async () => {
    mockGet.mockRejectedValue(new ApiError(403, { title: 'FORBIDDEN' }));
    await show();
    expect(await screen.findByText('Your role does not allow this screen.')).toBeTruthy();
  });

  it('shows only follow-ups for a role that may not see the aging report, and calls the customer', async () => {
    mockMe = { userId: 'u-1', roles: [], permissions: ['credit.followup'] };
    mockGet.mockResolvedValue({ items: [task()] });
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    await show();
    expect(await screen.findByText('Ramesh Patil')).toBeTruthy();
    expect(mockGet).toHaveBeenCalledWith(
      '/credit/tasks',
      expect.objectContaining({ query: { status: 'OPEN', limit: 200 } }),
    );
    expect(mockGet).not.toHaveBeenCalledWith('/reports/receivables/aging', expect.anything());
    expect(screen.getByText('Overdue ₹4,000.00, oldest 45 days')).toBeTruthy();
    expect(screen.queryByText('Outstanding')).toBeNull(); // no tab bar: only one tab is allowed
    await fireEvent.press(screen.getByLabelText('Call Ramesh Patil'));
    expect(open).toHaveBeenCalledWith('tel:9876543210');
    open.mockRestore();
  });

  it('switches to the follow-up tab and shows its empty message', async () => {
    mockGet.mockImplementation(async (path: string) => (path === '/credit/tasks' ? { items: [] } : aging()));
    await show();
    await screen.findByText('Sunita Jadhav');
    await fireEvent.press(screen.getByLabelText('Follow-ups'));
    expect(await screen.findByText(/No follow-ups today/)).toBeTruthy();
  });

  it('shows Hindi text', async () => {
    await setLanguage('hi');
    mockGet.mockResolvedValue({ asOn: '2026-11-11', rows: [], totals: {} });
    await show();
    expect(await screen.findByText('कोई बकाया नहीं है। अभी वसूली के लिए कुछ नहीं।')).toBeTruthy();
  });
});

describe('receipt form', () => {
  const receipt = (over: Partial<ReceiptView> = {}): ReceiptView => ({
    id: 'r-1',
    number: 'RCT/26-27/0001',
    customerId: 'c-1',
    branchId: 'b-1',
    receiptDate: '2026-11-11',
    modeCode: 'CASH',
    reference: null,
    amount: '1500.0000',
    allocated: '1000.0000',
    onAccount: '500.0000',
    status: 'ACTIVE',
    ...over,
  });

  const route = (over: Record<string, () => unknown> = {}) =>
    mockGet.mockImplementation(async (path: string) => {
      if (over[path]) return over[path]!();
      if (path === '/settings/payment-modes')
        return {
          items: [
            { code: 'CASH', enabled: true },
            { code: 'UPI', enabled: true },
            { code: 'CHEQUE', enabled: true },
            { code: 'CARD', enabled: false },
            { code: 'CREDIT', enabled: true },
          ],
        };
      if (path === '/branches') return { items: [{ id: 'b-1', name: 'Main branch' }] };
      if (path === '/customers')
        return { items: [{ id: 'c-1', name: 'Ramesh Patil', mobile: '9876543210', village: 'Baramati' }] };
      throw new Error(`unexpected GET ${path}`);
    });

  const show = () => render(<ReceiptFormScreen />, { wrapper });

  async function fill(amount = '1500') {
    await fireEvent.changeText(await screen.findByLabelText('Search customer by name or mobile'), 'ram');
    await fireEvent.press(await screen.findByLabelText('Ramesh Patil'));
    await fireEvent.press(await screen.findByLabelText('CASH'));
    await fireEvent.changeText(screen.getByLabelText('Amount (₹)'), amount);
  }

  it('lists only enabled payment modes and never "CREDIT"', async () => {
    route();
    await show();
    expect(await screen.findByLabelText('CASH')).toBeTruthy();
    expect(screen.getByLabelText('UPI')).toBeTruthy();
    expect(screen.getByLabelText('CHEQUE')).toBeTruthy();
    expect(screen.queryByLabelText('CARD')).toBeNull(); // switched off
    expect(screen.queryByLabelText('CREDIT')).toBeNull(); // the server refuses a receipt on credit
  });

  it('sends the receipt with a string amount, today in India, and the single branch chosen for the user, then shows the result', async () => {
    route();
    mockPost.mockResolvedValue(receipt());
    await show();
    await fill('1500.5');
    await fireEvent.press(screen.getByLabelText('Save receipt'));
    expect(await screen.findByText('Receipt RCT/26-27/0001 recorded')).toBeTruthy();
    expect(mockPost).toHaveBeenCalledTimes(1);
    const [path, opts] = mockPost.mock.calls[0]!;
    expect(path).toBe('/receipts');
    expect(opts.body).toEqual({
      customerId: 'c-1',
      branchId: 'b-1',
      receiptDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      modeCode: 'CASH',
      amount: '1500.50',
    });
    expect(typeof opts.body.amount).toBe('string');
    expect(opts.idempotencyKey).toBe('key-1');
    expect(screen.getByText('Applied to dues ₹1,000.00')).toBeTruthy();
    expect(screen.getByText('Kept on account ₹500.00')).toBeTruthy();
  });

  it('reuses the SAME idempotency key when the user retries after a lost answer, so no second receipt is made', async () => {
    route();
    mockPost.mockRejectedValueOnce(new ApiError(0, null)).mockResolvedValueOnce(receipt());
    await show();
    await fill();
    await fireEvent.press(screen.getByLabelText('Save receipt'));
    expect(await screen.findByText('No network. Check your connection and try again.')).toBeTruthy();
    expect(screen.getByText(/we do not know if it was saved/)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Save receipt'));
    expect(await screen.findByText('Receipt RCT/26-27/0001 recorded')).toBeTruthy();
    expect(mockPost).toHaveBeenCalledTimes(2);
    expect(mockPost.mock.calls[0]![1].idempotencyKey).toBe('key-1');
    expect(mockPost.mock.calls[1]![1].idempotencyKey).toBe('key-1');
    expect(mockPost.mock.calls[1]![1].body).toEqual(mockPost.mock.calls[0]![1].body);
  });

  it('uses a NEW key when the user changes the amount before retrying (a different action)', async () => {
    route();
    mockPost.mockRejectedValueOnce(new ApiError(500, { title: 'INTERNAL' })).mockResolvedValueOnce(receipt());
    await show();
    await fill('1500');
    await fireEvent.press(screen.getByLabelText('Save receipt'));
    await screen.findByText(/Something went wrong/);
    await fireEvent.changeText(screen.getByLabelText('Amount (₹)'), '1600');
    await fireEvent.press(screen.getByLabelText('Save receipt'));
    await screen.findByText('Receipt RCT/26-27/0001 recorded');
    expect(mockPost.mock.calls[0]![1].idempotencyKey).toBe('key-1');
    expect(mockPost.mock.calls[1]![1].idempotencyKey).toBe('key-2');
  });

  it('never double-submits: a second tap while the first is still sending does nothing', async () => {
    route();
    let finish: (r: ReceiptView) => void = () => {};
    mockPost.mockReturnValue(new Promise<ReceiptView>((res) => (finish = res)));
    await show();
    await fill();
    await fireEvent.press(screen.getByLabelText('Save receipt'));
    expect(await screen.findByLabelText('Saving...')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Saving...'));
    await fireEvent.press(screen.getByLabelText('Saving...'));
    expect(mockPost).toHaveBeenCalledTimes(1);
    await act(async () => finish(receipt()));
    expect(await screen.findByText('Receipt RCT/26-27/0001 recorded')).toBeTruthy();
    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  it('blocks the save with a clear message when the phone is offline, and sends nothing', async () => {
    route({
      '/settings/payment-modes': () => Promise.reject(new ApiError(0, null)),
      '/branches': () => Promise.reject(new ApiError(0, null)),
    });
    await show();
    expect(
      await screen.findByText('You are offline. A receipt moves money, so it can only be saved online.'),
    ).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Save receipt'));
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('can check again after being offline and then saves', async () => {
    let online = false;
    route({
      '/settings/payment-modes': () =>
        online ? { items: [{ code: 'CASH', enabled: true }] } : Promise.reject(new ApiError(0, null)),
      '/branches': () =>
        online ? { items: [{ id: 'b-1', name: 'Main branch' }] } : Promise.reject(new ApiError(0, null)),
    });
    await show();
    await screen.findByText(/You are offline/);
    online = true;
    await fireEvent.press(screen.getByLabelText('Check again'));
    expect(await screen.findByLabelText('CASH')).toBeTruthy();
    expect(screen.queryByText(/You are offline/)).toBeNull();
  });

  it('refuses a bad amount before anything is sent, with a translated message', async () => {
    route();
    await show();
    await fill('1.234');
    await fireEvent.press(screen.getByLabelText('Save receipt'));
    expect(
      await screen.findByText('Enter an amount like 1500 or 1500.50 (at most 2 decimals).'),
    ).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Amount (₹)'), '0');
    await fireEvent.press(screen.getByLabelText('Save receipt'));
    expect(await screen.findByText('The amount must be more than zero.')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Amount (₹)'), '');
    await fireEvent.press(screen.getByLabelText('Save receipt'));
    expect(await screen.findByText('This is required.')).toBeTruthy();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('asks for the customer and the mode when they are missing', async () => {
    route();
    await show();
    await screen.findByLabelText('CASH');
    await fireEvent.changeText(screen.getByLabelText('Amount (₹)'), '100');
    await fireEvent.press(screen.getByLabelText('Save receipt'));
    expect(await screen.findAllByText('This is required.')).toHaveLength(2); // customer and mode
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('needs the cheque number, bank and date for a cheque, and sends them', async () => {
    route();
    mockPost.mockResolvedValue(receipt({ modeCode: 'CHEQUE' }));
    await show();
    await fireEvent.changeText(await screen.findByLabelText('Search customer by name or mobile'), 'ram');
    await fireEvent.press(await screen.findByLabelText('Ramesh Patil'));
    await fireEvent.press(await screen.findByLabelText('CHEQUE'));
    await fireEvent.changeText(screen.getByLabelText('Amount (₹)'), '2000');
    await fireEvent.press(screen.getByLabelText('Save receipt'));
    expect(await screen.findAllByText('This is required.')).toHaveLength(3);
    await fireEvent.changeText(screen.getByLabelText('Cheque number'), '123456');
    await fireEvent.changeText(screen.getByLabelText('Cheque bank'), 'SBI');
    await fireEvent.changeText(screen.getByLabelText('Cheque date'), '2026-11-11');
    await fireEvent.press(screen.getByLabelText('Save receipt'));
    await screen.findByText('Receipt RCT/26-27/0001 recorded');
    expect(mockPost.mock.calls[0]![1].body).toMatchObject({
      modeCode: 'CHEQUE',
      chequeNo: '123456',
      chequeBank: 'SBI',
      chequeDate: '2026-11-11',
      amount: '2000.00',
    });
  });

  it('shows the translated server error code (credit rules, closed period and so on fall back to the generic text with the reference)', async () => {
    route();
    mockPost.mockRejectedValue(new ApiError(422, { title: 'PERIOD_CLOSED', correlationId: 'corr-3' }));
    await show();
    await fill();
    await fireEvent.press(screen.getByLabelText('Save receipt'));
    expect(
      await screen.findByText('Something went wrong. Code PERIOD_CLOSED, reference corr-3.'),
    ).toBeTruthy();
    expect(screen.queryByText(/we do not know if it was saved/)).toBeNull(); // a real answer, not a lost one
  });

  it('shows permission denied without calling the server when the role may not record payments', async () => {
    mockMe = { userId: 'u-1', roles: [], permissions: ['reports.receivables'] };
    await show();
    expect(await screen.findByText('Your role does not allow recording payments.')).toBeTruthy();
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('uses the single branch from the token when the branch list is not allowed for this role', async () => {
    mockMe = { userId: 'u-1', roles: [], permissions: ALL, branchScope: ['b-9'] };
    route({ '/branches': () => Promise.reject(new ApiError(403, { title: 'FORBIDDEN' })) });
    mockPost.mockResolvedValue(receipt());
    await show();
    await fill();
    await fireEvent.press(screen.getByLabelText('Save receipt'));
    await screen.findByText('Receipt RCT/26-27/0001 recorded');
    expect(mockPost.mock.calls[0]![1].body.branchId).toBe('b-9');
  });

  it('asks which branch when the user has several', async () => {
    route({
      '/branches': () => ({
        items: [
          { id: 'b-1', name: 'Main branch' },
          { id: 'b-2', name: 'Market branch' },
        ],
      }),
    });
    await show();
    await fireEvent.changeText(await screen.findByLabelText('Search customer by name or mobile'), 'ram');
    await fireEvent.press(await screen.findByLabelText('Ramesh Patil'));
    await fireEvent.press(await screen.findByLabelText('CASH'));
    await fireEvent.changeText(screen.getByLabelText('Amount (₹)'), '100');
    await fireEvent.press(screen.getByLabelText('Save receipt'));
    expect(await screen.findByText('This is required.')).toBeTruthy(); // branch not chosen yet
    expect(mockPost).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText('Market branch'));
    mockPost.mockResolvedValue(receipt());
    await fireEvent.press(screen.getByLabelText('Save receipt'));
    await screen.findByText('Receipt RCT/26-27/0001 recorded');
    expect(mockPost.mock.calls[0]![1].body.branchId).toBe('b-2');
  });

  it('after a saved receipt, "Record another" starts a new action with a new key', async () => {
    route();
    mockPost.mockResolvedValue(receipt());
    await show();
    await fill();
    await fireEvent.press(screen.getByLabelText('Save receipt'));
    await screen.findByText('Receipt RCT/26-27/0001 recorded');
    await fireEvent.press(screen.getByLabelText('Record another'));
    await fill();
    await fireEvent.press(screen.getByLabelText('Save receipt'));
    await screen.findByText('Receipt RCT/26-27/0001 recorded');
    expect(mockPost.mock.calls[0]![1].idempotencyKey).toBe('key-1');
    expect(mockPost.mock.calls[1]![1].idempotencyKey).toBe('key-2');
  });
});

import type { ReactNode } from 'react';
import { Share } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '../src/api/errors';
import { setLanguage } from '../src/i18n';
import PosScreen from '../src/features/pos/PosScreen';
import InvoicesScreen, { checkReturnQty } from '../src/features/pos/InvoicesScreen';
import ShiftsScreen, { validCash } from '../src/features/pos/ShiftsScreen';

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockDelete = jest.fn();
let mockMe: { userId: string; roles: string[]; permissions?: string[] };
let mockId = 0;
const mockClient = {
  get: (...a: unknown[]) => mockGet(...a),
  post: (...a: unknown[]) => mockPost(...a),
  delete: (...a: unknown[]) => mockDelete(...a),
};
jest.mock('../src/auth/AuthProvider', () => ({
  useAuth: () => ({ status: 'signedIn', me: mockMe, client: mockClient, signIn: jest.fn(), signOut: jest.fn() }),
}));
jest.mock('../src/device', () => ({ newId: () => `key-${++mockId}` }));
jest.mock('../src/features/stock/BarcodeScanner', () => ({ BarcodeScanner: () => null }));

let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
const inv = { id: 'i-1', number: 'INV-1', invoiceDate: '2026-11-11', customerName: 'Ramesh Patil', total: '280.00', creditAmount: '80.00', status: 'FINALIZED' };

beforeEach(async () => {
  [mockGet, mockPost, mockDelete].forEach((m) => m.mockReset());
  mockId = 0;
  mockMe = { userId: 'u-1', roles: [], permissions: undefined };
  client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retryDelay: 0 } } });
  await setLanguage('en');
});

describe('helpers', () => {
  test('return quantity is checked as a decimal against what is left', () => {
    expect(checkReturnQty('1', '2', '0')).toBe('ok');
    expect(checkReturnQty('1.5', '2', '1')).toBe('tooMany');
    expect(checkReturnQty('0', '2', '0')).toBe('format');
    expect(checkReturnQty('1.2345', '2', '0')).toBe('format');
  });
  test('cash is a decimal string with at most 2 places', () => {
    expect(validCash('0')).toBe(true);
    expect(validCash('100.50')).toBe(true);
    expect(validCash('-1')).toBe(false);
    expect(validCash('1.234')).toBe(false);
    expect(validCash('')).toBe(false);
  });
});

describe('invoices screen', () => {
  const show = () => render(<InvoicesScreen />, { wrapper });
  beforeEach(() => {
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/sales/invoices') return { items: [inv] };
      if (path === '/sales/invoices/i-1') return { ...inv, customerId: 'c-1', lines: [{ id: 'l-1', skuCode: 'URE-50', qty: '2.000', returned: '0.000' }] };
      if (path === '/settings/payment-modes') return { items: [{ code: 'CASH', enabled: true }] };
      return { items: [] };
    });
  });

  test('lists invoices with money as Indian rupees and credit', async () => {
    await show();
    expect(await screen.findByText('INV-1 · ₹280.00')).toBeTruthy();
    expect(screen.getByText(/on credit ₹80.00/)).toBeTruthy();
  });

  test('no permission: nothing is called', async () => {
    mockMe = { userId: 'u-1', roles: [], permissions: [] };
    await show();
    expect(await screen.findByText('You do not have permission to see invoices.')).toBeTruthy();
    expect(mockGet).not.toHaveBeenCalled();
  });

  test('cancel needs a reason and sends one key; a lost answer retries with the SAME key', async () => {
    await show();
    await screen.findByText('INV-1 · ₹280.00');
    await fireEvent.press(screen.getByLabelText('Cancel'));
    await fireEvent.changeText(await screen.findByLabelText('Reason'), 'wrong item');
    let first = true;
    mockPost.mockImplementation(async () => {
      if (first) {
        first = false;
        throw new ApiError(0, null);
      }
      return {};
    });
    await fireEvent.press(screen.getByLabelText('Cancel invoice'));
    await screen.findByText(/internet|offline|network/i, {}, { timeout: 3000 }).catch(() => null);
    await fireEvent.press(screen.getByLabelText('Cancel invoice'));
    expect(await screen.findByText('Invoice INV-1 cancelled.')).toBeTruthy();
    const keys = mockPost.mock.calls.map((c) => c[1].idempotencyKey);
    expect(keys).toEqual(['key-1', 'key-1']);
    expect(mockPost.mock.calls[0]![0]).toBe('/sales/invoices/i-1/cancel');
  });

  test('return: quantity above what is left is refused on screen and nothing is sent', async () => {
    await show();
    await screen.findByText('INV-1 · ₹280.00');
    await fireEvent.press(screen.getByLabelText('Return'));
    await fireEvent.changeText(await screen.findByLabelText('Quantity to return'), '3');
    expect(await screen.findByText('More than what is left to return.')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Reason'), 'damaged');
    await fireEvent.press(screen.getByLabelText('Issue credit note'));
    expect(mockPost).not.toHaveBeenCalled();
  });

  test('return: a valid credit note goes to /sales/returns with the line and refund mode', async () => {
    mockPost.mockResolvedValue({});
    await show();
    await screen.findByText('INV-1 · ₹280.00');
    await fireEvent.press(screen.getByLabelText('Return'));
    await fireEvent.changeText(await screen.findByLabelText('Quantity to return'), '1');
    await fireEvent.changeText(screen.getByLabelText('Reason'), 'damaged');
    await fireEvent.press(screen.getByLabelText('Issue credit note'));
    expect(await screen.findByText('Credit note issued against INV-1.')).toBeTruthy();
    const [path, o] = mockPost.mock.calls[0]!;
    expect(path).toBe('/sales/returns');
    expect(o.body).toMatchObject({ invoiceId: 'i-1', refundMode: 'CREDIT_TO_ACCOUNT', lines: [{ invoiceLineId: 'l-1', qty: '1', toDamaged: false }] });
  });

  test('share opens the phone share sheet with the link', async () => {
    const spy = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as never);
    mockPost.mockResolvedValue({ token: 't.abc', expiresAt: 'x' });
    await show();
    await screen.findByText('INV-1 · ₹280.00');
    await fireEvent.press(screen.getByLabelText('Share link'));
    await screen.findByText('INV-1 · ₹280.00');
    expect(spy).toHaveBeenCalledWith({ message: expect.stringContaining('t.abc') });
  });

  test('Hindi text', async () => {
    await setLanguage('hi');
    await show();
    expect(await screen.findByText('इनवॉइस')).toBeTruthy();
  });
});

describe('shifts screen', () => {
  const show = () => render(<ShiftsScreen />, { wrapper });
  const shift = { id: 's-1', businessDate: '2026-11-11', terminal: 'T1', openingCash: '500.00', expectedCash: '1200.00', countedCash: null, difference: null, status: 'OPEN' };
  beforeEach(() => {
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/pos/shifts') return { items: [shift] };
      if (path === '/branches') return { items: [{ id: 'b-1', name: 'Main', status: 'ACTIVE' }] };
      return { items: [] };
    });
    mockPost.mockResolvedValue({});
  });

  test('lists shifts with expected cash', async () => {
    await show();
    expect(await screen.findByText(/Opening ₹500.00 · expected ₹1,200.00/)).toBeTruthy();
  });

  test('close shows the difference as a decimal and sends the counted cash', async () => {
    await show();
    await screen.findByText('2026-11-11 · T1 · OPEN');
    await fireEvent.press(screen.getByLabelText('Close'));
    await fireEvent.changeText(await screen.findByLabelText('Counted cash'), '1150.50');
    expect(await screen.findByText('Difference -₹49.50: add a note.')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Note (needed when there is a difference)'), 'short');
    await fireEvent.press(screen.getByLabelText('Close shift'));
    expect(await screen.findByText('Shift closed.')).toBeTruthy();
    const [path, o] = mockPost.mock.calls[0]!;
    expect(path).toBe('/pos/shifts/s-1/close');
    expect(o.body).toEqual({ countedCash: '1150.50', note: 'short' });
  });

  test('open shift sends branch and opening cash with one key; a bad amount blocks it', async () => {
    await show();
    await screen.findByText('2026-11-11 · T1 · OPEN');
    await fireEvent.press(screen.getAllByLabelText('Open shift')[0]!);
    await fireEvent.changeText(await screen.findByLabelText('Opening cash'), '-5');
    expect(await screen.findByText('Enter an amount with at most 2 decimals.')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Opening cash'), '500');
    await fireEvent.press(screen.getAllByLabelText('Open shift').at(-1)!);
    expect(await screen.findByText('Shift opened.')).toBeTruthy();
    expect(mockPost.mock.calls[0]![1]).toMatchObject({ body: { branchId: 'b-1', openingCash: '500.00' }, idempotencyKey: 'key-1' });
  });

  test('day-end is hidden without pos.dayend', async () => {
    mockMe = { userId: 'u-1', roles: [], permissions: ['pos.shift'] };
    await show();
    await screen.findByText('2026-11-11 · T1 · OPEN');
    expect(screen.queryByLabelText('Day-end')).toBeNull();
  });
});

describe('POS: hold, resume and quick customer', () => {
  const prod = { id: 'p-1', code: 'URE-50', name: 'Urea 50kg', status: 'ACTIVE', sellable: true, saleBlocked: false, banned: false, mrp: '300.00', sellingPrice: '280.00', baseUomCode: 'BAG', primaryBarcode: null };
  const preview = { docType: 'TAX_INVOICE', placeOfSupply: '27', totals: { gross: '280.00', discount: '0.00', taxable: '266.67', cgst: '6.67', sgst: '6.66', igst: '0.00', roundOff: '0.00', total: '280.00' } };
  let heldRows: { id: string; label: string; created_at: string }[];
  beforeEach(() => {
    heldRows = [];
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/branches') return { items: [{ id: 'b-1', name: 'Main', status: 'ACTIVE' }] };
      if (path === '/warehouses') return { items: [{ id: 'w-1', branchId: 'b-1', name: 'Shop', status: 'ACTIVE', sellable: true }] };
      if (path === '/settings/payment-modes') return { items: [{ code: 'CASH', enabled: true }] };
      if (path === '/products') return { items: [prod] };
      if (path === '/sales/held') return { items: heldRows };
      if (path === '/sales/held/h-1') return { cart: { branchId: 'b-1', customerId: 'c-9', billDiscountPct: '5', lines: [{ skuId: 'p-1', warehouseId: 'w-1', qty: '3' }] } };
      if (path === '/customers/c-9') return { id: 'c-9', name: 'Sunita Jadhav' };
      return { items: [] };
    });
    mockPost.mockImplementation(async (path: string) => (path === '/sales/invoices/preview' ? preview : {}));
    mockDelete.mockResolvedValue(null);
  });

  test('resume brings back lines, customer and bill discount, then drops the held bill', async () => {
    heldRows = [{ id: 'h-1', label: 'Sunita', created_at: 'x' }];
    await render(<PosScreen />, { wrapper });
    await fireEvent.press(await screen.findByLabelText('Resume'));
    expect(await screen.findByText('Sunita Jadhav')).toBeTruthy();
    expect(screen.getByDisplayValue('3')).toBeTruthy();
    expect(mockDelete).toHaveBeenCalledWith('/sales/held/h-1');
    const priced = mockPost.mock.calls.filter((c) => c[0] === '/sales/invoices/preview').at(-1)![1].body;
    expect(priced).toMatchObject({ customerId: 'c-9', billDiscountPct: '5' });
  });

  test('hold sends the label and the cart with a key', async () => {
    await render(<PosScreen />, { wrapper });
    await fireEvent.changeText(await screen.findByLabelText('Search product by name or code'), 'ure');
    await fireEvent.press(await screen.findByLabelText('Urea 50kg', {}, { timeout: 3000 }));
    await screen.findByText('Total ₹280.00', {}, { timeout: 3000 });
    await fireEvent.press(screen.getByLabelText('Hold this bill'));
    await fireEvent.changeText(screen.getByLabelText('Label (for example the customer name)'), 'Ramesh');
    await fireEvent.press(screen.getByLabelText('Hold'));
    expect(await screen.findByText('Bill held. Find it under Held bills.')).toBeTruthy();
    const c = mockPost.mock.calls.find((x) => x[0] === '/sales/held')!;
    expect(c[1].body).toMatchObject({ branchId: 'b-1', label: 'Ramesh', cart: { lines: [{ skuId: 'p-1', qty: '1' }] } });
    expect(c[1].idempotencyKey).toBeTruthy();
  });

  test('quick customer: bad mobile blocks save; a good one creates and selects the customer', async () => {
    mockPost.mockImplementation(async (path: string) => (path === '/customers/quick' ? { id: 'c-5', name: 'Naya Kisan' } : preview));
    await render(<PosScreen />, { wrapper });
    await fireEvent.changeText(await screen.findByLabelText('Search customer by name or mobile'), 'naya');
    await fireEvent.press(await screen.findByLabelText('Not found: add a quick customer', {}, { timeout: 3000 }));
    await fireEvent.changeText(screen.getByLabelText('Mobile (10 digits, starts 6-9)'), '12345');
    expect(await screen.findByText('Mobile must be 10 digits and start with 6, 7, 8 or 9.')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Mobile (10 digits, starts 6-9)'), '9876543210');
    await fireEvent.changeText(screen.getByLabelText('Village'), 'Pune');
    await fireEvent.press(screen.getByLabelText('Save customer'));
    expect(await screen.findByText('Naya Kisan')).toBeTruthy();
    expect(mockPost.mock.calls.find((x) => x[0] === '/customers/quick')![1].body).toEqual({ name: 'naya', mobile: '9876543210', village: 'Pune' });
  });
});

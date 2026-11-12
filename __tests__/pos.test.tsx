import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '../src/api/errors';
import { setLanguage } from '../src/i18n';
import PosScreen from '../src/features/pos/PosScreen';
import {
  addProduct,
  changeFor,
  checkPayment,
  createKeyKeeper,
  emptyCart,
  firstCartError,
  toInvoiceBody,
  toTenders,
  type CartLine,
} from '../src/features/pos/cart';
import type { ProductLite } from '../src/features/pos/api';

const mockGet = jest.fn();
const mockPost = jest.fn();
let mockMe: { userId: string; roles: string[]; permissions?: string[]; branchScope?: unknown } | null;
let mockId = 0;

// Stable like the real AuthProvider, which builds the client once with useMemo.
const mockClient = { get: (...a: unknown[]) => mockGet(...a), post: (...a: unknown[]) => mockPost(...a) };
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
jest.mock('../src/features/stock/BarcodeScanner', () => ({ BarcodeScanner: () => null }));

const prod: ProductLite = {
  id: 'p-1',
  code: 'URE-50',
  name: 'Urea 50kg',
  status: 'ACTIVE',
  sellable: true,
  saleBlocked: false,
  banned: false,
  mrp: '300.00',
  sellingPrice: '280.00',
  baseUomCode: 'BAG',
  primaryBarcode: '890',
};
const preview = {
  docType: 'TAX_INVOICE',
  placeOfSupply: '27',
  totals: {
    gross: '280.00',
    discount: '0.00',
    taxable: '266.67',
    cgst: '6.67',
    sgst: '6.66',
    igst: '0.00',
    roundOff: '0.00',
    total: '280.00',
  },
};

let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

beforeEach(async () => {
  mockGet.mockReset();
  mockPost.mockReset();
  mockId = 0;
  mockMe = { userId: 'u-1', roles: ['CASHIER'], permissions: ['sales.pos.use'] };
  mockGet.mockImplementation(async (path: string) => {
    if (path === '/branches') return { items: [{ id: 'b-1', name: 'Main', status: 'ACTIVE' }] };
    if (path === '/warehouses')
      return { items: [{ id: 'w-1', branchId: 'b-1', name: 'Shop', status: 'ACTIVE', sellable: true }] };
    if (path === '/settings/payment-modes')
      return {
        items: [
          { code: 'CASH', enabled: true },
          { code: 'UPI', enabled: true },
          { code: 'CREDIT', enabled: true },
        ],
      };
    if (path === '/products') return { items: [prod] };
    return { items: [] };
  });
  mockPost.mockImplementation(async (path: string) => {
    if (path === '/sales/invoices/preview') return preview;
    return { invoiceId: 'i-1', number: 'INV-1', total: '280.00', creditAmount: '0.00', changeDue: '20.00' };
  });
  client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retryDelay: 0 } } });
  await setLanguage('en');
});

describe('cart logic', () => {
  const line = (over: Partial<CartLine> = {}): CartLine => ({
    skuId: 's',
    code: 'c',
    name: 'n',
    warehouseId: 'w',
    qty: '1',
    unitPrice: '',
    discountPct: '',
    ...over,
  });
  test('same product twice adds to one line, with decimal maths', () => {
    let c = addProduct({ ...emptyCart, branchId: 'b' }, prod, 'w-1');
    c = addProduct(c, prod, 'w-1');
    expect(c.lines).toHaveLength(1);
    expect(c.lines[0]!.qty).toBe('2');
  });
  test('quantity, price and discount are checked as strings', () => {
    const bad = (l: Partial<CartLine>) => firstCartError({ ...emptyCart, lines: [line(l)] })?.error;
    expect(bad({ qty: '0' })).toBe('qty');
    expect(bad({ qty: '1.2345' })).toBe('qty');
    expect(bad({ qty: 'abc' })).toBe('qty');
    expect(bad({ unitPrice: '10.123' })).toBe('price');
    expect(bad({ discountPct: '101' })).toBe('discount');
    expect(bad({ qty: '0.5', unitPrice: '10.50', discountPct: '5' })).toBeUndefined();
  });
  test('body leaves out blank optional boxes and never carries a tenant id', () => {
    const b = toInvoiceBody(
      { branchId: 'b', customerId: '', billDiscountPct: '', lines: [line()] },
      '2026-11-11',
    );
    expect(b).toEqual({
      branchId: 'b',
      invoiceDate: '2026-11-11',
      lines: [{ skuId: 's', warehouseId: 'w', qty: '1' }],
    });
    expect(JSON.stringify(b)).not.toMatch(/tenant|franchise/i);
  });
  test('tenders drop blank boxes; reference only with non-cash', () => {
    expect(toTenders({ CASH: '300', UPI: '', CARD: '0' }, 'r1')).toEqual([
      { mode: 'CASH', amount: '300.00' },
    ]);
    expect(toTenders({ UPI: '100' }, ' r1 ')).toEqual([{ mode: 'UPI', amount: '100.00', reference: 'r1' }]);
  });
  test('walk-in must pay in full; a customer may leave credit; change is cash over the total', () => {
    expect(checkPayment('280.00', [], false)).toBe('none');
    expect(checkPayment('280.00', [{ mode: 'CASH', amount: '100.00' }], false)).toBe('short');
    expect(checkPayment('280.00', [{ mode: 'CASH', amount: '300.00' }], false)).toBe('ok');
    expect(checkPayment('280.00', [], true)).toBe('ok');
    expect(changeFor('280.00', [{ mode: 'CASH', amount: '300.00' }])).toBe('20.00');
    expect(
      changeFor('0.30', [
        { mode: 'CASH', amount: '0.10' },
        { mode: 'CASH', amount: '0.20' },
      ]),
    ).toBe('0.00');
  });
  test('key keeper: same body same key; changed body new key; reset drops it', () => {
    let n = 0;
    const k = createKeyKeeper(() => `k${++n}`);
    const b = toInvoiceBody({ ...emptyCart, branchId: 'b', lines: [line()] }, 'd');
    expect(k.keyFor(b)).toBe('k1');
    expect(k.keyFor(b)).toBe('k1');
    expect(k.keyFor({ ...b, billDiscountPct: '5' })).toBe('k2');
    k.reset();
    expect(k.keyFor(b)).toBe('k3');
  });
});

describe('POS screen', () => {
  const show = () => render(<PosScreen />, { wrapper });
  async function fillCart() {
    await show();
    await fireEvent.changeText(await screen.findByLabelText('Search product by name or code'), 'ure');
    await fireEvent.press(await screen.findByLabelText('Urea 50kg', {}, { timeout: 3000 }));
    await screen.findByText('Total ₹280.00', {}, { timeout: 3000 });
  }

  test('without the permission the counter is closed and no API call is made', async () => {
    mockMe = { userId: 'u-1', roles: [], permissions: [] };
    await show();
    expect(await screen.findByText('You do not have permission to use the billing counter.')).toBeTruthy();
    expect(mockGet).not.toHaveBeenCalled();
  });

  test('add a product, the server prices it, take cash, finalize with ONE Idempotency-Key', async () => {
    await fillCart();
    await fireEvent.press(screen.getByLabelText('Take payment'));
    await fireEvent.changeText(await screen.findByLabelText('Amount in CASH'), '300');
    expect(screen.queryByLabelText('Amount in CREDIT')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Finalize bill'));
    expect(await screen.findByText('Bill INV-1 saved')).toBeTruthy();
    expect(screen.getByText('Change to give back ₹20.00')).toBeTruthy();
    const call = mockPost.mock.calls.find((c) => c[0] === '/sales/invoices')!;
    expect(call[1].idempotencyKey).toBe('key-1');
    expect(call[1].body.tenders).toEqual([{ mode: 'CASH', amount: '300.00' }]);
    expect(call[1].body.lines[0]).toEqual({ skuId: 'p-1', warehouseId: 'w-1', qty: '1' });
  });

  test('a lost answer keeps the key: the retry cannot make a second bill', async () => {
    await fillCart();
    await fireEvent.press(screen.getByLabelText('Take payment'));
    await fireEvent.changeText(await screen.findByLabelText('Amount in CASH'), '280');
    let first = true;
    mockPost.mockImplementation(async (path: string) => {
      if (path === '/sales/invoices/preview') return preview;
      if (first) {
        first = false;
        throw new ApiError(0, null);
      }
      return { invoiceId: 'i-1', number: 'INV-1', total: '280.00', creditAmount: '0.00', changeDue: '0.00' };
    });
    await fireEvent.press(screen.getByLabelText('Finalize bill'));
    expect(await screen.findByText(/The answer was lost/)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Finalize bill'));
    await screen.findByText('Bill INV-1 saved');
    const keys = mockPost.mock.calls
      .filter((c) => c[0] === '/sales/invoices')
      .map((c) => c[1].idempotencyKey);
    expect(keys).toEqual(['key-1', 'key-1']);
  });

  test('walk-in short payment blocks Finalize and sends nothing', async () => {
    await fillCart();
    await fireEvent.press(screen.getByLabelText('Take payment'));
    await fireEvent.changeText(await screen.findByLabelText('Amount in CASH'), '100');
    expect(await screen.findByText('A walk-in sale must be paid in full.')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Finalize bill'));
    expect(mockPost.mock.calls.some((c) => c[0] === '/sales/invoices')).toBe(false);
  });

  test('a bad quantity is shown at once and the server is not asked to price it', async () => {
    await fillCart();
    mockPost.mockClear();
    await fireEvent.changeText(screen.getByLabelText('Quantity of Urea 50kg'), '0');
    expect(await screen.findByText('Quantity must be more than 0 with at most 3 decimals.')).toBeTruthy();
    expect(mockPost).not.toHaveBeenCalled();
  });

  test('offline: a clear message, no bill can be made', async () => {
    mockGet.mockRejectedValue(new ApiError(0, null));
    await show();
    expect(
      await screen.findByText('You are offline. A bill moves money, so it can only be made online.'),
    ).toBeTruthy();
  });

  test('Hindi text', async () => {
    await setLanguage('hi');
    await show();
    expect(await screen.findByText('नया बिल')).toBeTruthy();
  });
});

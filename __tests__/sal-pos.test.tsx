import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import parts from '../i18n-parts/sal.json';
import { i18n, setLanguage } from '../src/i18n';
import PosScreen from '../src/features/pos/PosScreen';
import { cropCaptureOk, fefoOrder, needsFefoReason, type PickBatch } from '../src/features/pos/LineExtras';
import { emptyCart, firstCartError, toInvoiceBody, type Cart } from '../src/features/pos/cart';

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

let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

const prod = {
  id: 'p-1',
  code: 'PEST-1',
  name: 'Neem Spray',
  status: 'ACTIVE',
  sellable: true,
  saleBlocked: false,
  banned: false,
  mrp: '300.00',
  sellingPrice: '280.00',
  baseUomCode: 'BTL',
  primaryBarcode: null,
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
const batches: PickBatch[] = [
  { id: 'bt-2', batchNo: 'B-LATE', expiryDate: '2027-06-30', available: '10', status: 'ACTIVE' },
  { id: 'bt-1', batchNo: 'B-EARLY', expiryDate: '2026-12-31', available: '4', status: 'ACTIVE' },
];

beforeAll(() => {
  for (const lg of ['en', 'hi', 'mr'] as const)
    i18n.addResourceBundle(lg, 'translation', (parts as Record<string, object>)[lg], true, true);
});
beforeEach(async () => {
  [mockGet, mockPost, mockDelete].forEach((m) => m.mockReset());
  mockId = 0;
  mockMe = { userId: 'u-1', roles: [], permissions: undefined };
  client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retryDelay: 0 } } });
  await setLanguage('en');
  mockGet.mockImplementation(async (path: string) => {
    if (path === '/branches') return { items: [{ id: 'b-1', name: 'Main', status: 'ACTIVE' }] };
    if (path === '/warehouses')
      return { items: [{ id: 'w-1', branchId: 'b-1', name: 'Shop', status: 'ACTIVE', sellable: true }] };
    if (path === '/settings/payment-modes') return { items: [{ code: 'CASH', enabled: true }] };
    if (path === '/products') return { items: [prod] };
    if (path === '/customers')
      return { items: [{ id: 'c-1', name: 'Dealer Traders', mobile: '9876543210' }] };
    if (path === '/inventory/batches') return { items: batches };
    return { items: [] };
  });
  mockPost.mockImplementation(async (path: string) => (path === '/sales/invoices/preview' ? preview : {}));
});

const lastPreviewBody = () =>
  mockPost.mock.calls.filter((c) => c[0] === '/sales/invoices/preview').at(-1)![1].body;

async function addProduct() {
  await render(<PosScreen />, { wrapper });
  await fireEvent.changeText(await screen.findByLabelText('Search product by name or code'), 'nee');
  await fireEvent.press(await screen.findByLabelText('Neem Spray', {}, { timeout: 3000 }));
  await screen.findByText('Total ₹280.00', {}, { timeout: 3000 });
}

describe('logic', () => {
  test('FEFO order and the override reason rule', () => {
    expect(fefoOrder(batches).map((b) => b.id)).toEqual(['bt-1', 'bt-2']);
    expect(needsFefoReason(batches, 'bt-1')).toBe(false);
    expect(needsFefoReason(batches, 'bt-2')).toBe(true);
    expect(needsFefoReason([], 'x')).toBe(false);
  });
  test('crop capture is all three or none', () => {
    expect(cropCaptureOk({})).toBe(true);
    expect(cropCaptureOk({ crop: 'Cotton', targetPest: 'Bollworm', dose: '2 ml/l' })).toBe(true);
    expect(cropCaptureOk({ crop: 'Cotton' })).toBe(false);
  });
  test('the body carries extras only when set; wholesale needs a customer', () => {
    const line = {
      skuId: 's',
      code: 'c',
      name: 'n',
      warehouseId: 'w',
      qty: '1',
      unitPrice: '',
      discountPct: '',
    };
    const base: Cart = { ...emptyCart, branchId: 'b', lines: [line] };
    expect(toInvoiceBody(base, '2026-11-12').lines[0]).toEqual({ skuId: 's', warehouseId: 'w', qty: '1' });
    const cart: Cart = {
      ...base,
      customerId: 'c-1',
      wholesale: true,
      lines: [
        {
          ...line,
          crop: 'Cotton',
          targetPest: 'Bollworm',
          dose: '2 ml',
          batchId: 'bt-2',
          fefoOverrideReason: ' stock check ',
        },
      ],
    };
    const b = toInvoiceBody(cart, '2026-11-12');
    expect(b.wholesale).toBe(true);
    expect(b.lines[0]).toMatchObject({
      crop: 'Cotton',
      targetPest: 'Bollworm',
      dose: '2 ml',
      batchId: 'bt-2',
      fefoOverrideReason: 'stock check',
    });
    expect(toInvoiceBody({ ...cart, customerId: '' }, '2026-11-12').wholesale).toBeUndefined();
    expect(firstCartError({ ...base, lines: [{ ...line, crop: 'Cotton' }] })).toEqual({
      index: 0,
      error: 'crop',
    });
  });
});

describe('POS: crop capture, batch pick, wholesale', () => {
  test('crop, pest and dose go on the line sent to the server', async () => {
    await addProduct();
    await fireEvent.press(screen.getByLabelText('Crop details Neem Spray'));
    await fireEvent.changeText(screen.getByLabelText('Crop Neem Spray'), 'Cotton');
    expect(
      await screen.findByText('Fill crop, pest and dose, or clear all three.', { exact: false }),
    ).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Target pest Neem Spray'), 'Bollworm');
    await fireEvent.changeText(screen.getByLabelText('Dose Neem Spray'), '2 ml per litre');
    await screen.findByText('Total ₹280.00', {}, { timeout: 3000 });
    await new Promise((r) => setTimeout(r, 50));
    expect(lastPreviewBody().lines[0]).toMatchObject({
      crop: 'Cotton',
      targetPest: 'Bollworm',
      dose: '2 ml per litre',
    });
  });

  test('batches are listed with the oldest expiry marked; the first needs no reason', async () => {
    await addProduct();
    await fireEvent.press(screen.getByLabelText('Choose batch Neem Spray'));
    expect(await screen.findByLabelText('B-EARLY · 2026-12-31 · 4 · oldest expiry')).toBeTruthy();
    expect(mockGet.mock.calls.find((c) => c[0] === '/inventory/batches')![1].query).toMatchObject({
      product: 'p-1',
      warehouse: 'w-1',
      withStockOnly: 'true',
    });
    await fireEvent.press(screen.getByLabelText('B-EARLY · 2026-12-31 · 4 · oldest expiry'));
    expect(await screen.findByText('Batch B-EARLY')).toBeTruthy();
    expect(screen.queryByLabelText('Reason for choosing this batch Neem Spray')).toBeNull();
    await new Promise((r) => setTimeout(r, 50));
    expect(lastPreviewBody().lines[0]).toMatchObject({ batchId: 'bt-1' });
    expect(lastPreviewBody().lines[0].fefoOverrideReason).toBeUndefined();
  });

  test('a later batch asks for a reason and sends it with the batch', async () => {
    await addProduct();
    await fireEvent.press(screen.getByLabelText('Choose batch Neem Spray'));
    await fireEvent.press(await screen.findByLabelText('B-LATE · 2027-06-30 · 10'));
    expect(await screen.findByText('Give a reason of 3 or more letters.')).toBeTruthy();
    await fireEvent.changeText(
      screen.getByLabelText('Reason for choosing this batch Neem Spray'),
      'customer asked for fresh stock',
    );
    await new Promise((r) => setTimeout(r, 50));
    await screen.findByText('Total ₹280.00');
    expect(lastPreviewBody().lines[0]).toMatchObject({
      batchId: 'bt-2',
      fefoOverrideReason: 'customer asked for fresh stock',
    });
    await fireEvent.press(screen.getByLabelText('Let the system pick (oldest expiry first)'));
    await new Promise((r) => setTimeout(r, 50));
    expect(lastPreviewBody().lines[0].batchId).toBeUndefined();
  });

  test('batch list refused (no inventory right): the message is shown, billing continues', async () => {
    mockMe = { userId: 'u-1', roles: [], permissions: ['sales.pos.use', 'product.view', 'customer.view'] };
    await addProduct();
    expect(screen.queryByLabelText('Choose batch Neem Spray')).toBeNull();
    expect(screen.getByLabelText('Crop details Neem Spray')).toBeTruthy();
  });

  test('wholesale: only with a customer, sent in the bill, hidden without sales.wholesale', async () => {
    await addProduct();
    expect(screen.queryByLabelText('Wholesale (dealer) sale')).toBeNull();
    await fireEvent.changeText(screen.getByLabelText('Search customer by name or mobile'), 'dea');
    await fireEvent.press(await screen.findByLabelText('Dealer Traders', {}, { timeout: 3000 }));
    await fireEvent.press(await screen.findByLabelText('Wholesale (dealer) sale'));
    await new Promise((r) => setTimeout(r, 50));
    expect(lastPreviewBody()).toMatchObject({ customerId: 'c-1', wholesale: true });
  });

  test('wholesale toggle is hidden without the right', async () => {
    mockMe = {
      userId: 'u-1',
      roles: [],
      permissions: ['sales.pos.use', 'product.view', 'customer.view', 'inventory.view'],
    };
    await addProduct();
    await fireEvent.changeText(screen.getByLabelText('Search customer by name or mobile'), 'dea');
    await fireEvent.press(await screen.findByLabelText('Dealer Traders', {}, { timeout: 3000 }));
    await screen.findByText('Dealer Traders');
    expect(screen.queryByLabelText('Wholesale (dealer) sale')).toBeNull();
  });

  test('Hindi text on the line controls', async () => {
    await addProduct();
    await setLanguage('hi');
    expect(await screen.findByLabelText('फसल विवरण Neem Spray')).toBeTruthy();
  });
});

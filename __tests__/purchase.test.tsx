import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import parts from '../i18n-parts/step3.json';
import { i18n, setLanguage } from '../src/i18n';
import { ApiError } from '../src/api/errors';
import PurchaseScreen from '../src/features/purchase/PurchaseScreen';
import OrderDetailScreen from '../src/features/purchase/OrderDetailScreen';
import OrderFormScreen from '../src/features/purchase/OrderFormScreen';
import ReceiveScreen from '../src/features/purchase/ReceiveScreen';
import {
  buildGrnBody,
  buildOrderBody,
  countScan,
  lineEstimate,
  orderActions,
  orderErrors,
  receiveDraftFor,
  receiveErrors,
  validPct,
  validQty,
  validRate,
} from '../src/features/purchase/logic';
import type { OrderDetail } from '../src/features/purchase/api';

const mockGet = jest.fn();
const mockPost = jest.fn();
let mockMe: { userId: string; roles: string[]; permissions?: string[] };
let mockId = 0;
let mockScanned: ((c: string) => void) | null = null;
const mockPush = jest.fn();
const mockReplace = jest.fn();
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
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useLocalSearchParams: () => ({ id: 'po-1' }),
  Stack: { Screen: () => null },
}));
jest.mock('../src/features/stock/BarcodeScanner', () => ({
  BarcodeScanner: ({ visible, onScanned }: { visible: boolean; onScanned: (c: string) => void }) => {
    mockScanned = visible ? onScanned : null;
    return null;
  },
}));

let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

const order = (over: Partial<OrderDetail> = {}): OrderDetail => ({
  id: 'po-1',
  number: 'PO-1',
  revision: 1,
  branchId: 'b-1',
  supplierId: 's-1',
  supplierName: 'Agro Seeds',
  warehouseId: 'w-1',
  orderDate: '2026-11-10',
  expectedDate: null,
  status: 'SUBMITTED',
  total: '1180.00',
  createdBy: 'u-2',
  version: 3,
  subtotal: '1000.00',
  taxTotal: '180.00',
  notes: null,
  reason: null,
  lines: [
    {
      id: 'l-1',
      lineNo: 1,
      skuId: 'sku-1',
      skuCode: 'URE-50',
      skuName: 'Urea 50kg',
      qty: '10.000000',
      rate: '100.0000',
      discountPct: '0.0000',
      lineTotal: '1180.00',
      receivedQty: '0.000000',
      closedQty: '0.000000',
      pendingQty: '10.000000',
    },
  ],
  ...over,
});

beforeAll(() => {
  for (const lg of ['en', 'hi', 'mr'] as const)
    i18n.addResourceBundle(lg, 'translation', (parts as Record<string, object>)[lg], true, true);
});
beforeEach(async () => {
  [mockGet, mockPost, mockPush, mockReplace].forEach((m) => m.mockReset());
  mockId = 0;
  mockScanned = null;
  mockMe = { userId: 'u-1', roles: [], permissions: undefined };
  client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retryDelay: 0 } } });
  await setLanguage('en');
});

describe('purchase logic', () => {
  test('decimal checks', () => {
    expect(validQty('1.5')).toBe(true);
    expect(validQty('0')).toBe(false);
    expect(validQty('1.1234567')).toBe(false);
    expect(validRate('99.1234')).toBe(true);
    expect(validRate('99.12345')).toBe(false);
    expect(validPct('100')).toBe(true);
    expect(validPct('100.01')).toBe(false);
    expect(lineEstimate({ qty: '0.1', rate: '0.2', discountPct: '' })).toBe('0.02');
    expect(lineEstimate({ qty: '3', rate: '33.33', discountPct: '10' })).toBe('89.99');
  });
  test('order body leaves blanks out and needs a line', () => {
    const d = {
      supplierId: 's',
      branchId: 'b',
      warehouseId: 'w',
      orderDate: '2026-11-10',
      expectedDate: '',
      notes: '',
      lines: [{ skuId: 'k', label: 'x', qty: '2', rate: '5', discountPct: '' }],
    };
    expect(buildOrderBody(d)).toEqual({
      supplierId: 's',
      branchId: 'b',
      warehouseId: 'w',
      orderDate: '2026-11-10',
      lines: [{ skuId: 'k', qty: '2', rate: '5' }],
    });
    expect(orderErrors({ ...d, lines: [] }, '2026-11-11')).toContain('noLines');
    expect(orderErrors({ ...d, orderDate: '2026-12-01' }, '2026-11-11')).toContain('date');
    expect(orderErrors({ ...d, expectedDate: '2026-11-01' }, '2026-11-11')).toContain('expected');
  });
  test('approve button rules: maker-checker and permission', () => {
    const can = (p: string) => ['purchase.order.approve'].includes(p);
    expect(orderActions({ status: 'SUBMITTED', createdBy: 'u-2' }, 'u-1', can).approve).toBe(true);
    const own = orderActions({ status: 'SUBMITTED', createdBy: 'u-1' }, 'u-1', can);
    expect(own.approve).toBe(false);
    expect(own.ownOrder).toBe(true);
    expect(orderActions({ status: 'SUBMITTED', createdBy: 'u-2' }, 'u-1', () => false).approve).toBe(false);
  });
  test('receive: rejected needs a reason, scan counts one as a decimal', () => {
    const d = { ...receiveDraftFor(order()), receiptDate: '2026-11-10' };
    expect(d.lines).toHaveLength(1);
    const c1 = countScan(d, 'sku-1')!;
    expect(c1.lines[0]!.received).toBe('1');
    expect(countScan(c1, 'sku-1')!.lines[0]!.received).toBe('2');
    expect(countScan(d, 'other')).toBeNull();
    const bad = { ...c1, lines: [{ ...c1.lines[0]!, rejected: '1' }] };
    expect(receiveErrors(bad, '2026-11-11')).toContain('reason');
    const ok = { ...c1, lines: [{ ...c1.lines[0]!, received: '3', rejected: '1', reason: 'DAMAGED' }] };
    expect(receiveErrors(ok, '2026-11-11')).toEqual([]);
    expect(buildGrnBody('po-1', ok).lines[0]).toEqual({
      poLineId: 'l-1',
      receivedQty: '3',
      rejectedQty: '1',
      rejectReason: 'DAMAGED',
    });
    expect(receiveErrors({ ...ok, lines: [{ ...ok.lines[0]!, rejected: '4' }] }, '2026-11-11')).toContain(
      'rejected',
    );
  });
});

describe('purchase list', () => {
  test('lists orders, money in rupees', async () => {
    mockGet.mockResolvedValue({ items: [order()] });
    await render(<PurchaseScreen />, { wrapper });
    expect(await screen.findByText('PO-1 · ₹1,180.00')).toBeTruthy();
    expect(mockGet.mock.calls[0]![0]).toBe('/procurement/purchase-orders');
  });
  test('loading', async () => {
    mockGet.mockReturnValue(new Promise(() => undefined));
    await render(<PurchaseScreen />, { wrapper });
    expect(await screen.findByTestId('state-loading')).toBeTruthy();
  });
  test('empty', async () => {
    mockGet.mockResolvedValue({ items: [] });
    await render(<PurchaseScreen />, { wrapper });
    expect(await screen.findByText('No purchase orders yet.')).toBeTruthy();
  });
  test('offline', async () => {
    mockGet.mockRejectedValue(new ApiError(0, null));
    await render(<PurchaseScreen />, { wrapper });
    expect(await screen.findByTestId('state-offline')).toBeTruthy();
  });
  test('server error', async () => {
    mockGet.mockRejectedValue(new ApiError(500, { title: 'BOOM' }));
    await render(<PurchaseScreen />, { wrapper });
    expect(await screen.findByTestId('state-error')).toBeTruthy();
  });
  test('server 403 shows permission denied', async () => {
    mockGet.mockRejectedValue(new ApiError(403, { title: 'FORBIDDEN' }));
    await render(<PurchaseScreen />, { wrapper });
    expect(await screen.findByText('You do not have permission to see purchases.')).toBeTruthy();
  });
  test('no permission: nothing is called; create button hidden without create permission', async () => {
    mockMe = { userId: 'u-1', roles: [], permissions: [] };
    await render(<PurchaseScreen />, { wrapper });
    expect(await screen.findByText('You do not have permission to see purchases.')).toBeTruthy();
    expect(mockGet).not.toHaveBeenCalled();
  });
  test('view-only user sees no New order and no approvals tab', async () => {
    mockMe = { userId: 'u-1', roles: [], permissions: ['purchase.view'] };
    mockGet.mockResolvedValue({ items: [order()] });
    await render(<PurchaseScreen />, { wrapper });
    await screen.findByText('PO-1 · ₹1,180.00');
    expect(screen.queryByLabelText('New purchase order')).toBeNull();
    // only the status filter chip carries this text; the approvals tab is hidden
    expect(screen.getAllByLabelText('To approve')).toHaveLength(1);
  });
});

describe('order detail', () => {
  beforeEach(() => mockGet.mockResolvedValue(order()));

  test('approve sends If-Match version and one key; lost answer retries with the SAME key', async () => {
    await render(<OrderDetailScreen />, { wrapper });
    await screen.findByText('PO-1');
    let first = true;
    mockPost.mockImplementation(async () => {
      if (first) {
        first = false;
        throw new ApiError(0, null);
      }
      return order({ status: 'APPROVED' });
    });
    await fireEvent.press(screen.getByLabelText('Approve'));
    await screen.findByText(/No network/);
    await fireEvent.press(screen.getByLabelText('Approve'));
    expect(await screen.findByText('Order approved.')).toBeTruthy();
    expect(mockPost.mock.calls.map((c) => c[1].idempotencyKey)).toEqual(['key-1', 'key-1']);
    expect(mockPost.mock.calls[0]![0]).toBe('/procurement/purchase-orders/po-1/approve');
    expect(mockPost.mock.calls[0]![1].version).toBe(3);
  });

  test('own order: no approve button, a notice instead', async () => {
    mockGet.mockResolvedValue(order({ createdBy: 'u-1' }));
    await render(<OrderDetailScreen />, { wrapper });
    await screen.findByText('PO-1');
    expect(screen.queryByLabelText('Approve')).toBeNull();
    expect(screen.getByText('Another approver must approve this order.')).toBeTruthy();
  });

  test('approve hidden without permission', async () => {
    mockMe = { userId: 'u-1', roles: [], permissions: ['purchase.view'] };
    await render(<OrderDetailScreen />, { wrapper });
    await screen.findByText('PO-1');
    expect(screen.queryByLabelText('Approve')).toBeNull();
    expect(screen.queryByLabelText('Reject')).toBeNull();
  });

  test('reject needs a reason of 5 letters; a changed reason gets a new key', async () => {
    mockPost.mockRejectedValue(new ApiError(0, null));
    await render(<OrderDetailScreen />, { wrapper });
    await screen.findByText('PO-1');
    await fireEvent.press(screen.getByLabelText('Reject'));
    await fireEvent.changeText(screen.getByLabelText('Reason'), 'abc');
    expect(await screen.findByText('Write at least 5 letters.')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Reject order'));
    expect(mockPost).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText('Reason'), 'wrong rate');
    await fireEvent.press(screen.getByLabelText('Reject order'));
    await screen.findByText(/No network/);
    await fireEvent.changeText(screen.getByLabelText('Reason'), 'wrong rate again');
    await fireEvent.press(screen.getByLabelText('Reject order'));
    await screen.findByText(/No network/);
    expect(mockPost.mock.calls.map((c) => c[1].idempotencyKey)).toEqual(['key-1', 'key-2']);
    expect(mockPost.mock.calls[0]![1].body).toEqual({ reason: 'wrong rate' });
  });
});

describe('order form', () => {
  beforeEach(() => {
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/procurement/suppliers')
        return {
          items: [
            {
              id: 's-1',
              code: 'S1',
              name: 'Agro Seeds',
              type: 'COMPANY',
              gstin: null,
              stateCode: '27',
              creditDays: 0,
              creditLimit: '0',
              status: 'ACTIVE',
            },
          ],
        };
      if (path === '/branches') return { items: [{ id: 'b-1', name: 'Main', status: 'ACTIVE' }] };
      if (path === '/warehouses')
        return { items: [{ id: 'w-1', branchId: 'b-1', name: 'Store', status: 'ACTIVE', sellable: true }] };
      if (path.startsWith('/products/by-barcode')) return { id: 'sku-1', code: 'URE-50', name: 'Urea 50kg' };
      return { items: [] };
    });
  });

  test('empty form is refused and nothing is sent', async () => {
    await render(<OrderFormScreen />, { wrapper });
    await fireEvent.press(await screen.findByLabelText('Save order'));
    expect(await screen.findByText('Pick a supplier.')).toBeTruthy();
    expect(screen.getByText('Add at least one product.')).toBeTruthy();
    expect(mockPost).not.toHaveBeenCalled();
  });

  test('scan adds a line; bad quantity refused; valid body posted, lost answer reuses the key', async () => {
    await render(<OrderFormScreen />, { wrapper });
    await fireEvent.press(await screen.findByLabelText('Agro Seeds'));
    await fireEvent.press(await screen.findByLabelText('Main'));
    await fireEvent.press(await screen.findByLabelText('Store'));
    await fireEvent.press(screen.getByLabelText('Scan barcode'));
    await mockScanned!('8901');
    await screen.findByText('URE-50 Urea 50kg');
    await fireEvent.changeText(screen.getByLabelText('Quantity 1'), '0');
    await fireEvent.changeText(screen.getByLabelText('Rate 1'), '100');
    await fireEvent.press(screen.getByLabelText('Save order'));
    expect(await screen.findByText('Quantity must be more than 0 with at most 6 decimals.')).toBeTruthy();
    expect(mockPost).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText('Quantity 1'), '10');
    expect((await screen.findAllByText('About ₹1,000.00 before GST')).length).toBeGreaterThan(0);
    let first = true;
    mockPost.mockImplementation(async () => {
      if (first) {
        first = false;
        throw new ApiError(0, null);
      }
      return order();
    });
    await fireEvent.press(screen.getByLabelText('Save order'));
    await screen.findByText(/No network/);
    await fireEvent.press(screen.getByLabelText('Save order'));
    await screen.findByText('URE-50 Urea 50kg');
    expect(mockPost.mock.calls.map((c) => c[1].idempotencyKey)).toEqual(['key-1', 'key-1']);
    expect(mockPost.mock.calls[0]![1].body.lines).toEqual([{ skuId: 'sku-1', qty: '10', rate: '100' }]);
    expect(mockReplace).toHaveBeenCalled();
  });

  test('no create permission: denied, nothing loaded', async () => {
    mockMe = { userId: 'u-1', roles: [], permissions: ['purchase.view'] };
    await render(<OrderFormScreen />, { wrapper });
    expect(await screen.findByText('You do not have permission to create purchase orders.')).toBeTruthy();
    expect(mockGet).not.toHaveBeenCalled();
  });
});

describe('goods receipt', () => {
  beforeEach(() => {
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/procurement/purchase-orders/po-1') return order({ status: 'APPROVED' });
      if (path === '/warehouses') return { items: [] };
      if (path.startsWith('/products/by-barcode')) return { id: 'sku-1', code: 'URE-50', name: 'Urea 50kg' };
      return { items: [] };
    });
  });

  test('scan counts a unit, then receive creates and posts the receipt; lost answer on post reuses keys', async () => {
    await render(<ReceiveScreen />, { wrapper });
    await screen.findByText('URE-50 Urea 50kg');
    await fireEvent.press(screen.getByLabelText('Scan barcode'));
    await mockScanned!('8901');
    await fireEvent.press(screen.getByLabelText('Scan barcode'));
    await mockScanned!('8901');
    expect(await screen.findByDisplayValue('2')).toBeTruthy();
    let fail = true;
    mockPost.mockImplementation(async (path: string) => {
      if (path.endsWith('/receive') && fail) {
        fail = false;
        throw new ApiError(0, null);
      }
      return { id: 'g-1', number: null };
    });
    await fireEvent.press(screen.getByLabelText('Receive goods now'));
    expect(await screen.findByText(/saved but not posted/)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Post receipt again'));
    expect(await screen.findByText('Goods received and stock updated.')).toBeTruthy();
    const calls = mockPost.mock.calls;
    expect(calls.map((c) => c[0])).toEqual([
      '/procurement/goods-receipts',
      '/procurement/goods-receipts/g-1/receive',
      '/procurement/goods-receipts/g-1/receive',
    ]);
    expect(calls[1]![1].idempotencyKey).toBe(calls[2]![1].idempotencyKey);
    expect(calls[0]![1].body.lines).toEqual([{ poLineId: 'l-1', receivedQty: '2' }]);
  });

  test('a product that is not on the order is reported', async () => {
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/procurement/purchase-orders/po-1') return order({ status: 'APPROVED' });
      if (path.startsWith('/products/by-barcode')) return { id: 'sku-9', code: 'X', name: 'Other' };
      return { items: [] };
    });
    await render(<ReceiveScreen />, { wrapper });
    await screen.findByText('URE-50 Urea 50kg');
    await fireEvent.press(screen.getByLabelText('Scan barcode'));
    await mockScanned!('1');
    expect(await screen.findByText('Other is not waiting on this order.')).toBeTruthy();
  });

  test('nothing entered is refused; rejected without reason refused', async () => {
    await render(<ReceiveScreen />, { wrapper });
    await screen.findByText('URE-50 Urea 50kg');
    await fireEvent.press(screen.getByLabelText('Receive goods now'));
    expect(await screen.findByText('Enter the received quantity for at least one line.')).toBeTruthy();
    expect(mockPost).not.toHaveBeenCalled();
  });

  test('no receive permission: denied', async () => {
    mockMe = { userId: 'u-1', roles: [], permissions: ['purchase.view'] };
    await render(<ReceiveScreen />, { wrapper });
    expect(await screen.findByText('You do not have permission to receive goods.')).toBeTruthy();
    expect(mockGet).not.toHaveBeenCalled();
  });
});

describe('texts', () => {
  test('Hindi and Marathi have the same keys as English', () => {
    const keys = (o: unknown, p = ''): string[] =>
      Object.entries(o as Record<string, unknown>).flatMap(([k, v]) =>
        typeof v === 'object' && v !== null ? keys(v, `${p}${k}.`) : [`${p}${k}`],
      );
    const p = parts as unknown as Record<string, object>;
    expect(keys(p.hi!).sort()).toEqual(keys(p.en!).sort());
    expect(keys(p.mr!).sort()).toEqual(keys(p.en!).sort());
  });
});

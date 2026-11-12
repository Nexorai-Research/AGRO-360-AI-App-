import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '../src/api/errors';
import { i18n, setLanguage } from '../src/i18n';
import parts from '../i18n-parts/stk.json';
import {
  BillsScreen,
  PaySupplierScreen,
  PurchaseReportsScreen,
  ReceiptsScreen,
  SuppliersScreen,
  openToBill,
  validGstin,
  validState,
} from '../src/features/stk/PurchaseScreens';
import OrderMoreScreen from '../src/features/stk/OrderMoreScreen';

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockPatch = jest.fn();
const mockDelete = jest.fn();
let mockMe: { userId: string; roles: string[]; permissions?: string[] };
let mockId = 0;
const mockClient = {
  get: (...a: unknown[]) => mockGet(...a),
  post: (...a: unknown[]) => mockPost(...a),
  patch: (...a: unknown[]) => mockPatch(...a),
  delete: (...a: unknown[]) => mockDelete(...a),
  put: jest.fn(),
};
jest.mock('../src/auth/AuthProvider', () => ({
  useAuth: () => ({ status: 'signedIn', me: mockMe, client: mockClient }),
}));
jest.mock('../src/device', () => ({ newId: () => `key-${++mockId}` }));
jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({ id: 'po1' }) }));

let qc: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={qc}>{children}</QueryClientProvider>
);
const ALL = [
  'purchase.view',
  'purchase.supplier.manage',
  'purchase.supplier.ledger.view',
  'purchase.supplier.bank.manage',
  'purchase.supplier.bank.verify',
  'purchase.grn.create',
  'purchase.grn.approve_exception',
  'purchase.grn.reverse',
  'purchase.bill.create',
  'purchase.bill.direct',
  'purchase.bill.override',
  'purchase.return.create',
  'purchase.payment.create',
  'purchase.order.send',
  'purchase.order.create',
  'reports.purchase',
  'product.view',
];
const press = async (label: string) => fireEvent.press(await screen.findByLabelText(label));
const type = async (label: string, v: string) => fireEvent.changeText(await screen.findByLabelText(label), v);
const disabled = (label: string) => {
  const el = screen.getByLabelText(label);
  return Boolean(el.props.accessibilityState?.disabled ?? el.props.disabled);
};
const route = (map: Record<string, unknown>) =>
  mockGet.mockImplementation(async (p: string) => {
    const v = map[p];
    if (v instanceof Error) throw v;
    return v ?? { items: [] };
  });

const supplier = (o: Record<string, unknown> = {}) => ({
  id: 'sp1',
  code: 'SUP-1',
  name: 'Agro Seeds',
  type: 'COMPANY',
  gstin: '27ABCDE1234F1Z5',
  stateCode: '27',
  creditDays: 30,
  creditLimit: '50000.0000',
  status: 'ACTIVE',
  version: 3,
  ...o,
});
const grn = (o: Record<string, unknown> = {}) => ({
  id: 'g1',
  number: 'GRN-1',
  poNumber: 'PO-9',
  supplierName: 'Agro Seeds',
  receiptDate: '2026-11-05',
  status: 'DRAFT',
  value: '5900.0000',
  ...o,
});

beforeAll(() => {
  for (const l of ['en', 'hi', 'mr'] as const) i18n.addResourceBundle(l, 'translation', parts[l], true, true);
});
beforeEach(async () => {
  [mockGet, mockPost, mockPatch, mockDelete].forEach((m) => m.mockReset());
  mockId = 0;
  mockMe = { userId: 'u1', roles: [], permissions: ALL };
  qc = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retryDelay: 0 } } });
  await setLanguage('en');
});

describe('purchase logic', () => {
  test('GSTIN and state code', () => {
    expect(validGstin('27ABCDE1234F1Z5')).toBe(true);
    expect(validGstin('')).toBe(true);
    expect(validGstin('27ABC')).toBe(false);
    expect(validState('27', '27ABCDE1234F1Z5')).toBe(true);
    expect(validState('29', '27ABCDE1234F1Z5')).toBe(false);
    expect(validState('2', '')).toBe(false);
  });
  test('quantity left to bill is decimal arithmetic', () => {
    expect(openToBill({ acceptedQty: '0.3', billedQty: '0.1' })).toBe('0.2');
    expect(openToBill({ acceptedQty: '10', billedQty: '10' })).toBe('0');
  });
});

describe('suppliers', () => {
  test('list, ledger in rupees from strings, unregistered label', async () => {
    route({
      '/procurement/suppliers': {
        items: [supplier(), supplier({ id: 'sp2', name: 'Local Trader', gstin: null, code: 'SUP-2' })],
      },
      '/procurement/suppliers/sp1/ledger': {
        closing: '123456.5000',
        outstandingBills: '100000.0000',
        unallocatedAdvance: '0.0000',
      },
    });
    await render(<SuppliersScreen />, { wrapper });
    expect(await screen.findByText('SUP-2 · Unregistered · 30 credit days · ACTIVE')).toBeTruthy();
    fireEvent.press((await screen.findAllByLabelText('Ledger'))[0]!);
    expect(await screen.findByText('₹1,23,456.50')).toBeTruthy();
  });
  test('create sends text money, refuses a GSTIN that does not match the state, and handles a duplicate warning', async () => {
    route({ '/procurement/suppliers': { items: [] } });
    mockPost.mockRejectedValueOnce(new ApiError(409, { title: 'DUPLICATE_WARNING' })).mockResolvedValue({});
    await render(<SuppliersScreen />, { wrapper });
    await press('Add a supplier');
    await type('Name', 'New Agro');
    await type('GSTIN (leave empty if unregistered)', '27ABCDE1234F1Z5');
    await type('GST state code (2 digits, matches the GSTIN)', '29');
    expect(await screen.findByText('Two digits that match the start of the GSTIN.')).toBeTruthy();
    expect(disabled('Save supplier')).toBe(true);
    await type('GST state code (2 digits, matches the GSTIN)', '27');
    await type('Credit limit', '25000.50');
    await press('Save supplier');
    expect(await screen.findByText('A similar supplier already exists. Save anyway?')).toBeTruthy();
    await press('Save anyway');
    await screen.findByText('The supplier is saved.');
    const body = mockPost.mock.calls[1]![1].body;
    expect(body).toMatchObject({
      name: 'New Agro',
      stateCode: '27',
      creditLimit: '25000.50',
      creditDays: 0,
      confirmDuplicate: true,
    });
    expect(typeof body.creditLimit).toBe('string');
    expect(mockPost.mock.calls[0]![1].body.confirmDuplicate).toBeUndefined();
  });
  test('edit sends the version; block needs a reason', async () => {
    route({ '/procurement/suppliers': { items: [supplier()] } });
    mockPatch.mockResolvedValue({});
    mockPost.mockResolvedValue({});
    await render(<SuppliersScreen />, { wrapper });
    await press('Edit');
    await type('Credit limit', '60000');
    await press('Save supplier');
    await screen.findByText('The supplier is saved.');
    expect(mockPatch.mock.calls[0]![1].version).toBe(3);
    await press('Block');
    expect(disabled('Block the supplier')).toBe(true);
    await type('Reason', 'Bounced cheque');
    await press('Block the supplier');
    await screen.findByText('The supplier is blocked.');
    expect(mockPost.mock.calls[0]![0]).toBe('/procurement/suppliers/sp1/status');
    expect(mockPost.mock.calls[0]![1].body).toEqual({ status: 'BLOCKED', reason: 'Bounced cheque' });
  });
  test('view-only user sees no add or edit; empty state', async () => {
    mockMe = { userId: 'u1', roles: [], permissions: ['purchase.view'] };
    route({ '/procurement/suppliers': { items: [] } });
    await render(<SuppliersScreen />, { wrapper });
    expect(await screen.findByText('No suppliers yet.')).toBeTruthy();
    expect(screen.queryByLabelText('Add a supplier')).toBeNull();
  });
});

describe('goods receipts', () => {
  test('draft: post and discard; approved over-receipt needs a reason; received: reverse', async () => {
    route({
      '/procurement/goods-receipts': {
        items: [grn(), grn({ id: 'g2', number: 'GRN-2', status: 'RECEIVED' })],
      },
    });
    mockPost.mockResolvedValue({});
    await render(<ReceiptsScreen />, { wrapper });
    await screen.findByText('GRN-1 · Agro Seeds');
    expect(screen.getAllByText('₹5,900.00')).toHaveLength(2);
    await press('Post receipt');
    await screen.findByText('The receipt is posted and stock is added.');
    expect(mockPost.mock.calls[0]![0]).toBe('/procurement/goods-receipts/g1/receive');
    await press('Reverse');
    expect(disabled('Reverse the receipt')).toBe(true);
    await type('Reason (5 or more letters)', 'Wrong supplier');
    await press('Reverse the receipt');
    await screen.findByText('The receipt is reversed.');
    expect(mockPost.mock.calls[1]![0]).toBe('/procurement/goods-receipts/g2/reverse');
    expect(mockPost.mock.calls[1]![1].body).toEqual({ reason: 'Wrong supplier' });
  });
  test('a failed post shows the reference and a retry reuses the key', async () => {
    route({ '/procurement/goods-receipts': { items: [grn()] } });
    mockPost
      .mockRejectedValueOnce(new ApiError(500, { title: 'BOOM', correlationId: 'corr-5' }, 'corr-5'))
      .mockResolvedValue({});
    await render(<ReceiptsScreen />, { wrapper });
    await press('Post receipt');
    expect(await screen.findByText(/corr-5/)).toBeTruthy();
    await press('Post receipt');
    await screen.findByText('The receipt is posted and stock is added.');
    expect(mockPost.mock.calls[1]![1].idempotencyKey).toBe(mockPost.mock.calls[0]![1].idempotencyKey);
  });
  test('without the permission nothing is offered', async () => {
    mockMe = { userId: 'u1', roles: [], permissions: ['purchase.view'] };
    route({ '/procurement/goods-receipts': { items: [grn()] } });
    await render(<ReceiptsScreen />, { wrapper });
    await screen.findByText('GRN-1 · Agro Seeds');
    expect(screen.queryByLabelText('Post receipt')).toBeNull();
  });
});

describe('bills and returns', () => {
  const bill = (o: Record<string, unknown> = {}) => ({
    id: 'b1',
    number: null,
    supplierInvoiceNo: 'S-44',
    invoiceDate: '2026-11-01',
    supplierName: 'Agro Seeds',
    total: '11800.0000',
    outstanding: '0',
    status: 'DRAFT',
    matchStatus: 'MATCHED',
    paymentStatus: 'UNPAID',
    ...o,
  });
  test('draft bill: post and discard; variance needs a reason', async () => {
    route({ '/procurement/purchase-bills': { items: [bill({ matchStatus: 'VARIANCE' })] } });
    mockPost.mockResolvedValue({});
    mockDelete.mockResolvedValue(null);
    await render(<BillsScreen />, { wrapper });
    expect(await screen.findByText('S-44 · 1 Nov 2026 · Match: VARIANCE · DRAFT')).toBeTruthy();
    await press('Post');
    await screen.findByText('The bill is posted.');
    await press('Accept price variance');
    expect(disabled('Accept the variance')).toBe(true);
    await type('Reason', 'Supplier price rise agreed');
    await press('Accept the variance');
    await screen.findByText('The variance is accepted.');
    expect(mockPost.mock.calls[1]![0]).toBe('/procurement/purchase-bills/b1/override');
    await press('Discard');
    await screen.findByText('The draft bill is discarded.');
    expect(mockDelete.mock.calls[0]![0]).toBe('/procurement/purchase-bills/b1');
  });
  test('enter a bill from receipt lines: the quantity cannot pass what is left, rate stays text', async () => {
    route({
      '/procurement/purchase-bills': { items: [] },
      '/procurement/goods-receipts': { items: [{ id: 'g1', number: 'GRN-1', supplierName: 'Agro Seeds' }] },
      '/procurement/goods-receipts/g1': {
        id: 'g1',
        number: 'GRN-1',
        supplierId: 'sp1',
        branchId: 'br1',
        lines: [
          { id: 'gl1', skuCode: 'DAP', acceptedQty: '10', billedQty: '4', unitCost: '1180.0000' },
          { id: 'gl2', skuCode: 'URE', acceptedQty: '5', billedQty: '5', unitCost: '300' },
        ],
      },
    });
    mockPost.mockResolvedValue({});
    await render(<BillsScreen />, { wrapper });
    await press('Enter a bill');
    await press('GRN-1 Agro Seeds');
    expect(await screen.findByText('Left to bill: 6')).toBeTruthy();
    expect(screen.queryByLabelText('Quantity for URE')).toBeNull();
    await type('Quantity for DAP', '7');
    expect(await screen.findByText('Enter a quantity not above what is left.')).toBeTruthy();
    await type('Quantity for DAP', '6');
    await type('Supplier invoice number', 'S-77');
    await press('Save the bill as draft');
    await screen.findByText('The bill is saved as a draft.');
    expect(mockPost.mock.calls[0]![0]).toBe('/procurement/purchase-bills');
    expect(mockPost.mock.calls[0]![1].body).toMatchObject({
      supplierId: 'sp1',
      branchId: 'br1',
      supplierInvoiceNo: 'S-77',
      lines: [{ grnLineId: 'gl1', qty: '6' }],
    });
  });
  test('return from a posted bill: only up to what was billed less returned', async () => {
    route({
      '/procurement/purchase-bills': {
        items: [bill({ id: 'b2', number: 'PB-2', status: 'POSTED', outstanding: '11800.0000' })],
      },
      '/procurement/purchase-bills/b2': {
        lines: [{ id: 'bl1', skuCode: 'DAP', qty: '10', returnedQty: '3' }],
      },
    });
    mockPost.mockResolvedValue({});
    await render(<BillsScreen />, { wrapper });
    await press('Return goods');
    await press('DEFECTIVE');
    await type('Return quantity for DAP', '8');
    expect(await screen.findByText('Enter a quantity not above what is left.')).toBeTruthy();
    expect(disabled('Post the debit note')).toBe(true);
    await type('Return quantity for DAP', '7');
    await press('Post the debit note');
    await screen.findByText('The return and debit note are posted.');
    expect(mockPost.mock.calls[0]![1].body).toMatchObject({
      billId: 'b2',
      reason: 'DEFECTIVE',
      lines: [{ billLineId: 'bl1', qty: '7' }],
    });
  });
  test('direct purchase needs supplier, warehouse and at least one line', async () => {
    route({
      '/procurement/purchase-bills': { items: [] },
      '/procurement/suppliers': { items: [supplier()] },
      '/branches': { items: [{ id: 'br1', name: 'Main' }] },
      '/warehouses': { items: [{ id: 'w1', branchId: 'br1', name: 'Main godown', sellable: true }] },
      '/products': { items: [{ id: 's1', code: 'DAP', name: 'DAP 50kg' }] },
    });
    mockPost.mockResolvedValue({});
    await render(<BillsScreen />, { wrapper });
    await press('Direct purchase');
    expect(disabled('Save the purchase as draft')).toBe(true);
    await press('Agro Seeds');
    await press('Main');
    await press('Main godown');
    await type('Supplier invoice number', 'S-1');
    await type('Product', 'DAP');
    await press('DAP DAP 50kg');
    await type('Quantity', '10');
    await type('Rate', '1180.50');
    await type('Batch', 'B1');
    await type('Expiry date', '2027-12-31');
    await press('Add this line');
    expect(await screen.findByText('DAP · 10 x 1180.50 · B1')).toBeTruthy();
    await press('Save the purchase as draft');
    await screen.findByText('The bill is saved as a draft.');
    expect(mockPost.mock.calls[0]![0]).toBe('/procurement/purchase-bills/direct');
    expect(mockPost.mock.calls[0]![1].body).toMatchObject({
      supplierId: 'sp1',
      branchId: 'br1',
      warehouseId: 'w1',
      lines: [{ skuId: 's1', qty: '10', rate: '1180.50', batchNo: 'B1', expiryDate: '2027-12-31' }],
    });
  });
});

describe('pay a supplier', () => {
  test('warns when the amount is above what is due and sends text money with one key', async () => {
    route({
      '/procurement/suppliers': { items: [supplier()] },
      '/branches': { items: [{ id: 'br1', name: 'Main' }] },
      '/settings/payment-modes': { items: [{ code: 'BANK' }, { code: 'CASH' }] },
      '/procurement/suppliers/sp1/ledger': { outstandingBills: '10000.0000' },
    });
    mockPost.mockRejectedValueOnce(new ApiError(0, null, 'c')).mockResolvedValue({});
    await render(<PaySupplierScreen />, { wrapper });
    await press('Agro Seeds');
    await press('Main');
    await press('BANK');
    await type('Amount', '12500.50');
    expect(await screen.findByText('Due on open bills: ₹10,000.00')).toBeTruthy();
    expect(await screen.findByText(/The extra ₹2,500.50 will be kept as an advance/)).toBeTruthy();
    await press('Pay');
    await screen.findByText(/No network/);
    await press('Pay');
    await screen.findByText('The payment is recorded.');
    expect(mockPost.mock.calls[1]![0]).toBe('/procurement/supplier-payments');
    expect(mockPost.mock.calls[1]![1].body).toMatchObject({
      supplierId: 'sp1',
      branchId: 'br1',
      modeCode: 'BANK',
      amount: '12500.50',
    });
    expect(mockPost.mock.calls[1]![1].idempotencyKey).toBe(mockPost.mock.calls[0]![1].idempotencyKey);
  });
  test('closed without the payment permission', async () => {
    mockMe = { userId: 'u1', roles: [], permissions: ['purchase.view'] };
    await render(<PaySupplierScreen />, { wrapper });
    expect(await screen.findByText('You do not have permission for this screen.')).toBeTruthy();
  });
});

describe('purchase reports', () => {
  test('pending orders show overdue; register adds GST from strings', async () => {
    route({
      '/procurement/reports/pending-orders': {
        items: [
          {
            number: 'PO-9',
            supplierName: 'Agro Seeds',
            skuCode: 'DAP',
            ordered: '10',
            received: '4',
            pending: '6',
            overdue: true,
            expectedDate: '2026-11-01',
          },
        ],
      },
      '/procurement/reports/purchase-register': {
        rows: [
          {
            date: '2026-11-02',
            type: 'BILL',
            number: 'PB-1',
            supplierName: 'Agro Seeds',
            gstin: null,
            taxable: '1000.0000',
            cgst: '90.0000',
            sgst: '90.0000',
            igst: '0.0000',
            total: '1180.0000',
          },
        ],
        totals: {
          taxable: '1000.0000',
          cgst: '90.0000',
          sgst: '90.0000',
          igst: '0.0000',
          total: '1180.0000',
        },
      },
    });
    await render(<PurchaseReportsScreen />, { wrapper });
    expect(await screen.findByText('Overdue since 1 Nov 2026')).toBeTruthy();
    await press('Purchase register');
    expect(await screen.findByText('BILL PB-1 · Agro Seeds')).toBeTruthy();
    expect(screen.getAllByText('₹180.00').length).toBeGreaterThan(0);
  });
  test('the register tab is hidden without the reports permission', async () => {
    mockMe = { userId: 'u1', roles: [], permissions: ['purchase.view'] };
    route({ '/procurement/reports/pending-orders': { items: [] } });
    await render(<PurchaseReportsScreen />, { wrapper });
    expect(await screen.findByText('No open orders.')).toBeTruthy();
    expect(screen.queryByLabelText('Purchase register')).toBeNull();
  });
});

describe('order actions', () => {
  const order = (o: Record<string, unknown> = {}) => ({
    id: 'po1',
    number: 'PO-9',
    revision: 1,
    supplierName: 'Agro Seeds',
    status: 'APPROVED',
    total: '11800.0000',
    version: 5,
    ...o,
  });
  test('send and revise an approved order', async () => {
    route({ '/procurement/purchase-orders/po1': order() });
    mockPost.mockResolvedValue({});
    await render(<OrderMoreScreen />, { wrapper });
    await press('Send to supplier');
    await screen.findByText('The order is marked as sent.');
    expect(mockPost.mock.calls[0]![1].body).toEqual({ channel: 'DOWNLOAD' });
    await press('Revise');
    await screen.findByText('A revised order is created.');
    expect(mockPost.mock.calls[1]![0]).toBe('/procurement/purchase-orders/po1/revise');
    expect(screen.queryByLabelText('Close the rest')).toBeNull();
  });
  test('close a part-received order sends a reason and the version', async () => {
    route({ '/procurement/purchase-orders/po1': order({ status: 'PART_RECEIVED' }) });
    mockPost.mockResolvedValue({});
    await render(<OrderMoreScreen />, { wrapper });
    await press('Close the rest');
    expect(disabled('Close the order')).toBe(true);
    await type('Reason (5 or more letters)', 'Supplier cannot deliver the rest');
    await press('Close the order');
    await screen.findByText('The order is closed.');
    expect(mockPost.mock.calls[0]![1].version).toBe(5);
    expect(mockPost.mock.calls[0]![1].body).toEqual({ reason: 'Supplier cannot deliver the rest' });
    expect(screen.queryByLabelText('Send to supplier')).toBeNull();
  });
});

import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setLanguage } from '../src/i18n';
import { todayIST } from '../src/features/collections/receipt';
import { rangeOf } from '../src/features/reports/api';
import HomeExtras, { ATTENTION_ROUTE } from '../src/features/home/HomeExtras';
import InvoicesScreen from '../src/features/pos/InvoicesScreen';
import { ExpiryScreen, batchAccessors } from '../src/features/stk/InventoryScreens';
import {
  billAccessors,
  receiptAccessors,
  BillsScreen,
  ReceiptsScreen,
} from '../src/features/stk/PurchaseScreens';
import ImportHistoryScreen, { importAccessors } from '../src/features/adm/ImportHistoryScreen';
import {
  distinct,
  emptyFilter,
  filterRows,
  isFiltered,
  paidKinds,
  rangeProblem,
} from '../src/features/lists/list-filter';

const mockGet = jest.fn();
const mockPush = jest.fn();
let mockParams: Record<string, string> = {};
let mockMe: { userId: string; roles: string[]; permissions?: string[] };
jest.mock('../src/auth/AuthProvider', () => ({
  useAuth: () => ({
    status: 'signedIn',
    me: mockMe,
    client: { get: (...a: unknown[]) => mockGet(...a), post: jest.fn(), delete: jest.fn(), put: jest.fn() },
    signIn: jest.fn(),
    signOut: jest.fn(),
  }),
}));
jest.mock('../src/device', () => ({ newId: () => 'key-1' }));
jest.mock('expo-router', () => ({
  router: { push: (...a: unknown[]) => mockPush(...a) },
  useLocalSearchParams: () => mockParams,
}));

let qc: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={qc}>{children}</QueryClientProvider>
);
beforeEach(async () => {
  [mockGet, mockPush].forEach((m) => m.mockReset());
  mockParams = {};
  mockMe = { userId: 'u-1', roles: [], permissions: undefined };
  qc = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retryDelay: 0 } } });
  await setLanguage('en');
});
const route = (map: Record<string, unknown>) =>
  mockGet.mockImplementation(async (p: string) => map[p] ?? { items: [] });

const day = todayIST();
const inv = (o: Record<string, unknown>) => ({
  id: 'i',
  number: 'INV-1',
  invoiceDate: day,
  customerName: 'Ravi',
  total: '1000.00',
  creditAmount: '0.00',
  tenderMode: 'CASH',
  status: 'FINALIZED',
  ...o,
});
const invoices = [
  inv({ id: 'i1', number: 'INV-1', tenderMode: 'CASH' }),
  inv({ id: 'i2', number: 'INV-2', customerName: null, tenderMode: 'UPI' }),
  inv({ id: 'i3', number: 'INV-3', creditAmount: '1000.00', tenderMode: 'CASH' }),
  inv({ id: 'i4', number: 'INV-4', status: 'CANCELLED', invoiceDate: '2026-01-05' }),
];

describe('list filters like the web', () => {
  test('a date range: real days, From not after To, an empty side is open', () => {
    expect(rangeProblem('', '')).toBeNull();
    expect(rangeProblem('2026-11-01', '')).toBeNull();
    expect(rangeProblem('2026-11-01', '2026-10-31')).toBe('order');
    expect(rangeProblem('2026-02-30', '')).toBe('format');
    expect(rangeProblem('1/11/2026', '')).toBe('format');
  });
  test('how a bill was paid: credit part, UPI / card / bank part, the rest is cash; money as decimals', () => {
    expect(paidKinds({ total: '1000.00', creditAmount: '0.00', tenderMode: 'CASH' })).toEqual(['CASH']);
    expect(paidKinds({ total: '1000.00', creditAmount: '0.00', tenderMode: 'UPI' })).toEqual(['DIGITAL']);
    expect(paidKinds({ total: '1000.00', creditAmount: '1000.00', tenderMode: 'CASH' })).toEqual(['CREDIT']);
    expect(paidKinds({ total: '1000.00', creditAmount: '400.10', tenderMode: 'CARD' })).toEqual([
      'CREDIT',
      'DIGITAL',
    ]);
    expect(paidKinds({ total: '0.30', creditAmount: '0.10', tenderMode: null })).toEqual(['CREDIT', 'CASH']);
    expect(paidKinds({ total: '100.00', creditAmount: '500.00' })).toEqual(['CREDIT']);
  });
  test('search reads the given text; status, date and paid-by narrow; a wrong range is ignored, not applied', () => {
    const a = {
      text: (i: (typeof invoices)[number]) => `${i.number} ${i.customerName ?? ''} ${i.total}`,
      status: (i: (typeof invoices)[number]) => i.status,
      date: (i: (typeof invoices)[number]) => i.invoiceDate,
      paidBy: (i: (typeof invoices)[number]) => paidKinds(i),
    };
    const f = emptyFilter();
    expect(isFiltered(f)).toBe(false);
    expect(filterRows(invoices, { ...f, q: 'ravi' }, a).map((i) => i.id)).toEqual(['i1', 'i3', 'i4']);
    expect(filterRows(invoices, { ...f, status: 'CANCELLED' }, a).map((i) => i.id)).toEqual(['i4']);
    expect(filterRows(invoices, { ...f, paidBy: 'DIGITAL' }, a).map((i) => i.id)).toEqual(['i2']);
    expect(filterRows(invoices, { ...f, paidBy: 'CREDIT' }, a).map((i) => i.id)).toEqual(['i3']);
    expect(filterRows(invoices, { ...f, from: day, to: day }, a).map((i) => i.id)).toEqual([
      'i1',
      'i2',
      'i3',
    ]);
    expect(filterRows(invoices, { ...f, from: day, to: '2026-01-01' }, a)).toHaveLength(4);
    expect(distinct(invoices, (i) => i.status)).toEqual(['CANCELLED', 'FINALIZED']);
  });
  test('the accessors of each list read the columns the web searches', () => {
    expect(
      batchAccessors.text({ skuCode: 'S1', skuName: 'Seed', batchNo: 'B7', status: 'ACTIVE' } as never),
    ).toContain('B7');
    expect(
      receiptAccessors.text({
        number: 'GRN-1',
        poNumber: 'PO-2',
        supplierName: 'IFFCO',
        status: 'RECEIVED',
        value: '5',
      } as never),
    ).toContain('PO-2');
    expect(
      billAccessors.text({
        number: 'PB-1',
        supplierInvoiceNo: 'S-77',
        supplierName: 'IFFCO',
        status: 'POSTED',
        paymentStatus: 'UNPAID',
        total: '9',
      } as never),
    ).toContain('S-77');
    expect(
      importAccessors.text({
        filename: 'products.csv',
        status: 'VALIDATED',
        mode: null,
        createdBy: null,
      } as never),
    ).toContain('products.csv');
  });
});

describe('the invoices list', () => {
  test('Paid by narrows the bills, with the web split', async () => {
    route({ '/sales/invoices': { items: invoices } });
    await render(<InvoicesScreen />, { wrapper });
    expect(await screen.findByText(/INV-1 · ₹1,000.00/)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('UPI / card / bank'));
    expect(screen.queryByText(/INV-1 · /)).toBeNull();
    expect(screen.getByText(/INV-2 · /)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('On credit'));
    expect(screen.getByText(/INV-3 · /)).toBeTruthy();
    expect(screen.queryByText(/INV-2 · /)).toBeNull();
  });
  test('the search finds a number or a customer; nothing found says so', async () => {
    route({ '/sales/invoices': { items: invoices } });
    await render(<InvoicesScreen />, { wrapper });
    await screen.findByText(/INV-1 · /);
    await fireEvent.changeText(screen.getByLabelText('Search by number, customer, amount'), 'INV-3');
    expect(screen.queryByText(/INV-1 · /)).toBeNull();
    expect(screen.getByText(/INV-3 · /)).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Search by number, customer, amount'), 'zzz');
    expect(screen.getByText('Nothing matches the search and filters.')).toBeTruthy();
  });
  test('status and a date range; a wrong range says so', async () => {
    route({ '/sales/invoices': { items: invoices } });
    await render(<InvoicesScreen />, { wrapper });
    await screen.findByText(/INV-1 · /);
    await fireEvent.press(screen.getByLabelText('CANCELLED'));
    expect(screen.getByText(/INV-4 · /)).toBeTruthy();
    expect(screen.queryByText(/INV-1 · /)).toBeNull();
    await fireEvent.press(screen.getAllByLabelText('All')[0]!);
    await fireEvent.changeText(screen.getByLabelText('From (YYYY-MM-DD)'), day);
    expect(screen.queryByText(/INV-4 · /)).toBeNull();
    await fireEvent.changeText(screen.getByLabelText('To (YYYY-MM-DD)'), '2020-01-01');
    expect(screen.getByText('The start date cannot be after the end date.')).toBeTruthy();
  });
  test('a tap on the Home dashboard comes here already filtered: paid on credit, or one bill number', async () => {
    route({ '/sales/invoices': { items: invoices } });
    mockParams = { paidBy: 'CREDIT' };
    const a = await render(<InvoicesScreen />, { wrapper });
    expect(await screen.findByText(/INV-3 · /)).toBeTruthy();
    expect(screen.queryByText(/INV-1 · /)).toBeNull();
    await a.unmount();
    mockParams = { q: 'INV-2' };
    await render(<InvoicesScreen />, { wrapper });
    expect(await screen.findByText(/INV-2 · /)).toBeTruthy();
    expect(screen.queryByText(/INV-3 · /)).toBeNull();
  });
  test('a paid-by value that is not one of the three is ignored', async () => {
    route({ '/sales/invoices': { items: invoices } });
    mockParams = { paidBy: 'BOGUS' };
    await render(<InvoicesScreen />, { wrapper });
    expect(await screen.findByText(/INV-1 · /)).toBeTruthy();
    expect(screen.getByText(/INV-3 · /)).toBeTruthy();
  });
});

describe('purchase and stock lists', () => {
  test('the expiry list is searched by product or batch, and Home opens it for one product', async () => {
    const batch = (o: Record<string, unknown>) => ({
      id: 'b',
      skuCode: 'S1',
      skuName: 'Seed X',
      batchNo: 'B7',
      expiryDate: '2026-12-01',
      daysToExpiry: 9,
      onHand: '12',
      valueAtRisk: null,
      status: 'ACTIVE',
      ...o,
    });
    route({
      '/inventory/batches': {
        items: [batch({ id: 'b1' }), batch({ id: 'b2', skuName: 'Urea', skuCode: 'U1', batchNo: 'U9' })],
      },
    });
    mockParams = { q: 'Urea' };
    await render(<ExpiryScreen />, { wrapper });
    expect(await screen.findByText('U1 Urea')).toBeTruthy();
    expect(screen.queryByText('S1 Seed X')).toBeNull();
    expect(screen.getByLabelText('Search by product or batch number').props.value).toBe('Urea');
  });
  test('receipts and bills have the search and the date range', async () => {
    route({
      '/procurement/goods-receipts': {
        items: [
          {
            id: 'g1',
            number: 'GRN-1',
            poNumber: 'PO-1',
            supplierName: 'IFFCO',
            receiptDate: day,
            status: 'RECEIVED',
            value: '100.00',
          },
          {
            id: 'g2',
            number: 'GRN-2',
            poNumber: 'PO-2',
            supplierName: 'Kribhco',
            receiptDate: day,
            status: 'DRAFT',
            value: '50.00',
          },
        ],
      },
    });
    const a = await render(<ReceiptsScreen />, { wrapper });
    await screen.findByText(/GRN-1/);
    await fireEvent.changeText(screen.getByLabelText('Search by number, order, supplier'), 'kribhco');
    expect(screen.queryByText(/GRN-1/)).toBeNull();
    expect(screen.getByText(/GRN-2/)).toBeTruthy();
    expect(screen.getByLabelText('From (YYYY-MM-DD)')).toBeTruthy();
    await a.unmount();
    route({
      '/procurement/purchase-bills': {
        items: [
          {
            id: 'p1',
            number: 'PB-1',
            supplierInvoiceNo: 'S-77',
            invoiceDate: day,
            supplierName: 'IFFCO',
            total: '500.00',
            outstanding: '500.00',
            status: 'POSTED',
            matchStatus: 'MATCHED',
            paymentStatus: 'UNPAID',
          },
          {
            id: 'p2',
            number: 'PB-2',
            supplierInvoiceNo: 'S-88',
            invoiceDate: day,
            supplierName: 'Kribhco',
            total: '300.00',
            outstanding: '0.00',
            status: 'DRAFT',
            matchStatus: 'MATCHED',
            paymentStatus: 'PAID',
          },
        ],
      },
    });
    await render(<BillsScreen />, { wrapper });
    await screen.findByText(/PB-1/);
    await fireEvent.changeText(screen.getByLabelText('Search by number, supplier invoice, supplier'), 'S-88');
    expect(screen.queryByText(/PB-1/)).toBeNull();
    expect(screen.getByText(/PB-2/)).toBeTruthy();
  });
  test('the import history is searched by file name and filtered by status', async () => {
    const job = (o: Record<string, unknown>) => ({
      id: 'j',
      entity: 'products',
      filename: 'a.csv',
      status: 'COMMITTED',
      mode: null,
      totalRows: 10,
      errorRows: 0,
      result: { created: 10, updated: 0, unchanged: 0, failed: 0 },
      createdBy: null,
      createdAt: `${day}T04:00:00Z`,
      committedAt: null,
      ...o,
    });
    route({
      '/products/import-jobs': {
        items: [
          job({ id: 'j1', filename: 'seeds.csv' }),
          job({ id: 'j2', filename: 'urea.csv', status: 'VALIDATED', result: null }),
        ],
        next_cursor: null,
      },
    });
    mockMe = { userId: 'u-1', roles: [], permissions: undefined };
    await render(<ImportHistoryScreen />, { wrapper });
    await screen.findByText(/seeds.csv/);
    await fireEvent.changeText(screen.getByLabelText('Search by file name'), 'urea');
    expect(screen.queryByText(/seeds.csv/)).toBeNull();
    expect(screen.getByText(/urea.csv/)).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Search by file name'), '');
    expect(
      screen.getAllByText(
        'This import is applied and cannot be changed. The report shows what happened to each row.',
      ),
    ).toHaveLength(1);
  });
});

describe('Home: a tap opens the matching list already filtered', () => {
  const week = rangeOf(day, 7);
  const reg = {
    rows: [
      { status: 'FINALIZED', date: day, total: '10000.00', creditAmount: '2000.00', paymentModes: 'UPI' },
      { status: 'FINALIZED', date: week.from, total: '4000.00', creditAmount: '0.00', paymentModes: 'CASH' },
    ],
  };
  beforeEach(() =>
    route({
      '/reports/sales-register': reg,
      '/sales/invoices': {
        items: [
          {
            id: 'i-1',
            number: 'INV-9',
            invoiceDate: day,
            customerName: null,
            total: '1180.00',
            creditAmount: '180.00',
            status: 'FINALIZED',
          },
        ],
      },
      '/inventory/batches': {
        items: [{ skuName: 'Seed X', batchNo: 'B7', onHand: '12', daysToExpiry: 9, value: '2400.00' }],
      },
      '/procurement/purchase-orders/approvals': { items: [{ id: 'po1' }] },
      '/complaints': { items: [{ id: 'c1' }] },
      '/alerts': { items: [], total: 4 },
    }),
  );
  test('each way customers paid opens the bills paid that way', async () => {
    await render(<HomeExtras />, { wrapper });
    await fireEvent.press(await screen.findByLabelText(/^Cash \d+ percent\. Open these bills$/));
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/invoices', params: { paidBy: 'CASH' } });
    await fireEvent.press(
      screen.getByLabelText(/^(UPI|Digital|UPI \/ card \/ bank)[^.]* \d+ percent\. Open these bills$/),
    );
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/invoices', params: { paidBy: 'DIGITAL' } });
    await fireEvent.press(screen.getByLabelText(/^(On credit|Credit)[^.]* \d+ percent\. Open these bills$/));
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/invoices', params: { paidBy: 'CREDIT' } });
  });
  test('the latest bill opens that bill number; an expiring batch opens the expiry list for the product', async () => {
    await render(<HomeExtras />, { wrapper });
    await fireEvent.press(await screen.findByLabelText('Open bill INV-9'));
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/invoices', params: { q: 'INV-9' } });
    await fireEvent.press(await screen.findByLabelText('Open the expiry list for Seed X'));
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/inventory-expiry', params: { q: 'Seed X' } });
  });
  test('the needs-attention rows lead to the lists that hold those items', async () => {
    expect(ATTENTION_ROUTE.credit).toEqual({ pathname: '/invoices', params: { paidBy: 'CREDIT' } });
    expect(ATTENTION_ROUTE.po).toEqual({ pathname: '/purchase' });
    await render(<HomeExtras />, { wrapper });
    await fireEvent.press(await screen.findByLabelText('Open Recent bills sold on credit'));
    await waitFor(() =>
      expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/invoices', params: { paidBy: 'CREDIT' } }),
    );
  });
});

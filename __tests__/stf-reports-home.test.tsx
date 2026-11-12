import type { ReactNode } from 'react';
import { Share } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '../src/api/errors';
import { i18n, setLanguage } from '../src/i18n';
import step4 from '../i18n-parts/step4.json';
import stf from '../i18n-parts/stf.json';
import MoreReportsScreen from '../src/features/reportsmore/MoreReportsScreen';
import HomeExtras from '../src/features/home/HomeExtras';
import { insightsFrom, validGoal, weeklyFrom, sharePct } from '../src/features/home/extras';
import { todayIST } from '../src/features/collections/receipt';
import { rangeOf } from '../src/features/reports/api';

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockShare = jest.fn();
let mockMe: { userId: string; roles: string[]; permissions?: string[] };
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
jest.mock('../src/device', () => ({ newId: () => 'key-x' }));

let qc: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={qc}>{children}</QueryClientProvider>
);

beforeAll(() => {
  for (const lang of ['en', 'hi', 'mr'] as const) {
    i18n.addResourceBundle(lang, 'translation', (step4 as Record<string, object>)[lang], true, true);
    i18n.addResourceBundle(lang, 'translation', (stf as Record<string, object>)[lang], true, true);
  }
});
beforeEach(async () => {
  [mockGet, mockPost, mockShare].forEach((m) => m.mockReset());
  mockMe = { userId: 'u-1', roles: [], permissions: undefined };
  qc = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retryDelay: 0 } } });
  await setLanguage('en');
  jest.spyOn(Share, 'share').mockImplementation((...a: unknown[]) => mockShare(...a));
});
afterEach(() => jest.restoreAllMocks());

function route(map: Record<string, unknown>) {
  mockGet.mockImplementation(async (path: string) => {
    const v = map[path];
    if (v instanceof Error) throw v;
    return v === undefined ? { items: [] } : v;
  });
}

describe('more reports', () => {
  const purchases = {
    groupBy: 'supplier',
    totals: { value: '250000.50', bills: 12 },
    previous: { value: '200000.00', changePct: '25.00' },
    rows: [
      {
        key: 's1',
        label: 'Kisan Agro',
        quantity: '100',
        value: '150000.50',
        tax: '7500.00',
        bills: 7,
        avgRate: '1500.00',
        sharePct: '60.00',
      },
    ],
    priceVariance: [
      {
        key: 'p1',
        label: 'Urea',
        minRate: '260.00',
        maxRate: '300.00',
        avgRate: '280.00',
        spreadPct: '15.38',
      },
    ],
  };

  test('purchase analysis in rupees from strings, with group and custom dates', async () => {
    route({
      '/reports/purchases/analysis': purchases,
      '/branches': {
        items: [
          { id: 'b-1', name: 'Main' },
          { id: 'b-2', name: 'East' },
        ],
      },
    });
    await render(<MoreReportsScreen />, { wrapper });
    expect(await screen.findByText('₹2,50,000.50')).toBeTruthy();
    expect(screen.getByText('Kisan Agro')).toBeTruthy();
    expect(screen.getByText('Compared with the period before: +25.00%')).toBeTruthy();
    expect(screen.getByText('Urea')).toBeTruthy();
    const first = mockGet.mock.calls.find((c) => c[0] === '/reports/purchases/analysis') as [
      string,
      { query: Record<string, unknown> },
    ];
    expect(first[1].query).toMatchObject({ groupBy: 'supplier', limit: 30 });
    await fireEvent.press(await screen.findByLabelText('East'));
    await waitFor(() => {
      const calls = mockGet.mock.calls.filter((c) => c[0] === '/reports/purchases/analysis');
      expect((calls.at(-1) as [string, { query: Record<string, unknown> }])[1].query.branchId).toBe('b-2');
    });
    await fireEvent.press(screen.getByLabelText('Brand'));
    await fireEvent.press(screen.getByLabelText('Own dates'));
    await fireEvent.changeText(screen.getByLabelText('From (YYYY-MM-DD)'), '2026-10-01');
    await fireEvent.changeText(screen.getByLabelText('To (YYYY-MM-DD)'), '2026-09-01');
    expect(await screen.findByText('The end date is before the start date.')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('To (YYYY-MM-DD)'), '2026-10-31');
    await waitFor(() => {
      const calls = mockGet.mock.calls.filter((c) => c[0] === '/reports/purchases/analysis');
      expect((calls.at(-1) as [string, { query: Record<string, unknown> }])[1].query).toMatchObject({
        from: '2026-10-01',
        to: '2026-10-31',
        groupBy: 'brand',
      });
    });
  });

  test('export asks the server for CSV text and opens the share sheet', async () => {
    route({ '/reports/purchases/analysis': purchases });
    mockShare.mockResolvedValue({});
    await render(<MoreReportsScreen />, { wrapper });
    await screen.findByText('Kisan Agro');
    mockGet.mockImplementation(async (_p: string, o: { query: Record<string, unknown>; as?: string }) =>
      o.query.format === 'csv' && o.as === 'text' ? 'Supplier,Value\nKisan,150000' : purchases,
    );
    await fireEvent.press(screen.getByLabelText('Share as CSV'));
    expect(await screen.findByText('Shared.')).toBeTruthy();
    expect(mockShare).toHaveBeenCalledWith({
      title: 'purchases.csv',
      message: 'Supplier,Value\nKisan,150000',
    });
  });

  test('export failure shows the reference', async () => {
    route({ '/reports/purchases/analysis': purchases });
    await render(<MoreReportsScreen />, { wrapper });
    await screen.findByText('Kisan Agro');
    mockGet.mockRejectedValue(new ApiError(500, { title: 'BOOM', correlationId: 'c-csv' }));
    await fireEvent.press(screen.getByLabelText('Share as CSV'));
    expect(await screen.findByText(/c-csv/)).toBeTruthy();
  });

  test('customers, staff, branches, seasons', async () => {
    mockMe = { userId: 'u-1', roles: [], permissions: ['reports.sales', 'reports.financial'] };
    route({
      '/reports/customers/analytics': {
        masked: true,
        summary: {
          customers: 10,
          newCustomers: 3,
          newSharePct: '30.00',
          returningCustomers: 7,
          avgBillsPerCustomer: '2.0',
          avgSpendPerCustomer: '5000.00',
          avgBillValue: '2500.00',
          walkInSales: '1000.00',
        },
        concentration: { top5SharePct: '40.00', top10SharePct: '80.00' },
        top: [
          {
            key: 'c1',
            label: 'Ram Lal',
            village: 'Rampur',
            spend: '25000.00',
            bills: 5,
            avgBill: '5000.00',
            lastPurchase: '2026-11-01',
          },
        ],
        villages: [{ key: 'v', label: 'Rampur', customers: 4, netSales: '30000.00', sharePct: '50.00' }],
        crops: [{ key: 'w', label: 'Wheat', netSales: '12000.00' }],
      },
      '/reports/staff/productivity': {
        rows: [
          {
            name: 'Sita',
            bills: 20,
            netSales: '40000.00',
            avgBill: '2000.00',
            discountPct: '1.50',
            returns: 1,
            voids: 0,
            shiftHours: '40',
            billsPerHour: '0.5',
          },
        ],
        notes: ['Shift hours come from the shift register.'],
      },
      '/reports/branches/comparison': {
        totals: {
          netSales: '900000.00',
          purchases: '500000.00',
          receivables: '120000.00',
          collections: '300000.00',
          expenses: '50000.00',
        },
        rows: [
          {
            branch: 'Main',
            rank: 1,
            netSales: '600000.00',
            bills: 300,
            marginPct: '18.00',
            purchases: '300000.00',
            receivables: '70000.00',
            overdue: '10000.00',
            collections: '200000.00',
            expenses: '30000.00',
          },
        ],
      },
      '/reports/seasonal': {
        seasonSettings: { assumption: true },
        seasons: [
          {
            name: 'Kharif',
            isCurrent: true,
            totals: [{ year: 2026, value: '100000.00' }],
            changePct: '-5.00',
            rows: [{ key: 'Seed', years: [{ year: 2026, value: '60000.00' }], changePct: null }],
          },
        ],
      },
    });
    await render(<MoreReportsScreen />, { wrapper });
    await fireEvent.press(await screen.findByLabelText('Customers'));
    expect(await screen.findByText('Ram Lal')).toBeTruthy();
    expect(screen.getByText('Customer names are hidden for your role.')).toBeTruthy();
    expect(screen.getAllByText('₹25,000.00').length).toBeGreaterThan(0);
    await fireEvent.press(screen.getByLabelText('Staff'));
    expect(await screen.findByText('Sita')).toBeTruthy();
    expect(screen.getByText('Shift hours come from the shift register.')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Branches'));
    expect(await screen.findByText('1. Main')).toBeTruthy();
    expect(screen.getByText('₹9,00,000.00')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Seasons'));
    expect(await screen.findByText('Kharif (now)')).toBeTruthy();
    expect(screen.getByText('Change on the year before: -5.00%')).toBeTruthy();
    // the branch comparison takes no branch filter
    const bc = mockGet.mock.calls.find((c) => c[0] === '/reports/branches/comparison') as [
      string,
      { query: Record<string, unknown> },
    ];
    expect(bc[1].query.branchId).toBeUndefined();
  });

  test('saved reports run under the user with a POST key', async () => {
    mockMe = { userId: 'u-1', roles: [], permissions: ['reports.sales'] };
    route({
      '/reports/customers/analytics': { nothing: true },
      '/reports/views': { items: [{ id: 'v-1', name: 'Top villages', dataset: 'sales' }] },
    });
    mockPost.mockResolvedValue({
      columns: [
        { key: 'village', label: 'Village' },
        { key: 'total', label: 'Total' },
      ],
      rows: [{ village: 'Rampur', total: '1200.00' }],
    });
    await render(<MoreReportsScreen />, { wrapper });
    expect(await screen.findByText('The server sent a report this app could not read.')).toBeTruthy();
    await fireEvent.press(await screen.findByLabelText('Saved reports'));
    await fireEvent.press(await screen.findByLabelText('Run'));
    expect(await screen.findByText('Rampur')).toBeTruthy();
    expect(mockPost).toHaveBeenCalledWith('/reports/views/v-1/run', { idempotencyKey: 'key-x' });
  });

  test('only reports the user may see are offered; denied; offline; Hindi', async () => {
    mockMe = { userId: 'u-1', roles: [], permissions: ['reports.purchase'] };
    route({ '/reports/purchases/analysis': purchases });
    const a = await render(<MoreReportsScreen />, { wrapper });
    await screen.findByText('Kisan Agro');
    expect(screen.queryByLabelText('Customers')).toBeNull();
    await a.unmount();

    mockMe = { userId: 'u-1', roles: [], permissions: ['sales.view'] };
    const b = await render(<MoreReportsScreen />, { wrapper });
    expect(await screen.findByText('You do not have permission to see these reports.')).toBeTruthy();
    await b.unmount();

    mockMe = { userId: 'u-1', roles: [], permissions: ['reports.purchase'] };
    route({ '/reports/purchases/analysis': new ApiError(0, null) });
    qc.clear();
    const c = await render(<MoreReportsScreen />, { wrapper });
    expect(
      await screen.findByText('No network. The report cannot be loaded now.', {}, { timeout: 3000 }),
    ).toBeTruthy();
    await c.unmount();

    await setLanguage('hi');
    route({ '/reports/purchases/analysis': { ...purchases, rows: [], priceVariance: [] } });
    qc.clear();
    await render(<MoreReportsScreen />, { wrapper });
    expect(await screen.findByText('इस अवधि में कोई खरीद नहीं।')).toBeTruthy();
  });
});

describe('home extras logic', () => {
  const today = '2026-11-12';
  const rows = [
    { status: 'FINALIZED', date: '2026-11-12', total: '1000.00', creditAmount: '0.00', paymentModes: 'CASH' },
    { status: 'FINALIZED', date: '2026-11-12', total: '500.50', creditAmount: '200.50', paymentModes: 'UPI' },
    { status: 'FINALIZED', date: '2026-11-10', total: '3000.00', creditAmount: '3000.00', paymentModes: '' },
    { status: 'CANCELLED', date: '2026-11-12', total: '9999.00', creditAmount: '0.00', paymentModes: 'CASH' },
    { status: 'FINALIZED', date: '2026-10-01', total: '7777.00', creditAmount: '0.00', paymentModes: 'CASH' },
  ];
  test('weekly totals and payment mix are exact decimals', () => {
    const w = weeklyFrom(rows, today);
    expect(w.days.map((d) => d.day)).toEqual([
      '2026-11-06',
      '2026-11-07',
      '2026-11-08',
      '2026-11-09',
      '2026-11-10',
      '2026-11-11',
      '2026-11-12',
    ]);
    expect(w.days[6]).toEqual({ day: '2026-11-12', total: '1500.50', count: 2 });
    expect(w.mix).toEqual({ cash: '1000.00', digital: '300.00', credit: '3200.50' });
    expect(w.total).toBe('4500.50');
    expect(w.bills).toBe(3);
    expect(sharePct(w.mix.credit, w.total)).toBe('71');
  });
  test('insights come from the same numbers', () => {
    const w = weeklyFrom(rows, today);
    const ids = insightsFrom(
      w,
      [{ skuName: 'Seed', batchNo: 'B1', onHand: '5', daysToExpiry: 10, value: '1000.00' }],
      2,
      (d) => d,
    ).map((i) => i.id);
    expect(ids).toEqual(expect.arrayContaining(['bestDay', 'creditShare', 'expiry', 'poWaiting']));
    expect(insightsFrom(undefined, [], null, (d) => d).map((i) => i.id)).toEqual(['noExpiry']);
  });
  test('goal limits', () => {
    expect(validGoal('25000')).toBe(true);
    expect(validGoal('999')).toBe(false);
    expect(validGoal('100000001')).toBe(false);
    expect(validGoal('12.5')).toBe(false);
  });
});

describe('home extras screen', () => {
  const day = todayIST();
  const reg = {
    rows: [
      { status: 'FINALIZED', date: day, total: '10000.00', creditAmount: '2000.00', paymentModes: 'UPI' },
      {
        status: 'FINALIZED',
        date: rangeOf(day, 3).from,
        total: '4000.00',
        creditAmount: '0.00',
        paymentModes: 'CASH',
      },
    ],
  };
  const all = () =>
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
        items: [
          { skuName: 'Seed X', batchNo: 'B7', onHand: '12', daysToExpiry: 9, value: '2400.00' },
          { skuName: 'Old', batchNo: 'B1', onHand: '0', daysToExpiry: 3, value: '0' },
        ],
      },
      '/procurement/purchase-orders/approvals': { items: [{ id: 'po1' }, { id: 'po2' }] },
      '/complaints': { items: [{ id: 'c1' }] },
      '/alerts': { items: [], total: 4 },
    });

  test('payment mix, latest bills, expiring, needs attention, insights and goal', async () => {
    all();
    await render(<HomeExtras />, { wrapper });
    expect(await screen.findByText('INV-9')).toBeTruthy();
    expect(screen.getByText('₹1,180.00')).toBeTruthy();
    expect(await screen.findByText('Seed X')).toBeTruthy();
    expect(screen.queryByText('Old')).toBeNull(); // nothing in stock, left out
    expect(screen.getByText('9 d')).toBeTruthy();
    expect(await screen.findByText('How customers paid (last 7 days)')).toBeTruthy();
    expect(await screen.findByLabelText('Purchase orders to approve: 2')).toBeTruthy();
    expect(await screen.findByLabelText('Stock alerts to review: 4')).toBeTruthy();
    expect(await screen.findByLabelText('Open customer complaints: 1')).toBeTruthy();
    expect(await screen.findByLabelText('Recent bills sold on credit: 1')).toBeTruthy();
    expect(await screen.findByText(/1 batches expire within 60 days/)).toBeTruthy();
    expect(await screen.findByText(/purchase orders are waiting/)).toBeTruthy();
  });

  test('a failing part shows its own error with a reference and the rest still works', async () => {
    all();
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/sales/invoices') throw new ApiError(500, { title: 'BOOM', correlationId: 'c-bills' });
      return path === '/reports/sales-register'
        ? reg
        : path === '/alerts'
          ? { items: [], total: 0 }
          : { items: [] };
    });
    await render(<HomeExtras />, { wrapper });
    expect(await screen.findByText(/c-bills/)).toBeTruthy();
    expect(await screen.findByText('How customers paid (last 7 days)')).toBeTruthy();
  });

  test('sections the user has no permission for are not asked for', async () => {
    mockMe = { userId: 'u-1', roles: [], permissions: ['inventory.view'] };
    all();
    await render(<HomeExtras />, { wrapper });
    expect(await screen.findByText('Seed X')).toBeTruthy();
    const paths = mockGet.mock.calls.map((c) => c[0]);
    expect(paths).toEqual(expect.arrayContaining(['/inventory/batches', '/alerts']));
    expect(paths).not.toContain('/sales/invoices');
    expect(paths).not.toContain('/reports/sales-register');
    expect(paths).not.toContain('/procurement/purchase-orders/approvals');
    expect(screen.queryByText('Latest bills')).toBeNull();
  });

  test('the sales goal is checked, saved on this phone per user, and shown', async () => {
    all();
    await render(<HomeExtras />, { wrapper });
    expect(await screen.findByText('₹10,000 of ₹25,000')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Change goal'));
    await fireEvent.changeText(screen.getByLabelText('Daily goal (rupees)'), '500');
    expect(await screen.findByText('The goal must be between 1,000 and 10,00,00,000.')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Daily goal (rupees)'), '5000');
    await fireEvent.press(screen.getByLabelText('Save'));
    expect(await screen.findByText('Goal reached today.')).toBeTruthy();
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('agro360.dailyGoal.u-1', '5000');
  });

  test('Marathi', async () => {
    await setLanguage('mr');
    all();
    await render(<HomeExtras />, { wrapper });
    expect(await screen.findByText('ताजी बिले')).toBeTruthy();
  });
});

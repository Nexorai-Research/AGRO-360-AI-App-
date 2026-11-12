import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '../src/api/errors';
import { i18n, setLanguage } from '../src/i18n';
import parts from '../i18n-parts/step4.json';
import ReportsScreen from '../src/features/reports/ReportsScreen';
import { rangeOf } from '../src/features/reports/api';
import AccountsScreen, { drCr } from '../src/features/accounts/AccountsScreen';
import ComplianceScreen from '../src/features/accounts/ComplianceScreen';
import { monthRange, previousMonth } from '../src/features/accounts/compliance-api';

const mockGet = jest.fn();
const mockPost = jest.fn();
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
  for (const lang of ['en', 'hi', 'mr'] as const)
    i18n.addResourceBundle(lang, 'translation', (parts as Record<string, object>)[lang], true, true);
});
beforeEach(async () => {
  [mockGet, mockPost].forEach((m) => m.mockReset());
  mockMe = { userId: 'u-1', roles: [], permissions: undefined };
  qc = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retryDelay: 0 } } });
  await setLanguage('en');
});

const sales = {
  from: '2026-10-13',
  to: '2026-11-11',
  groupBy: 'product',
  truncated: false,
  rows: [
    {
      key: 'k1',
      label: 'Urea 50kg',
      quantity: '120.000',
      netSales: '1234567.50',
      discount: '0.00',
      bills: 4,
      sharePct: '60.5',
      margin: null,
      marginPct: null,
    },
  ],
  totals: {
    quantity: '120.000',
    netSales: '2040000.00',
    discount: '10.00',
    bills: 40,
    avgBill: '51000.00',
    margin: null,
    marginPct: null,
  },
  previous: { from: 'a', to: 'b', netSales: '1', changePct: '-3.2' },
};

describe('helpers', () => {
  test('rangeOf, monthRange, previousMonth, drCr', () => {
    expect(rangeOf('2026-11-11', 7)).toEqual({ from: '2026-11-05', to: '2026-11-11' });
    expect(monthRange('2028-02')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
    expect(previousMonth('2026-01')).toBe('2025-12');
    expect(drCr('1234567.5')).toBe('₹12,34,567.50 Dr');
    expect(drCr('-100.00')).toBe('₹100.00 Cr');
  });
});

describe('reports', () => {
  test('sales: money from strings, previous change, bar share, group by sent to the server', async () => {
    mockGet.mockResolvedValue(sales);
    await render(<ReportsScreen />, { wrapper });
    expect(await screen.findByText('₹20,40,000.00')).toBeTruthy();
    expect(screen.getByText('₹12,34,567.50')).toBeTruthy();
    expect(screen.getByText('Compared with the period before: -3.2%')).toBeTruthy();
    expect(screen.getByText('Share 60.5%')).toBeTruthy();
    const [path, o] = mockGet.mock.calls[0]!;
    expect(path).toBe('/reports/sales/analysis');
    expect(o.query.groupBy).toBe('product');
    expect(o.query).not.toHaveProperty('tenantId');
  });
  test('margin hidden when the server sends none', async () => {
    mockGet.mockResolvedValue(sales);
    await render(<ReportsScreen />, { wrapper });
    await screen.findByText('₹20,40,000.00');
    expect(screen.queryByText('Margin')).toBeNull();
  });
  test('empty', async () => {
    mockGet.mockResolvedValue({ ...sales, rows: [] });
    await render(<ReportsScreen />, { wrapper });
    expect(await screen.findByText('No sales in this period.')).toBeTruthy();
  });
  test('offline', async () => {
    mockGet.mockRejectedValue(new ApiError(0, null));
    await render(<ReportsScreen />, { wrapper });
    expect(
      await screen.findByText('No network. The report cannot be loaded now.', {}, { timeout: 3000 }),
    ).toBeTruthy();
  });
  test('error', async () => {
    mockGet.mockRejectedValue(new ApiError(500, { title: 'BOOM', correlationId: 'c-1' }));
    await render(<ReportsScreen />, { wrapper });
    expect(await screen.findByText(/c-1/)).toBeTruthy();
  });
  test('server 403 is shown as denied', async () => {
    mockGet.mockRejectedValue(new ApiError(403, { title: 'FORBIDDEN' }));
    await render(<ReportsScreen />, { wrapper });
    expect(await screen.findByText('You do not have permission to see these reports.')).toBeTruthy();
  });
  test('no report permission: nothing called', async () => {
    mockMe = { userId: 'u-1', roles: [], permissions: ['hr.leave.self'] };
    await render(<ReportsScreen />, { wrapper });
    expect(await screen.findByText('You do not have permission to see these reports.')).toBeTruthy();
    expect(mockGet).not.toHaveBeenCalled();
  });
  test('only the reports the user may see are offered', async () => {
    mockMe = { userId: 'u-1', roles: [], permissions: ['reports.sales'] };
    mockGet.mockResolvedValue(sales);
    await render(<ReportsScreen />, { wrapper });
    await screen.findByText('₹20,40,000.00');
    expect(screen.getByLabelText('Sales')).toBeTruthy();
    expect(screen.queryByLabelText('Profit')).toBeNull();
    expect(screen.queryByLabelText('Tax')).toBeNull();
  });
  test('tax summary', async () => {
    mockGet.mockImplementation(async (path: string) =>
      path === '/reports/tax/summary'
        ? {
            from: 'a',
            to: 'b',
            output: [
              { ratePct: '5', taxable: '1000.00', cgst: '25.00', sgst: '25.00', igst: '0.00', tax: '50.00' },
            ],
            input: [{ ratePct: '18', taxable: '500.00', tax: '90.00' }],
            months: [],
            notes: [],
            totals: {
              outputTaxable: '1000.00',
              outputTax: '50.00',
              inputTaxable: '500.00',
              inputTax: '90.00',
              netPayable: '-40.00',
            },
          }
        : sales,
    );
    await render(<ReportsScreen />, { wrapper });
    await screen.findByText('₹20,40,000.00');
    await fireEvent.press(screen.getByLabelText('Tax'));
    expect(await screen.findByText('-₹40.00')).toBeTruthy();
    expect(mockGet.mock.calls.some((c) => c[0] === '/reports/tax/summary')).toBe(true);
  });
  test('collections show ageing', async () => {
    mockGet.mockImplementation(async (path: string) =>
      path === '/reports/collections/efficiency'
        ? {
            from: 'a',
            to: 'b',
            groupBy: 'branch',
            rows: [
              {
                key: 'b1',
                label: 'Main',
                due: '100.00',
                collected: '80.00',
                adjusted: '0.00',
                efficiencyPct: '80.0',
                outstanding: '20.00',
                documents: 2,
              },
            ],
            totals: { due: '100.00', collected: '80.00', adjusted: '0.00', efficiencyPct: '80.0' },
            ageing: {
              notDue: '1.00',
              days1to30: '2.00',
              days31to60: '3.00',
              days61to90: '4.00',
              over90: '12345.00',
            },
          }
        : sales,
    );
    await render(<ReportsScreen />, { wrapper });
    await screen.findByText('₹20,40,000.00');
    await fireEvent.press(screen.getByLabelText('Collections'));
    expect(await screen.findByText('₹12,345.00')).toBeTruthy();
    expect(screen.getByText('Collected 80.0% of what was due')).toBeTruthy();
  });
  test('Marathi title', async () => {
    await setLanguage('mr');
    mockGet.mockResolvedValue(sales);
    await render(<ReportsScreen />, { wrapper });
    expect(await screen.findByRole('header', { name: 'अहवाल' })).toBeTruthy();
  });
});

describe('accounts', () => {
  const day = {
    from: 'a',
    to: 'b',
    balanced: true,
    journals: [
      {
        id: 'j1',
        date: '2026-11-11',
        sourceType: 'SALES',
        purpose: 'SALE',
        narration: 'Cash sale',
        voucherNo: 'V-1',
        voucherKind: 'RECEIPT',
        debit: '2500.00',
        credit: '2500.00',
      },
    ],
    totals: { debit: '2500.00', credit: '2500.00' },
  };
  test('day book in rupees', async () => {
    mockGet.mockResolvedValue(day);
    await render(<AccountsScreen />, { wrapper });
    expect(await screen.findByText('V-1 · ₹2,500.00')).toBeTruthy();
    expect(mockGet.mock.calls[0]![0]).toBe('/reports/day-book');
  });
  test('unbalanced books raise a notice', async () => {
    mockGet.mockResolvedValue({ ...day, balanced: false });
    await render(<AccountsScreen />, { wrapper });
    expect(await screen.findByText('Debit and credit do not match. Tell your accountant.')).toBeTruthy();
  });
  test('empty', async () => {
    mockGet.mockResolvedValue({ ...day, journals: [] });
    await render(<AccountsScreen />, { wrapper });
    expect(await screen.findByText('No entries in this period.')).toBeTruthy();
  });
  test('offline', async () => {
    mockGet.mockRejectedValue(new ApiError(0, null));
    await render(<AccountsScreen />, { wrapper });
    expect(
      await screen.findByText('No network. Accounts cannot be loaded now.', {}, { timeout: 3000 }),
    ).toBeTruthy();
  });
  test('no permission', async () => {
    mockMe = { userId: 'u-1', roles: [], permissions: [] };
    await render(<AccountsScreen />, { wrapper });
    expect(await screen.findByText('You do not have permission to see accounts.')).toBeTruthy();
    expect(mockGet).not.toHaveBeenCalled();
  });
  test('only finance.account.view: ledger tab shown, day book hidden', async () => {
    mockMe = { userId: 'u-1', roles: [], permissions: ['finance.account.view'] };
    mockGet.mockResolvedValue({
      items: [
        {
          id: 'a1',
          code: '1010',
          name: 'Cash',
          type: 'ASSET',
          groupName: 'Cash',
          cashBank: 'CASH',
          active: true,
          balance: '-50.00',
        },
      ],
    });
    await render(<AccountsScreen />, { wrapper });
    expect(await screen.findByText('₹50.00 Cr')).toBeTruthy();
    expect(screen.queryByLabelText('Day book')).toBeNull();
    expect(mockGet.mock.calls[0]![0]).toBe('/finance/accounts');
  });
  test('trial balance', async () => {
    mockGet.mockImplementation(async (path: string) =>
      path === '/reports/trial-balance'
        ? {
            to: '2026-11-11',
            balanced: true,
            rows: [
              {
                accountId: 'a1',
                code: '1010',
                name: 'Cash',
                groupName: null,
                closingDr: '99999.00',
                closingCr: '0.00',
              },
            ],
            totals: { closingDr: '99999.00', closingCr: '99999.00' },
          }
        : day,
    );
    await render(<AccountsScreen />, { wrapper });
    await screen.findByText('V-1 · ₹2,500.00');
    await fireEvent.press(screen.getByLabelText('Trial balance'));
    expect(await screen.findByText('1010 · Cash')).toBeTruthy();
    expect(screen.getAllByText('₹99,999.00').length).toBe(3);
  });
});

describe('compliance', () => {
  const g3b = {
    period: '2026-11',
    from: 'a',
    to: 'b',
    outward: { taxable: '100000.00', igst: '0.00', cgst: '2500.00', sgst: '2500.00' },
    exempt: { taxable: '0.00' },
    reverseCharge: { taxable: '0.00', igst: '0.00', cgst: '0.00', sgst: '0.00' },
    itc: {
      eligible: { igst: '0.00', cgst: '0.00', sgst: '0.00' },
      blocked: { igst: '0.00', cgst: '0.00', sgst: '0.00' },
      reversed: { igst: '0.00', cgst: '0.00', sgst: '0.00' },
      net: { igst: '0.00', cgst: '1000.00', sgst: '1000.00' },
    },
    liability: { igst: '0.00', cgst: '2500.00', sgst: '2500.00' },
    payable: { igst: '0.00', cgst: '1500.00', sgst: '1500.00', total: '3000.00' },
    creditCarried: { igst: '0.00', cgst: '0.00', sgst: '0.00' },
    matchesGstr1: true,
    notes: [],
    snapshot: null,
  };
  test('GST summary read only, with month sent as period', async () => {
    mockGet.mockResolvedValue(g3b);
    await render(<ComplianceScreen />, { wrapper });
    expect(await screen.findByText('₹3,000.00')).toBeTruthy();
    expect(screen.getByText('Sales side agrees with GSTR-1.')).toBeTruthy();
    expect(mockGet.mock.calls[0]![0]).toBe('/gst/gstr3b');
    expect(mockGet.mock.calls[0]![1].query.period).toMatch(/^\d{4}-\d{2}$/);
    expect(screen.queryByLabelText('Freeze snapshot')).toBeNull();
    expect(mockPost).not.toHaveBeenCalled();
  });
  test('no permission', async () => {
    mockMe = { userId: 'u-1', roles: [], permissions: [] };
    await render(<ComplianceScreen />, { wrapper });
    expect(await screen.findByText('You do not have permission to see tax returns.')).toBeTruthy();
    expect(mockGet).not.toHaveBeenCalled();
  });
  test('offline', async () => {
    mockGet.mockRejectedValue(new ApiError(0, null));
    await render(<ComplianceScreen />, { wrapper });
    expect(
      await screen.findByText('No network. Tax data cannot be loaded now.', {}, { timeout: 3000 }),
    ).toBeTruthy();
  });
  test('input credit register: empty and rows', async () => {
    mockGet.mockImplementation(async (path: string) =>
      path === '/gst/itc-register'
        ? {
            period: 'p',
            rows: [
              {
                billId: 'b1',
                number: 'PB-1',
                supplierInvoiceNo: 'S1',
                date: '2026-11-03',
                supplierName: 'Agro Ltd',
                tax: '180.00',
                eligible: {},
                blocked: {},
                status: 'NO_GSTIN',
                reason: null,
              },
            ],
            totals: { tax: '180.00', eligible: '0.00', blocked: '0.00' },
          }
        : g3b,
    );
    await render(<ComplianceScreen />, { wrapper });
    await screen.findByText('₹3,000.00');
    await fireEvent.press(screen.getByLabelText('Input credit'));
    expect(await screen.findByText('PB-1 · Agro Ltd')).toBeTruthy();
    expect(screen.getByText(/Supplier has no GSTIN/)).toBeTruthy();
  });
  test('hsn empty', async () => {
    mockGet.mockImplementation(async (path: string) =>
      path === '/gst/hsn-summary'
        ? {
            from: 'a',
            to: 'b',
            hsnDigits: 4,
            rows: [],
            totals: { taxable: '0.00', tax: '0.00', value: '0.00' },
          }
        : g3b,
    );
    await render(<ComplianceScreen />, { wrapper });
    await screen.findByText('₹3,000.00');
    await fireEvent.press(screen.getByLabelText('HSN summary'));
    expect(await screen.findByText('No sales in this month.')).toBeTruthy();
  });
});

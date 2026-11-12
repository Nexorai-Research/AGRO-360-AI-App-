import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '../src/api/errors';
import { i18n, setLanguage } from '../src/i18n';
import parts from '../i18n-parts/step4.json';
import ReportsScreen from '../src/features/reports/ReportsScreen';

const mockGet = jest.fn();
let mockMe: { userId: string; roles: string[]; permissions?: string[] };
const mockClient = { get: (...a: unknown[]) => mockGet(...a), post: jest.fn() };
jest.mock('../src/auth/AuthProvider', () => ({
  useAuth: () => ({ status: 'signedIn', me: mockMe, client: mockClient, signIn: jest.fn(), signOut: jest.fn() }),
}));
jest.mock('../src/device', () => ({ newId: () => 'key-x' }));

let qc: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;

beforeAll(() => {
  for (const lang of ['en', 'hi', 'mr'] as const) i18n.addResourceBundle(lang, 'translation', (parts as Record<string, object>)[lang], true, true);
});
beforeEach(async () => {
  mockGet.mockReset();
  mockMe = { userId: 'u-1', roles: [], permissions: ['reports.sales'] };
  qc = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retryDelay: 0 } } });
  await setLanguage('en');
});

const row = (over: Record<string, unknown> = {}) => ({
  kind: 'INVOICE', id: 'i-1', number: 'INV-1', date: '2026-11-10', customerName: 'Ramesh Patil', status: 'FINALIZED',
  taxable: '1000.00', cgst: '90.00', sgst: '90.00', igst: '0.00', total: '1180.00', ...over,
});
const register = {
  rows: [row(), row({ kind: 'CREDIT_NOTE', id: 'c-1', number: 'CN-1', customerName: null, status: 'POSTED', taxable: '100.00', total: '118.00' })],
  totals: { taxable: '900.00', cgst: '81.00', sgst: '81.00', igst: '0.00', total: '1062.00' },
};

const salesStub = {
  from: '2026-10-13', to: '2026-11-11', groupBy: 'product', truncated: false, rows: [],
  totals: { quantity: '0', netSales: '0.00', discount: '0.00', bills: 0, avgBill: null, margin: null, marginPct: null },
  previous: { from: 'a', to: 'b', netSales: '0', changePct: null },
};
/** The screen opens on Sales; only the register path answers with the register. */
const answer = (r: unknown) => mockGet.mockImplementation(async (path: string) => {
  if (path === '/reports/profitability')
    return { from: 'a', to: 'b', groupBy: 'product', rows: [], totals: { netSales: '0.00', cost: '0.00', margin: '0.00', marginPct: null }, leakage: { belowCost: [], heavyDiscount: [], returns: { returnedValue: '0.00', marginLost: '0.00' } } };
  if (path !== '/reports/sales-register') return salesStub;
  if (r instanceof Error) throw r;
  return r;
});

async function openRegister() {
  await render(<ReportsScreen />, { wrapper });
  await fireEvent.press(await screen.findByLabelText('Sales register'));
}

describe('sales register report', () => {
  test('asks the server for the period and shows totals and rows as rupees from strings', async () => {
    answer(register);
    await openRegister();
    expect(await screen.findByText('₹1,062.00')).toBeTruthy();
    expect(screen.getByText('Tax invoice · Ramesh Patil · FINALIZED')).toBeTruthy();
    expect(screen.getByText('Credit note · Walk-in · POSTED')).toBeTruthy();
    expect(screen.getByText('₹1,180.00')).toBeTruthy();
    const call = mockGet.mock.calls.find((c) => c[0] === '/reports/sales-register')!;
    expect(call[1].query).toMatchObject({ from: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), to: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
  });

  test('only the first 100 rows are drawn and the screen says how many there are', async () => {
    const many = Array.from({ length: 130 }, (_, i) => row({ id: `i-${i}`, number: `INV-${i + 1}` }));
    answer({ rows: many, totals: register.totals });
    await openRegister();
    expect(await screen.findByText('Showing the first 100 of 130 documents. Narrow the period, or use the web app for the full list.')).toBeTruthy();
    expect(screen.queryByText(/INV-101 ·/)).toBeNull();
    expect(screen.getByText(/INV-100 ·/)).toBeTruthy();
  });

  test('empty period', async () => {
    answer({ rows: [], totals: { taxable: '0.00', cgst: '0.00', sgst: '0.00', igst: '0.00', total: '0.00' } });
    await openRegister();
    expect(await screen.findByText('No bills in this period.')).toBeTruthy();
  });

  test('offline and server refusal show their own message', async () => {
    answer(new ApiError(0, null, 'c-1'));
    await openRegister();
    expect(await screen.findByText('No network. The report cannot be loaded now.')).toBeTruthy();
  });

  test('not offered without reports.sales', async () => {
    mockMe = { userId: 'u-1', roles: [], permissions: ['reports.financial'] };
    answer(register);
    await render(<ReportsScreen />, { wrapper });
    await screen.findByLabelText('Profit');
    expect(screen.queryByLabelText('Sales register')).toBeNull();
  });

  test('Hindi names', async () => {
    await setLanguage('hi');
    answer(register);
    await render(<ReportsScreen />, { wrapper });
    await fireEvent.press(await screen.findByLabelText('बिक्री रजिस्टर'));
    expect(await screen.findByText('क्रेडिट नोट · वॉक-इन · POSTED')).toBeTruthy();
  });
});

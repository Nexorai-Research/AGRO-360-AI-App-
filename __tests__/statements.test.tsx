import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '../src/api/errors';
import { setLanguage } from '../src/i18n';
import StatementsScreen from '../src/features/accounts/StatementsScreen';

const mockGet = jest.fn();
let mockMe: { userId: string; roles: string[]; permissions?: string[] };
jest.mock('../src/auth/AuthProvider', () => ({
  useAuth: () => ({ status: 'signedIn', me: mockMe, client: { get: (...a: unknown[]) => mockGet(...a) } }),
}));

let qc: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={qc}>{children}</QueryClientProvider>
);
const pl = {
  sections: [
    {
      section: 'SALES',
      label: 'Sales (net of returns and discounts)',
      total: '120000.00',
      lines: [{ code: '4000', name: 'Sales', amount: '120000.00' }],
    },
    { section: 'OTHER_INCOME', label: 'Other income', total: '0.00', lines: [] },
  ],
  netSales: '120000.00',
  costOfSales: '90000.00',
  grossProfit: '30000.00',
  operatingExpenses: '12500.50',
  otherIncome: '0.00',
  netProfit: '17499.50',
};
const sec = (
  section: string,
  label: string,
  total: string,
  lines: { code: string; name: string; amount: string }[],
) => ({ section, label, total, lines });
const bs = {
  asOn: '2026-11-12',
  assets: [
    sec('CASH_BANK', 'Cash and bank', '50000.00', [{ code: '1000', name: 'Cash', amount: '50000.00' }]),
  ],
  liabilities: [sec('PAYABLES', 'Payables', '20000.00', [])],
  equity: [sec('EQUITY', 'Equity', '30000.00', [])],
  totalAssets: '50000.00',
  totalLiabilities: '20000.00',
  totalEquity: '30000.00',
  currentYearProfit: '17499.50',
  earlierYearsProfit: '0.00',
  balanced: true,
};
const book = {
  kind: 'CASH',
  from: '2026-10-14',
  to: '2026-11-12',
  accounts: [
    {
      accountId: 'a1',
      code: '1000',
      name: 'Cash in hand',
      opening: '1000.00',
      receipts: '9000.00',
      payments: '12000.00',
      closing: '-2000.00',
      negative: true,
      days: [],
    },
  ],
};
const base: Record<string, unknown> = {
  '/reports/profit-loss': { from: '2026-10-14', to: '2026-11-12', current: pl, previous: null },
  '/reports/balance-sheet': bs,
  '/reports/cash-book': book,
  '/reports/bank-book': { ...book, kind: 'BANK', accounts: [] },
};
const answers = (o: Record<string, unknown> = {}) =>
  mockGet.mockImplementation(async (path: string) => {
    const v = path in o ? o[path] : base[path];
    if (v instanceof Error) throw v;
    return v;
  });
const pick = async (label: string) => fireEvent.press(await screen.findByLabelText(label));

beforeEach(async () => {
  mockGet.mockReset();
  mockMe = { userId: 'u1', roles: [], permissions: ['reports.financial'] };
  qc = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retryDelay: 0 } } });
  await setLanguage('en');
  answers();
});

describe('financial statements', () => {
  test('profit and loss: summary lines and sections as rupees from strings; empty sections are hidden', async () => {
    await render(<StatementsScreen />, { wrapper });
    expect(await screen.findByText('₹17,499.50')).toBeTruthy();
    expect(screen.getByText('₹12,500.50')).toBeTruthy();
    expect(screen.getByText('4000 Sales')).toBeTruthy();
    expect(screen.queryByText('Other income', { exact: true })).toBeTruthy(); // the summary line only
    expect(screen.getAllByText('Other income').length).toBe(1);
    const q = mockGet.mock.calls[0]![1].query;
    expect(q.from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(q.to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  test('changing the period asks again with a wider range', async () => {
    await render(<StatementsScreen />, { wrapper });
    await screen.findByText('₹17,499.50');
    await pick('Last 90 days');
    await screen.findByText('₹17,499.50');
    const calls = mockGet.mock.calls.filter((c) => c[0] === '/reports/profit-loss');
    expect(calls.length).toBe(2);
    expect(calls[1]![1].query.from < calls[0]![1].query.from).toBe(true);
  });
  test('balance sheet: totals, sections, and a warning only when it does not balance', async () => {
    await render(<StatementsScreen />, { wrapper });
    await pick('Balance sheet');
    expect((await screen.findAllByText('₹50,000.00')).length).toBeGreaterThan(0);
    expect(screen.getByText('1000 Cash')).toBeTruthy();
    expect(screen.queryByText(/Tell your accountant/)).toBeNull();
    expect(mockGet.mock.calls.find((c) => c[0] === '/reports/balance-sheet')![1].query.asOn).toMatch(
      /^\d{4}-\d{2}-\d{2}$/,
    );
  });
  test('balance sheet that does not balance shows the warning', async () => {
    answers({ '/reports/balance-sheet': { ...bs, balanced: false } });
    await render(<StatementsScreen />, { wrapper });
    await pick('Balance sheet');
    expect(
      await screen.findByText('Assets do not equal liabilities plus equity. Tell your accountant.'),
    ).toBeTruthy();
  });
  test('cash book: opening, receipts, payments, closing and a note when the balance went negative', async () => {
    await render(<StatementsScreen />, { wrapper });
    await pick('Cash book');
    expect(await screen.findByText('1000 Cash in hand')).toBeTruthy();
    expect(screen.getByText('-₹2,000.00')).toBeTruthy();
    expect(screen.getByText('The balance went below zero in this period.')).toBeTruthy();
  });
  test('bank book with no bank ledgers says so', async () => {
    await render(<StatementsScreen />, { wrapper });
    await pick('Bank book');
    expect(await screen.findByText('No cash or bank ledgers.')).toBeTruthy();
  });
  test('no permission: denied and nothing is requested', async () => {
    mockMe = { userId: 'u1', roles: [], permissions: ['customer.view'] };
    await render(<StatementsScreen />, { wrapper });
    expect(await screen.findByText('You do not have permission to see financial statements.')).toBeTruthy();
    expect(mockGet).not.toHaveBeenCalled();
  });
  test('offline and a 403 from the server', async () => {
    answers({ '/reports/profit-loss': new ApiError(0, null, 'c1') });
    await render(<StatementsScreen />, { wrapper });
    expect(await screen.findByText('No network. This cannot be loaded now.')).toBeTruthy();
  });
  test('Hindi names', async () => {
    await setLanguage('hi');
    await render(<StatementsScreen />, { wrapper });
    expect(await screen.findByText('शुद्ध लाभ')).toBeTruthy();
  });
});

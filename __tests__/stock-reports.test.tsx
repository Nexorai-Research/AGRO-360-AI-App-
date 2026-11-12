import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '../src/api/errors';
import { setLanguage } from '../src/i18n';
import StockReportsScreen from '../src/features/inventory/StockReportsScreen';
import { fetchExpiry, KIND_PERM } from '../src/features/inventory/reports-api';

const mockGet = jest.fn();
let mockMe: { userId: string; roles: string[]; permissions?: string[] };
jest.mock('../src/auth/AuthProvider', () => ({
  useAuth: () => ({ status: 'signedIn', me: mockMe, client: { get: (...a: unknown[]) => mockGet(...a) } }),
}));

let qc: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={qc}>{children}</QueryClientProvider>
);
const batch = (o: Record<string, unknown> = {}) => ({
  id: 'b1',
  skuCode: 'URE-50',
  skuName: 'Urea 50kg',
  batchNo: 'B-77',
  expiryDate: '2026-12-01',
  daysToExpiry: 19,
  status: 'ACTIVE',
  onHand: '40.000',
  available: '40.000',
  valueAtRisk: '10400.5000',
  ...o,
});
const move = (o: Record<string, unknown> = {}) => ({
  id: 'm1',
  businessDate: '2026-11-10',
  movementType: 'SALE_ISSUE',
  skuCode: 'URE-50',
  skuName: 'Urea 50kg',
  warehouseCode: 'WH1',
  batchNo: 'B-77',
  qty: '-2.000',
  value: '-520.0000',
  sourceType: 'INVOICE',
  reasonCode: null,
  runningBalance: '38.000',
  ...o,
});
const answers = (o: Record<string, unknown> = {}) =>
  mockGet.mockImplementation(async (path: string) => {
    if (path in o) {
      const v = o[path];
      if (v instanceof Error) throw v;
      return v;
    }
    if (path === '/inventory/batches') return { items: [batch()], total: 1 };
    if (path === '/inventory/ledger') return { items: [move()], total: 120, currentBalance: '38.000' };
    if (path === '/inventory/reorder-rules')
      return {
        items: [
          {
            skuCode: 'URE-50',
            skuName: 'Urea 50kg',
            branchName: null,
            minQty: '10.000',
            reorderLevel: '25.000',
            maxQty: '100.000',
            reorderQty: '60.000',
          },
        ],
        total: 1,
      };
    if (path === '/inventory/valuation')
      return {
        asOn: '2026-11-12',
        costingMethod: 'FIFO',
        warning: 'FIFO cost layers are not built yet; valued at the weighted average.',
        totalQty: '38.000',
        totalValue: '9880.0000',
        rows: [
          {
            skuCode: 'URE-50',
            skuName: 'Urea 50kg',
            branchName: 'Main',
            qty: '38.000',
            avgCost: '260.000000',
            value: '9880.0000',
          },
        ],
      };
    return { items: [] };
  });

beforeEach(async () => {
  mockGet.mockReset();
  mockMe = { userId: 'u1', roles: [], permissions: ['inventory.view', 'inventory.value.view'] };
  qc = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retryDelay: 0 } } });
  await setLanguage('en');
  answers();
});
const pick = async (label: string) => fireEvent.press(await screen.findByLabelText(label));

describe('stock reports', () => {
  test('expiry: asks for batches with stock expiring in 30 days; value at risk from a string', async () => {
    await render(<StockReportsScreen />, { wrapper });
    expect(await screen.findByText('Urea 50kg')).toBeTruthy();
    expect(screen.getByText('1 Dec 2026 (19 days)')).toBeTruthy();
    expect(screen.getByText('₹10,400.50')).toBeTruthy();
    const q = mockGet.mock.calls.find((c) => c[0] === '/inventory/batches')![1].query;
    expect(q).toMatchObject({ withStockOnly: 'true', expiringWithinDays: '30', limit: 50 });
  });
  test('expiry: "Already expired" asks for expired=true instead', async () => {
    await render(<StockReportsScreen />, { wrapper });
    await screen.findByText('Urea 50kg');
    await pick('Already expired');
    await screen.findByText('Urea 50kg');
    const calls = mockGet.mock.calls.filter((c) => c[0] === '/inventory/batches');
    expect(calls.at(-1)![1].query).toMatchObject({ expired: 'true' });
    expect(calls.at(-1)![1].query.expiringWithinDays).toBeUndefined();
  });
  test('expiry: cost fields hidden by the server (null) are not shown', async () => {
    answers({ '/inventory/batches': { items: [batch({ valueAtRisk: null })], total: 1 } });
    await render(<StockReportsScreen />, { wrapper });
    await screen.findByText('Urea 50kg');
    expect(screen.queryByText('Value at risk')).toBeNull();
  });
  test('expiry: empty window', async () => {
    answers({ '/inventory/batches': { items: [], total: 0 } });
    await render(<StockReportsScreen />, { wrapper });
    expect(await screen.findByText('No batches with stock in this window.')).toBeTruthy();
  });
  test('ledger: movement names, quantities as strings, running balance, and how many more exist', async () => {
    await render(<StockReportsScreen />, { wrapper });
    await pick('Stock ledger');
    expect(await screen.findByText('10 Nov 2026 · Sale · WH1 · Batch B-77')).toBeTruthy();
    expect(screen.getByText('-2.000')).toBeTruthy();
    expect(screen.getByText('38.000')).toBeTruthy();
    expect(screen.getByText('Showing the first 1 of 120. Use the web app for the full list.')).toBeTruthy();
  });
  test('reorder rules: product default shown as all branches', async () => {
    await render(<StockReportsScreen />, { wrapper });
    await pick('Reorder rules');
    expect(await screen.findByText('URE-50 · All branches (default)')).toBeTruthy();
    expect(screen.getByText('25.000')).toBeTruthy();
  });
  test('valuation: total as rupees, server warning shown, average cost', async () => {
    await render(<StockReportsScreen />, { wrapper });
    await pick('Valuation');
    expect((await screen.findAllByText('₹9,880.00')).length).toBe(2); // the total and the one row
    expect(screen.getByText(/FIFO cost layers are not built yet/)).toBeTruthy();
    expect(screen.getByText('₹260.00')).toBeTruthy();
  });
  test('valuation is not offered without inventory.value.view', async () => {
    mockMe = { userId: 'u1', roles: [], permissions: ['inventory.view'] };
    await render(<StockReportsScreen />, { wrapper });
    await screen.findByLabelText('Expiry');
    expect(screen.queryByLabelText('Valuation')).toBeNull();
    expect(KIND_PERM.valuation).toBe('inventory.value.view');
  });
  test('no permission at all shows denied and calls nothing', async () => {
    mockMe = { userId: 'u1', roles: [], permissions: [] };
    await render(<StockReportsScreen />, { wrapper });
    expect(await screen.findByText('You do not have permission to see these stock reports.')).toBeTruthy();
    expect(mockGet).not.toHaveBeenCalled();
  });
  test('offline and server error', async () => {
    answers({ '/inventory/batches': new ApiError(0, null, 'c1') });
    await render(<StockReportsScreen />, { wrapper });
    expect(await screen.findByText('No network. The report cannot be loaded now.')).toBeTruthy();
  });
  test('Hindi names', async () => {
    await setLanguage('hi');
    await render(<StockReportsScreen />, { wrapper });
    await pick('स्टॉक खाता');
    expect(await screen.findByText(/बिक्री/)).toBeTruthy();
  });
  test('fetchExpiry builds the right query', async () => {
    const get = jest.fn().mockResolvedValue({ items: [], total: 0 });
    await fetchExpiry({ get } as never, '90');
    expect(get.mock.calls[0]![1].query).toEqual({
      withStockOnly: 'true',
      limit: 50,
      expiringWithinDays: '90',
    });
  });
});

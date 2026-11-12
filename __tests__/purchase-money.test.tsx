import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '../src/api/errors';
import { setLanguage } from '../src/i18n';
import PurchaseMoneyScreen from '../src/features/purchase/PurchaseMoneyScreen';
import { MONEY_PERM } from '../src/features/purchase/money-api';

const mockGet = jest.fn();
let mockMe: { userId: string; roles: string[]; permissions?: string[] };
jest.mock('../src/auth/AuthProvider', () => ({
  useAuth: () => ({ status: 'signedIn', me: mockMe, client: { get: (...a: unknown[]) => mockGet(...a) } }),
}));

let qc: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
const bill = (o: Record<string, unknown> = {}) => ({ id: 'b1', number: 'PB-9', supplierName: 'Agro Seeds', supplierInvoiceNo: 'S-44', invoiceDate: '2026-11-01', dueDate: '2026-11-30', status: 'POSTED', matchStatus: 'MATCHED', paymentStatus: 'PART_PAID', total: '11800.0000', paid: '5000.0000', returned: '0.0000', outstanding: '6800.0000', ...o });
const base: Record<string, unknown> = {
  '/procurement/purchase-bills': { items: [bill()] },
  '/procurement/supplier-payments': { items: [{ id: 'p1', number: 'SP-3', supplierName: 'Agro Seeds', paymentDate: '2026-11-05', modeCode: 'BANK', reference: 'UTR123', amount: '5000.0000', allocated: '5000.0000', advance: '0.0000', tdsWithheld: '50.0000', cashPaid: '4950.0000' }] },
  '/procurement/purchase-returns': { items: [{ id: 'r1', number: 'PR-1', supplierName: 'Agro Seeds', billNumber: 'PB-9', returnDate: '2026-11-08', reason: 'Damaged bags', total: '590.0000' }] },
  '/procurement/reports/payables-aging': { asOf: '2026-11-12', rows: [{ supplierId: 's1', supplierName: 'Agro Seeds', buckets: { NOT_DUE: '6800.0000', '1-30': '0.0000', '31-60': '2000.0000', '61-90': '0.0000', '90+': '0.0000' }, total: '8800.0000', unallocatedAdvance: '300.0000' }], totals: { NOT_DUE: '6800.0000', '1-30': '0.0000', '31-60': '2000.0000', '61-90': '0.0000', '90+': '0.0000' }, total: '8800.0000' },
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
  mockMe = { userId: 'u1', roles: [], permissions: ['purchase.view', 'purchase.supplier.ledger.view'] };
  qc = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retryDelay: 0 } } });
  await setLanguage('en');
  answers();
});

describe('purchase bills and payables', () => {
  test('bills: open bills asked for by default; amounts as rupees from strings; due date and match', async () => {
    await render(<PurchaseMoneyScreen />, { wrapper });
    expect(await screen.findByText('Agro Seeds')).toBeTruthy();
    expect(screen.getByText('₹6,800.00')).toBeTruthy();
    expect(screen.getByText('PB-9 · 1 Nov 2026 · POSTED')).toBeTruthy();
    expect(screen.getByText('Due 30 Nov 2026 · Match: MATCHED')).toBeTruthy();
    expect(mockGet.mock.calls[0]![1].query).toEqual({ limit: 50, open: 'true' });
  });
  test('bills: "All" stops asking for open only', async () => {
    await render(<PurchaseMoneyScreen />, { wrapper });
    await screen.findByText('Agro Seeds');
    await pick('All');
    await screen.findByText('Agro Seeds');
    const last = mockGet.mock.calls.filter((c) => c[0] === '/procurement/purchase-bills').at(-1)!;
    expect(last[1].query).toEqual({ limit: 50 });
  });
  test('bills: 50 rows means there may be more and the screen says so', async () => {
    answers({ '/procurement/purchase-bills': { items: Array.from({ length: 50 }, (_, i) => bill({ id: `b${i}` })) } });
    await render(<PurchaseMoneyScreen />, { wrapper });
    expect(await screen.findByText('Showing the first 50. Use the web app for the full list.')).toBeTruthy();
  });
  test('bills: empty', async () => {
    answers({ '/procurement/purchase-bills': { items: [] } });
    await render(<PurchaseMoneyScreen />, { wrapper });
    expect(await screen.findByText('No bills.')).toBeTruthy();
  });
  test('payments: TDS and cash paid shown; zero advance is hidden', async () => {
    await render(<PurchaseMoneyScreen />, { wrapper });
    await pick('Payments');
    expect(await screen.findByText('SP-3 · 5 Nov 2026 · BANK · UTR123')).toBeTruthy();
    expect(screen.getByText('₹50.00')).toBeTruthy();
    expect(screen.getByText('₹4,950.00')).toBeTruthy();
    expect(screen.queryByText('Advance (not yet allocated)')).toBeNull();
  });
  test('returns', async () => {
    await render(<PurchaseMoneyScreen />, { wrapper });
    await pick('Returns');
    expect(await screen.findByText('PR-1 · 8 Nov 2026 · Bill PB-9')).toBeTruthy();
    expect(screen.getByText('Damaged bags')).toBeTruthy();
    expect(screen.getByText('₹590.00')).toBeTruthy();
  });
  test('ageing: totals by bucket, only non-zero buckets per supplier, advance note', async () => {
    await render(<PurchaseMoneyScreen />, { wrapper });
    await pick('Payables ageing');
    expect((await screen.findAllByText('₹8,800.00')).length).toBe(2); // grand total and the one supplier
    expect(screen.getAllByText('31 to 60 days late').length).toBe(2);
    expect(screen.getAllByText('Over 90 days late').length).toBe(1); // zero for the supplier, so only the summary line
    expect(screen.getByText('Advance paid, not yet allocated: ₹300.00')).toBeTruthy();
  });
  test('ageing is not offered without the supplier ledger permission', async () => {
    mockMe = { userId: 'u1', roles: [], permissions: ['purchase.view'] };
    await render(<PurchaseMoneyScreen />, { wrapper });
    await screen.findByLabelText('Purchase bills');
    expect(screen.queryByLabelText('Payables ageing')).toBeNull();
    expect(MONEY_PERM.ageing).toBe('purchase.supplier.ledger.view');
  });
  test('no permission: denied and no call', async () => {
    mockMe = { userId: 'u1', roles: [], permissions: [] };
    await render(<PurchaseMoneyScreen />, { wrapper });
    expect(await screen.findByText('You do not have permission to see this.')).toBeTruthy();
    expect(mockGet).not.toHaveBeenCalled();
  });
  test('offline, and a 403 from the server shows denied', async () => {
    answers({ '/procurement/purchase-bills': new ApiError(0, null, 'c1') });
    await render(<PurchaseMoneyScreen />, { wrapper });
    expect(await screen.findByText('No network. This cannot be loaded now.')).toBeTruthy();
  });
  test('Hindi', async () => {
    await setLanguage('hi');
    await render(<PurchaseMoneyScreen />, { wrapper });
    await pick('भुगतान');
    expect(await screen.findByText('नकद चुकाया')).toBeTruthy();
  });
});

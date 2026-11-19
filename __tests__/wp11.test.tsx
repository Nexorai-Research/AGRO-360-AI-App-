import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setLanguage } from '../src/i18n';
import { createClient } from '../src/api/client';
import StatementsScreen from '../src/features/accounts/StatementsScreen';
import { DetailButton, csvPath, fullText, shareGstr3bCsv } from '../src/features/accounts/Parity11';
import { statementQuery } from '../src/features/accounts/statements-api';
import { CustomerExtras } from '../src/features/customers/CustomerExtras';
import {
  guarantorBody,
  guarantorErrors,
  reorderLines,
  type PurchaseRow,
} from '../src/features/customers/extras-api';
import { parseReorder } from '../src/features/pos/PosScreen';

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockSave = jest.fn();
const mockPush = jest.fn();
let mockMe: { userId: string; roles: string[]; permissions?: string[] };
let mockId = 0;
jest.mock('../src/auth/AuthProvider', () => ({
  useAuth: () => ({
    status: 'signedIn',
    me: mockMe,
    client: {
      get: (...a: unknown[]) => mockGet(...a),
      post: (...a: unknown[]) => mockPost(...a),
      delete: jest.fn(),
    },
  }),
}));
jest.mock('../src/device', () => ({ newId: () => `key-${++mockId}` }));
jest.mock('../src/features/admin/usr-files', () => ({
  saveTextAndShare: (...a: unknown[]) => mockSave(...a),
  saveAndShare: jest.fn(),
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: (...a: unknown[]) => mockPush(...a), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
  Stack: { Screen: () => null },
}));

let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);
beforeEach(async () => {
  [mockGet, mockPost, mockSave, mockPush].forEach((m) => m.mockReset());
  mockId = 0;
  mockMe = { userId: 'u-1', roles: [], permissions: undefined };
  client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retryDelay: 0 } } });
  await setLanguage('en');
});
const fake = () => ({ get: mockGet, post: mockPost }) as never;
const pr = (sku: string, qty: string, returned: string, status = 'POSTED'): PurchaseRow => ({
  number: 'INV-1',
  d: '2026-10-01',
  sku_code: sku,
  sku_name: sku,
  batch_no: null,
  qty,
  returned,
  line_total: '100.00',
  status,
});

describe('logic', () => {
  test('11.1 CSV path and filters like the web', () => {
    expect(csvPath('/reports/profit-loss')).toBe('/reports/profit-loss.csv');
    expect(statementQuery({ from: 'a', to: 'b' }, { branchId: 'b1', compare: true })).toEqual({
      from: 'a',
      to: 'b',
      branchId: 'b1',
      compare: 'true',
    });
    expect(statementQuery({ asOn: 'x' })).toEqual({ asOn: 'x' });
  });
  test('11.3 the client reads raw bytes for an Excel file', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: () => Promise.resolve(new Uint8Array([80, 75]).buffer),
      headers: { get: () => null },
    });
    const c = createClient({
      baseUrl: 'https://x',
      appVersion: '1',
      getToken: () => Promise.resolve('t'),
      refreshToken: () => Promise.resolve(null),
      onSignedOut: () => undefined,
      uuid: () => 'u',
      fetchImpl,
    } as never);
    const b = await c.get<Uint8Array>('/reports/sales/analysis', { query: { format: 'xlsx' }, as: 'bytes' });
    expect(Array.from(b)).toEqual([80, 75]);
    expect(fetchImpl.mock.calls[0][0]).toBe('https://x/reports/sales/analysis?format=xlsx');
    expect(fetchImpl.mock.calls[0][1].headers.Accept).toBe('*/*');
  });
  test('11.6 an existing customer as guarantor: name and mobile not needed', () => {
    const g = {
      name: '',
      mobile: '',
      relationship: 'cousin',
      documentRef: '',
      limitCovered: '',
      guarantorCustomerId: 'c-9',
    };
    expect(guarantorErrors(g)).toEqual([]);
    expect(guarantorBody(g)).toEqual({ relationship: 'cousin', guarantorCustomerId: 'c-9' });
    expect(guarantorErrors({ ...g, guarantorCustomerId: '' })).toEqual(['name', 'mobile']);
  });
  test('11.7 reorder lines: net of returns per product, cancelled bills left out, floored once', () => {
    expect(
      reorderLines([
        pr('UREA', '10', '2'),
        pr('UREA', '5', '0'),
        pr('DAP', '3', '3'),
        pr('SEED', '4', '0', 'CANCELLED'),
      ]),
    ).toEqual([{ code: 'UREA', qty: 13 }]);
    expect(
      parseReorder(
        JSON.stringify({
          customerId: 'c-1',
          lines: [
            { code: 'UREA', qty: 13 },
            { code: 'X', qty: 0 },
          ],
        }),
      ),
    ).toEqual({
      customerId: 'c-1',
      lines: [{ code: 'UREA', qty: 13 }],
    });
    expect(parseReorder('not json')).toBeNull();
  });
  test('11.4 / 11.5 full text is cut like the web', () => {
    expect(fullText({ a: 'x'.repeat(30000) }).length).toBe(20000);
  });
  test('GSTR-3B CSV: the file comes in the answer', async () => {
    mockGet.mockResolvedValue({ fileName: 'GSTR3B-2026-10.csv', mimeType: 'text/csv', content: 'a,b' });
    mockSave.mockResolvedValue(true);
    await shareGstr3bCsv(fake(), '2026-10');
    expect(mockGet).toHaveBeenCalledWith('/gst/gstr3b', { query: { period: '2026-10', format: 'csv' } });
    expect(mockSave).toHaveBeenCalledWith('GSTR3B-2026-10.csv', 'text/csv', 'a,b');
  });
});

describe('screens', () => {
  const pl = {
    from: '2026-10-20',
    to: '2026-11-19',
    current: {
      sections: [],
      netSales: '1000',
      costOfSales: '600',
      grossProfit: '400',
      operatingExpenses: '100',
      otherIncome: '0',
      netProfit: '300',
    },
    previous: null,
  };
  test('11.1 statements: CSV of profit and loss with the same filters', async () => {
    mockGet.mockImplementation((p: string) =>
      Promise.resolve(p === '/branches' ? { items: [] } : p === '/reports/profit-loss.csv' ? 'a,b' : pl),
    );
    mockSave.mockResolvedValue(true);
    await render(<StatementsScreen />, { wrapper });
    await fireEvent.press(await screen.findByText('Download CSV'));
    await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1));
    const call = mockGet.mock.calls.find((c) => c[0] === '/reports/profit-loss.csv')!;
    expect(call[1].as).toBe('text');
    expect(call[1].query.from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(await screen.findByText('File ready to share.')).toBeTruthy();
  });
  test('11.x branch-wise profit and reconciliation', async () => {
    const figs = {
      netSales: '1000',
      costOfSales: '600',
      grossProfit: '400',
      operatingExpenses: '100',
      otherIncome: '0',
      netProfit: '300',
    };
    mockGet.mockImplementation((p: string) => {
      if (p === '/branches') return Promise.resolve({ items: [] });
      if (p === '/reports/profit-loss/by-branch')
        return Promise.resolve({
          dimension: 'branch',
          from: null,
          to: 'x',
          columns: [{ id: 'b1', name: 'Pune', pl: figs }],
          consolidated: figs,
          sumOfColumnsEqualsConsolidated: true,
        });
      if (p === '/finance/reconciliation')
        return Promise.resolve({
          asOn: 'x',
          reconciled: false,
          sections: [
            {
              key: 'ar',
              title: 'Customers',
              subLedger: '10',
              glBalance: '12',
              variance: '-2',
              reconciled: false,
            },
          ],
        });
      return Promise.resolve(pl);
    });
    await render(<StatementsScreen />, { wrapper });
    await fireEvent.press(await screen.findByLabelText('Branch-wise profit'));
    expect(await screen.findByText('Pune')).toBeTruthy();
    expect(screen.getByText('Columns add up to the consolidated figure.')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Reconciliation'));
    expect(await screen.findByText('There are differences to investigate.')).toBeTruthy();
    expect(screen.getByText('Customers')).toBeTruthy();
  });
  test('11.4 a frozen return opens in full (its payload)', async () => {
    mockGet.mockResolvedValue({ id: 's1', payload: { b2b: [1, 2] }, checksum: 'zz' });
    await render(<DetailButton label="Open in full" path="/gst/snapshots/s1" pick={(x) => x.payload} />, {
      wrapper,
    });
    await fireEvent.press(screen.getByText('Open in full'));
    expect(await screen.findByText(/"b2b"/)).toBeTruthy();
    expect(screen.queryByText(/checksum/)).toBeNull();
    expect(mockGet).toHaveBeenCalledWith('/gst/snapshots/s1');
  });
  test('11.6 guarantors: pick an existing customer', async () => {
    mockGet.mockImplementation((p: string, o?: { query?: Record<string, unknown> }) => {
      if (p === '/customers/c-1/credit') return Promise.resolve({ guarantors: [] });
      if (p === '/customers' && o?.query?.q)
        return Promise.resolve({
          items: [
            { id: 'c-1', name: 'Self' },
            { id: 'c-9', name: 'Mahesh', mobile: '9876500000' },
          ],
        });
      return Promise.resolve({ items: [] });
    });
    mockPost.mockResolvedValue({});
    await render(<CustomerExtras customerId="c-1" />, { wrapper });
    await fireEvent.press(screen.getByText(/Guarantors/));
    await fireEvent.press(await screen.findByText('Add guarantor'));
    await fireEvent.changeText(
      screen.getByLabelText('An existing customer (type 2 letters of the name or mobile)'),
      'Ma',
    );
    await fireEvent.press(await screen.findByText('Mahesh - 9876500000'));
    expect(screen.queryByText('Self')).toBeNull();
    await fireEvent.changeText(screen.getByLabelText('Relationship'), 'cousin');
    await fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(mockPost).toHaveBeenCalled());
    const call = mockPost.mock.calls.find((c) => c[0] === '/customers/c-1/guarantors')!;
    expect(call[1].body).toEqual({ relationship: 'cousin', guarantorCustomerId: 'c-9' });
  });
  test('11.7 purchase history: reorder at the counter opens the counter with the lines', async () => {
    mockGet.mockImplementation((p: string) =>
      Promise.resolve(p === '/customers/c-1/purchases' ? { items: [pr('UREA', '10', '2')] } : { items: [] }),
    );
    await render(<CustomerExtras customerId="c-1" />, { wrapper });
    await fireEvent.press(screen.getByText(/Purchase history/));
    await fireEvent.press(await screen.findByText('Reorder at the counter'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/pos',
      params: { reorder: JSON.stringify({ customerId: 'c-1', lines: [{ code: 'UREA', qty: 8 }] }) },
    });
  });
});

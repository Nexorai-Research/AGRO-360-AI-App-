import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '../src/api/errors';
import { i18n, setLanguage } from '../src/i18n';
import parts from '../i18n-parts/stk.json';
import CountsScreen, { varianceOf } from '../src/features/stk/CountsScreen';
import {
  ExpiryScreen,
  LedgerScreen,
  OpeningScreen,
  ReorderScreen,
  ValuationScreen,
  WriteOffScreen,
} from '../src/features/stk/InventoryScreens';
import { checkRule, parseOpeningCsv } from '../src/features/stk/logic';

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockPut = jest.fn();
const mockDelete = jest.fn();
let mockMe: { userId: string; roles: string[]; permissions?: string[] };
let mockId = 0;
const mockClient = {
  get: (...a: unknown[]) => mockGet(...a),
  post: (...a: unknown[]) => mockPost(...a),
  put: (...a: unknown[]) => mockPut(...a),
  delete: (...a: unknown[]) => mockDelete(...a),
  patch: jest.fn(),
};
jest.mock('../src/auth/AuthProvider', () => ({
  useAuth: () => ({ status: 'signedIn', me: mockMe, client: mockClient }),
}));
jest.mock('../src/device', () => ({ newId: () => `key-${++mockId}` }));
jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({}) }));

let qc: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={qc}>{children}</QueryClientProvider>
);
const ALL = [
  'inventory.view',
  'inventory.adjust.create',
  'inventory.adjust.approve',
  'inventory.opening',
  'inventory.value.view',
  'inventory.reorder.manage',
  'inventory.batch.manage',
  'inventory.batch.extend.approve',
  'inventory.jobs.run',
  'inventory.damage',
  'product.view',
];
const press = async (label: string) => fireEvent.press(await screen.findByLabelText(label));
const type = async (label: string, v: string) => fireEvent.changeText(await screen.findByLabelText(label), v);
const flat = (o: unknown, p = ''): string[] =>
  Object.entries(o as Record<string, unknown>).flatMap(([k, v]) =>
    typeof v === 'object' && v !== null ? flat(v, `${p}${k}.`) : [`${p}${k}`],
  );

const count = (o: Record<string, unknown> = {}) => ({
  id: 'c1',
  number: 'CNT-1',
  warehouseId: 'w1',
  status: 'COUNTING',
  freeze: true,
  remarks: null,
  decisionNote: null,
  lines: [
    {
      skuId: 's1',
      skuCode: 'DAP',
      skuName: 'DAP 50kg',
      batchId: 'b1',
      batchNo: 'B7',
      systemQty: '10.000000',
      countedQty: null,
      varianceQty: null,
    },
    {
      skuId: 's2',
      skuCode: 'URE',
      skuName: 'Urea',
      batchId: null,
      batchNo: null,
      systemQty: '4',
      countedQty: '4',
      varianceQty: '0.000000',
    },
  ],
  ...o,
});

beforeAll(() => {
  for (const l of ['en', 'hi', 'mr'] as const) i18n.addResourceBundle(l, 'translation', parts[l], true, true);
});
beforeEach(async () => {
  [mockGet, mockPost, mockPut, mockDelete].forEach((m) => m.mockReset());
  mockId = 0;
  mockMe = { userId: 'u1', roles: [], permissions: ALL };
  qc = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retryDelay: 0 } } });
  await setLanguage('en');
});

describe('stk texts', () => {
  test('English, Hindi and Marathi have the same keys', () => {
    expect(flat(parts.hi).sort()).toEqual(flat(parts.en).sort());
    expect(flat(parts.mr).sort()).toEqual(flat(parts.en).sort());
  });
  test('every nav entry has a description', () => {
    expect(Object.keys(parts.en.nav).sort()).toEqual(Object.keys(parts.en.featureDesc).sort());
  });
});

describe('stk logic', () => {
  test('variance from decimal text', () => {
    expect(varianceOf('8.5', '10.000000')).toBe('-1.5');
    expect(varianceOf('10', '10')).toBe('0');
    expect(varianceOf('0.1', '0')).toBe('0.1');
  });
  test('opening CSV: header, rows, bad rows', () => {
    expect(parseOpeningCsv('sku,qty')).toEqual({ error: 'header' });
    expect(parseOpeningCsv('skuCode,qty,unitCost')).toEqual({ error: 'empty' });
    expect(parseOpeningCsv('skuCode,batchNo,expiryDate,qty,unitCost\nDAP,B1,2027-02-30,5,10')).toEqual({
      error: 'row',
      row: 2,
    });
    expect(parseOpeningCsv('skuCode,qty,unitCost\nDAP,1e3,10')).toEqual({ error: 'row', row: 2 });
    expect(parseOpeningCsv('skuCode,batchNo,expiryDate,qty,unitCost\nDAP,B1,2027-02-28,5.5,10.25\n')).toEqual(
      { lines: [{ skuCode: 'DAP', batchNo: 'B1', expiryDate: '2027-02-28', qty: '5.5', unitCost: '10.25' }] },
    );
  });
  test('reorder rule order', () => {
    expect(checkRule({ minQty: '1', reorderLevel: '5', maxQty: '20', reorderQty: '10' })).toBeNull();
    expect(checkRule({ minQty: '6', reorderLevel: '5', maxQty: '20', reorderQty: '10' })).toBe('order');
    expect(checkRule({ minQty: '1', reorderLevel: 'x', maxQty: '20', reorderQty: '10' })).toBe('format');
  });
});

describe('stock counts', () => {
  const list = { items: [count({ lines: undefined })] };
  const answers = (o: Record<string, unknown> = {}) =>
    mockGet.mockImplementation(async (path: string) => {
      const base: Record<string, unknown> = {
        '/inventory/counts': list,
        '/inventory/counts/c1': count(),
        '/warehouses': { items: [{ id: 'w1', branchId: 'br1', name: 'Main godown', status: 'ACTIVE' }] },
      };
      const v = path in o ? o[path] : base[path];
      if (v instanceof Error) throw v;
      return v;
    });

  test('list, empty, offline, error with reference, denied', async () => {
    answers();
    const a = await render(<CountsScreen />, { wrapper });
    expect(await screen.findByText('CNT-1 · Counting')).toBeTruthy();
    await a.unmount();
    answers({ '/inventory/counts': { items: [] } });
    const b = await render(<CountsScreen />, { wrapper });
    expect(await screen.findByText('No stock counts.')).toBeTruthy();
    await b.unmount();
    qc.clear();
    answers({ '/inventory/counts': new ApiError(0, null, 'c-1') });
    const c = await render(<CountsScreen />, { wrapper });
    expect(await screen.findByText('No network. Check your connection and try again.')).toBeTruthy();
    await c.unmount();
    qc.clear();
    answers({
      '/inventory/counts': new ApiError(500, { title: 'BOOM', correlationId: 'corr-77' }, 'corr-77'),
    });
    const d = await render(<CountsScreen />, { wrapper });
    expect(await screen.findByText(/corr-77/)).toBeTruthy();
    await d.unmount();
    qc.clear();
    mockGet.mockClear();
    mockMe = { userId: 'u1', roles: [], permissions: ['sales.pos.use'] };
    await render(<CountsScreen />, { wrapper });
    expect(await screen.findByText('You do not have permission for this screen.')).toBeTruthy();
    expect(mockGet).not.toHaveBeenCalled();
  });

  test('typing a count shows the difference and records only the typed lines with one key', async () => {
    answers();
    mockPost.mockRejectedValueOnce(new ApiError(0, null, 'c')).mockResolvedValue(count());
    await render(<CountsScreen />, { wrapper });
    await press('Open CNT-1');
    await type('Counted quantity for DAP', '8.5');
    expect(await screen.findByText('Difference: -1.5')).toBeTruthy();
    await press('Save counted quantities');
    await screen.findByText(/No network/);
    await press('Save counted quantities');
    await screen.findByText('Counts saved.');
    const [path, opts] = mockPost.mock.calls[0]!;
    expect(path).toBe('/inventory/counts/c1/record');
    expect(opts.body).toEqual({ lines: [{ skuId: 's1', batchId: 'b1', countedQty: '8.5' }] });
    expect(mockPost.mock.calls[1]![1].idempotencyKey).toBe(opts.idempotencyKey);
  });

  test('a bad quantity blocks saving; sending is blocked while lines are uncounted', async () => {
    answers();
    await render(<CountsScreen />, { wrapper });
    await press('Open CNT-1');
    await type('Counted quantity for DAP', '8,5');
    expect(await screen.findByText('Enter the counted quantity as digits.')).toBeTruthy();
    expect(
      screen.getByLabelText('Save counted quantities').props.accessibilityState?.disabled ??
        screen.getByLabelText('Save counted quantities').props.disabled,
    ).toBeTruthy();
    expect(
      screen.getByLabelText('Send for approval').props.accessibilityState?.disabled ??
        screen.getByLabelText('Send for approval').props.disabled,
    ).toBeTruthy();
    expect(mockPost).not.toHaveBeenCalled();
  });

  test('approve and reject only for the approver; reject needs a note', async () => {
    answers({ '/inventory/counts/c1': count({ status: 'SUBMITTED' }) });
    mockPost.mockResolvedValue({});
    const a = await render(<CountsScreen />, { wrapper });
    await press('Open CNT-1');
    await press('Approve and post differences');
    await screen.findByText('Approved. The differences are posted.');
    expect(mockPost.mock.calls[0]![0]).toBe('/inventory/counts/c1/approve');
    await press('Reject');
    await type('Reason for rejecting', 'ok');
    expect(
      screen.getByLabelText('Reject the count').props.accessibilityState?.disabled ??
        screen.getByLabelText('Reject the count').props.disabled,
    ).toBeTruthy();
    await type('Reason for rejecting', 'Counted twice, wrong shelf');
    await press('Reject the count');
    await waitFor(() => expect(mockPost.mock.calls[1]![0]).toBe('/inventory/counts/c1/reject'));
    expect(mockPost.mock.calls[1]![1].body).toEqual({ note: 'Counted twice, wrong shelf' });
    await a.unmount();
    mockMe = { userId: 'u1', roles: [], permissions: ['inventory.view'] };
    await render(<CountsScreen />, { wrapper });
    await press('Open CNT-1');
    await screen.findByText('Difference: 0.000000');
    expect(screen.queryByLabelText('Approve and post differences')).toBeNull();
  });

  test('start a count sends the warehouse and freeze flag, never a tenant', async () => {
    answers();
    mockPost.mockResolvedValue(count());
    await render(<CountsScreen />, { wrapper });
    await press('Start a count');
    await press('Main godown');
    await press('Start count');
    await screen.findByText('The count has started.');
    expect(mockPost.mock.calls[0]![1].body).toEqual({ warehouseId: 'w1', freeze: true });
    expect(JSON.stringify(mockPost.mock.calls[0])).not.toMatch(/tenant/i);
  });
});

describe('ledger', () => {
  test('rows, hidden value, movement type filter, balance', async () => {
    mockGet.mockResolvedValue({
      items: [
        {
          businessDate: '2026-11-02',
          movementType: 'SALE_ISSUE',
          skuCode: 'DAP',
          batchNo: 'B7',
          warehouseCode: 'MAIN',
          qty: '-2',
          value: null,
          sourceType: 'INVOICE',
          reasonCode: null,
          runningBalance: '8',
        },
      ],
      currentBalance: null,
    });
    await render(<LedgerScreen />, { wrapper });
    expect(await screen.findByText('SALE_ISSUE · -2')).toBeTruthy();
    expect(screen.getByText('INVOICE · Balance 8')).toBeTruthy();
    expect(screen.getByText('Pick one product to see its balance.')).toBeTruthy();
    await press('ADJUST_PLUS');
    await waitFor(() =>
      expect(mockGet.mock.calls.at(-1)![1].query).toEqual({ limit: 100, type: 'ADJUST_PLUS' }),
    );
  });
});

describe('opening stock', () => {
  test('one line posts with decimal text and one key', async () => {
    mockGet.mockImplementation(async (p: string) =>
      p === '/warehouses'
        ? { items: [{ id: 'w1', branchId: 'b', name: 'Main godown' }] }
        : p === '/products'
          ? { items: [{ id: 's1', code: 'DAP', name: 'DAP 50kg' }] }
          : { items: [] },
    );
    mockPost.mockResolvedValue({});
    await render(<OpeningScreen />, { wrapper });
    await press('Main godown');
    await type('Product', 'DAP');
    await press('DAP DAP 50kg');
    await type('Quantity in base unit', '12.5');
    await type('Unit cost', '1200.50');
    await press('Post opening stock');
    await screen.findByText('Opening stock posted.');
    const body = mockPost.mock.calls[0]![1].body;
    expect(mockPost.mock.calls[0]![0]).toBe('/inventory/opening');
    expect(body.lines).toEqual([{ skuId: 's1', qty: '12.5', unitCost: '1200.50' }]);
    expect(typeof body.lines[0].qty).toBe('string');
  });

  test('CSV is checked with dryRun first; posting needs the check and the same file', async () => {
    mockGet.mockImplementation(async (p: string) =>
      p === '/warehouses' ? { items: [{ id: 'w1', branchId: 'b', name: 'Main godown' }] } : { items: [] },
    );
    mockPost.mockImplementation(async (_p: string, o: { body: { dryRun?: boolean } }) =>
      o.body.dryRun ? { lineCount: 2, totalValue: '1500.0000' } : {},
    );
    await render(<OpeningScreen />, { wrapper });
    await press('Paste CSV');
    await press('Main godown');
    expect(
      screen.getByLabelText('Post all lines').props.accessibilityState?.disabled ??
        screen.getByLabelText('Post all lines').props.disabled,
    ).toBeTruthy();
    await type('CSV rows', 'skuCode,qty,unitCost\nDAP,10,100\nURE,5,100');
    await press('Check the file');
    expect(await screen.findByText('Checked: 2 lines, value ₹1,500.00. Nothing is posted yet.')).toBeTruthy();
    expect(mockPost.mock.calls[0]![1].body.dryRun).toBe(true);
    await type('CSV rows', 'skuCode,qty,unitCost\nDAP,10,100');
    expect(screen.queryByText(/Checked: 2 lines/)).toBeNull();
    await press('Check the file');
    await screen.findByText(/Checked: 2 lines/);
    await press('Post all lines');
    await screen.findByText('Opening stock posted.');
    const last = mockPost.mock.calls.at(-1)![1].body;
    expect(last.dryRun).toBeUndefined();
    expect(last.lines).toHaveLength(1);
  });

  test('a bad CSV row is reported and nothing is sent', async () => {
    mockGet.mockResolvedValue({ items: [] });
    await render(<OpeningScreen />, { wrapper });
    await press('Paste CSV');
    await type('CSV rows', 'skuCode,qty,unitCost\nDAP,abc,100');
    expect(await screen.findByText('Row 2 is not valid.')).toBeTruthy();
    expect(mockPost).not.toHaveBeenCalled();
  });

  test('without the opening permission the screen is closed', async () => {
    mockMe = { userId: 'u1', roles: [], permissions: ['inventory.view'] };
    await render(<OpeningScreen />, { wrapper });
    expect(await screen.findByText('You do not have permission for this screen.')).toBeTruthy();
  });
});

describe('expiry', () => {
  const batch = {
    id: 'b1',
    skuCode: 'DAP',
    skuName: 'DAP 50kg',
    batchNo: 'B7',
    expiryDate: '2026-12-01',
    daysToExpiry: 19,
    onHand: '10',
    valueAtRisk: '12000.0000',
    status: 'ACTIVE',
  };
  test('near-expiry list asks for 60 days and request extension sends the body', async () => {
    mockGet.mockResolvedValue({ items: [batch] });
    mockPost.mockResolvedValue({});
    await render(<ExpiryScreen />, { wrapper });
    expect(await screen.findByText('DAP DAP 50kg')).toBeTruthy();
    expect(mockGet.mock.calls[0]![1].query).toEqual({ expiringWithinDays: 60, limit: 200 });
    expect(screen.getByText('₹12,000.00')).toBeTruthy();
    await press('Request extension for B7');
    await type('New expiry date', '2027-02-30');
    expect(await screen.findByText('Use a real date as YYYY-MM-DD.')).toBeTruthy();
    await type('New expiry date', '2027-03-01');
    await type('Reason', 'Re-test passed');
    await type('Document reference', 'LAB-44');
    await press('Send the request');
    await screen.findByText('The request was sent for approval.');
    expect(mockPost.mock.calls[0]![0]).toBe('/inventory/batches/b1/extend');
    expect(mockPost.mock.calls[0]![1].body).toEqual({
      newExpiry: '2027-03-01',
      reason: 'Re-test passed',
      documentRef: 'LAB-44',
    });
  });
  test('approve a pending extension with a note', async () => {
    mockGet.mockResolvedValue({
      items: [
        {
          id: 'x1',
          skuCode: 'DAP',
          batchNo: 'B7',
          newExpiry: '2027-03-01',
          reason: 'Re-test',
          documentRef: 'LAB-44',
        },
      ],
    });
    mockPost.mockResolvedValue({});
    await render(<ExpiryScreen />, { wrapper });
    await press('Extension requests');
    await press('Approve');
    await type('Note', 'Certificate seen');
    await press('Approve the extension');
    await screen.findByText('The extension is approved.');
    expect(mockPost.mock.calls[0]![0]).toBe('/inventory/batch-extensions/x1/approve');
    expect(mockPost.mock.calls[0]![1].body).toEqual({ note: 'Certificate seen' });
  });
});

describe('reorder', () => {
  const rule = {
    skuId: 's1',
    branchId: 'br1',
    skuCode: 'DAP',
    skuName: 'DAP 50kg',
    branchName: 'Main',
    minQty: '5',
    reorderLevel: '10',
    maxQty: '50',
    reorderQty: '20',
  };
  const answers = () =>
    mockGet.mockImplementation(async (p: string) =>
      p === '/alerts'
        ? {
            items: [
              {
                skuCode: 'URE',
                skuName: 'Urea',
                branchName: 'Main',
                qty: '2',
                threshold: '10',
                openedAt: '2026-11-01T04:00:00Z',
              },
            ],
          }
        : p === '/inventory/reorder-rules'
          ? { items: [rule] }
          : p === '/branches'
            ? { items: [{ id: 'br1', name: 'Main' }] }
            : p === '/products'
              ? { items: [{ id: 's1', code: 'DAP', name: 'DAP 50kg' }] }
              : { items: [] },
    );
  test('alerts and rules are shown; remove deletes with the branch id', async () => {
    answers();
    mockDelete.mockResolvedValue(null);
    await render(<ReorderScreen />, { wrapper });
    expect(await screen.findByText('Main · Available 2 · Reorder at 10 · 1 Nov 2026')).toBeTruthy();
    await press('Remove');
    await screen.findByText('The reorder level is removed.');
    expect(mockDelete.mock.calls[0]![0]).toBe('/inventory/reorder-rules/s1/br1');
  });
  test('minimum above the reorder level is refused on screen, a good rule is saved as text', async () => {
    answers();
    mockPut.mockResolvedValue({});
    await render(<ReorderScreen />, { wrapper });
    await press('Set a reorder level');
    await type('Product', 'DAP');
    await press('DAP DAP 50kg');
    await type('Minimum', '12');
    await type('Reorder level', '10');
    await type('Maximum', '50');
    await type('Reorder quantity', '20');
    expect(await screen.findByText(/Minimum must not exceed/)).toBeTruthy();
    expect(
      screen.getByLabelText('Save').props.accessibilityState?.disabled ??
        screen.getByLabelText('Save').props.disabled,
    ).toBeTruthy();
    await type('Minimum', '5');
    await press('Save');
    await screen.findByText('The reorder level is saved.');
    expect(mockPut.mock.calls[0]![0]).toBe('/inventory/reorder-rules');
    expect(mockPut.mock.calls[0]![1].body).toEqual({
      rules: [{ skuId: 's1', minQty: '5', reorderLevel: '10', maxQty: '50', reorderQty: '20' }],
    });
  });
});

describe('valuation and write off', () => {
  test('valuation shows totals from strings and needs the cost permission', async () => {
    mockGet.mockResolvedValue({
      asOn: '2026-11-12',
      totalValue: '125000.5000',
      totalQty: '40',
      valuedBy: 'WEIGHTED_AVG',
      warning: null,
      rows: [
        {
          skuCode: 'DAP',
          skuName: 'DAP 50kg',
          branchName: 'Main',
          qty: '40',
          avgCost: '3125.0125',
          value: '125000.5000',
        },
      ],
    });
    const a = await render(<ValuationScreen />, { wrapper });
    expect(await screen.findByText('Total value as on 12 Nov 2026')).toBeTruthy();
    expect(screen.getAllByText('₹1,25,000.50').length).toBeGreaterThan(0);
    expect(screen.getByText('₹3,125.0125')).toBeTruthy();
    await a.unmount();
    mockMe = { userId: 'u1', roles: [], permissions: ['inventory.view'] };
    await render(<ValuationScreen />, { wrapper });
    expect(await screen.findByText('You do not have permission for this screen.')).toBeTruthy();
  });
  test('write off needs the confirmation tick, then posts the line', async () => {
    mockGet.mockImplementation(async (p: string) =>
      p === '/warehouses'
        ? {
            items: [
              { id: 'w9', branchId: 'b', name: 'Damaged godown', sellable: false },
              { id: 'w1', branchId: 'b', name: 'Main godown', sellable: true },
            ],
          }
        : { items: [{ id: 's1', code: 'DAP', name: 'DAP 50kg' }] },
    );
    mockPost.mockResolvedValue({});
    await render(<WriteOffScreen />, { wrapper });
    expect(await screen.findByLabelText('Damaged godown')).toBeTruthy();
    expect(screen.queryByLabelText('Main godown')).toBeNull();
    await press('Damaged godown');
    await type('Product', 'DAP');
    await press('DAP DAP 50kg');
    await type('Quantity', '3');
    await press('EXPIRED');
    expect(
      screen.getByLabelText('Write off').props.accessibilityState?.disabled ??
        screen.getByLabelText('Write off').props.disabled,
    ).toBeTruthy();
    await press('I understand this posts a loss and cannot be undone here');
    await press('Write off');
    await screen.findByText('The stock is written off.');
    expect(mockPost.mock.calls[0]![0]).toBe('/inventory/damage/write-off');
    expect(mockPost.mock.calls[0]![1].body).toEqual({
      warehouseId: 'w9',
      reasonCode: 'EXPIRED',
      lines: [{ skuId: 's1', qty: '3' }],
    });
  });
});

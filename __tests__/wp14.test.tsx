import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { i18n, setLanguage } from '../src/i18n';
import { ApiError } from '../src/api/errors';
import { memoryStore, secureStore } from '../src/features/offline/store';
import { createJournal } from '../src/features/offline/journal';
import { backoffMs, runSync, type Transport } from '../src/features/offline/sync';
import {
  checkGrant,
  estimateTotal,
  offlineOps,
  openOffline,
  orCached,
  prepareOffline,
  resetOffline,
  resetSyncBackoff,
  searchCachedProducts,
} from '../src/features/offline/offline';
import { OfflineBillsScreen } from '../src/features/offline/OfflineBillsScreen';
import PosScreen from '../src/features/pos/PosScreen';
import type { ApiClient } from '../src/api/client';

const mockGet = jest.fn();
const mockPost = jest.fn();
let mockId = 0;
const mockClient = { get: (...a: unknown[]) => mockGet(...a), post: (...a: unknown[]) => mockPost(...a) };
const DEVICE = 'dev-12345678';
jest.mock('../src/auth/AuthProvider', () => ({
  useAuth: () => ({
    status: 'signedIn',
    me: { userId: 'u-1', roles: [], permissions: ['sales.pos.use', 'sales.payment', 'integration.sync.use'] },
    client: mockClient,
  }),
}));
jest.mock('../src/device', () => ({
  newId: () => `id-${++mockId}`,
  getDeviceId: () => Promise.resolve('dev-12345678'),
  getAppVersion: () => '1.0.0',
}));
jest.mock('../src/features/stock/BarcodeScanner', () => ({ BarcodeScanner: () => null }));
jest.mock('expo-secure-store', () => {
  const m = new Map<string, string>();
  return {
    getItemAsync: (k: string) => Promise.resolve(m.get(k) ?? null),
    setItemAsync: (k: string, v: string) => {
      if (!/^[A-Za-z0-9._-]+$/.test(k)) return Promise.reject(new Error(`bad key ${k}`));
      if (v.length > 2048) return Promise.reject(new Error('too big'));
      m.set(k, v);
      return Promise.resolve();
    },
    deleteItemAsync: (k: string) => Promise.resolve(void m.delete(k)),
    __m: m,
  };
});
jest.mock('expo-file-system', () => {
  const files = new Map<string, string>();
  class File {
    name: string;
    constructor(_dir: unknown, name: string) {
      this.name = name;
    }
    get exists() {
      return files.has(this.name);
    }
    create() {
      files.set(this.name, '');
    }
    write(s: string) {
      files.set(this.name, s);
    }
    text() {
      return Promise.resolve(files.get(this.name) ?? '');
    }
  }
  return { File, Paths: { document: 'doc' }, __files: files };
});

const net = () => new ApiError(0, null);
const future = () => new Date(Date.now() + 48 * 3_600_000).toISOString();
const grantFor = (deviceId: string, expiresAt = future()) => ({
  grant: JSON.stringify({ v: 1, deviceId, expiresAt }),
  signature: 'sig',
  expiresAt,
});
const urea = {
  id: 'p-1',
  code: 'URE-50',
  name: 'Urea 50kg',
  status: 'ACTIVE',
  sellable: true,
  saleBlocked: false,
  banned: false,
  mrp: '300.00',
  sellingPrice: '280.00',
  baseUomCode: 'BAG',
  primaryBarcode: '8901234567890',
};

let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);
beforeEach(async () => {
  mockGet.mockReset();
  mockPost.mockReset();
  mockId = 0;
  resetOffline();
  resetSyncBackoff();
  (jest.requireMock('expo-secure-store') as { __m: Map<string, string> }).__m.clear();
  (jest.requireMock('expo-file-system') as { __files: Map<string, string> }).__files.clear();
  client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retryDelay: 0 } } });
  await setLanguage('en');
});

describe('journal and sync, like the web library', () => {
  const journal = () =>
    createJournal({ store: memoryStore(), deviceId: DEVICE, newId: () => `n${++mockId}` });
  const transport = (
    push: Transport['push'],
    status: Transport['status'] = async () => ({ items: [] }),
  ): Transport => ({
    push,
    status,
    pull: async () => ({ items: [], cursor: null, more: false }),
  });

  test('a bill is written first, with its own id and a provisional number', async () => {
    const j = journal();
    const a = await j.append('SALE_INVOICE', { branchId: 'b-1' });
    const b = await j.append('SALE_INVOICE', { branchId: 'b-1' });
    expect(a.clientOpId).toBe(`${DEVICE}-n1`);
    expect(a.localNumber).toBe('OFF-DEV1-00001');
    expect(b.seq).toBe(2);
    expect(await j.pendingInfo()).toEqual({ count: 2, oldestAt: a.createdAt });
  });

  test('the server decides: booked, for review, refused; the payload is the online bill', async () => {
    const j = journal();
    const [a, b, c] = [
      await j.append('SALE_INVOICE', { n: 1 }),
      await j.append('SALE_INVOICE', { n: 2 }),
      await j.append('SALE_INVOICE', { n: 3 }),
    ];
    const push = jest.fn(async (body: Record<string, unknown>) => {
      expect(body).toMatchObject({
        deviceId: DEVICE,
        appVersion: '1.0.0',
        platform: 'ANDROID',
        pending: { count: 3 },
      });
      expect((body.ops as { payload: unknown }[]).map((o) => o.payload)).toEqual([
        { n: 1 },
        { n: 2 },
        { n: 3 },
      ]);
      return {
        results: [
          {
            clientOpId: a.clientOpId,
            status: 'APPLIED' as const,
            result: { number: 'INV-7', total: '560.00' },
          },
          {
            clientOpId: b.clientOpId,
            status: 'CONFLICT' as const,
            error: { code: 'CREDIT_LIMIT', message: 'over limit' },
            conflictId: 'cf-1',
          },
          {
            clientOpId: c.clientOpId,
            status: 'REJECTED' as const,
            error: { code: 'FORBIDDEN', message: 'no' },
          },
        ],
      };
    });
    const out = await runSync({ journal: j, transport: transport(push), appVersion: '1.0.0' });
    expect(out).toMatchObject({
      sent: 3,
      applied: 1,
      conflicts: 1,
      rejected: 1,
      offline: false,
      failures: 0,
    });
    expect((await j.get(a.clientOpId))!.result).toEqual({ number: 'INV-7', total: '560.00' });
    expect((await j.get(b.clientOpId))!.conflictId).toBe('cf-1');
    expect((await j.get(c.clientOpId))!.state).toBe('REJECTED');
  });

  test('no answer: the bills stay SENDING, then the server is asked about them instead of guessing', async () => {
    const j = journal();
    const a = await j.append('SALE_INVOICE', { n: 1 });
    const out = await runSync({
      journal: j,
      transport: transport(async () => Promise.reject(net())),
      appVersion: '1',
      failures: 2,
    });
    expect(out).toMatchObject({ offline: true, failures: 3 });
    expect((await j.get(a.clientOpId))!.state).toBe('SENDING');
    const push = jest.fn(async () => ({
      results: [{ clientOpId: a.clientOpId, status: 'APPLIED' as const }],
    }));
    // the server never saw it: safe to send again
    await runSync({ journal: j, transport: transport(push, async () => ({ items: [] })), appVersion: '1' });
    expect(push).toHaveBeenCalledTimes(1);
    expect((await j.get(a.clientOpId))!.state).toBe('APPLIED');
  });

  test('a bill the server already booked is not sent again after a crash', async () => {
    const j = journal();
    const a = await j.append('SALE_INVOICE', { n: 1 });
    await j.update(a.clientOpId, { state: 'SENDING' });
    const push = jest.fn();
    await runSync({
      journal: j,
      transport: transport(push, async () => ({
        items: [{ clientOpId: a.clientOpId, status: 'APPLIED', result: { number: 'INV-9' } }],
      })),
      appVersion: '1',
    });
    expect(push).not.toHaveBeenCalled();
    expect((await j.get(a.clientOpId))!.state).toBe('APPLIED');
  });

  test('an app that is too old: the bills go back to waiting and the refusal is passed on', async () => {
    const j = journal();
    const a = await j.append('SALE_INVOICE', { n: 1 });
    const old = new ApiError(426, { title: 'UPGRADE_REQUIRED', status: 426 } as never);
    await expect(
      runSync({ journal: j, transport: transport(async () => Promise.reject(old)), appVersion: '0.1.0' }),
    ).rejects.toBe(old);
    expect((await j.get(a.clientOpId))!.state).toBe('PENDING');
  });

  test('backoff doubles from 5 s up to 15 minutes', () => {
    expect([0, 1, 2, 3].map((n) => backoffMs(n))).toEqual([0, 5000, 10000, 20000]);
    expect(backoffMs(30)).toBe(15 * 60_000);
  });
});

describe('the phone side', () => {
  test('secure storage: a large bill is kept in parts, listed in order and deleted cleanly', async () => {
    const s = secureStore('u.u-1');
    const big = { lines: Array.from({ length: 80 }, (_, i) => ({ skuId: `sku-${i}`, qty: '1' })) };
    await s.put('op:000000000002', big);
    await s.put('op:000000000001', { small: true });
    expect(JSON.stringify(big).length).toBeGreaterThan(2048);
    expect(await s.get('op:000000000002')).toEqual(big);
    expect((await s.list('op:')).map(([k]) => k)).toEqual(['op:000000000001', 'op:000000000002']);
    await s.delete('op:000000000002');
    expect(await s.get('op:000000000002')).toBeUndefined();
    expect((await s.list('op:')).length).toBe(1);
  });

  test('the offline permission: for this phone and not expired', () => {
    expect(checkGrant(undefined, DEVICE)).toEqual({ ok: false, reason: 'NOT_PREPARED' });
    expect(checkGrant(grantFor('other-phone-1'), DEVICE)).toEqual({ ok: false, reason: 'WRONG_DEVICE' });
    expect(checkGrant(grantFor(DEVICE, '2020-01-01T00:00:00Z'), DEVICE)).toEqual({
      ok: false,
      reason: 'EXPIRED',
    });
    expect(checkGrant({ grant: 'x', signature: '', expiresAt: '' }, DEVICE)).toEqual({
      ok: false,
      reason: 'MALFORMED',
    });
    const now = Date.parse('2026-11-19T00:00:00Z');
    expect(checkGrant(grantFor(DEVICE, '2026-11-20T12:00:00Z'), DEVICE, now)).toMatchObject({
      ok: true,
      hoursLeft: 36,
    });
  });

  test('the estimate: price x quantity less discounts, as decimals; none without a price', () => {
    expect(
      estimateTotal(
        [
          { qty: '2', unitPrice: '', listPrice: '280.00', discountPct: '10' },
          { qty: '1.5', unitPrice: '100.10', listPrice: null, discountPct: '' },
        ],
        '5',
      ),
    ).toBe('621.44'); // (504.00 + 150.15) less 5 %
    expect(estimateTotal([{ qty: '1', unitPrice: '', listPrice: null, discountPct: '' }], '')).toBeNull();
  });

  test('prepare: grant and the product list (changes after a cursor), then search without network', async () => {
    mockPost.mockResolvedValue(grantFor(DEVICE));
    mockGet
      .mockResolvedValueOnce({ items: [urea], cursor: 'c1', more: true })
      .mockResolvedValueOnce({
        items: [{ ...urea, id: 'p-2', code: 'DAP', name: 'DAP 50kg', banned: true }],
        cursor: 'c2',
        more: false,
      });
    const r = await prepareOffline(mockClient as unknown as ApiClient, 'u-1');
    expect(r).toMatchObject({ grant: { ok: true }, products: 2 });
    expect(mockPost).toHaveBeenCalledWith(
      '/sync/offline-grant',
      expect.objectContaining({ body: { deviceId: DEVICE } }),
    );
    expect(mockGet.mock.calls[1][1].query).toMatchObject({ entity: 'products', cursor: 'c1' });
    expect((await searchCachedProducts('u-1', 'urea')).map((p) => p.id)).toEqual(['p-1']);
    expect(await searchCachedProducts('u-1', 'dap')).toEqual([]); // banned products are not sold offline either
    expect((await searchCachedProducts('u-1', '8901234567890')).map((p) => p.id)).toEqual(['p-1']);
  });

  test('branches: online first and kept; without network the kept copy', async () => {
    const b = [{ id: 'b-1', name: 'Main' }];
    expect(await orCached('u-1', 'branches', async () => b)).toEqual(b);
    await waitFor(async () =>
      expect(await orCached('u-1', 'branches', async () => Promise.reject(net()))).toEqual(b),
    );
    await expect(orCached('u-2', 'branches', async () => Promise.reject(net()))).rejects.toBeInstanceOf(
      ApiError,
    );
  });
});

describe('the counter without network', () => {
  async function setUp(prepared: boolean) {
    if (prepared) {
      const { store } = await openOffline('u-1');
      await store.put('meta:grant', grantFor(DEVICE));
    }
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/branches') return { items: [{ id: 'b-1', name: 'Main', status: 'ACTIVE' }] };
      if (path === '/warehouses')
        return { items: [{ id: 'w-1', branchId: 'b-1', name: 'Shop', status: 'ACTIVE', sellable: true }] };
      if (path === '/settings/payment-modes') return { items: [{ code: 'CASH', enabled: true }] };
      if (path === '/products') return { items: [urea] };
      return { items: [] };
    });
    mockPost.mockRejectedValue(net()); // the network drops before the bill is priced
    await render(<PosScreen />, { wrapper });
    await fireEvent.changeText(await screen.findByLabelText(i18n.t('pos.searchProduct')), 'urea');
    await fireEvent.press(await screen.findByLabelText('Urea 50kg'));
    expect(await screen.findByText('Estimate: ₹280.00')).toBeTruthy();
    await fireEvent.press(screen.getByText('Take payment'));
    await fireEvent.changeText(screen.getByLabelText('Amount in CASH'), '300');
  }

  test('saves the bill to the journal with the online body and shows its provisional number', async () => {
    await setUp(true);
    await fireEvent.press(await screen.findByText('Save bill offline'));
    expect(await screen.findByText('Saved offline as OFF-DEV1-00001')).toBeTruthy();
    const [op] = await offlineOps('u-1');
    expect(op).toMatchObject({
      kind: 'SALE_INVOICE',
      state: 'PENDING',
      note: { estimate: '280.00', lines: 1 },
    });
    expect(op!.payload).toMatchObject({
      branchId: 'b-1',
      lines: [{ skuId: 'p-1', warehouseId: 'w-1', qty: '1' }],
      tenders: [{ mode: 'CASH', amount: '300.00' }],
    });
    expect(op!.payload).not.toHaveProperty('listPrice');
    expect(mockPost.mock.calls.every(([p]) => p === '/sales/invoices/preview')).toBe(true); // never finalized online as well
  });

  test('not prepared for offline: the button stays off and says why', async () => {
    await setUp(false);
    expect(
      await screen.findByText('Not yet. Tap "Prepare for offline" while the network is on.'),
    ).toBeTruthy();
    expect(screen.getByLabelText('Save bill offline').props.accessibilityState?.disabled).toBe(true);
  });
});

describe('offline bills screen', () => {
  test('lists a waiting bill, sends it and shows the invoice number the server gave', async () => {
    const { journal, store } = await openOffline('u-1');
    await store.put('meta:grant', grantFor(DEVICE));
    const op = await journal.append(
      'SALE_INVOICE',
      { branchId: 'b-1' },
      { note: { estimate: '280.00', lines: 1 } },
    );
    mockPost.mockImplementation(async (path: string) =>
      path === '/sync/push'
        ? {
            results: [
              { clientOpId: op.clientOpId, status: 'APPLIED', result: { number: 'INV-42', total: '294.00' } },
            ],
          }
        : { items: [] },
    );
    await render(<OfflineBillsScreen />, { wrapper });
    expect(await screen.findByText('OFF-DEV1-00001')).toBeTruthy();
    expect(screen.getByText(/Waiting for network/)).toBeTruthy();
    expect(screen.getByText(/Yes, for 4[78](\.\d)? more hours/)).toBeTruthy();
    await fireEvent.press(screen.getByText('Send now'));
    expect(await screen.findByText('INV-42')).toBeTruthy();
    expect(screen.getByText('Sent: 1 booked, 0 for review, 0 refused.')).toBeTruthy();
    const push = mockPost.mock.calls.find(([p]) => p === '/sync/push')!;
    expect(push[1].idempotencyKey).toMatch(/^id-/);
  });

  test('a bill the server could not book is shown for the office to review', async () => {
    const { journal } = await openOffline('u-1');
    const op = await journal.append('SALE_INVOICE', { branchId: 'b-1' });
    await journal.update(op.clientOpId, {
      state: 'CONFLICT',
      error: { code: 'CREDIT_LIMIT', message: 'over the credit limit' },
    });
    await render(<OfflineBillsScreen />, { wrapper });
    expect(await screen.findByText(/over the credit limit/)).toBeTruthy();
  });

  test('Hindi', async () => {
    await setLanguage('hi');
    await render(<OfflineBillsScreen />, { wrapper });
    expect(await screen.findByText('ऑफ़लाइन बिल')).toBeTruthy();
  });
});

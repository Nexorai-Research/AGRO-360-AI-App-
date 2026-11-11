import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '../src/i18n';
import { ApiError } from '../src/api/errors';
import StockScreen from '../app/stock';

const mockClient = { get: jest.fn() };
jest.mock('../src/auth/AuthProvider', () => ({ useAuth: () => ({ client: mockClient, status: 'signedIn', me: null }) }));
// expo-camera is a native module; the scanner is replaced by a button that "reads" a barcode.
jest.mock('../src/features/stock/BarcodeScanner', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories may only load modules lazily
  const { Pressable, Text } = require('react-native');
  return {
    BarcodeScanner: ({ visible, onScanned }: { visible: boolean; onScanned: (c: string) => void }) =>
      visible ? (
        <Pressable accessibilityLabel="fake-scan" onPress={() => onScanned('8901234567890')}>
          <Text>scanner</Text>
        </Pressable>
      ) : null,
  };
});

const row = (o: Record<string, unknown> = {}) => ({
  skuId: 's1',
  skuCode: 'UREA-50',
  skuName: 'Urea 50 kg',
  branchId: 'b1',
  branchName: 'Main',
  warehouseId: 'w1',
  warehouseCode: 'WH1',
  warehouseKind: 'MAIN',
  sellable: true,
  batchId: 'bt1',
  batchNo: 'B-001',
  batchStatus: 'ACTIVE',
  expiryDate: '2027-01-01',
  daysToExpiry: 200,
  onHand: '12.500000',
  reserved: '2.000000',
  available: '10.500000',
  inTransit: '0.000000',
  avgCost: null,
  value: null,
  ...o,
});

const batch = (o: Record<string, unknown> = {}) => ({
  id: 'bt1',
  skuId: 's1',
  skuCode: 'UREA-50',
  skuName: 'Urea 50 kg',
  batchNo: 'B-001',
  mfgDate: null,
  expiryDate: '2027-01-01',
  daysToExpiry: 20,
  status: 'ACTIVE',
  statusReason: null,
  onHand: '5.000000',
  available: '5.000000',
  unitCost: null,
  valueAtRisk: null,
  version: 1,
  ...o,
});

let qc: QueryClient;
async function renderScreen() {
  qc = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0, gcTime: Infinity } } });
  return await render(
    <QueryClientProvider client={qc}>
      <StockScreen />
    </QueryClientProvider>,
  );
}

function answer(map: Record<string, unknown>) {
  mockClient.get.mockImplementation(async (path: string) => {
    const r = map[path];
    if (r instanceof Error) throw r;
    if (r === undefined) throw new ApiError(404, { title: 'NOT_FOUND' });
    return r;
  });
}

const callsTo = (path: string) => mockClient.get.mock.calls.filter((c) => c[0] === path);
const lastQuery = (path: string) => callsTo(path).at(-1)?.[1]?.query as Record<string, unknown>;

beforeEach(() => mockClient.get.mockReset());

describe('stock check screen', () => {
  it('shows rows with quantities as trimmed decimals, hides value when the API sends none, and shows an as-of time', async () => {
    answer({
      '/inventory/stock': { items: [row(), row({ skuId: 's2', skuName: 'DAP 50 kg', batchId: null, batchNo: null, value: '1234567.50', onHand: '3.000000', available: '3.000000' })], total: 2 },
      '/branches': { items: [] },
    });
    await renderScreen();
    expect(await screen.findByText('Urea 50 kg')).toBeTruthy();
    expect(screen.getByText('12.5')).toBeTruthy(); // not 12.500000
    expect(screen.getByText('10.5')).toBeTruthy();
    expect(screen.getByText('Value: ₹12,34,567.50')).toBeTruthy(); // only the row with a value
    expect(screen.getAllByText(/^Value:/)).toHaveLength(1);
    expect(screen.getByText(/2 rows · as of/)).toBeTruthy();
  });

  it('sends only the query names the server accepts and never a tenant id', async () => {
    answer({ '/inventory/stock': { items: [row()], total: 1 }, '/branches': { items: [] } });
    await renderScreen();
    await screen.findByText('Urea 50 kg');
    const q = lastQuery('/inventory/stock');
    const allowed = ['product', 'q', 'branch', 'warehouse', 'batch', 'includeZero', 'limit', 'offset'];
    Object.keys(q).forEach((k) => expect(allowed).toContain(k));
    expect(JSON.stringify(q)).not.toMatch(/tenant/i);
    expect(q.limit).toBe(50);
    expect(q.offset).toBe(0);
  });

  it('highlights expired and soon-to-expire batches in words and colour', async () => {
    answer({
      '/inventory/stock': {
        items: [row({ daysToExpiry: -3, expiryDate: '2026-11-08' }), row({ skuId: 's2', warehouseId: 'w2', daysToExpiry: 10, expiryDate: '2026-11-21' })],
        total: 2,
      },
      '/branches': { items: [] },
    });
    await renderScreen();
    expect(await screen.findByText('Expired 3 days ago (2026-11-08)')).toBeTruthy();
    expect(screen.getByText('Expires in 10 days (2026-11-21)')).toBeTruthy();
    expect(screen.getByTestId('expiry-expired')).toBeTruthy();
    expect(screen.getByTestId('expiry-soon')).toBeTruthy();
  });

  it('shows the empty state', async () => {
    answer({ '/inventory/stock': { items: [], total: 0 }, '/branches': { items: [] } });
    await renderScreen();
    expect(await screen.findByTestId('state-empty')).toBeTruthy();
  });

  it('shows permission denied on a 403 and offers no retry', async () => {
    answer({ '/inventory/stock': new ApiError(403, { title: 'FORBIDDEN' }), '/branches': new ApiError(403, { title: 'FORBIDDEN' }) });
    await renderScreen();
    expect(await screen.findByTestId('state-denied')).toBeTruthy();
    expect(screen.getByText('You do not have permission to see stock.')).toBeTruthy();
    expect(screen.queryByText('Try again')).toBeNull();
  });

  it('shows the offline state when there is no network and nothing saved', async () => {
    answer({ '/inventory/stock': new ApiError(0, null), '/branches': { items: [] } });
    await renderScreen();
    expect(await screen.findByTestId('state-offline')).toBeTruthy();
  });

  it('shows a generic error with the correlation id for an unknown server error', async () => {
    answer({ '/inventory/stock': new ApiError(500, { title: 'INTERNAL', correlationId: 'corr-9' }), '/branches': { items: [] } });
    await renderScreen();
    const el = await screen.findByTestId('state-error');
    expect(el).toBeTruthy();
    expect(screen.getByText(/corr-9/)).toBeTruthy();
  });

  it('keeps old rows and says they may be out of date when a refresh fails for lack of network', async () => {
    answer({ '/inventory/stock': { items: [row()], total: 1 }, '/branches': { items: [] } });
    await renderScreen();
    await screen.findByText('Urea 50 kg');
    answer({ '/inventory/stock': new ApiError(0, null), '/branches': { items: [] } });
    await act(async () => {
      await qc.refetchQueries({ queryKey: ['stock', 'rows'] });
    });
    expect(await screen.findByTestId('banner-warn')).toBeTruthy();
    expect(screen.getByText(/may be out of date/)).toBeTruthy();
    expect(screen.getByText('Urea 50 kg')).toBeTruthy();
  });

  it('searches by name after a short pause', async () => {
    answer({ '/inventory/stock': { items: [row()], total: 1 }, '/branches': { items: [] } });
    await renderScreen();
    await screen.findByText('Urea 50 kg');
    await fireEvent.changeText(screen.getByLabelText('Search product code or name'), ' urea ');
    await waitFor(() => expect(lastQuery('/inventory/stock').q).toBe('urea'));
  });

  it('filters by branch when the user can list branches', async () => {
    answer({
      '/inventory/stock': { items: [row()], total: 1 },
      '/branches': { items: [{ id: 'b1', name: 'Main' }, { id: 'b2', name: 'North' }] },
      '/warehouses': { items: [] },
    });
    await renderScreen();
    await fireEvent.press(await screen.findByText('North'));
    await waitFor(() => expect(lastQuery('/inventory/stock').branch).toBe('b2'));
  });

  it('scans a barcode, finds the product, and filters the stock by it', async () => {
    answer({
      '/inventory/stock': { items: [row()], total: 1 },
      '/branches': { items: [] },
      '/products/by-barcode/8901234567890': { id: 'sku-77', code: 'DAP-50', name: 'DAP 50 kg', status: 'ACTIVE' },
    });
    await renderScreen();
    await screen.findByText('Urea 50 kg');
    await fireEvent.press(screen.getByText('Scan'));
    await fireEvent.press(await screen.findByLabelText('fake-scan'));
    await waitFor(() => expect(lastQuery('/inventory/stock').product).toBe('sku-77'));
    expect(screen.getByText(/DAP 50 kg \(DAP-50\)/)).toBeTruthy();
  });

  it('says so when no product has the scanned barcode', async () => {
    answer({ '/inventory/stock': { items: [row()], total: 1 }, '/branches': { items: [] } });
    await renderScreen();
    await screen.findByText('Urea 50 kg');
    await fireEvent.press(screen.getByText('Scan'));
    await fireEvent.press(await screen.findByLabelText('fake-scan'));
    expect(await screen.findByText('No product has the barcode 8901234567890.')).toBeTruthy();
  });

  it('lists batches expiring within 60 days', async () => {
    answer({
      '/inventory/stock': { items: [row()], total: 1 },
      '/inventory/batches': { items: [batch()], total: 1 },
      '/branches': { items: [] },
    });
    await renderScreen();
    await screen.findByText('Urea 50 kg');
    await fireEvent.press(screen.getByText('Batches and expiry'));
    await fireEvent.press(await screen.findByText('Expiring in 60 days'));
    await waitFor(() => expect(lastQuery('/inventory/batches').expiringWithinDays).toBe(60));
    expect(await screen.findByText('Expires in 20 days (2027-01-01)')).toBeTruthy();
  });
});

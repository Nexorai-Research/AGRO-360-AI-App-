import type { ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setLanguage } from '../src/i18n';
import PosScreen from '../src/features/pos/PosScreen';
import type { ProductLite } from '../src/features/pos/api';

// Web parity 11.7, the counter side: a reorder hand-off fills the cart with the customer and the lines.
const mockGet = jest.fn();
const mockPost = jest.fn();
let mockId = 0;
const mockClient = { get: (...a: unknown[]) => mockGet(...a), post: (...a: unknown[]) => mockPost(...a) };
jest.mock('../src/auth/AuthProvider', () => ({
  useAuth: () => ({
    status: 'signedIn',
    me: { userId: 'u-1', roles: [], permissions: ['sales.pos.use'] },
    client: mockClient,
  }),
}));
jest.mock('../src/device', () => ({ newId: () => `key-${++mockId}` }));
jest.mock('../src/features/stock/BarcodeScanner', () => ({ BarcodeScanner: () => null }));

const urea: ProductLite = {
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
  primaryBarcode: null,
};
let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);
beforeEach(async () => {
  mockGet.mockReset();
  mockPost.mockReset();
  mockPost.mockResolvedValue({
    docType: 'TAX_INVOICE',
    placeOfSupply: '27',
    totals: {
      gross: '2240.00',
      discount: '0.00',
      taxable: '2133.33',
      cgst: '53.34',
      sgst: '53.33',
      igst: '0.00',
      roundOff: '0.00',
      total: '2240.00',
    },
  });
  mockGet.mockImplementation(async (path: string, o?: { query?: Record<string, unknown> }) => {
    if (path === '/branches') return { items: [{ id: 'b-1', name: 'Main', status: 'ACTIVE' }] };
    if (path === '/warehouses')
      return { items: [{ id: 'w-1', branchId: 'b-1', name: 'Shop', status: 'ACTIVE', sellable: true }] };
    if (path === '/customers/c-1') return { id: 'c-1', name: 'Ramesh Patil', mobile: '9876543210' };
    if (path === '/products') return { items: o?.query?.q === 'URE-50' ? [urea] : [] };
    return { items: [] };
  });
  client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retryDelay: 0 } } });
  await setLanguage('en');
});

test('11.7 the counter opens with the customer and the reordered quantities; a missing code is named', async () => {
  const reorder = JSON.stringify({
    customerId: 'c-1',
    lines: [
      { code: 'URE-50', qty: 8 },
      { code: 'OLD-1', qty: 2 },
    ],
  });
  await render(<PosScreen reorder={reorder} />, { wrapper });
  expect(await screen.findByText(/Ramesh Patil/)).toBeTruthy();
  expect((await screen.findAllByText(/Urea 50kg/)).length).toBeGreaterThan(0);
  expect(await screen.findByText('Cart made. Not found or not for sale now: OLD-1.')).toBeTruthy();
  await waitFor(() => expect(mockPost).toHaveBeenCalled());
  const body = mockPost.mock.calls[0][1].body;
  expect(body.customerId).toBe('c-1');
  expect(body.lines[0]).toMatchObject({ skuId: 'p-1', warehouseId: 'w-1', qty: '8' });
});

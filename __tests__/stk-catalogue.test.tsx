import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '../src/api/errors';
import { i18n, setLanguage } from '../src/i18n';
import parts from '../i18n-parts/stk.json';
import {
  BrandsScreen,
  CategoriesScreen,
  MissingHsnScreen,
  PriceListsScreen,
  UnitsScreen,
  parseListLines,
  validUnit,
} from '../src/features/stk/CatalogueScreens';
import ProductMoreScreen, { parseUnitLines } from '../src/features/stk/ProductMoreScreen';

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockPut = jest.fn();
const mockPatch = jest.fn();
const mockDelete = jest.fn();
let mockMe: { userId: string; roles: string[]; permissions?: string[] };
let mockId = 0;
const mockClient = {
  get: (...a: unknown[]) => mockGet(...a),
  post: (...a: unknown[]) => mockPost(...a),
  put: (...a: unknown[]) => mockPut(...a),
  patch: (...a: unknown[]) => mockPatch(...a),
  delete: (...a: unknown[]) => mockDelete(...a),
};
jest.mock('../src/auth/AuthProvider', () => ({
  useAuth: () => ({ status: 'signedIn', me: mockMe, client: mockClient }),
}));
jest.mock('../src/device', () => ({ newId: () => `key-${++mockId}` }));
jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({ id: 'p1' }) }));

let qc: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={qc}>{children}</QueryClientProvider>
);
const ALL = [
  'product.view',
  'product.category.manage',
  'product.brand.manage',
  'product.uom.manage',
  'pricing.manage',
  'product.tax.manage',
  'product.regulated',
];
const press = async (label: string) => fireEvent.press(await screen.findByLabelText(label));
const type = async (label: string, v: string) => fireEvent.changeText(await screen.findByLabelText(label), v);
const disabled = (label: string) => {
  const el = screen.getByLabelText(label);
  return Boolean(el.props.accessibilityState?.disabled ?? el.props.disabled);
};
const route = (map: Record<string, unknown>) =>
  mockGet.mockImplementation(async (p: string) => {
    const v = map[p];
    if (v instanceof Error) throw v;
    return v ?? { items: [] };
  });

const cat = (o: Record<string, unknown> = {}) => ({
  id: 'k1',
  name: 'Fertilizers',
  parentId: null,
  level: 1,
  defaultHsn: '3105',
  defaultTaxCode: null,
  batchRequired: true,
  expiryRequired: false,
  regulatedType: 'FERTILIZER',
  productCount: 3,
  childCount: 0,
  version: 4,
  ...o,
});

beforeAll(() => {
  for (const l of ['en', 'hi', 'mr'] as const) i18n.addResourceBundle(l, 'translation', parts[l], true, true);
});
beforeEach(async () => {
  [mockGet, mockPost, mockPut, mockPatch, mockDelete].forEach((m) => m.mockReset());
  mockId = 0;
  mockMe = { userId: 'u1', roles: [], permissions: ALL };
  qc = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retryDelay: 0 } } });
  await setLanguage('en');
});

describe('catalogue logic', () => {
  test('price list lines: price, percent, bad lines', () => {
    expect(parseListLines('DAP-50, 1200\nURE, -5%')).toEqual({
      rows: [
        { code: 'DAP-50', price: '1200' },
        { code: 'URE', adjustPct: '-5' },
      ],
    });
    expect(parseListLines('DAP-50')).toEqual({ badLine: 1 });
    expect(parseListLines('DAP-50, 12e3')).toEqual({ badLine: 1 });
    expect(parseListLines('A, 1\nB, x%')).toEqual({ badLine: 2 });
  });
  test('unit lines and unit form', () => {
    expect(parseUnitLines('bag=50\nbox = 12.5')).toEqual({
      rows: [
        { code: 'BAG', factor: '50' },
        { code: 'BOX', factor: '12.5' },
      ],
    });
    expect(parseUnitLines('BAG')).toEqual({ badLine: 1 });
    expect(parseUnitLines('BAG=0')).toEqual({ badLine: 1 });
    expect(validUnit('KG', 'Kilogram', '3')).toBe(true);
    expect(validUnit('KG', 'Kilogram', '7')).toBe(false);
  });
});

describe('categories', () => {
  test('list with defaults; edit sends the version as If-Match and PATCH', async () => {
    route({ '/product-categories': { items: [cat()] } });
    mockPatch.mockResolvedValue({});
    await render(<CategoriesScreen />, { wrapper });
    expect(await screen.findByText('Fertilizers')).toBeTruthy();
    expect(screen.getByText('3 products · batch · FERTILIZER · HSN 3105')).toBeTruthy();
    await press('Edit');
    await type('Name', 'Fertilisers');
    await press('Save');
    await screen.findByText('The category is saved.');
    const [path, opts] = mockPatch.mock.calls[0]!;
    expect(path).toBe('/product-categories/k1');
    expect(opts.version).toBe(4);
    expect(opts.body.name).toBe('Fertilisers');
    expect(opts.idempotencyKey).toBe('key-1');
  });
  test('delete only for an empty category; merge needs a target', async () => {
    route({
      '/product-categories': {
        items: [cat({ productCount: 0 }), cat({ id: 'k2', name: 'Seeds', productCount: 5 })],
      },
    });
    mockDelete.mockResolvedValue(null);
    mockPost.mockResolvedValue({});
    await render(<CategoriesScreen />, { wrapper });
    await screen.findByText('Seeds');
    expect(screen.getAllByLabelText('Delete')).toHaveLength(1);
    await press('Delete');
    await screen.findByText('The category is deleted.');
    expect(mockDelete.mock.calls[0]![0]).toBe('/product-categories/k1');
    fireEvent.press(screen.getAllByLabelText('Merge into...')[1]!);
    await screen.findByLabelText('Merge');
    expect(disabled('Merge')).toBe(true);
    await press('Fertilizers');
    await press('Merge');
    await screen.findByText('The categories are merged.');
    expect(mockPost.mock.calls[0]![1].body).toEqual({ targetId: 'k1' });
  });
  test('view only: no add button; denied without view permission; error shows the reference', async () => {
    mockMe = { userId: 'u1', roles: [], permissions: ['product.view'] };
    route({ '/product-categories': { items: [cat()] } });
    const a = await render(<CategoriesScreen />, { wrapper });
    await screen.findByText('Fertilizers');
    expect(screen.queryByLabelText('Add a category')).toBeNull();
    await a.unmount();
    route({ '/product-categories': new ApiError(500, { title: 'BOOM', correlationId: 'corr-9' }, 'corr-9') });
    qc.clear();
    const b = await render(<CategoriesScreen />, { wrapper });
    expect(await screen.findByText(/corr-9/)).toBeTruthy();
    await b.unmount();
    mockMe = { userId: 'u1', roles: [], permissions: [] };
    await render(<CategoriesScreen />, { wrapper });
    expect(await screen.findByText('You do not have permission for this screen.')).toBeTruthy();
  });
  test('a lost answer retries the same action with the same key', async () => {
    route({ '/product-categories': { items: [] } });
    mockPost.mockRejectedValueOnce(new ApiError(0, null, 'c')).mockResolvedValue({});
    await render(<CategoriesScreen />, { wrapper });
    await press('Add a category');
    await type('Name', 'Pesticides');
    await press('Save');
    await screen.findByText(/No network/);
    await press('Save');
    await screen.findByText('The category is saved.');
    expect(mockPost.mock.calls[1]![1].idempotencyKey).toBe(mockPost.mock.calls[0]![1].idempotencyKey);
  });
});

describe('brands and units', () => {
  test('a duplicate warning asks first, then resends with the flag', async () => {
    route({
      '/manufacturers': { items: [{ id: 'm1', name: 'IFFCO', registrationNo: null, phone: null }] },
      '/brands': { items: [] },
    });
    mockPost.mockRejectedValueOnce(new ApiError(409, { title: 'DUPLICATE_WARNING' })).mockResolvedValue({});
    await render(<BrandsScreen />, { wrapper });
    await press('Add a brand');
    await type('Brand name', 'Kisan');
    await press('Save brand');
    expect(await screen.findByText('A similar record already exists. Save anyway?')).toBeTruthy();
    expect(mockPost.mock.calls[0]![1].body.confirmDuplicate).toBeUndefined();
    await press('Save anyway');
    await screen.findByText('Saved.');
    expect(mockPost.mock.calls[1]![1].body.confirmDuplicate).toBe(true);
  });
  test('unit precision is checked before sending', async () => {
    route({ '/uoms': { items: [{ id: 'u1', code: 'KG', name: 'Kilogram', precision: 3, active: true }] } });
    mockPost.mockResolvedValue({});
    await render(<UnitsScreen />, { wrapper });
    expect(await screen.findByText('KG · Kilogram')).toBeTruthy();
    await press('Add a unit');
    await type('Code', 'BAG');
    await type('Name', 'Bag');
    await type('Decimal places (0 to 6)', '9');
    expect(disabled('Save unit')).toBe(true);
    await type('Decimal places (0 to 6)', '0');
    await press('Save unit');
    await screen.findByText('The unit is saved.');
    expect(mockPost.mock.calls[0]![1].body).toEqual({ code: 'BAG', name: 'Bag', precision: 0 });
  });
});

describe('price lists', () => {
  const list = {
    id: 'l1',
    code: 'RETAIL',
    name: 'Retail',
    kind: 'RETAIL',
    revision: 1,
    status: 'DRAFT',
    itemCount: 1,
    effectiveFrom: null,
    effectiveTo: null,
    version: 2,
  };
  const full = {
    ...list,
    items: [
      {
        code: 'DAP-50',
        name: 'DAP',
        price: '1200.0000',
        adjustPct: null,
        effectivePrice: '1200.0000',
        mrp: '1350.0000',
      },
    ],
    assignments: [],
  };
  test('open a draft, publish with a date and the version', async () => {
    route({ '/price-lists': { items: [list] }, '/price-lists/l1': full });
    mockPost.mockResolvedValue({});
    await render(<PriceListsScreen />, { wrapper });
    await press('Open RETAIL');
    expect(await screen.findByText('₹1,350.00')).toBeTruthy();
    await press('Publish');
    await type('Effective from', '2026-02-30');
    expect(disabled('Publish now')).toBe(true);
    await type('Effective from', '2026-12-01');
    await press('Publish now');
    await screen.findByText('The price list is published.');
    expect(mockPost.mock.calls[0]![0]).toBe('/price-lists/l1/publish');
    expect(mockPost.mock.calls[0]![1].version).toBe(2);
    expect(mockPost.mock.calls[0]![1].body).toEqual({ effectiveFrom: '2026-12-01' });
  });
  test('edit lines looks up product ids and keeps prices as text; unknown code is reported', async () => {
    route({
      '/price-lists': { items: [list] },
      '/price-lists/l1': full,
      '/products': { items: [{ id: 's1', code: 'DAP-50' }] },
    });
    mockPut.mockResolvedValue({});
    await render(<PriceListsScreen />, { wrapper });
    await press('Open RETAIL');
    await press('Edit lines');
    await type('Lines', 'DAP-50, 1250.50\nNOPE, 5%');
    await press('Save lines');
    expect(await screen.findByText('Product NOPE was not found.')).toBeTruthy();
    expect(mockPut).not.toHaveBeenCalled();
    await type('Lines', 'DAP-50, 1250.50');
    await press('Save lines');
    await screen.findByText('The lines are saved.');
    expect(mockPut.mock.calls[0]![1].body).toEqual({ items: [{ skuId: 's1', price: '1250.50' }] });
    expect(mockPut.mock.calls[0]![1].version).toBe(2);
  });
  test('a published list offers revise and end, not edit; view-only user has no buttons', async () => {
    route({
      '/price-lists': { items: [{ ...list, status: 'PUBLISHED' }] },
      '/price-lists/l1': { ...full, status: 'PUBLISHED' },
    });
    await render(<PriceListsScreen />, { wrapper });
    await press('Open RETAIL');
    expect(await screen.findByLabelText('Revise')).toBeTruthy();
    expect(screen.getByLabelText('End the list')).toBeTruthy();
    expect(screen.queryByLabelText('Edit lines')).toBeNull();
  });
});

describe('products without HSN', () => {
  test('list and none state', async () => {
    route({
      '/products/missing-hsn': {
        total: 1,
        items: [{ id: 'p', code: 'X1', name: 'Mystery', categoryName: null }],
      },
    });
    const a = await render(<MissingHsnScreen />, { wrapper });
    expect(await screen.findByText('1 products have no HSN or tax category')).toBeTruthy();
    await a.unmount();
    qc.clear();
    route({ '/products/missing-hsn': { total: 0, items: [] } });
    await render(<MissingHsnScreen />, { wrapper });
    expect(await screen.findByText(/Every active product has an HSN/)).toBeTruthy();
  });
});

describe('product extras', () => {
  const prod = {
    id: 'p1',
    version: 7,
    name: 'DAP',
    regulatedType: 'NONE',
    requiresRecommendation: false,
    requiresFarmerId: false,
    maxQtyPerCustomerDay: null,
    saleBlocked: false,
    banned: false,
  };
  test('tax change sends the date and HSN as text', async () => {
    route({
      '/products/p1/tax': {
        current: { hsnCode: '3105', taxCode: null },
        resolved: { code: 'GST5', ratePct: '5' },
        history: [{ effectiveFrom: '2026-01-01', hsnCode: '3105', taxCode: null, reason: null }],
      },
    });
    mockPost.mockResolvedValue({});
    await render(<ProductMoreScreen />, { wrapper });
    await press('Tax');
    expect(await screen.findByText('Today: HSN 3105, category -')).toBeTruthy();
    await press('Change tax mapping');
    await type('Effective from', '2026-12-01');
    await type('HSN code', '31051000');
    await press('Save tax mapping');
    await screen.findByText('The tax mapping is saved.');
    expect(mockPost.mock.calls[0]![0]).toBe('/products/p1/tax');
    expect(mockPost.mock.calls[0]![1].body).toEqual({ effectiveFrom: '2026-12-01', hsnCode: '31051000' });
  });
  test('alternate units are mapped to unit ids and sent', async () => {
    route({
      '/products/p1/units': { items: [{ code: 'KG', isBase: true, factor: '1', precision: 3 }] },
      '/uoms': { items: [{ id: 'u9', code: 'BAG' }] },
    });
    mockPut.mockResolvedValue({});
    await render(<ProductMoreScreen />, { wrapper });
    await press('Edit alternate units');
    await type('Unit lines', 'bag=50');
    await press('Save units');
    await screen.findByText('The units are saved.');
    expect(mockPut.mock.calls[0]![1].body).toEqual({ units: [{ uomId: 'u9', factor: '50' }] });
  });
  test('regulated flags need the permission; saving sends the version', async () => {
    route({ '/products/p1': prod });
    mockPatch.mockResolvedValue({});
    const a = await render(<ProductMoreScreen />, { wrapper });
    await press('Rules');
    await press('Edit rules');
    await press('PESTICIDE');
    await press("Needs the farmer's identity");
    await type('Max quantity per customer per day (blank = no limit)', '2.5');
    await press('Save rules');
    await screen.findByText('The rules are saved.');
    expect(mockPatch.mock.calls[0]![1].version).toBe(7);
    expect(mockPatch.mock.calls[0]![1].body).toMatchObject({
      regulatedType: 'PESTICIDE',
      requiresFarmerId: true,
      maxQtyPerCustomerDay: '2.5',
    });
    await a.unmount();
    mockMe = { userId: 'u1', roles: [], permissions: ['product.view'] };
    await render(<ProductMoreScreen />, { wrapper });
    await press('Rules');
    expect(await screen.findByText(/needs the regulated-product permission/)).toBeTruthy();
    expect(screen.queryByLabelText('Edit rules')).toBeNull();
  });
  test('history rows', async () => {
    route({
      '/products/p1/history': {
        items: [
          {
            at: '2026-11-01T04:00:00Z',
            action: 'UPDATE',
            field: 'mrp',
            oldValue: '100',
            newValue: '110',
            reason: 'new season',
          },
        ],
      },
    });
    await render(<ProductMoreScreen />, { wrapper });
    await press('History');
    expect(await screen.findByText('UPDATE · mrp')).toBeTruthy();
    expect(screen.getByText('1 Nov 2026 · 100 -> 110 · new season')).toBeTruthy();
  });
});

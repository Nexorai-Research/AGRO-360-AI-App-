import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '../src/api/errors';
import { setLanguage } from '../src/i18n';
import ProductsScreen from '../src/features/products/ProductsScreen';
import ProductDetailScreen from '../src/features/products/ProductDetailScreen';
import ProductFormScreen from '../src/features/products/ProductFormScreen';
import AdjustmentsScreen from '../src/features/inventory/AdjustmentsScreen';
import TransfersScreen from '../src/features/inventory/TransfersScreen';
import BatchesScreen from '../src/features/inventory/BatchesScreen';
import {
  costAboveSelling,
  emptyDraft,
  priceBody,
  toBody,
  validateDraft,
} from '../src/features/products/logic';
import { checkDelta, checkQty } from '../src/features/inventory/logic';

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockPatch = jest.fn();
const mockDelete = jest.fn();
const mockPush = jest.fn();
let mockMe: { userId: string; roles: string[]; permissions?: string[] };
let mockParams: Record<string, string> = {};
let mockId = 0;
const mockClient = {
  get: (...a: unknown[]) => mockGet(...a),
  post: (...a: unknown[]) => mockPost(...a),
  patch: (...a: unknown[]) => mockPatch(...a),
  delete: (...a: unknown[]) => mockDelete(...a),
};
jest.mock('../src/auth/AuthProvider', () => ({
  useAuth: () => ({
    status: 'signedIn',
    me: mockMe,
    client: mockClient,
    signIn: jest.fn(),
    signOut: jest.fn(),
  }),
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: mockPush, back: jest.fn() }),
  useLocalSearchParams: () => mockParams,
}));
jest.mock('../src/device', () => ({ newId: () => `key-${++mockId}` }));

let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

const product = {
  id: 'p-1',
  version: 3,
  code: 'URE-50',
  name: 'Urea 50kg',
  localName: null,
  status: 'ACTIVE',
  categoryId: 'cat-1',
  categoryName: 'Fertiliser',
  brandId: null,
  brandName: null,
  baseUomId: 'u-1',
  baseUomCode: 'BAG',
  batchTracked: false,
  expiryTracked: false,
  shelfLifeMonths: null,
  reorderLevel: null,
  sellable: true,
  purchasable: true,
  mrpControlled: true,
  hsnCode: '3102',
  taxCode: 'GST5',
  mrp: '300.00',
  sellingPrice: '280.00',
  purchasePrice: '240.00',
  primaryBarcode: null,
};

beforeEach(async () => {
  [mockGet, mockPost, mockPatch, mockDelete, mockPush].forEach((m) => m.mockReset());
  mockId = 0;
  mockParams = {};
  mockMe = { userId: 'u-1', roles: [], permissions: undefined };
  client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retryDelay: 0 } } });
  await setLanguage('en');
});

describe('product logic', () => {
  test('create needs name, category, unit, selling price; MRP item needs MRP and price may not exceed it', () => {
    expect(Object.keys(validateDraft(emptyDraft, true, false)).sort()).toEqual([
      'baseUomId',
      'categoryId',
      'mrp',
      'name',
      'sellingPrice',
    ]);
    const ok = { ...emptyDraft, name: 'A', categoryId: 'c', baseUomId: 'u', mrp: '100', sellingPrice: '90' };
    expect(validateDraft(ok, true, false)).toEqual({});
    expect(validateDraft({ ...ok, sellingPrice: '100.01' }, true, false).sellingPrice).toBe('aboveMrp');
    expect(validateDraft({ ...ok, sellingPrice: '9.12345' }, true, false).sellingPrice).toBe('price');
    expect(validateDraft({ ...ok, mrpControlled: false, mrp: '' }, true, false)).toEqual({});
  });
  test('body: blanks left out on create, cleared (null) on edit; cost only with the cost right', () => {
    const d = {
      ...emptyDraft,
      name: ' A ',
      categoryId: 'c',
      baseUomId: 'u',
      mrp: '100',
      sellingPrice: '90',
      purchasePrice: '70',
    };
    const c = toBody(d, true, true);
    expect(c).toMatchObject({ name: 'A', mrp: '100', sellingPrice: '90', purchasePrice: '70' });
    expect(c).not.toHaveProperty('brandId');
    expect(toBody(d, true, false)).not.toHaveProperty('purchasePrice');
    expect(toBody(d, false, true)).toMatchObject({ brandId: null, localName: null });
    expect(JSON.stringify(c)).not.toMatch(/tenant|franchise/i);
  });
  test('price body keeps only filled boxes; loss warning is decimal based', () => {
    expect(
      priceBody({ effectiveFrom: '2026-11-11', mrp: '', sellingPrice: '95', purchasePrice: '', reason: '' }),
    ).toEqual({ effectiveFrom: '2026-11-11', sellingPrice: '95' });
    expect(costAboveSelling('100.10', '100.1')).toBe(false);
    expect(costAboveSelling('100.11', '100.1')).toBe(true);
  });
  test('stock quantities are checked as decimals against what is on hand', () => {
    expect(checkDelta('-3', '2')).toBe('tooMany');
    expect(checkDelta('-2', '2')).toBe('ok');
    expect(checkDelta('0', '2')).toBe('zero');
    expect(checkDelta('1.2345', '2')).toBe('format');
    expect(checkQty('1', '0.5')).toBe('tooMany');
    expect(checkQty('0.5', '0.5')).toBe('ok');
  });
});

describe('products screens', () => {
  test('list shows products with rupees; no permission makes no call', async () => {
    mockGet.mockResolvedValue({ items: [product], total: 1 });
    await render(<ProductsScreen />, { wrapper });
    expect(await screen.findByText('Urea 50kg')).toBeTruthy();
    expect(screen.getByText(/URE-50 · Fertiliser · ₹280.00/)).toBeTruthy();
    mockGet.mockClear();
    mockMe = { userId: 'u-2', roles: [], permissions: [] };
    await render(<ProductsScreen />, { wrapper });
    expect(await screen.findAllByText('You do not have permission to see products.')).toBeTruthy();
    expect(mockGet).not.toHaveBeenCalled();
  });

  test('offline list shows a clear message', async () => {
    mockGet.mockRejectedValue(new ApiError(0, null));
    await render(<ProductsScreen />, { wrapper });
    expect(await screen.findByText('You are offline. Products load only online.')).toBeTruthy();
  });

  test('create: invalid form sends nothing; valid form posts once with a key; lost answer retry reuses the key', async () => {
    mockGet.mockImplementation(async (p: string) => {
      if (p === '/product-categories') return { items: [{ id: 'cat-1', name: 'Fertiliser', level: 1 }] };
      if (p === '/brands') return { items: [] };
      if (p === '/uoms') return { items: [{ id: 'u-1', name: 'Bag', code: 'BAG' }] };
      return { items: [] };
    });
    await render(<ProductFormScreen />, { wrapper });
    await fireEvent.press(await screen.findByLabelText('Save'));
    expect(mockPost).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Urea 50kg');
    await fireEvent.press(await screen.findByLabelText('Fertiliser'));
    await fireEvent.press(screen.getByLabelText('BAG'));
    await fireEvent.changeText(screen.getByLabelText('MRP'), '300');
    await fireEvent.changeText(screen.getByLabelText('Selling'), '280');
    let first = true;
    mockPost.mockImplementation(async () => {
      if (first) {
        first = false;
        throw new ApiError(0, null);
      }
      return { ...product };
    });
    await fireEvent.press(screen.getByLabelText('Save'));
    await fireEvent.press(await screen.findByLabelText('Save'));
    expect(await screen.findByText('Product Urea 50kg created.')).toBeTruthy();
    const keys = mockPost.mock.calls.map((c) => c[1].idempotencyKey);
    expect(keys).toEqual(['key-1', 'key-1']);
    expect(mockPost.mock.calls[0]![0]).toBe('/products');
    expect(mockPost.mock.calls[0]![1].body).toMatchObject({
      name: 'Urea 50kg',
      categoryId: 'cat-1',
      baseUomId: 'u-1',
      mrp: '300',
      sellingPrice: '280',
    });
  });

  test('duplicate warning asks first, then resends with confirmDuplicate', async () => {
    mockGet.mockImplementation(async (p: string) => {
      if (p === '/product-categories') return { items: [{ id: 'cat-1', name: 'Fertiliser', level: 1 }] };
      if (p === '/uoms') return { items: [{ id: 'u-1', name: 'Bag', code: 'BAG' }] };
      return { items: [] };
    });
    mockPost
      .mockRejectedValueOnce(new ApiError(409, { title: 'DUPLICATE_WARNING' }))
      .mockResolvedValue({ ...product });
    await render(<ProductFormScreen />, { wrapper });
    await fireEvent.changeText(await screen.findByLabelText('Name'), 'Urea 50kg');
    await fireEvent.press(await screen.findByLabelText('Fertiliser'));
    await fireEvent.press(screen.getByLabelText('BAG'));
    await fireEvent.changeText(screen.getByLabelText('MRP'), '300');
    await fireEvent.changeText(screen.getByLabelText('Selling'), '280');
    await fireEvent.press(screen.getByLabelText('Save'));
    await fireEvent.press(await screen.findByLabelText('Create anyway'));
    expect(await screen.findByText('Product Urea 50kg created.')).toBeTruthy();
    expect(mockPost.mock.calls[1]![1].body.confirmDuplicate).toBe(true);
  });

  test('edit sends If-Match version and clears blank optional fields', async () => {
    mockParams = { id: 'p-1' };
    mockGet.mockImplementation(async (p: string) => {
      if (p === '/products/p-1') return product;
      if (p === '/product-categories') return { items: [{ id: 'cat-1', name: 'Fertiliser', level: 1 }] };
      if (p === '/uoms') return { items: [{ id: 'u-1', name: 'Bag', code: 'BAG' }] };
      return { items: [] };
    });
    mockPatch.mockResolvedValue({ ...product, name: 'Urea 45kg' });
    await render(<ProductFormScreen />, { wrapper });
    await fireEvent.changeText(await screen.findByLabelText('Name'), 'Urea 45kg');
    await fireEvent.press(screen.getByLabelText('Save'));
    expect(await screen.findByText('Product Urea 45kg saved.')).toBeTruthy();
    const [path, o] = mockPatch.mock.calls[0]!;
    expect(path).toBe('/products/p-1');
    expect(o.version).toBe(3);
    expect(o.body).toMatchObject({ name: 'Urea 45kg', brandId: null });
  });

  test('detail: cost hidden without the cost right; stock warning needs a second deliberate tap', async () => {
    mockParams = { id: 'p-1' };
    mockMe = { userId: 'u-1', roles: [], permissions: ['product.view', 'product.update'] };
    mockGet.mockImplementation(async (p: string) => {
      if (p === '/products/p-1') return product;
      return { items: [] };
    });
    mockPost
      .mockRejectedValueOnce(new ApiError(409, { title: 'STOCK_ON_HAND_WARNING' }))
      .mockResolvedValue({});
    await render(<ProductDetailScreen />, { wrapper });
    expect(await screen.findByText('MRP ₹300.00 · Selling ₹280.00')).toBeTruthy();
    expect(screen.queryByText(/Cost ₹240/)).toBeNull();
    await fireEvent.press(screen.getByLabelText('Deactivate'));
    await fireEvent.press(await screen.findByLabelText('Continue'));
    expect(await screen.findByText('Product deactivated.')).toBeTruthy();
    expect(mockPost.mock.calls[1]![1].body).toEqual({ confirmStock: true });
    expect(screen.queryByLabelText('Generate internal EAN-13')).toBeNull(); // needs product.barcode
  });

  test('Hindi list title', async () => {
    await setLanguage('hi');
    mockGet.mockResolvedValue({ items: [], total: 0 });
    await render(<ProductsScreen />, { wrapper });
    expect(await screen.findByText('प्रोडक्ट')).toBeTruthy();
  });
});

describe('inventory screens', () => {
  const adj = (over = {}) => ({
    id: 'a-1',
    number: 'ADJ-1',
    branchId: 'b-1',
    reasonCode: 'DAMAGE',
    remarks: null,
    status: 'DRAFT',
    adjustmentDate: '2026-11-11',
    totalValue: '500.00',
    decisionNote: null,
    version: 1,
    ...over,
  });

  test('adjustment: draft can be submitted with a key; approve is hidden without the right; reject needs a reason', async () => {
    mockMe = { userId: 'u-1', roles: [], permissions: ['inventory.view', 'inventory.adjust.create'] };
    mockGet.mockResolvedValue({ items: [adj(), adj({ id: 'a-2', number: 'ADJ-2', status: 'SUBMITTED' })] });
    mockPost.mockResolvedValue({});
    await render(<AdjustmentsScreen />, { wrapper });
    expect(await screen.findByText('ADJ-1 · DRAFT')).toBeTruthy();
    expect(screen.queryByLabelText('Approve')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Submit'));
    expect(await screen.findByText('ADJ-1 submitted for approval.')).toBeTruthy();
    expect(mockPost.mock.calls[0]).toEqual([
      '/inventory/adjustments/a-1/submit',
      { idempotencyKey: 'key-1' },
    ]);
  });

  test('adjustment approver can approve and must give a reason to reject', async () => {
    mockGet.mockResolvedValue({ items: [adj({ status: 'SUBMITTED' })] });
    mockPost.mockResolvedValue({});
    await render(<AdjustmentsScreen />, { wrapper });
    await fireEvent.press(await screen.findByLabelText('Reject'));
    expect(screen.getByLabelText('Reject adjustment').props.accessibilityState?.disabled).toBe(true);
    await fireEvent.changeText(screen.getByLabelText('Reason'), 'not true');
    await fireEvent.press(screen.getByLabelText('Reject adjustment'));
    expect(await screen.findByText('ADJ-1 rejected.')).toBeTruthy();
    expect(mockPost.mock.calls[0]![1].body).toEqual({ note: 'not true' });
  });

  test('new adjustment: decrease above stock is refused on screen and nothing is sent', async () => {
    mockGet.mockImplementation(async (p: string) => {
      if (p === '/inventory/adjustments') return { items: [] };
      if (p === '/branches') return { items: [{ id: 'b-1', name: 'Main', status: 'ACTIVE' }] };
      if (p === '/warehouses')
        return { items: [{ id: 'w-1', branchId: 'b-1', name: 'Shop', status: 'ACTIVE' }] };
      if (p === '/inventory/batches')
        return {
          items: [
            {
              id: 'bt-1',
              skuId: 'p-1',
              skuCode: 'URE',
              skuName: 'Urea',
              batchNo: 'B1',
              expiryDate: null,
              status: 'ACTIVE',
              onHand: '2.000',
              available: '2.000',
            },
          ],
        };
      return { items: [] };
    });
    await render(<AdjustmentsScreen />, { wrapper });
    await fireEvent.press(await screen.findByLabelText('New adjustment'));
    await fireEvent.press(await screen.findByLabelText('Shop'));
    await fireEvent.press(screen.getByLabelText('DAMAGE'));
    await fireEvent.press(await screen.findByLabelText('URE / B1 (2.000)'));
    await fireEvent.changeText(screen.getByLabelText('Quantity (use - for a decrease)'), '-5');
    expect(await screen.findByText('More than what is on hand.')).toBeTruthy();
    expect(screen.getByLabelText('Save draft').props.accessibilityState?.disabled).toBe(true);
    await fireEvent.changeText(screen.getByLabelText('Quantity (use - for a decrease)'), '-1');
    mockPost.mockResolvedValue({});
    await fireEvent.press(screen.getByLabelText('Save draft'));
    expect(await screen.findByText('Draft saved. Submit it for approval.')).toBeTruthy();
    expect(mockPost.mock.calls[0]![1].body).toEqual({
      branchId: 'b-1',
      reasonCode: 'DAMAGE',
      lines: [{ warehouseId: 'w-1', skuId: 'p-1', batchId: 'bt-1', qtyDelta: '-1' }],
    });
  });

  test('transfer: posts between two warehouses of one branch with one key', async () => {
    mockGet.mockImplementation(async (p: string) => {
      if (p === '/inventory/transfers') return { items: [] };
      if (p === '/warehouses')
        return {
          items: [
            { id: 'w-1', branchId: 'b-1', name: 'Shop', status: 'ACTIVE', sellable: true },
            { id: 'w-2', branchId: 'b-1', name: 'Godown', status: 'ACTIVE', sellable: true },
            { id: 'w-3', branchId: 'b-2', name: 'Other', status: 'ACTIVE', sellable: true },
          ],
        };
      if (p === '/products')
        return {
          items: [
            {
              id: 'p-1',
              code: 'URE',
              name: 'Urea 50kg',
              status: 'ACTIVE',
              sellable: true,
              saleBlocked: false,
              banned: false,
              mrp: null,
              sellingPrice: null,
              baseUomCode: 'BAG',
              primaryBarcode: null,
            },
          ],
        };
      return { items: [] };
    });
    mockPost.mockResolvedValue({});
    await render(<TransfersScreen />, { wrapper });
    await fireEvent.press(await screen.findByLabelText('New transfer'));
    await fireEvent.press(await screen.findByLabelText('Shop'));
    expect(screen.queryAllByLabelText('Other').length).toBe(1); // only in the From list, never offered as a target
    await fireEvent.press(screen.getAllByLabelText('Godown').at(-1)!);
    await fireEvent.changeText(screen.getByLabelText('Search product'), 'ure');
    await fireEvent.press(await screen.findByLabelText('Urea 50kg', {}, { timeout: 3000 }));
    await fireEvent.changeText(screen.getByLabelText('Quantity (base unit)'), '4');
    await fireEvent.press(screen.getByLabelText('Post transfer'));
    expect(await screen.findByText('Transfer posted.')).toBeTruthy();
    expect(mockPost.mock.calls[0]![0]).toBe('/inventory/transfers/internal');
    expect(mockPost.mock.calls[0]![1].body).toEqual({
      fromWarehouseId: 'w-1',
      toWarehouseId: 'w-2',
      lines: [{ skuId: 'p-1', qty: '4' }],
    });
  });

  test('batches: block needs a reason; release only for a quarantined batch', async () => {
    mockGet.mockResolvedValue({
      items: [
        {
          id: 'bt-1',
          skuId: 'p-1',
          skuCode: 'URE',
          skuName: 'Urea',
          batchNo: 'B1',
          expiryDate: '2027-01-01',
          status: 'ACTIVE',
          onHand: '5.000',
          available: '5.000',
        },
        {
          id: 'bt-2',
          skuId: 'p-1',
          skuCode: 'URE',
          skuName: 'Urea',
          batchNo: 'B2',
          expiryDate: null,
          status: 'QUARANTINED',
          onHand: '1.000',
          available: '0.000',
        },
      ],
    });
    mockPost.mockResolvedValue({});
    await render(<BatchesScreen />, { wrapper });
    await fireEvent.press(await screen.findByLabelText('Block'));
    await fireEvent.changeText(screen.getByLabelText('Reason'), 'wet');
    await fireEvent.press(screen.getAllByLabelText('Block').at(-1)!);
    expect(await screen.findByText('Batch B1 blocked.')).toBeTruthy();
    expect(mockPost.mock.calls[0]).toEqual([
      '/inventory/batches/bt-1/block',
      { body: { reason: 'wet' }, idempotencyKey: 'key-1' },
    ]);
    expect(screen.getByLabelText('Release')).toBeTruthy();
  });

  test('inventory offline and no-permission states', async () => {
    mockGet.mockRejectedValue(new ApiError(0, null));
    await render(<AdjustmentsScreen />, { wrapper });
    expect(await screen.findByText('You are offline. Adjustments load only online.')).toBeTruthy();
    mockGet.mockClear();
    mockMe = { userId: 'u-3', roles: [], permissions: [] };
    await render(<BatchesScreen />, { wrapper });
    expect((await screen.findAllByText('You do not have permission to see stock.')).length).toBeGreaterThan(
      0,
    );
    expect(mockGet).not.toHaveBeenCalled();
  });
});

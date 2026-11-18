import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import parts from '../i18n-parts/wp2.json';
import step3 from '../i18n-parts/step3.json';
import stk from '../i18n-parts/stk.json';
import { i18n, setLanguage } from '../src/i18n';
import OrderFormScreen from '../src/features/purchase/OrderFormScreen';
import {
  AssignmentsCard,
  BulkTaxCard,
  SupplierNotes,
  bulkTaxBody,
  bulkTaxErrors,
  noteBody,
  noteErrors,
  parseAssignmentLines,
  type NoteForm,
} from '../src/features/stk/Parity2';

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockPut = jest.fn();
const mockPatch = jest.fn();
let mockMe: { userId: string; roles: string[]; permissions?: string[] };
let mockParams: Record<string, string> = {};
let mockId = 0;
jest.mock('../src/auth/AuthProvider', () => ({
  useAuth: () => ({
    status: 'signedIn',
    me: mockMe,
    client: {
      get: (...a: unknown[]) => mockGet(...a),
      post: (...a: unknown[]) => mockPost(...a),
      put: (...a: unknown[]) => mockPut(...a),
      patch: (...a: unknown[]) => mockPatch(...a),
    },
  }),
}));
jest.mock('../src/device', () => ({ newId: () => `key-${++mockId}` }));
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: mockReplace }),
  useLocalSearchParams: () => mockParams,
  Stack: { Screen: () => null },
}));
jest.mock('../src/features/stock/BarcodeScanner', () => ({ BarcodeScanner: () => null }));

let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);
beforeAll(() => {
  for (const lg of ['en', 'hi', 'mr'] as const)
    for (const p of [step3, stk, parts])
      i18n.addResourceBundle(lg, 'translation', (p as Record<string, object>)[lg], true, true);
});
beforeEach(async () => {
  [mockGet, mockPost, mockPut, mockPatch, mockReplace].forEach((m) => m.mockReset());
  mockId = 0;
  mockParams = {};
  mockMe = { userId: 'u-1', roles: [], permissions: undefined };
  client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retryDelay: 0 } } });
  await setLanguage('en');
});
const U1 = '11111111-1111-4111-8111-111111111111';
const U2 = '22222222-2222-4222-8222-222222222222';

describe('logic', () => {
  test('assignment lines: SCOPE:id, no repeats', () => {
    expect(parseAssignmentLines(`customer:${U1}\nCUSTOMER_CATEGORY:${U2}\n`)).toEqual({
      rows: [
        { scope: 'CUSTOMER', refId: U1 },
        { scope: 'CUSTOMER_CATEGORY', refId: U2 },
      ],
    });
    expect(parseAssignmentLines(`CUSTOMER:${U1}\nCUSTOMER:${U1}`)).toEqual({ badLine: 2 });
    expect(parseAssignmentLines('VILLAGE:abc')).toEqual({ badLine: 1 });
    expect(parseAssignmentLines('')).toEqual({ rows: [] });
  });
  test('bulk tax: a target, a new HSN or tax, valid codes', () => {
    const f = {
      effectiveFrom: '2026-12-01',
      categoryId: '',
      fromHsn: '3102',
      hsnCode: '310210',
      taxCode: '',
      hsnConfirmed: false,
      dryRun: true,
    };
    expect(bulkTaxErrors(f)).toEqual([]);
    expect(bulkTaxBody(f)).toEqual({
      effectiveFrom: '2026-12-01',
      fromHsn: '3102',
      set: { hsnCode: '310210' },
      dryRun: true,
    });
    expect(bulkTaxErrors({ ...f, fromHsn: '', hsnCode: '12345', taxCode: 'g' })).toEqual([
      'pick',
      'hsn',
      'tax',
    ]);
    expect(bulkTaxBody({ ...f, taxCode: 'gst5', hsnCode: '' }).set).toEqual({ taxCode: 'GST5' });
  });
  test('supplier note: credit names a bill, debit does not; tax only with the GST document', () => {
    const f: NoteForm = {
      supplierId: 's',
      branchId: 'b',
      kind: 'REDUCTION',
      billId: 'bill-1',
      taxable: '500',
      accountCode: '',
      gstDocument: false,
      supplierDocNo: '',
      supplierDocDate: '',
      cgst: '',
      sgst: '',
      igst: '',
      adjustmentDate: '',
      reason: 'rate difference',
    };
    expect(noteErrors(f)).toEqual([]);
    expect(noteBody(f)).toEqual({
      supplierId: 's',
      branchId: 'b',
      kind: 'REDUCTION',
      billId: 'bill-1',
      taxable: '500',
      gstDocument: false,
      reason: 'rate difference',
    });
    expect(noteErrors({ ...f, billId: '', accountCode: '6030', cgst: '10', igst: '5' })).toEqual([
      'bill',
      'account',
      'taxNeedsDoc',
      'both',
    ]);
    expect(noteErrors({ ...f, kind: 'INCREASE' })).toEqual(['noBill']);
    const g = {
      ...f,
      gstDocument: true,
      supplierDocNo: 'CN-7',
      supplierDocDate: '2026-11-10',
      cgst: '45',
      sgst: '45',
    };
    expect(noteErrors(g)).toEqual([]);
    expect(noteBody(g)).toMatchObject({
      supplierDocNo: 'CN-7',
      supplierDocDate: '2026-11-10',
      cgst: '45',
      sgst: '45',
      igst: '0',
    });
  });
});

describe('edit a draft purchase order (2.2)', () => {
  const order = (over = {}) => ({
    id: 'po-9',
    number: null,
    revision: 0,
    branchId: 'b-1',
    supplierId: 'sp-1',
    supplierName: 'Agro Dist',
    warehouseId: 'w-1',
    orderDate: '2026-11-15',
    expectedDate: null,
    status: 'DRAFT',
    total: '1000.00',
    createdBy: 'u-1',
    version: 4,
    subtotal: '1000.00',
    taxTotal: '0.00',
    notes: null,
    reason: null,
    lines: [
      {
        id: 'l1',
        lineNo: 1,
        skuId: 'p-1',
        skuCode: 'U45',
        skuName: 'Urea',
        qty: '10.000',
        rate: '100.0000',
        discountPct: '0.00',
        lineTotal: '1000.00',
        receivedQty: '0',
        closedQty: '0',
        pendingQty: '10',
      },
    ],
    ...over,
  });
  const lookups = (o: unknown) =>
    mockGet.mockImplementation((p: string) => {
      if (p === '/procurement/purchase-orders/po-9') return Promise.resolve(o);
      if (p === '/procurement/suppliers')
        return Promise.resolve({ items: [{ id: 'sp-1', name: 'Agro Dist', status: 'ACTIVE' }] });
      if (p === '/branches') return Promise.resolve({ items: [{ id: 'b-1', name: 'Baramati' }] });
      if (p === '/warehouses')
        return Promise.resolve({ items: [{ id: 'w-1', branchId: 'b-1', name: 'Main' }] });
      return Promise.reject(new Error(`unexpected GET ${p}`));
    });

  test('the form is filled from the draft and saved with PATCH and the version', async () => {
    mockParams = { edit: 'po-9' };
    lookups(order());
    mockPatch.mockResolvedValue({ id: 'po-9' });
    await render(<OrderFormScreen />, { wrapper });
    expect(await screen.findByText('Edit order Draft')).toBeTruthy();
    expect(await screen.findByDisplayValue('10')).toBeTruthy();
    expect(screen.getByDisplayValue('100')).toBeTruthy();
    await fireEvent.changeText(screen.getByDisplayValue('10'), '12');
    await fireEvent.press(screen.getByText('Save changes'));
    await waitFor(() => expect(mockPatch).toHaveBeenCalledTimes(1));
    expect(mockPatch.mock.calls[0][0]).toBe('/procurement/purchase-orders/po-9');
    expect(mockPatch.mock.calls[0][1].version).toBe(4);
    expect(mockPatch.mock.calls[0][1].body).toMatchObject({
      supplierId: 'sp-1',
      branchId: 'b-1',
      warehouseId: 'w-1',
      lines: [{ skuId: 'p-1', qty: '12', rate: '100' }],
    });
    expect(mockPost).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalled();
  });

  test('an approved order cannot be saved here', async () => {
    mockParams = { edit: 'po-9' };
    lookups(order({ status: 'APPROVED', number: 'PO-1' }));
    await render(<OrderFormScreen />, { wrapper });
    expect(await screen.findByText(/Only a draft order can be edited/)).toBeTruthy();
    await fireEvent.press(screen.getByText('Save changes'));
    expect(mockPatch).not.toHaveBeenCalled();
  });

  test('without the edit parameter it stays a new order', async () => {
    lookups(order());
    await render(<OrderFormScreen />, { wrapper });
    expect(await screen.findByText('New purchase order')).toBeTruthy();
    expect(mockGet).not.toHaveBeenCalledWith('/procurement/purchase-orders/po-9', expect.anything());
  });
});

describe('price list assignments (2.4) and bulk tax (2.5)', () => {
  test('assignments are saved with PUT and the version', async () => {
    mockPut.mockResolvedValue({});
    await render(
      <AssignmentsCard
        x={{ id: 'pl-1', version: 3, assignments: [{ scope: 'CUSTOMER', refId: U1 }] }}
        onDone={jest.fn()}
      />,
      { wrapper },
    );
    const area = screen.getByLabelText('Assignments');
    await fireEvent.changeText(area, `CUSTOMER:${U1}\nVILLAGE:x`);
    expect(screen.getByText(/Line 2 is not/)).toBeTruthy();
    await fireEvent.changeText(area, `CUSTOMER:${U1}\nCUSTOMER_CATEGORY:${U2}`);
    await fireEvent.press(screen.getByText('Save assignments'));
    await waitFor(() => expect(mockPut).toHaveBeenCalledTimes(1));
    expect(mockPut.mock.calls[0][0]).toBe('/price-lists/pl-1/assignments');
    expect(mockPut.mock.calls[0][1].version).toBe(3);
    expect(mockPut.mock.calls[0][1].body).toEqual({
      assignments: [
        { scope: 'CUSTOMER', refId: U1 },
        { scope: 'CUSTOMER_CATEGORY', refId: U2 },
      ],
    });
  });

  test('bulk tax: preview first and show what would change', async () => {
    mockGet.mockResolvedValue({ items: [{ id: 'cat-1', name: 'Fertilizers' }] });
    mockPost.mockResolvedValue({
      dryRun: true,
      matched: 5,
      changed: 3,
      unchanged: 2,
      sample: [{ code: 'U45', name: 'Urea' }],
    });
    await render(<BulkTaxCard />, { wrapper });
    await fireEvent.press(screen.getByText('Preview'));
    expect(await screen.findByText('Choose a category or an HSN prefix.')).toBeTruthy();
    await fireEvent.press(await screen.findByLabelText('Fertilizers'));
    await fireEvent.changeText(screen.getByLabelText('New tax category (for example GST5, EXEMPT)'), 'gst5');
    await fireEvent.press(screen.getByText('Preview'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    expect(mockPost.mock.calls[0][0]).toBe('/products/bulk-tax-update');
    expect(mockPost.mock.calls[0][1].body).toMatchObject({
      categoryId: 'cat-1',
      set: { taxCode: 'GST5' },
      dryRun: true,
    });
    expect(await screen.findByText(/Preview: 5 matched, 3 would change/)).toBeTruthy();
    expect(screen.getByText('U45 Urea')).toBeTruthy();
  });
});

describe('supplier notes (2.1)', () => {
  test('lists notes; posts a credit note against a posted bill', async () => {
    mockGet.mockImplementation((p: string) => {
      if (p === '/procurement/supplier-adjustments')
        return Promise.resolve({
          items: [
            {
              id: 'n1',
              number: 'SADJ-1',
              supplierId: 'sp-1',
              supplierName: 'Agro Dist',
              kind: 'REDUCTION',
              taxable: '100',
              total: '100.00',
              adjustmentDate: '2026-11-10',
              reason: 'short supply',
            },
          ],
        });
      if (p === '/procurement/suppliers')
        return Promise.resolve({ items: [{ id: 'sp-1', code: 'S1', name: 'Agro Dist', status: 'ACTIVE' }] });
      if (p === '/branches')
        return Promise.resolve({ items: [{ id: 'b-1', name: 'Baramati', status: 'ACTIVE' }] });
      if (p === '/procurement/purchase-bills')
        return Promise.resolve({
          items: [
            {
              id: 'pb-1',
              number: 'PB-7',
              supplierId: 'sp-1',
              supplierName: 'Agro Dist',
              outstanding: '900.00',
              status: 'POSTED',
            },
            {
              id: 'pb-2',
              number: 'PB-8',
              supplierId: 'sp-1',
              supplierName: 'Agro Dist',
              outstanding: '50.00',
              status: 'DRAFT',
            },
          ],
        });
      return Promise.reject(new Error(`unexpected GET ${p}`));
    });
    mockPost.mockResolvedValue({ id: 'n2', number: 'SADJ-2' });
    await render(<SupplierNotes />, { wrapper });
    expect(await screen.findByText(/SADJ-1/)).toBeTruthy();
    await fireEvent.press(screen.getByText('New supplier note'));
    await fireEvent.press(screen.getByText('Post note'));
    expect(await screen.findByText('Choose a supplier.')).toBeTruthy();
    await fireEvent.press(await screen.findByLabelText('Agro Dist'));
    await fireEvent.press(await screen.findByLabelText('Baramati'));
    expect(screen.queryByLabelText(/PB-8/)).toBeNull();
    await fireEvent.press(await screen.findByLabelText(/PB-7/));
    await fireEvent.changeText(screen.getByLabelText('Amount before tax'), '250');
    await fireEvent.changeText(screen.getByLabelText('CGST (as printed)'), '10');
    await fireEvent.changeText(screen.getByLabelText('Reason (3 to 500 letters)'), 'damaged bags');
    await fireEvent.press(screen.getByText('Post note'));
    expect(await screen.findByText('Tax can be entered only with the supplier GST document.')).toBeTruthy();
    expect(mockPost).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText('CGST (as printed)'), '');
    await fireEvent.press(screen.getByText('Post note'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    expect(mockPost.mock.calls[0][0]).toBe('/procurement/supplier-adjustments');
    expect(mockPost.mock.calls[0][1].body).toMatchObject({
      supplierId: 'sp-1',
      branchId: 'b-1',
      kind: 'REDUCTION',
      billId: 'pb-1',
      taxable: '250',
      gstDocument: false,
      reason: 'damaged bags',
    });
    expect(mockPost.mock.calls[0][1].idempotencyKey).toBeTruthy();
    expect(await screen.findByText('Note posted.')).toBeTruthy();
  });

  test('view only without purchase.supplier.adjustment', async () => {
    mockMe = { userId: 'u-1', roles: [], permissions: ['purchase.supplier.ledger.view'] };
    mockGet.mockResolvedValue({ items: [] });
    await render(<SupplierNotes />, { wrapper });
    expect(await screen.findByText('No supplier notes yet.')).toBeTruthy();
    expect(screen.queryByText('New supplier note')).toBeNull();
  });
});

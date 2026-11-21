import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import parts from '../i18n-parts/wp7.json';
import { i18n, setLanguage } from '../src/i18n';
import {
  CompositionEdit,
  LabelSheet,
  ProductImportCard,
  compositionText,
  fetchLabels,
  importBody,
  ingredientBody,
  ingredientErrors,
  labelsHtml,
  parseCompositionLines,
  parseLabelLines,
  sheetError,
} from '../src/features/stk/Parity7';

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockPut = jest.fn();
const mockPick = jest.fn();
const mockPrint = jest.fn();
const mockShare = jest.fn();
const mockSaveShare = jest.fn();
let mockMe: { userId: string; roles: string[]; permissions?: string[] };
let mockId = 0;
jest.mock('../src/auth/AuthProvider', () => ({
  useAuth: () => ({
    status: 'signedIn',
    me: mockMe,
    client: {
      get: (...a: unknown[]) => mockGet(...a),
      post: (...a: unknown[]) => mockPost(...a),
      put: (...a: unknown[]) => mockPut(...a),
    },
  }),
}));
jest.mock('../src/device', () => ({ newId: () => `key-${++mockId}` }));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: (...a: unknown[]) => mockPick(...a) }));
jest.mock('expo-file-system', () => ({
  File: function MockFile(this: Record<string, unknown>, mockUri: string) {
    this.text = () => Promise.resolve('code,name\nU-1,Urea');
    this.base64 = () => Promise.resolve(`b64:${mockUri}`);
  },
}));
jest.mock('expo-print', () => ({ printToFileAsync: (...a: unknown[]) => mockPrint(...a) }));
jest.mock('expo-sharing', () => ({
  isAvailableAsync: () => Promise.resolve(true),
  shareAsync: (...a: unknown[]) => mockShare(...a),
}));
jest.mock('../src/features/admin/usr-files', () => ({
  saveTextAndShare: (...a: unknown[]) => mockSaveShare(...a),
}));

let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);
beforeAll(() => {
  for (const lg of ['en', 'hi', 'mr'] as const)
    i18n.addResourceBundle(lg, 'translation', (parts as Record<string, object>)[lg], true, true);
});
beforeEach(async () => {
  [mockGet, mockPost, mockPut, mockPick, mockPrint, mockShare, mockSaveShare].forEach((m) => m.mockReset());
  mockId = 0;
  mockMe = { userId: 'u-1', roles: [], permissions: undefined };
  client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retryDelay: 0 } } });
  await setLanguage('en');
});
const fake = () => ({ get: mockGet, post: mockPost, put: mockPut }) as never;
const master = [
  { id: 'i-1', name: 'Chlorpyrifos' },
  { id: 'i-2', name: 'Cypermethrin' },
];

describe('logic', () => {
  test('7.2 import body: csv or xlsx, never both; HSN flag only when ticked', () => {
    expect(importBody({ name: 'p.csv', data: 'a,b', xlsx: false }, false)).toEqual({
      csv: 'a,b',
      filename: 'p.csv',
    });
    expect(importBody({ name: 'p.xlsx', data: 'QUJD', xlsx: true }, true)).toEqual({
      xlsx: 'QUJD',
      filename: 'p.xlsx',
      confirmUnknownHsn: true,
    });
    expect(sheetError(null)).toBe('file');
    expect(sheetError({ name: 'p.xlsx', data: 'x'.repeat(5_500_001), xlsx: true })).toBe('size');
    expect(sheetError({ name: 'p.csv', data: 'x'.repeat(5_500_001), xlsx: false })).toBeNull();
  });
  test('7.3 composition lines: names from the master, 0-100 with 4 decimals, known formulations', () => {
    expect(parseCompositionLines('chlorpyrifos, 50, ec\nCypermethrin, 5', master)).toEqual({
      rows: [
        { ingredientId: 'i-1', percentage: '50', formulation: 'EC' },
        { ingredientId: 'i-2', percentage: '5' },
      ],
    });
    expect(parseCompositionLines('Neem, 1', master)).toEqual({ line: 1, problem: 'unknown', name: 'Neem' });
    expect(parseCompositionLines('Chlorpyrifos, 101', master)).toEqual({ line: 1, problem: 'pct' });
    expect(parseCompositionLines('Chlorpyrifos, 1, XX', master)).toEqual({ line: 1, problem: 'formulation' });
    expect(parseCompositionLines('Chlorpyrifos, 1\nchlorpyrifos, 2', master)).toEqual({
      line: 2,
      problem: 'twice',
    });
    expect(parseCompositionLines('Chlorpyrifos', master)).toEqual({ line: 1, problem: 'format' });
    expect(compositionText([{ ingredientName: 'Chlorpyrifos', percentage: '50', formulation: 'EC' }])).toBe(
      'Chlorpyrifos, 50, EC',
    );
  });
  test('7.3 ingredient: a banned one needs a reason', () => {
    expect(ingredientErrors({ name: '', banned: true, banReason: '' })).toEqual(['name', 'banReason']);
    expect(ingredientBody({ name: ' Neem ', banned: false, banReason: 'x' })).toEqual({ name: 'Neem' });
    expect(ingredientBody({ name: 'Endosulfan', banned: true, banReason: 'Banned by order' })).toEqual({
      name: 'Endosulfan',
      banned: true,
      banReason: 'Banned by order',
    });
  });
  test('7.4 label lines and the sheet', async () => {
    expect(parseLabelLines('U-1, 3\nD-2')).toEqual({
      lines: [
        { code: 'U-1', copies: 3 },
        { code: 'D-2', copies: 1 },
      ],
    });
    expect(parseLabelLines('U-1, 0')).toEqual({ line: 1 });
    expect(parseLabelLines('U-1, 501')).toEqual({ line: 1 });
    mockGet.mockImplementation((p: string, o: { query: Record<string, string> }) =>
      p === '/products'
        ? Promise.resolve({ items: [{ id: `id-${o.query.q}`, code: String(o.query.q).toLowerCase() }] })
        : Promise.resolve({ labels: [] }),
    );
    await fetchLabels(fake(), [
      { code: 'U-1', copies: 3 },
      { code: 'D-2', copies: 1 },
    ]);
    expect(mockGet).toHaveBeenLastCalledWith('/labels', { query: { items: 'id-U-1:3,id-D-2:1' } });
    const html = labelsHtml(
      [
        {
          name: 'Urea <45kg>',
          packSize: '45',
          packUnit: 'KG',
          mrp: '266.50',
          sellingPrice: '266.50',
          barcode: '890',
          copies: 2,
        },
      ],
      'MRP',
    );
    expect(html.match(/class="l"/g)).toHaveLength(2);
    expect(html).toContain('Urea &lt;45kg&gt;');
  });
});

describe('screens', () => {
  test('7.1 / 7.2 pick, check, then import valid rows only', async () => {
    mockPick.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///p.csv', name: 'p.csv' }] });
    const summary = {
      jobId: 'job-1',
      status: 'VALIDATED',
      totalRows: 3,
      createRows: 1,
      updateRows: 1,
      unchangedRows: 0,
      errorRows: 1,
      errors: [{ row: 4, column: 'hsnCode', message: 'unknown HSN' }],
    };
    mockPost.mockResolvedValueOnce(summary).mockResolvedValueOnce({ ...summary, status: 'COMMITTED' });
    mockGet.mockResolvedValue('code,name\n');
    mockSaveShare.mockResolvedValue(true);
    await render(<ProductImportCard />, { wrapper });
    await fireEvent.press(screen.getByText('Download import template'));
    await waitFor(() =>
      expect(mockSaveShare).toHaveBeenCalledWith('product-template.csv', 'text/csv', 'code,name\n'),
    );
    expect(mockGet).toHaveBeenCalledWith('/products/import/template', { as: 'text' });
    await fireEvent.press(screen.getByText('Choose a CSV or Excel file'));
    await fireEvent.press(await screen.findByLabelText('HSN codes not in the library are confirmed'));
    await fireEvent.press(await screen.findByText('Check the file'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    expect(mockPost.mock.calls[0]).toEqual([
      '/products/import',
      {
        body: { csv: 'code,name\nU-1,Urea', filename: 'p.csv', confirmUnknownHsn: true },
        idempotencyKey: 'key-1',
      },
    ]);
    expect(await screen.findByText('Row 4, hsnCode: unknown HSN')).toBeTruthy();
    await fireEvent.press(screen.getByText('Import valid rows only'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(2));
    expect(mockPost.mock.calls[1][0]).toBe('/products/import/job-1/commit');
    expect(mockPost.mock.calls[1][1].body).toEqual({ mode: 'ROW_WISE' });
    expect(await screen.findByText(/Imported\./)).toBeTruthy();
    expect(screen.queryByText('Import valid rows only')).toBeNull();
  });
  test('7.1 no export without product.export, no import without product.import', async () => {
    mockMe = { userId: 'u-1', roles: [], permissions: ['product.export'] };
    await render(<ProductImportCard />, { wrapper });
    expect(screen.getByText('Download products CSV')).toBeTruthy();
    expect(screen.queryByText('Check the file')).toBeNull();
  });
  test('7.3 edit composition: lines checked against the master, saved with PUT', async () => {
    mockGet.mockResolvedValue({ items: master });
    mockPut.mockResolvedValue({});
    await render(
      <CompositionEdit
        id="sku-1"
        items={[{ ingredientName: 'Chlorpyrifos', percentage: '50', formulation: 'EC' }]}
      />,
      { wrapper },
    );
    await fireEvent.press(screen.getByText('Edit composition'));
    await fireEvent.changeText(await screen.findByLabelText('Rows'), 'Chlorpyrifos, 50, EC\nNeem, 1');
    expect(await screen.findByText(/"Neem" is not in the ingredient master/)).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Rows'), 'Chlorpyrifos, 20, EC\nCypermethrin, 5');
    await fireEvent.press(screen.getByText('Save composition'));
    await waitFor(() => expect(mockPut).toHaveBeenCalledTimes(1));
    expect(mockPut.mock.calls[0][0]).toBe('/products/sku-1/composition');
    expect(mockPut.mock.calls[0][1].body).toEqual({
      rows: [
        { ingredientId: 'i-1', percentage: '20', formulation: 'EC' },
        { ingredientId: 'i-2', percentage: '5' },
      ],
    });
  });
  test('7.3 add an ingredient; nothing without product.update', async () => {
    mockGet.mockResolvedValue({ items: master });
    mockPost.mockResolvedValue({});
    const r = await render(<CompositionEdit id="sku-1" items={[]} />, { wrapper });
    await fireEvent.press(screen.getByText('Add ingredient to master'));
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Neem oil');
    await fireEvent.press(screen.getByText('Add ingredient'));
    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith(
        '/ingredients',
        expect.objectContaining({ body: { name: 'Neem oil' } }),
      ),
    );
    r.unmount();
  });
  test('7.3 nothing to edit without product.update', async () => {
    mockMe = { userId: 'u-1', roles: [], permissions: ['product.view'] };
    await render(<CompositionEdit id="sku-1" items={[]} />, { wrapper });
    expect(screen.queryByText('Edit composition')).toBeNull();
  });
  test('7.4 label sheet: product codes to a PDF', async () => {
    mockGet.mockImplementation((p: string) =>
      p === '/products'
        ? Promise.resolve({ items: [{ id: 'sku-1', code: 'U-1' }] })
        : Promise.resolve({
            labels: [
              {
                name: 'Urea',
                packSize: '45',
                packUnit: 'KG',
                mrp: '266.50',
                sellingPrice: '266.50',
                barcode: '890',
                copies: 2,
              },
            ],
          }),
    );
    mockPrint.mockResolvedValue({ uri: 'file:///labels.pdf' });
    mockShare.mockResolvedValue(undefined);
    await render(<LabelSheet />, { wrapper });
    await fireEvent.press(screen.getByText('Print labels'));
    await fireEvent.changeText(screen.getByLabelText('Product code, copies'), 'U-1, 2');
    await fireEvent.press(screen.getByText('Make the label sheet'));
    expect(await screen.findByText('Label sheet made.')).toBeTruthy();
    expect(mockPrint.mock.calls[0][0].html).toContain('Urea');
    expect(mockShare).toHaveBeenCalledWith(
      'file:///labels.pdf',
      expect.objectContaining({ mimeType: 'application/pdf' }),
    );
  });
});

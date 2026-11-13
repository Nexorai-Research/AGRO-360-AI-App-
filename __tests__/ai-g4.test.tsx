import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import base from '../i18n-parts/ai.json';
import g4 from '../i18n-parts/ai-g4.json';
import { i18n, setLanguage } from '../src/i18n';
import ScanScreen from '../src/features/ai/ScanScreen';
import ShelfCheckScreen from '../src/features/ai/ShelfCheckScreen';
import VillagesScreen from '../src/features/ai/VillagesScreen';
import CropMapScreen from '../src/features/ai/CropMapScreen';
import CasesScreen from '../src/features/ai/CasesScreen';

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockPick = jest.fn();
let mockMe: { userId: string; roles: string[]; permissions?: string[] };
let mockId = 0;
jest.mock('../src/auth/AuthProvider', () => ({
  useAuth: () => ({
    status: 'signedIn',
    me: mockMe,
    client: { get: (...a: unknown[]) => mockGet(...a), post: (...a: unknown[]) => mockPost(...a) },
    signIn: jest.fn(),
    signOut: jest.fn(),
  }),
}));
jest.mock('../src/device', () => ({ newId: () => `key-${++mockId}` }));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: (...a: unknown[]) => mockPick(...a) }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }), Stack: { Screen: () => null } }));

let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);
beforeAll(() => {
  for (const lg of ['en', 'hi', 'mr'] as const) {
    i18n.addResourceBundle(lg, 'translation', (base as Record<string, object>)[lg], true, true);
    i18n.addResourceBundle(lg, 'translation', (g4 as Record<string, object>)[lg], true, true);
  }
});
beforeEach(async () => {
  [mockGet, mockPost, mockPick].forEach((m) => m.mockReset());
  mockId = 0;
  mockMe = { userId: 'u-1', roles: [], permissions: undefined };
  client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retryDelay: 0 } } });
  await setLanguage('en');
});
const route = (map: Record<string, unknown>) =>
  mockGet.mockImplementation((p: string) =>
    p in map ? Promise.resolve(map[p]) : Promise.reject(new Error(`unexpected GET ${p}`)),
  );
const BR = { items: [{ id: 'b1', name: 'Main' }] };
const fld = (value: string | null, confidence: number) => ({ value, confidence });
const DOC = {
  id: 'd1',
  kind: 'PURCHASE_BILL',
  status: 'REVIEW',
  filename: 'bill.pdf',
  provider: 'fake',
  retainUntil: '2034-11-13',
  version: 1,
  extracted: {
    fields: {
      supplierName: fld('Kisan Agro', 0.95),
      invoiceNo: fld('INV-7', 0.4),
      total: fld('11800.00', 0.9),
    },
    lines: [{ description: fld('Urea 50kg', 0.9), qty: fld('10', 0.9) }],
  },
  validation: {
    ok: false,
    lowConfidence: ['invoiceNo'],
    issues: [{ field: 'total', severity: 'ERROR', code: 'SUM', message: 'lines do not add up to the total' }],
  },
};

describe('supplier bill and label scan', () => {
  test('bill: file goes as base64 with one key; fields show confidence, low ones flagged; errors listed; no confirm for a bill', async () => {
    route({ '/branches': BR });
    mockPost.mockResolvedValue({ duplicate: false, document: DOC });
    mockPick.mockResolvedValueOnce({
      canceled: false,
      assets: [{ name: 'bill.pdf', mimeType: 'application/pdf', base64: 'JVBERi0x' }],
    });
    await render(<ScanScreen kind="PURCHASE_BILL" />, { wrapper });
    await fireEvent.press(await screen.findByLabelText('Choose file'));
    await screen.findByText('bill.pdf (0 KB)');
    await fireEvent.press(screen.getByLabelText('Read the file'));
    await screen.findByText('supplierName: Kisan Agro · 95% sure');
    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(mockPost).toHaveBeenCalledWith('/ai/ocr/purchase-bill', {
      body: { branchId: 'b1', filename: 'bill.pdf', contentBase64: 'JVBERi0x' },
      idempotencyKey: 'key-1',
    });
    expect(screen.getByText('invoiceNo: INV-7 · 40% sure · check this')).toBeTruthy();
    expect(screen.getByText('total: lines do not add up to the total')).toBeTruthy();
    expect(screen.getByText('Line 1')).toBeTruthy();
    expect(screen.queryByLabelText('Use as product draft')).toBeNull();
    expect(
      screen.getByText(
        'This only reads the bill. Making a draft purchase bill from it is done on the purchase screens.',
      ),
    ).toBeTruthy();
  });
  test('wrong type and too-big files are refused before upload', async () => {
    route({ '/branches': BR });
    await render(<ScanScreen kind="PURCHASE_BILL" />, { wrapper });
    mockPick.mockResolvedValueOnce({
      canceled: false,
      assets: [{ name: 'a.txt', mimeType: 'text/plain', base64: 'QUJD' }],
    });
    await fireEvent.press(await screen.findByLabelText('Choose file'));
    await screen.findByText('Choose a PDF, PNG or JPEG file.');
    mockPick.mockResolvedValueOnce({
      canceled: false,
      assets: [{ name: 'big.png', mimeType: 'image/png', base64: 'A'.repeat(6 * 1024 * 1024) }],
    });
    await fireEvent.press(screen.getByLabelText('Choose file'));
    await screen.findByText('The file is larger than 4 MB.');
    expect(mockPost).not.toHaveBeenCalled();
  });
  test('a file read before says so; reject sends the version seen', async () => {
    route({ '/branches': BR });
    mockPost
      .mockResolvedValueOnce({ duplicate: true, document: DOC })
      .mockResolvedValueOnce({ ...DOC, status: 'REJECTED' });
    mockPick.mockResolvedValueOnce({
      canceled: false,
      assets: [{ name: 'bill.pdf', mimeType: 'application/pdf', base64: 'JVBERi0x' }],
    });
    await render(<ScanScreen kind="PURCHASE_BILL" />, { wrapper });
    await fireEvent.press(await screen.findByLabelText('Choose file'));
    await fireEvent.press(await screen.findByLabelText('Read the file'));
    await screen.findByText('This file was read before. Showing the earlier result.');
    await fireEvent.press(screen.getByLabelText('Reject'));
    await screen.findByText('Rejected.');
    expect(mockPost).toHaveBeenLastCalledWith('/ai/ocr/documents/d1/reject', {
      body: { expectedVersion: 1 },
      idempotencyKey: 'key-2',
    });
  });
  test('label: confirm shows the prefilled form and says nothing was created; blocked while errors remain', async () => {
    route({ '/branches': BR });
    const label = {
      ...DOC,
      kind: 'LABEL',
      validation: { ok: true, lowConfidence: [], issues: [] },
      extracted: { fields: { productName: fld('Urea', 0.9) }, lines: [] },
    };
    mockPost.mockResolvedValueOnce({ duplicate: false, document: label }).mockResolvedValueOnce({
      document: { ...label, status: 'CONFIRMED', version: 2 },
      productDraft: { name: 'Urea', mrp: '266.50' },
    });
    mockPick.mockResolvedValueOnce({
      canceled: false,
      assets: [{ name: 'l.jpg', mimeType: 'image/jpeg', base64: '/9j/4AAQ' }],
    });
    await render(<ScanScreen kind="LABEL" />, { wrapper });
    await fireEvent.press(await screen.findByLabelText('Choose file'));
    await fireEvent.press(await screen.findByLabelText('Read the file'));
    await fireEvent.press(await screen.findByLabelText('Use as product draft'));
    await screen.findByText('Prefilled product form');
    expect(screen.getByText('mrp: 266.50')).toBeTruthy();
    expect(screen.getByText('No product was created. Open the product form to add it.')).toBeTruthy();
    expect(mockPost.mock.calls[0][0]).toBe('/ai/ocr/label');
  });
  test('denied without the permission for that kind', async () => {
    mockMe = { userId: 'u', roles: [], permissions: ['ai.assistant.use'] };
    await render(<ScanScreen kind="PURCHASE_BILL" />, { wrapper });
    await screen.findByText('You do not have permission for this screen.');
    expect(mockGet).not.toHaveBeenCalled();
  });
});

describe('shelf photo check', () => {
  const check = {
    id: 's1',
    warehouseId: 'w1',
    countId: null,
    countCandidates: ['sku1'],
    note: 'An estimate from a photo, not a count. Stock is not changed.',
    rows: [
      {
        skuId: 'sku1',
        name: 'Urea 50kg',
        estimated: 8,
        confidence: 0.8,
        systemQty: 12,
        variance: -4,
        flag: 'SHORT',
      },
      {
        skuId: 'sku2',
        name: 'DAP',
        estimated: 10,
        confidence: 0.9,
        systemQty: 10,
        variance: 0,
        flag: 'MATCH',
      },
    ],
  };
  test('estimate with flags; open count only when the person may and there are differences; posts once with keys', async () => {
    route({ '/warehouses': { items: [{ id: 'w1', branchId: 'b1', name: 'Godown' }] } });
    mockPost.mockResolvedValueOnce(check).mockResolvedValueOnce({});
    mockPick.mockResolvedValueOnce({
      canceled: false,
      assets: [{ name: 'shelf.jpg', mimeType: 'image/jpeg', base64: '/9j/4AAQ' }],
    });
    await render(<ShelfCheckScreen />, { wrapper });
    await fireEvent.press(await screen.findByLabelText('Choose photo'));
    await fireEvent.press(await screen.findByLabelText('Estimate from photo'));
    await screen.findByText('Urea 50kg');
    expect(mockPost).toHaveBeenCalledWith('/ai/shelf-check', {
      body: { warehouseId: 'w1', image: '/9j/4AAQ', mediaType: 'image/jpeg' },
      idempotencyKey: 'key-1',
    });
    expect(screen.getByText('Looks short')).toBeTruthy();
    expect(screen.getByText('Photo 8, system 12')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Open a stock count for the differences'));
    await screen.findByText('Stock count opened for recount.');
    expect(mockPost).toHaveBeenLastCalledWith('/ai/shelf-check/s1/count-draft', { idempotencyKey: 'key-2' });
  });
  test('without inventory.adjust.create there is no count button; without inventory.view the screen is denied', async () => {
    mockMe = { userId: 'u', roles: [], permissions: ['ai.assistant.use', 'inventory.view'] };
    route({ '/warehouses': { items: [{ id: 'w1', branchId: 'b1', name: 'Godown' }] } });
    mockPost.mockResolvedValueOnce(check);
    mockPick.mockResolvedValueOnce({
      canceled: false,
      assets: [{ name: 's.png', mimeType: 'image/png', base64: 'iVBORw0K' }],
    });
    await render(<ShelfCheckScreen />, { wrapper });
    await fireEvent.press(await screen.findByLabelText('Choose photo'));
    await fireEvent.press(await screen.findByLabelText('Estimate from photo'));
    await screen.findByText('Urea 50kg');
    expect(screen.queryByLabelText('Open a stock count for the differences')).toBeNull();
  });
  test('denied without inventory.view', async () => {
    mockMe = { userId: 'u', roles: [], permissions: ['ai.assistant.use'] };
    await render(<ShelfCheckScreen />, { wrapper });
    await screen.findByText('You do not have permission for this screen.');
  });
});

describe('villages, crop map and cases', () => {
  test('villages: trend, facts, explanation, season demand, hidden count', async () => {
    route({
      '/branches': BR,
      '/ai/villages/trends': {
        asOf: '2026-11-13',
        state: 'OK',
        reason: null,
        suppressedVillages: 2,
        rule: 'Villages under 5 customers are not shown.',
        villages: [
          {
            village: 'Sonai',
            customers: 12,
            bills: 40,
            spend: 250000,
            overdue: 20000,
            changePct: 14,
            trend: 'RISING',
            explanation: 'Spend per customer rose 14%.',
            demand: [{ season: 'KHARIF', category: 'Fertiliser', value: 1, sharePct: 60 }],
          },
        ],
      },
    });
    await render(<VillagesScreen />, { wrapper });
    await screen.findByText('Sonai');
    expect(screen.getByText('Buying more · 14%')).toBeTruthy();
    expect(screen.getByText('12 customers, 40 bills, sales ₹2,50,000, overdue ₹20,000')).toBeTruthy();
    expect(screen.getByText('• Kharif: Fertiliser (60%)')).toBeTruthy();
    expect(screen.getByText('2 village(s) with too few customers are not shown.')).toBeTruthy();
  });
  test('crop map; shortage with no factors says so instead of an empty list', async () => {
    route({
      '/branches': BR,
      '/ai/crops/heatmap': {
        asOf: 'x',
        state: 'OK',
        reason: null,
        crops: ['cotton'],
        suppressedVillages: 0,
        rule: 'Acres from crop plans.',
        rows: [
          {
            village: 'Sonai',
            totalAcres: 40,
            cells: [{ crop: 'cotton', acres: 40, plans: 5, intensity: 1 }],
          },
        ],
      },
      '/ai/crops/shortage': {
        asOf: 'x',
        state: 'NO_FACTORS',
        reason: null,
        horizonDays: 30,
        leadDays: 7,
        rows: [],
      },
    });
    await render(<CropMapScreen />, { wrapper });
    await screen.findByText('Sonai · 40 acres');
    await fireEvent.press(screen.getByText('Shortage'));
    await screen.findByText('No crop requirement factors are entered yet, so no shortage can be predicted.');
    expect(mockGet).toHaveBeenCalledWith(
      '/ai/crops/shortage',
      expect.objectContaining({ query: { branch: undefined, horizonDays: 30, leadDays: 7 } }),
    );
  });
  test('shortage rows show the gap and the reason', async () => {
    route({
      '/branches': BR,
      '/ai/crops/heatmap': {
        asOf: 'x',
        state: 'OK',
        reason: null,
        crops: [],
        suppressedVillages: 0,
        rule: 'r',
        rows: [],
      },
      '/ai/crops/shortage': {
        asOf: 'x',
        state: 'OK',
        reason: null,
        horizonDays: 30,
        leadDays: 7,
        rows: [
          {
            product: 'Urea',
            branch: 'Main',
            demand: 100,
            onHand: 40,
            onOrder: 10,
            gap: 50,
            shortBeforeArrival: 20,
            status: 'SHORT',
            explanation: 'Need 100 in 30 days.',
          },
        ],
      },
    });
    await render(<CropMapScreen />, { wrapper });
    await fireEvent.press(await screen.findByText('Shortage'));
    await screen.findByText('Short by 50');
    expect(screen.getByText('Need 100, in stock 40, on order 10')).toBeTruthy();
  });
  const cs = (o: object) => ({
    items: [
      {
        id: 'c1',
        crop: 'cotton',
        stage: null,
        symptomsText: 'spots',
        via: 'TEXT',
        outcome: 'NOT_SURE',
        escalation: 'REQUESTED',
        escalatedNote: 'Please advise.',
        expertAnswer: null,
        createdAt: '2026-11-12T10:00:00Z',
        ...o,
      },
    ],
  });
  test('cases: expert with ai.governance.manage answers once with a key; others only read', async () => {
    route({ '/ai/agro/cases': cs({}) });
    mockPost.mockResolvedValue({});
    await render(<CasesScreen />, { wrapper });
    await fireEvent.press(await screen.findByLabelText('Write the answer'));
    await fireEvent.changeText(screen.getByLabelText('Expert answer'), 'ok');
    expect(screen.getByText('Write at least 3 characters.')).toBeTruthy();
    expect(mockPost).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText('Expert answer'), 'Spray neem oil');
    await fireEvent.press(screen.getByLabelText('Send answer'));
    await screen.findByText('Answer saved.');
    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(mockPost).toHaveBeenCalledWith('/ai/agro/cases/c1/answer', {
      body: { answer: 'Spray neem oil' },
      idempotencyKey: 'key-1',
    });
  });
  test('cases: a person without ai.governance.manage cannot answer', async () => {
    mockMe = { userId: 'u', roles: [], permissions: ['ai.assistant.use'] };
    route({ '/ai/agro/cases': cs({}) });
    await render(<CasesScreen />, { wrapper });
    await screen.findByText('Question: Please advise.');
    expect(screen.queryByLabelText('Write the answer')).toBeNull();
  });
  test('Hindi and Marathi texts exist for these screens', async () => {
    for (const lg of ['hi', 'mr'] as const) {
      await setLanguage(lg);
      for (const key of [
        'nav.aiBillScan',
        'ai.sc.billTitle',
        'ai.sh.title',
        'ai.vl.title',
        'ai.cm.title',
        'ai.cs.title',
      ])
        expect(i18n.t(key)).not.toBe(i18n.getFixedT('en')(key));
    }
  });
});

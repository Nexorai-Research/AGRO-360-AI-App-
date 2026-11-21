import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setLanguage } from '../src/i18n';
import {
  CampaignMessage,
  KnowledgeEntries,
  OcrReview,
  RiskEvidence,
  RunScanNow,
  ShelfHistory,
  TrainingEditor,
  campaignMessageBody,
  confirmBillBody,
  emptyKnowledge,
  evidenceOk,
  hasEdits,
  jobsRunSummary,
  knowledgeBody,
  knowledgeErrors,
  knowledgeSteps,
  ocrEdits,
  shelfDifferences,
  trainingBody,
  trainingErrors,
  type OcrOpen,
} from '../src/features/ai/Parity10';
import ExpansionScreen, { inputsToForm } from '../src/features/ai/ExpansionScreen';
import type { OcrDocument } from '../src/features/ai/api-g4';

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockPut = jest.fn();
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
      delete: jest.fn(),
    },
  }),
}));
jest.mock('../src/device', () => ({ newId: () => `key-${++mockId}` }));

let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);
beforeEach(async () => {
  [mockGet, mockPost, mockPut].forEach((m) => m.mockReset());
  mockId = 0;
  mockMe = { userId: 'u-1', roles: [], permissions: undefined };
  client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retryDelay: 0 } } });
  await setLanguage('en');
});
const f = (value: string | null, confidence = 0.9) => ({ value, confidence });
const bill: OcrDocument = {
  id: 'd1',
  kind: 'PURCHASE_BILL',
  status: 'REVIEW',
  filename: 'bill.pdf',
  provider: 'test',
  retainUntil: '2034-11-19',
  extracted: {
    fields: { invoiceNo: f('INV-1'), total: f('1180.00') },
    lines: [{ description: f('Urea'), qty: f('10') }],
  },
  validation: { issues: [], lowConfidence: [], ok: true },
  version: 2,
};

describe('logic', () => {
  test('10.2 scan result like the web toast', () => {
    expect(jobsRunSummary({ skipped: 'AI is switched off' })).toEqual({ skipped: 'AI is switched off' });
    expect(jobsRunSummary({ ran: [{ outcome: 'OK' }, { outcome: 'FAILED' }, { outcome: 'OK' }] })).toEqual({
      ran: 2,
    });
  });
  test('10.1 knowledge: required fields, lines become lists, empty left out, steps by status', () => {
    const e = emptyKnowledge();
    expect(knowledgeErrors(e)).toEqual(['crop', 'nameEn', 'sourceRef']);
    expect(
      knowledgeBody({
        ...e,
        crop: 'Cotton',
        nameEn: 'Pink bollworm',
        sourceRef: 'ICAR 2024 p.3',
        symptoms: 'holes\n\nrosette flowers',
        ingredients: '',
      }),
    ).toEqual({
      kind: 'PEST',
      crop: 'Cotton',
      nameEn: 'Pink bollworm',
      symptoms: ['holes', 'rosette flowers'],
      source: 'ICAR',
      sourceRef: 'ICAR 2024 p.3',
    });
    expect(knowledgeSteps('DRAFT').map((x) => x.step)).toEqual(['submit']);
    expect(knowledgeSteps('SUBMITTED')).toEqual([
      { step: 'approve', note: false },
      { step: 'reject', note: true },
    ]);
    expect(knowledgeSteps('RETIRED')).toEqual([]);
  });
  test('10.3 / 10.7 / 10.6 bodies', () => {
    expect(campaignMessageBody('c1', 'b1', 'Hi')).toEqual({ campaignDraft: 'c1', branch: 'b1', body: 'Hi' });
    expect(evidenceOk('INVOICE', ' INV-9 ')).toBe(true);
    expect(evidenceOk('INVOICE', '  ')).toBe(false);
    expect(trainingErrors({ title: '', source: 'SOP 1', category: 'SOP', body: 'x' })).toEqual(['title']);
    expect(
      trainingBody({ title: ' Billing ', source: 'SOP 1', category: 'BILLING', body: 'Text' }, 4),
    ).toEqual({
      title: 'Billing',
      source: 'SOP 1',
      category: 'BILLING',
      body: 'Text',
      expectedVersion: 4,
    });
  });
  test('10.4 only changed fields and cells are sent; the bill body pairs each line with a receipt line', () => {
    const e = ocrEdits(bill, { invoiceNo: 'INV-1', total: '1190.00' }, [
      { description: 'Urea 45kg', qty: '10' },
    ]);
    expect(e).toEqual({
      expectedVersion: 2,
      fields: { total: '1190.00' },
      lines: [{ description: 'Urea 45kg' }],
    });
    expect(hasEdits(e)).toBe(true);
    expect(
      hasEdits(
        ocrEdits(bill, { invoiceNo: 'INV-1', total: '1180.00' }, [{ description: 'Urea', qty: '10' }]),
      ),
    ).toBe(false);
    expect(confirmBillBody(3, 's1', ['g1'])).toEqual({
      expectedVersion: 3,
      supplierId: 's1',
      lines: [{ line: 0, grnLineId: 'g1' }],
    });
  });
  test('10.5 / 10.8 helpers', () => {
    expect(shelfDifferences({ rows: [{ flag: 'SHORT' }, { flag: 'MATCH' }, { flag: 'OVER' }] })).toBe(2);
    expect(
      inputsToForm({
        investment: 500000,
        monthlyFixedCost: 40000,
        matureMonthlySales: 300000,
        rampPct: [30, 60, 100],
        workingCapitalDays: 30,
      }),
    ).toEqual({
      investment: '500000',
      fixed: '40000',
      sales: '300000',
      ramp: '30,60,100',
      margin: '',
      wc: '30',
    });
  });
});

describe('screens', () => {
  test('10.2 run the daily scan (owner only)', async () => {
    mockPost.mockResolvedValue({ ran: [{ outcome: 'OK' }, { outcome: 'OK' }] });
    await render(<RunScanNow onDone={() => undefined} />, { wrapper });
    await fireEvent.press(screen.getByText('Run the daily scan now'));
    expect(await screen.findByText('Done: 2 jobs ran.')).toBeTruthy();
    expect(mockPost).toHaveBeenCalledWith('/ai/jobs/run', { idempotencyKey: 'key-1' });
  });
  test('10.2 no scan button without ai.governance.manage', async () => {
    mockMe = { userId: 'u-1', roles: [], permissions: ['ai.assistant.use'] };
    await render(<RunScanNow onDone={() => undefined} />, { wrapper });
    expect(screen.queryByText('Run the daily scan now')).toBeNull();
  });
  test('10.1 knowledge: a new entry, then approve a submitted one', async () => {
    mockGet.mockResolvedValue({
      items: [
        {
          id: 'k1',
          kind: 'PEST',
          crop: 'Cotton',
          nameEn: 'Aphids',
          source: 'KVK',
          sourceRef: 'KVK note',
          status: 'SUBMITTED',
        },
      ],
    });
    mockPost.mockResolvedValue({});
    await render(<KnowledgeEntries />, { wrapper });
    await fireEvent.press(await screen.findByText('Approve'));
    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith('/ai/agro/knowledge/k1/approve', {
        body: {},
        idempotencyKey: 'key-1',
      }),
    );
    await fireEvent.press(screen.getByText('New entry'));
    await fireEvent.changeText(screen.getByLabelText('Crop *'), 'Soybean');
    await fireEvent.changeText(screen.getByLabelText('Name (English) *'), 'Girdle beetle');
    await fireEvent.changeText(
      screen.getByLabelText('Source reference (title, edition, page) *'),
      'SAU 2023',
    );
    await fireEvent.press(screen.getByText('Save as draft'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(2));
    expect(mockPost.mock.calls[1][0]).toBe('/ai/agro/knowledge');
    expect(mockPost.mock.calls[1][1].body).toMatchObject({
      crop: 'Soybean',
      nameEn: 'Girdle beetle',
      sourceRef: 'SAU 2023',
    });
  });
  test('10.3 campaign message saved as a proposal for an approved campaign', async () => {
    mockGet.mockResolvedValue({ items: [{ id: 'c1', name: 'Kharif offer', channel: 'SMS' }] });
    mockPost.mockResolvedValue({ payload: { customerIds: ['a'] } });
    await render(<CampaignMessage text="Urea is in stock" branch="b1" />, { wrapper });
    await fireEvent.press(await screen.findByText('Save as a proposal'));
    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith('/ai/recommendations/campaign-message', {
        body: { campaignDraft: 'c1', branch: 'b1', body: 'Urea is in stock' },
        idempotencyKey: 'key-1',
      }),
    );
    expect(mockGet).toHaveBeenCalledWith(
      '/ai/campaigns/drafts',
      expect.objectContaining({ query: { status: 'APPROVED' } }),
    );
  });
  test('10.7 attach evidence to a risk case', async () => {
    mockPost.mockResolvedValue({});
    await render(<RiskEvidence riskId="r1" onDone={() => undefined} />, { wrapper });
    await fireEvent.press(screen.getByLabelText('Purchase bill'));
    await fireEvent.changeText(screen.getByLabelText('Number or id'), 'PB-77');
    await fireEvent.press(screen.getByText('Attach evidence'));
    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith('/ai/risks/r1/evidence', {
        body: { kind: 'PURCHASE_BILL', ref: 'PB-77' },
        idempotencyKey: 'key-1',
      }),
    );
  });
  test('10.6 a training text is changed with PUT and expectedVersion', async () => {
    mockPut.mockResolvedValue({});
    await render(
      <TrainingEditor
        item={{ id: 't1', title: 'Billing', source: 'SOP 2', category: 'BILLING', body: 'Old', version: 3 }}
        onDone={() => undefined}
      />,
      { wrapper },
    );
    await fireEvent.changeText(screen.getByLabelText('Text'), 'New text');
    await fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(mockPut).toHaveBeenCalledTimes(1));
    expect(mockPut.mock.calls[0][0]).toBe('/ai/training/items/t1');
    expect(mockPut.mock.calls[0][1].body).toEqual({
      title: 'Billing',
      source: 'SOP 2',
      category: 'BILLING',
      body: 'New text',
      expectedVersion: 3,
    });
  });
  test('10.4 a supplier bill: correct, choose supplier and receipt line, create the draft bill', async () => {
    const open: OcrOpen = {
      document: bill,
      purchase: {
        supplier: { id: 's1', name: 'Kisan Traders' },
        duplicateBillId: null,
        candidates: [{ grnLineId: 'g1', grnNumber: 'GRN-4', productName: 'Urea', unbilledQty: '10' }],
        matches: [{ line: 0, suggestion: { grnLineId: 'g1' } }],
      },
    };
    mockGet.mockImplementation((p: string) =>
      Promise.resolve(
        p === '/procurement/suppliers'
          ? { items: [{ id: 's1', name: 'Kisan Traders' }] }
          : { ...open, document: { ...bill, status: 'CONFIRMED' } },
      ),
    );
    mockPut.mockResolvedValue({ ...bill, version: 3 });
    mockPost.mockResolvedValue({});
    await render(<OcrReview open={open} onChanged={() => undefined} onSupplier={() => undefined} />, {
      wrapper,
    });
    await fireEvent.changeText(screen.getByLabelText('total'), '1190.00');
    await fireEvent.press(screen.getByText('Create draft bill'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    expect(mockPut.mock.calls[0][0]).toBe('/ai/ocr/documents/d1/review');
    expect(mockPut.mock.calls[0][1].body).toMatchObject({
      expectedVersion: 2,
      fields: { total: '1190.00' },
      supplierId: 's1',
    });
    expect(mockPost.mock.calls[0]).toEqual([
      '/ai/ocr/documents/d1/confirm',
      expect.objectContaining({
        body: { expectedVersion: 3, supplierId: 's1', lines: [{ line: 0, grnLineId: 'g1' }] },
      }),
    ]);
  });
  test('10.5 shelf check history: tap one to show it', async () => {
    mockGet.mockResolvedValue({
      items: [
        {
          id: 'sc1',
          createdAt: '2026-11-18T10:00:00Z',
          countId: null,
          rows: [{ flag: 'SHORT' }, { flag: 'MATCH' }],
        },
      ],
    });
    const shown = jest.fn();
    await render(<ShelfHistory onShow={shown} />, { wrapper });
    expect(await screen.findByText('2026-11-18 10:00 · 2 products · 1 differences')).toBeTruthy();
    await fireEvent.press(screen.getByText('Show 2026-11-18 10:00'));
    expect(shown).toHaveBeenCalledWith(expect.objectContaining({ id: 'sc1' }));
  });
  test('10.8 a saved scenario opens with its assumptions and result', async () => {
    const inputs = {
      investment: 500000,
      monthlyFixedCost: 40000,
      matureMonthlySales: 300000,
      rampPct: [30, 100],
      workingCapitalDays: 30,
    };
    const result = {
      label: 'A simulation, not a forecast',
      inputs,
      marginSource: 'ENTERED',
      base: {
        breakEvenMonth: 7,
        paybackMonth: 19,
        cumulativeCash24: 120000,
        peakFunding: 650000,
        totalSales: 1,
      },
      sensitivity: [],
      notes: [],
      fingerprint: 'x',
    };
    mockGet.mockImplementation((p: string) =>
      Promise.resolve(
        p === '/ai/expansion/scenarios'
          ? { items: [{ id: 'e1', name: 'Wardha shop', inputs }] }
          : { id: 'e1', name: 'Wardha shop', inputs, result },
      ),
    );
    await render(<ExpansionScreen />, { wrapper });
    await fireEvent.press(await screen.findByText('Open Wardha shop'));
    expect(await screen.findByText('A simulation, not a forecast')).toBeTruthy();
    expect(mockGet).toHaveBeenCalledWith('/ai/expansion/scenarios/e1');
  });
});

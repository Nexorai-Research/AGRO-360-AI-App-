import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import cmp from '../i18n-parts/cmp.json';
import parts from '../i18n-parts/wp8.json';
import { i18n, setLanguage } from '../src/i18n';
import HubScreen from '../src/features/compliance/HubScreen';
import { formErrors, initialValues, runRowAction, splitBatch } from '../src/features/compliance/cmp-api';
import * as F from '../src/features/compliance/cmp-forms';
import { HUBS } from '../src/features/compliance/cmp-tabs';

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockWrite = jest.fn();
const mockShare = jest.fn();
let mockMe: { userId: string; roles: string[]; permissions?: string[] };
let mockId = 0;
jest.mock('../src/auth/AuthProvider', () => ({
  useAuth: () => ({
    status: 'signedIn',
    me: mockMe,
    client: { get: (...a: unknown[]) => mockGet(...a), post: (...a: unknown[]) => mockPost(...a) },
  }),
}));
jest.mock('../src/device', () => ({ newId: () => `key-${++mockId}` }));
jest.mock('expo-file-system', () => ({
  Paths: { cache: 'cache' },
  File: function MockFile(this: Record<string, unknown>, _dir: string, mockName: string) {
    this.uri = `file:///${mockName}`;
    this.create = () => undefined;
    this.write = (b: unknown) => mockWrite(mockName, b);
  },
}));
jest.mock('expo-sharing', () => ({
  isAvailableAsync: () => Promise.resolve(true),
  shareAsync: (...a: unknown[]) => mockShare(...a),
}));

let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);
beforeAll(() => {
  for (const lg of ['en', 'hi', 'mr'] as const)
    for (const p of [cmp, parts])
      i18n.addResourceBundle(lg, 'translation', (p as Record<string, object>)[lg], true, true);
});
beforeEach(async () => {
  [mockGet, mockPost, mockWrite, mockShare].forEach((m) => m.mockReset());
  mockId = 0;
  mockMe = { userId: 'u-1', roles: [], permissions: undefined };
  client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retryDelay: 0 } } });
  await setLanguage('en');
});
const fake = () => ({ get: mockGet, post: mockPost }) as never;
const batches = {
  items: [
    { id: 'bat-1', skuId: 'sku-1', skuCode: 'CHL-500', batchNo: 'B-22' },
    { id: 'bat-2', skuId: 'sku-2', skuCode: 'UREA-45', batchNo: 'U-7' },
  ],
};

describe('logic', () => {
  test('form checks: required, real dates, months and numbers, like the web form', () => {
    const v = initialValues(F.sampleForm.fields, '2026-11-19');
    expect(v.takenOn).toBe('2026-11-19');
    expect(v.purpose).toBe('INTERNAL');
    expect(formErrors(F.sampleForm.fields, v)).toEqual(['batch', 'warehouseId', 'qty', 'takenBy']);
    expect(
      formErrors(F.sampleForm.fields, {
        ...v,
        batch: 'sku-1|bat-1',
        warehouseId: 'w1',
        qty: '1.5',
        takenBy: 'Ravi',
        takenOn: '2026-02-30',
      }),
    ).toEqual(['takenOn']);
    expect(formErrors(F.auditPackForm.fields, { period: '2026-13' })).toEqual(['period']);
    expect(splitBatch('sku-1|bat-1')).toEqual({ skuId: 'sku-1', batchId: 'bat-1' });
    expect(splitBatch('')).toEqual({ skuId: null, batchId: null });
  });
  test('bodies match the web: recall scope, incident numbers, template columns, rule JSON', () => {
    expect(
      F.recallForm.body({
        title: 'Bad lot',
        source: 'MANUFACTURER',
        noticeRef: '',
        reason: 'Leak',
        severity: 'HIGH',
        batch: 'sku-1|bat-1',
      }),
    ).toEqual({
      title: 'Bad lot',
      source: 'MANUFACTURER',
      noticeRef: null,
      reason: 'Leak',
      severity: 'HIGH',
      scope: [{ skuId: 'sku-1', batchId: 'bat-1' }],
    });
    expect(
      F.incidentForm.body({
        incidentType: 'SPILL',
        severity: 'LOW',
        batch: '',
        occurredOn: '2026-11-19',
        peopleAffected: '2',
        summary: 'Spill',
        location: '',
      }),
    ).toEqual({
      type: 'SPILL',
      severity: 'LOW',
      skuId: null,
      batchId: null,
      location: null,
      occurredOn: '2026-11-19',
      peopleAffected: 2,
      summary: 'Spill',
    });
    expect(
      F.templateForm.body({
        code: 'P1',
        name: 'Monthly',
        jurisdiction: 'MH',
        legalRef: 'LR-1',
        sourceKey: 'pesticide_register',
        columns: 'sku, qty,,',
        periodKind: 'MONTH',
      }).columns,
    ).toEqual([{ key: 'sku' }, { key: 'qty' }]);
    expect(F.ruleForm.check!({ condition: '{bad' })).toBe('condition');
    expect(F.ruleForm.check!({ condition: '{"regulatedType":"PESTICIDE"}' })).toBeNull();
    expect(
      F.restrictionForm.body({
        ingredient: 'Endosulfan',
        scope: 'LOCAL',
        restriction: 'BANNED',
        reference: 'GO 12',
        reason: '',
        effectiveFrom: '2026-11-01',
      }),
    ).toEqual({
      name: 'Endosulfan',
      scope: 'LOCAL',
      restriction: 'BANNED',
      reference: 'GO 12',
      reason: null,
      effectiveFrom: '2026-11-01',
    });
  });
  test('rules list every version; templates carry the draft and whether one is approved', () => {
    expect(
      F.ruleRows([
        {
          id: 'r1',
          code: 'R1',
          name: 'No sale',
          versions: [
            { id: 'v2', status: 'DRAFT' },
            { id: 'v1', status: 'APPROVED' },
          ],
        },
      ]).map((x) => [x.id, x.code]),
    ).toEqual([
      ['v2', 'R1'],
      ['v1', 'R1'],
    ]);
    const [t] = F.templateRows([
      {
        id: 't1',
        versions: [
          { id: 'tv2', version: 2, status: 'DRAFT' },
          { id: 'tv1', version: 1, status: 'APPROVED' },
        ],
      },
    ]);
    expect(t).toMatchObject({ version: 2, status: 'DRAFT', draftVersionId: 'tv2', approvedVersion: true });
  });
  test('a step with a form sends what was typed', async () => {
    mockPost.mockResolvedValue({});
    const result = F.sampleActions.find((a) => a.id === 'result')!;
    expect(result.show!({ status: 'RESULT_RECORDED' })).toBe(false);
    await runRowAction(fake(), result, { id: 's1' }, '', 'k', {
      outcome: 'FAIL',
      lab: '',
      reportRef: 'R-9',
      detail: '',
      batchAction: 'QUARANTINE',
    });
    expect(mockPost).toHaveBeenCalledWith('/compliance/samples/s1/result', {
      body: { outcome: 'FAIL', lab: null, reportRef: 'R-9', detail: null, batchAction: 'QUARANTINE' },
      idempotencyKey: 'k',
    });
  });
  test('every new tab and step is in a hub', () => {
    const ids = Object.values(HUBS).flatMap((h) => h.tabs.map((t) => t.id));
    expect(ids).toEqual(expect.arrayContaining(['impact', 'templates', 'trace']));
  });
});

describe('screens', () => {
  const answer = (rows: Record<string, unknown> = {}) =>
    mockGet.mockImplementation((p: string) => {
      if (p === '/inventory/batches') return Promise.resolve(batches);
      if (p in rows) return Promise.resolve(rows[p]);
      return Promise.resolve({ items: [] });
    });

  test('safety hub: open a recall for one batch', async () => {
    answer();
    mockPost.mockResolvedValue({ id: 'rc-1' });
    await render(<HubScreen hub="safety" />, { wrapper });
    await fireEvent.press(await screen.findByText('Open recall'));
    await fireEvent.changeText(screen.getByLabelText('Title *'), 'Leaking bottles');
    await fireEvent.changeText(screen.getByLabelText('Reason *'), 'Caps crack');
    await fireEvent.changeText(screen.getByLabelText('Batch'), 'chl');
    await fireEvent.press(await screen.findByLabelText('CHL-500 / B-22'));
    await fireEvent.press(screen.getByLabelText('High'));
    await fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    expect(mockPost.mock.calls[0]).toEqual([
      '/compliance/recalls',
      {
        body: {
          title: 'Leaking bottles',
          source: 'MANUFACTURER',
          noticeRef: null,
          reason: 'Caps crack',
          severity: 'HIGH',
          scope: [{ skuId: 'sku-1', batchId: 'bat-1' }],
        },
        idempotencyKey: 'key-1',
      },
    ]);
    expect(await screen.findByText('Recall opened.')).toBeTruthy();
  });
  test('a missing required field is shown and nothing is sent', async () => {
    answer();
    await render(<HubScreen hub="safety" />, { wrapper });
    await fireEvent.press(await screen.findByText('Open recall'));
    await fireEvent.press(screen.getByText('Save'));
    expect((await screen.findAllByText('Fill this in.')).length).toBe(2);
    expect(mockPost).not.toHaveBeenCalled();
  });
  test('quarantine: release asks for a note; only with compliance.quarantine.approve', async () => {
    answer({
      '/compliance/quarantine': {
        items: [{ id: 'q1', caseNo: 'Q-1', skuCode: 'CHL-500', status: 'QUARANTINED' }],
      },
    });
    mockPost.mockResolvedValue({});
    const r = await render(<HubScreen hub="safety" />, { wrapper });
    await fireEvent.press(await screen.findByLabelText('Quarantine'));
    await fireEvent.press(await screen.findByText('Release'));
    await fireEvent.press(screen.getByText('Yes, do it'));
    expect(await screen.findByText('Fill this in.')).toBeTruthy();
    expect(mockPost).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText('Note *'), 'Lab cleared it');
    await fireEvent.press(screen.getByText('Yes, do it'));
    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith(
        '/compliance/quarantine/q1/release',
        expect.objectContaining({ body: { note: 'Lab cleared it' } }),
      ),
    );
    r.unmount();
  });
  test('quarantine: no release without compliance.quarantine.approve', async () => {
    mockMe = { userId: 'u-1', roles: [], permissions: ['compliance.quarantine.manage'] };
    answer({
      '/compliance/quarantine': {
        items: [{ id: 'q1', caseNo: 'Q-1', skuCode: 'CHL-500', status: 'QUARANTINED' }],
      },
    });
    await render(<HubScreen hub="safety" />, { wrapper });
    await screen.findByText(/Q-1/);
    expect(screen.queryByText('Release')).toBeNull();
    expect(screen.getByText('Dispose')).toBeTruthy();
  });
  test('batch trace: pick a batch, the trace is read', async () => {
    answer({
      '/compliance/trace': {
        items: [
          {
            batch: { sku: 'CHL-500', batchNo: 'B-22', status: 'ACTIVE', expiryDate: null },
            receipts: [
              {
                grnNumber: 'GRN-4',
                supplierName: 'Kisan Traders',
                receiptDate: '2026-10-01',
                acceptedQty: '10',
              },
            ],
            sales: [
              {
                invoiceNumber: 'INV-9',
                date: '2026-10-05',
                status: 'POSTED',
                customerName: 'R*****',
                qty: '2',
              },
            ],
            returns: [],
            totals: { received: '10', sold: '2', returned: '0', onHand: '8' },
            reconciles: true,
            differences: [],
          },
        ],
      },
    });
    await render(<HubScreen hub="safety" />, { wrapper });
    await fireEvent.press(await screen.findByLabelText('Batch trace'));
    await fireEvent.changeText(screen.getByLabelText('Batch'), 'B-22');
    await fireEvent.press(await screen.findByLabelText('CHL-500 / B-22'));
    expect(await screen.findByText('The trace agrees with the stock movements of the batch.')).toBeTruthy();
    expect(screen.getByText('2026-10-05 sale INV-9 to R*****: 2')).toBeTruthy();
    const call = mockGet.mock.calls.find((c) => c[0] === '/compliance/trace')!;
    expect(call[1].query).toEqual({ batch: 'bat-1' });
  });
  test('licences hub: an audit pack ZIP goes to the share sheet', async () => {
    answer();
    mockPost.mockResolvedValue({ fileName: 'audit-2026-10.zip', contentBase64: 'UEsDBA==' });
    mockShare.mockResolvedValue(undefined);
    await render(<HubScreen hub="licences" />, { wrapper });
    await fireEvent.press(await screen.findByLabelText('Document vault'));
    await fireEvent.press(await screen.findByText('Create audit pack'));
    await fireEvent.changeText(screen.getByLabelText('Month (YYYY-MM) *'), '2026-10');
    await fireEvent.press(screen.getByText('Save'));
    await waitFor(() =>
      expect(mockShare).toHaveBeenCalledWith('file:///audit-2026-10.zip', { mimeType: 'application/zip' }),
    );
    expect(mockPost.mock.calls[0][0]).toBe('/compliance/audit-pack');
    expect(mockPost.mock.calls[0][1].body).toEqual({ period: '2026-10' });
    expect(Array.from(mockWrite.mock.calls[0][1] as Uint8Array)).toEqual([80, 75, 3, 4]);
  });
  test('rules: a draft version can be tested and submitted', async () => {
    answer({
      '/compliance/rules': {
        items: [
          { id: 'r1', code: 'R1', name: 'No sale', versions: [{ id: 'v1', version: 1, status: 'DRAFT' }] },
        ],
      },
    });
    mockPost.mockResolvedValue({});
    await render(<HubScreen hub="safety" />, { wrapper });
    await fireEvent.press(await screen.findByLabelText('Rules'));
    await fireEvent.press(await screen.findByText('Test'));
    await fireEvent.press(screen.getByText('Yes, do it'));
    await waitFor(() => expect(mockPost.mock.calls[0][0]).toBe('/compliance/rule-versions/v1/test'));
  });
});

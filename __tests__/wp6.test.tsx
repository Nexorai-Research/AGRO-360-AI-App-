import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import parts from '../i18n-parts/wp6.json';
import cmp from '../i18n-parts/cmp.json';
import wp3 from '../i18n-parts/wp3.json';
import { i18n, setLanguage } from '../src/i18n';
import HubScreen from '../src/features/compliance/HubScreen';
import { runRowAction } from '../src/features/compliance/cmp-api';
import { HUBS } from '../src/features/compliance/cmp-tabs';
import {
  blockBody,
  blockErrors,
  gstr2bBody,
  gstr2bErrors,
  ruleBody,
  ruleErrors,
  sectionBody,
  sectionErrors,
  type SectionForm,
} from '../src/features/compliance/TaxForms';

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockPut = jest.fn();
const mockPick = jest.fn();
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
  File: function MockFile(this: { text: () => Promise<string> }, mockUri: string) {
    this.text = () => Promise.resolve(mockUri === 'file:///2b.json' ? '{"data":{"docdata":{}}}' : '');
  },
}));

let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);
beforeAll(() => {
  for (const lg of ['en', 'hi', 'mr'] as const)
    for (const p of [cmp, wp3, parts])
      i18n.addResourceBundle(lg, 'translation', (p as Record<string, object>)[lg], true, true);
});
beforeEach(async () => {
  [mockGet, mockPost, mockPut, mockPick].forEach((m) => m.mockReset());
  mockId = 0;
  mockMe = { userId: 'u-1', roles: [], permissions: undefined };
  client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retryDelay: 0 } } });
  await setLanguage('en');
});
const fake = () => ({ get: mockGet, post: mockPost, put: mockPut }) as never;
const settings = {
  hsnDigits: 6,
  itcTolerance: '10.00',
  b2cLargeLimit: '250000.00',
  rcmEnabled: true,
  tdsEnabled: true,
  docAlertDays: [60, 30, 7],
  version: 2,
};

describe('logic', () => {
  test('6.1 claim / block a bill: decision and the typed reason in one body', async () => {
    mockPost.mockResolvedValue({});
    const tab = HUBS.taxRecords!.tabs.find((x) => x.id === 'itcRegister')!;
    expect(tab.path).toBe('/gst/itc-register');
    const block = tab.actions!.find((a) => a.id === 'blockItc')!;
    expect(block.perm).toBe('compliance.itc.manage');
    await runRowAction(fake(), block, { billId: 'b-9' }, '  adviser said so ', 'k1');
    expect(mockPost).toHaveBeenCalledWith('/gst/bills/b-9/itc-decision', {
      body: { decision: 'BLOCK', reason: 'adviser said so' },
      idempotencyKey: 'k1',
    });
  });
  test('6.2 GSTR-2B: a file is needed, empty or too big is refused', () => {
    expect(gstr2bErrors(null)).toEqual(['file']);
    expect(gstr2bErrors({ name: 'a.json', text: '' })).toEqual(['size']);
    expect(gstr2bErrors({ name: 'a.json', text: 'x'.repeat(5_000_001) })).toEqual(['size']);
    expect(gstr2bErrors({ name: 'a.json', text: '{}' })).toEqual([]);
    expect(gstr2bBody('2026-10', { name: 'a.json', text: '{}' })).toEqual({
      period: '2026-10',
      fileName: 'a.json',
      content: '{}',
    });
  });
  test('6.3 block credit: something chosen and a reason of 3 to 300 letters', () => {
    expect(blockErrors({ kind: 'SKU', refId: '', reason: 'ab' })).toEqual(['ref', 'reason']);
    expect(blockErrors({ kind: 'CATEGORY', refId: 'c1', reason: 'Exempt input' })).toEqual([]);
    expect(blockBody({ kind: 'CATEGORY', refId: 'c1', reason: ' Exempt input ' })).toEqual({
      kind: 'CATEGORY',
      refId: 'c1',
      reason: 'Exempt input',
    });
  });
  test('6.4 RCM rule: unregistered suppliers send refId null; a supplier rule needs the supplier', () => {
    expect(ruleErrors({ name: 'U', appliesTo: 'SUPPLIER', refId: '' })).toEqual(['name', 'ref']);
    expect(ruleBody({ name: ' Unregistered ', appliesTo: 'UNREGISTERED_SUPPLIER', refId: 'x' })).toEqual({
      name: 'Unregistered',
      appliesTo: 'UNREGISTERED_SUPPLIER',
      refId: null,
    });
    expect(ruleBody({ name: 'Transport', appliesTo: 'SUPPLIER', refId: 's1' }).refId).toBe('s1');
  });
  test('6.5 TDS section: code, rates up to 100 with 4 decimals, real date', () => {
    const f: SectionForm = {
      code: '194q',
      name: 'Purchase of goods',
      kind: 'TDS',
      partyType: 'SUPPLIER',
      ratePct: '0.1',
      ratePctNoPan: '5',
      annualThreshold: '',
      effectiveFrom: '2026-04-01',
    };
    expect(sectionErrors(f)).toEqual([]);
    expect(sectionBody(f)).toEqual({
      code: '194Q',
      name: 'Purchase of goods',
      kind: 'TDS',
      partyType: 'SUPPLIER',
      ratePct: '0.1',
      ratePctNoPan: '5',
      annualThreshold: '0',
      effectiveFrom: '2026-04-01',
    });
    expect(
      sectionErrors({
        ...f,
        code: '194 Q',
        ratePct: '101',
        ratePctNoPan: '1.23456',
        effectiveFrom: '2026-02-30',
      }),
    ).toEqual(['code', 'rate', 'noPan', 'date']);
  });
});

describe('screens', () => {
  const answer = (extra: Record<string, unknown> = {}) =>
    mockGet.mockImplementation((p: string) => {
      if (p === '/compliance/settings') return Promise.resolve(extra.settings ?? settings);
      if (p === '/product-categories') return Promise.resolve({ items: [{ id: 'cat-1', name: 'Seeds' }] });
      if (p === '/procurement/suppliers')
        return Promise.resolve({ items: [{ id: 'sup-1', name: 'Kisan Traders' }] });
      if (p === '/gst/itc-register')
        return Promise.resolve({
          rows: [
            {
              billId: 'b-1',
              number: 'PB-12',
              supplierName: 'Kisan Traders',
              supplierInvoiceNo: 'KT/88',
              tax: '180.00',
              status: 'ELIGIBLE',
              reason: null,
            },
          ],
        });
      return Promise.resolve({ items: [], rows: [] });
    });

  test('6.1 input credit tab: claim a bill with a reason', async () => {
    answer();
    mockPost.mockResolvedValue({});
    await render(<HubScreen hub="taxRecords" />, { wrapper });
    await fireEvent.press(await screen.findByLabelText('Input credit'));
    expect(await screen.findByText(/PB-12/)).toBeTruthy();
    await fireEvent.press(screen.getByText('Claim credit'));
    await fireEvent.changeText(screen.getByLabelText('Reason (at least 3 characters)'), 'Goods received');
    await fireEvent.press(screen.getByText('Yes, do it'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    expect(mockPost.mock.calls[0][0]).toBe('/gst/bills/b-1/itc-decision');
    expect(mockPost.mock.calls[0][1].body).toEqual({ decision: 'CLAIM', reason: 'Goods received' });
  });
  test('6.1 no claim / block without compliance.itc.manage', async () => {
    mockMe = { userId: 'u-1', roles: [], permissions: ['compliance.gst.view'] };
    answer();
    await render(<HubScreen hub="taxRecords" />, { wrapper });
    await fireEvent.press(await screen.findByLabelText('Input credit'));
    await screen.findByText(/PB-12/);
    expect(screen.queryByText('Claim credit')).toBeNull();
  });
  test('6.2 GSTR-2B tab: pick the portal file and import it for the month', async () => {
    answer();
    mockPick.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///2b.json', name: '2b.json' }] });
    mockPost.mockResolvedValue({ rejected: [{ row: 3 }] });
    await render(<HubScreen hub="taxRecords" />, { wrapper });
    await fireEvent.press(await screen.findByLabelText('GSTR-2B match'));
    await fireEvent.press(await screen.findByText('Choose the file'));
    await fireEvent.press(await screen.findByText('Import GSTR-2B'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    const [path, opts] = mockPost.mock.calls[0];
    expect(path).toBe('/gst/gstr2b/import');
    expect(opts.body.fileName).toBe('2b.json');
    expect(opts.body.period).toMatch(/^\d{4}-\d{2}$/);
    expect(opts.idempotencyKey).toBe('key-1');
    expect(await screen.findByText('1 row could not be read.')).toBeTruthy();
  });
  test('6.4 RCM rules tab: add a rule for one supplier', async () => {
    answer();
    mockPost.mockResolvedValue({});
    await render(<HubScreen hub="taxRecords" />, { wrapper });
    await fireEvent.press(await screen.findByLabelText('Reverse charge rules'));
    await fireEvent.press(await screen.findByText('Add a reverse charge rule'));
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Transport');
    await fireEvent.press(screen.getByLabelText('One supplier'));
    await fireEvent.press(screen.getByText('Add the rule'));
    expect(await screen.findByText('Choose the supplier or category.')).toBeTruthy();
    expect(mockPost).not.toHaveBeenCalled();
    await fireEvent.press(await screen.findByLabelText('Kisan Traders'));
    await fireEvent.press(screen.getByText('Add the rule'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    expect(mockPost.mock.calls[0]).toEqual([
      '/rcm/rules',
      { body: { name: 'Transport', appliesTo: 'SUPPLIER', refId: 'sup-1' }, idempotencyKey: 'key-1' },
    ]);
  });
  test('6.3 blocked credit tab: block a category', async () => {
    answer();
    mockPost.mockResolvedValue({});
    await render(<HubScreen hub="taxRecords" />, { wrapper });
    await fireEvent.press(await screen.findByLabelText('Blocked credit'));
    await fireEvent.press(await screen.findByText('Block a product or category'));
    await fireEvent.press(screen.getAllByLabelText('Category')[0]!);
    await fireEvent.press(await screen.findByLabelText('Seeds'));
    await fireEvent.changeText(screen.getByLabelText('Reason'), 'Used for exempt supply');
    await fireEvent.press(screen.getByText('Block the credit'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    expect(mockPost.mock.calls[0][0]).toBe('/gst/itc-blocks');
    expect(mockPost.mock.calls[0][1].body).toEqual({
      kind: 'CATEGORY',
      refId: 'cat-1',
      reason: 'Used for exempt supply',
    });
  });
  test('6.5 / 6.6 TDS: add a section with PUT; run only while TDS is on', async () => {
    answer();
    mockPut.mockResolvedValue({});
    mockPost.mockResolvedValue({});
    await render(<HubScreen hub="taxRecords" />, { wrapper });
    await fireEvent.press(await screen.findByLabelText('TDS / TCS sections'));
    await fireEvent.press(await screen.findByText('Add a section'));
    await fireEvent.changeText(screen.getByLabelText('Section code'), '194Q');
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Purchase of goods');
    await fireEvent.changeText(screen.getByLabelText('Rate %'), '0.1');
    await fireEvent.changeText(screen.getByLabelText('Rate % when PAN is missing'), '5');
    await fireEvent.press(screen.getByText('Save the section'));
    await waitFor(() => expect(mockPut).toHaveBeenCalledTimes(1));
    expect(mockPut.mock.calls[0][0]).toBe('/tax/tds-config');
    expect(mockPut.mock.calls[0][1].body.code).toBe('194Q');
    await fireEvent.press(screen.getByLabelText('TDS / TCS report'));
    await fireEvent.press(await screen.findByText(/^Run for /));
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    expect(mockPost.mock.calls[0][0]).toBe('/tax/tds/run');
    expect(mockPost.mock.calls[0][1].body.from).toMatch(/^\d{4}-\d{2}-01$/);
  });
  test('6.6 no TDS run while TDS is off', async () => {
    answer({ settings: { ...settings, tdsEnabled: false } });
    await render(<HubScreen hub="taxRecords" />, { wrapper });
    await fireEvent.press(await screen.findByLabelText('TDS / TCS report'));
    await screen.findByText('Compliance settings');
    expect(screen.queryByText(/^Run for /)).toBeNull();
  });
});

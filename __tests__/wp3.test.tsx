import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import parts from '../i18n-parts/wp3.json';
import cmp from '../i18n-parts/cmp.json';
import { i18n, setLanguage } from '../src/i18n';
import HubScreen from '../src/features/compliance/HubScreen';
import {
  ComplianceSettingsCard,
  settingsBody,
  settingsErrors,
} from '../src/features/compliance/SettingsCard';
import { fetchGstr1Export, runRowAction } from '../src/features/compliance/cmp-api';
import { HUBS } from '../src/features/compliance/cmp-tabs';
import {
  defaultMapping,
  entryAccounts,
  entryKind,
  mappingBody,
  mappingOk,
  postLineEntry,
} from '../src/features/finance/BankExtras';
import { fetchTemplatePreview } from '../src/features/setup/print-preview';
import type { Account } from '../src/features/finance/api';

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockPut = jest.fn();
const mockPatch = jest.fn();
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
      patch: (...a: unknown[]) => mockPatch(...a),
    },
  }),
}));
jest.mock('../src/device', () => ({ newId: () => `key-${++mockId}` }));

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
  [mockGet, mockPost, mockPut, mockPatch].forEach((m) => m.mockReset());
  mockId = 0;
  mockMe = { userId: 'u-1', roles: [], permissions: undefined };
  client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retryDelay: 0 } } });
  await setLanguage('en');
});
const fake = () => ({ get: mockGet, post: mockPost, put: mockPut, patch: mockPatch }) as never;

describe('logic', () => {
  test('compliance settings: amounts and whole-day lead times like the web', () => {
    const f = {
      hsnDigits: '6',
      itcTolerance: '10.00',
      b2cLargeLimit: '250000',
      docAlertDays: '60, 30,7',
      rcmEnabled: true,
      tdsEnabled: false,
    };
    expect(settingsErrors(f)).toEqual([]);
    expect(settingsBody(f)).toEqual({
      hsnDigits: 6,
      itcTolerance: '10.00',
      b2cLargeLimit: '250000',
      docAlertDays: [60, 30, 7],
      rcmEnabled: true,
      tdsEnabled: false,
    });
    expect(settingsErrors({ ...f, itcTolerance: '1.234', docAlertDays: '60,30,' })).toEqual([
      'tolerance',
      'days',
    ]);
    expect(settingsBody({ ...f, docAlertDays: '' }).docAlertDays).toEqual([60, 30, 7]);
  });
  test('bank: a withdrawal is a charge to an expense account; control accounts never offered', () => {
    expect(entryKind({ withdrawal: '15.00' })).toBe('CHARGE');
    expect(entryKind({ withdrawal: '0.00' })).toBe('INTEREST');
    const acc = (id: string, type: string, isControl = false) =>
      ({ id, code: id, name: id, type, isControl }) as Account;
    const all = [acc('e1', 'EXPENSE'), acc('e2', 'EXPENSE', true), acc('i1', 'INCOME')];
    expect(entryAccounts(all, 'CHARGE').map((a) => a.id)).toEqual(['e1']);
    expect(entryAccounts(all, 'INTEREST').map((a) => a.id)).toEqual(['i1']);
  });
  test('bank: statement mapping like the web', () => {
    const m = defaultMapping();
    expect(mappingOk(m)).toBe(true);
    expect(mappingBody(m)).toEqual({
      date: 'Date',
      narration: 'Narration',
      reference: 'Reference',
      withdrawal: 'Withdrawal',
      deposit: 'Deposit',
      balance: 'Balance',
    });
    expect(mappingBody({ ...m, amount: 'Amount', narration: '' })).toEqual({
      date: 'Date',
      reference: 'Reference',
      amount: 'Amount',
      balance: 'Balance',
    });
    expect(mappingOk({ ...m, deposit: '' })).toBe(false);
  });
  test('api paths: line entry, GSTR-1 export, template preview', async () => {
    mockPost.mockResolvedValue({});
    mockGet.mockResolvedValue({});
    await postLineEntry(fake(), 'k1', 'line-1', 'CHARGE', 'acc-1');
    expect(mockPost).toHaveBeenCalledWith('/finance/bank-lines/line-1/entry', {
      idempotencyKey: 'k1',
      body: { kind: 'CHARGE', accountId: 'acc-1' },
    });
    await fetchGstr1Export(fake(), '2026-10', 'csv');
    expect(mockGet).toHaveBeenCalledWith('/gst/gstr1/export', {
      query: { period: '2026-10', format: 'csv' },
    });
    await fetchTemplatePreview(fake(), 'TAX_INVOICE');
    expect(mockPost).toHaveBeenLastCalledWith('/settings/print-templates:preview', {
      body: { docType: 'TAX_INVOICE' },
    });
  });
  test('an RCM rule is switched with PATCH and a fixed body; other actions still POST', async () => {
    mockPatch.mockResolvedValue({});
    mockPost.mockResolvedValue({});
    const rules = HUBS.taxRecords!.tabs.find((x) => x.id === 'rcmRules')!;
    const off = rules.actions!.find((a) => a.id === 'switchOff')!;
    expect(off.show!({ active: true })).toBe(true);
    expect(off.show!({ active: false })).toBe(false);
    await runRowAction(fake(), off, { id: 'r1', active: true }, '', 'k');
    expect(mockPatch).toHaveBeenCalledWith('/rcm/rules/r1', { body: { active: false }, idempotencyKey: 'k' });
    const reverse = HUBS.taxRecords!.tabs.find((x) => x.id === 'rcm')!.actions![0]!;
    await runRowAction(fake(), reverse, { id: 'e1' }, '', 'k2');
    expect(mockPost).toHaveBeenCalledWith('/rcm/entries/e1/reverse', { body: {}, idempotencyKey: 'k2' });
  });
});

describe('screens', () => {
  const settings = {
    hsnDigits: 6,
    itcTolerance: '10.00',
    b2cLargeLimit: '250000.00',
    rcmEnabled: false,
    tdsEnabled: true,
    docAlertDays: [60, 30, 7],
    version: 2,
  };
  test('compliance settings: shown, changed with PUT and the version', async () => {
    mockGet.mockResolvedValue(settings);
    mockPut.mockResolvedValue({});
    await render(<ComplianceSettingsCard />, { wrapper });
    expect(await screen.findByText('Compliance settings')).toBeTruthy();
    expect(screen.getByText('60, 30, 7')).toBeTruthy();
    await fireEvent.press(screen.getByText('Change'));
    await fireEvent.changeText(screen.getByLabelText('Alert lead times in days (comma separated)'), '45,x');
    await fireEvent.press(screen.getByText('Save settings'));
    expect(await screen.findByText(/whole numbers of days/)).toBeTruthy();
    expect(mockPut).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText('Alert lead times in days (comma separated)'), '45,15');
    await fireEvent.press(screen.getByLabelText('Reverse charge on'));
    await fireEvent.press(screen.getByText('Save settings'));
    await waitFor(() => expect(mockPut).toHaveBeenCalledTimes(1));
    expect(mockPut.mock.calls[0][0]).toBe('/compliance/settings');
    expect(mockPut.mock.calls[0][1].version).toBe(2);
    expect(mockPut.mock.calls[0][1].body).toEqual({
      hsnDigits: 6,
      itcTolerance: '10.00',
      b2cLargeLimit: '250000.00',
      docAlertDays: [45, 15],
      rcmEnabled: true,
      tdsEnabled: true,
    });
  });
  test('compliance settings: no change button without compliance.settings.manage', async () => {
    mockMe = { userId: 'u-1', roles: [], permissions: ['compliance.gst.view'] };
    mockGet.mockResolvedValue(settings);
    await render(<ComplianceSettingsCard />, { wrapper });
    await screen.findByText('Compliance settings');
    expect(screen.queryByText('Change')).toBeNull();
  });
  test('tax records hub: the GSTR-2B match tab reads the month', async () => {
    mockGet.mockImplementation((p: string) => {
      if (p === '/compliance/settings') return Promise.resolve(settings);
      if (p === '/gst/itc-reconciliation')
        return Promise.resolve({
          rows: [
            {
              id: 'x',
              supplierGstin: '27ABCDE1234F1Z5',
              invoiceNo: 'INV-9',
              status: 'MISMATCH',
              bookTax: '90.00',
              portalTax: '81.00',
              difference: '9.00',
              note: 'Ask the supplier',
            },
          ],
        });
      return Promise.resolve({ items: [] });
    });
    await render(<HubScreen hub="taxRecords" />, { wrapper });
    await fireEvent.press(await screen.findByLabelText('GSTR-2B match'));
    expect(await screen.findByText(/27ABCDE1234F1Z5/)).toBeTruthy();
    const call = mockGet.mock.calls.find((c) => c[0] === '/gst/itc-reconciliation')!;
    expect(call[1].query.period).toMatch(/^\d{4}-\d{2}$/);
    expect(screen.getByText('Ask the supplier')).toBeTruthy();
  });
});

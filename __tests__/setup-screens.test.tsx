import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import parts from '../i18n-parts/setup.json';
import { i18n, setLanguage } from '../src/i18n';
import { ApiError } from '../src/api/errors';
import YearsScreen from '../src/features/setup/YearsScreen';
import TaxScreen from '../src/features/setup/TaxScreen';
import NumberingScreen from '../src/features/setup/NumberingScreen';
import PrintScreen from '../src/features/setup/PrintScreen';
import BranchesScreen from '../src/features/setup/BranchesScreen';
import WarehousesScreen from '../src/features/setup/WarehousesScreen';
import {
  binErrors,
  branchBody,
  branchErrors,
  nextDay,
  rateErrors,
  seriesErrors,
  validHsn,
  yearErrors,
} from '../src/features/setup/logic';

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
    signIn: jest.fn(),
    signOut: jest.fn(),
  }),
}));
jest.mock('../src/device', () => ({ newId: () => `key-${++mockId}` }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }), Stack: { Screen: () => null } }));

let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);
beforeAll(() => {
  for (const lg of ['en', 'hi', 'mr'] as const)
    i18n.addResourceBundle(lg, 'translation', (parts as Record<string, object>)[lg], true, true);
});
beforeEach(async () => {
  [mockGet, mockPost, mockPut, mockPatch].forEach((m) => m.mockReset());
  mockId = 0;
  mockMe = { userId: 'u-1', roles: [], permissions: undefined };
  client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retryDelay: 0 } } });
  await setLanguage('en');
});
const route = (map: Record<string, unknown>) =>
  mockGet.mockImplementation((p: string) =>
    p in map ? Promise.resolve(map[p]) : Promise.reject(new Error(`unexpected GET ${p}`)),
  );

describe('logic', () => {
  test('years', () => {
    expect(nextDay('2027-03-31')).toBe('2027-04-01');
    expect(yearErrors('2027-04-01', '')).toEqual([]);
    expect(yearErrors('2027-02-30', '2027-01-01')).toEqual(['start']);
    expect(yearErrors('2027-04-01', '2027-02-30')).toEqual(['end']);
    expect(yearErrors('2027-04-01', '2027-04-01')).toEqual(['end']);
  });
  test('tax rate: decimal string, 0 unless GST, code upper case', () => {
    const f = {
      code: 'gst5',
      name: 'GST 5',
      kind: 'GST' as const,
      ratePct: '5',
      effectiveFrom: '2026-04-01',
      reason: '',
    };
    expect(rateErrors(f)).toEqual([]);
    expect(rateErrors({ ...f, ratePct: '100.5' })).toEqual(['rate']);
    expect(rateErrors({ ...f, kind: 'EXEMPT' })).toEqual(['rate']);
    expect(rateErrors({ ...f, kind: 'EXEMPT', ratePct: '0' })).toEqual([]);
    expect(rateErrors({ ...f, code: 'a', reason: 'x' })).toEqual(['code', 'reason']);
    expect(validHsn('3808')).toBe(true);
    expect(validHsn('38081')).toBe(false);
  });
  test('series: GST invoice numbers are 16 characters at most', () => {
    expect(seriesErrors('TAX_INVOICE', { prefix: 'INV/', padding: '6', nextNumber: '1' })).toEqual([]);
    expect(seriesErrors('TAX_INVOICE', { prefix: 'INVOICE-2026-', padding: '6', nextNumber: '1' })).toEqual([
      'length',
    ]);
    expect(seriesErrors('RECEIPT', { prefix: 'INVOICE-2026-', padding: '6', nextNumber: '1' })).toEqual([]);
    expect(seriesErrors('RECEIPT', { prefix: 'a b', padding: '0', nextNumber: '0' })).toEqual([
      'prefix',
      'padding',
      'next',
    ]);
  });
  test('branch rules and a body of only what changed', () => {
    const f = {
      code: 'pune',
      name: 'Pune',
      address: '',
      stateCode: '27',
      gstin: '27ABCDE1234F1Z5',
      phone: '',
      openingDate: '',
    };
    expect(branchErrors(f, true)).toEqual([]);
    expect(branchErrors({ ...f, gstin: '29ABCDE1234F1Z5' }, true)).toEqual(['gstinState']);
    expect(branchErrors({ ...f, gstin: 'bad', phone: 'x' }, false)).toEqual(['gstin', 'phone']);
    expect(branchBody(f, null)).toEqual({
      name: 'Pune',
      stateCode: '27',
      gstin: '27ABCDE1234F1Z5',
      code: 'PUNE',
    });
    expect(branchBody({ ...f, name: 'Pune 2', gstin: '' }, { ...f })).toEqual({
      name: 'Pune 2',
      gstin: null,
    });
    expect(binErrors({ label: '', rack: 'x'.repeat(41), shelf: '' })).toEqual(['label', 'rack']);
  });
});

const years = [
  {
    id: 'y1',
    label: '2025-26',
    startDate: '2025-04-01',
    endDate: '2026-03-31',
    status: 'LOCKED',
    lockedAt: 'x',
    periodCount: 12,
  },
  {
    id: 'y2',
    label: '2026-27',
    startDate: '2026-04-01',
    endDate: '2027-03-31',
    status: 'OPEN',
    lockedAt: null,
    periodCount: 12,
  },
];
describe('years', () => {
  test('add starts the day after the last year; the same key is reused after a lost answer', async () => {
    route({ '/financial-years': { items: years } });
    mockPost.mockRejectedValueOnce(new ApiError(0, null)).mockResolvedValueOnce(years[1]);
    await render(<YearsScreen />, { wrapper });
    await fireEvent.press(await screen.findByText('Add next year'));
    expect(screen.getByLabelText('Start date (YYYY-MM-DD)').props.value).toBe('2027-04-01');
    await fireEvent.press(screen.getByText('Create year'));
    await screen.findByRole('alert');
    await fireEvent.press(screen.getByText('Create year'));
    expect(await screen.findByText(/Financial year created/)).toBeTruthy();
    expect(mockPost.mock.calls[1][0]).toBe('/financial-years');
    expect(mockPost.mock.calls[1][1].body).toEqual({ startDate: '2027-04-01' });
    expect(mockPost.mock.calls[0][1].idempotencyKey).toBe(mockPost.mock.calls[1][1].idempotencyKey);
  });
  test('locking a month needs a reason of 10 letters; locked months and years have no lock button', async () => {
    route({
      '/financial-years': { items: years },
      '/financial-years/y2/periods': {
        items: [
          {
            id: 'p1',
            fyId: 'y2',
            label: 'Apr 2026',
            startDate: '2026-04-01',
            endDate: '2026-04-30',
            status: 'LOCKED',
            lockedAt: 'x',
          },
          {
            id: 'p2',
            fyId: 'y2',
            label: 'May 2026',
            startDate: '2026-05-01',
            endDate: '2026-05-31',
            status: 'OPEN',
            lockedAt: null,
          },
        ],
      },
    });
    mockPost.mockResolvedValue({});
    await render(<YearsScreen />, { wrapper });
    expect(screen.queryByText('Lock year 2025-26')).toBeNull();
    await fireEvent.press(await screen.findByText('Months 2026-27'));
    expect(screen.queryByText('Lock Apr 2026')).toBeNull();
    await fireEvent.press(await screen.findByText('Lock May 2026'));
    await fireEvent.changeText(screen.getByLabelText('Reason (10 to 500 letters)'), 'short');
    await fireEvent.press(screen.getByText('Lock month'));
    expect(await screen.findByText('Give a reason of 10 to 500 letters.')).toBeTruthy();
    expect(mockPost).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText('Reason (10 to 500 letters)'), 'books closed for May');
    await fireEvent.press(screen.getByText('Lock month'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    expect(mockPost.mock.calls[0][0]).toBe('/accounting-periods/p2:lock');
    expect(mockPost.mock.calls[0][1].body).toEqual({ reason: 'books closed for May' });
  });
  test('no view permission: no call', async () => {
    mockMe = { userId: 'u-1', roles: [], permissions: [] };
    await render(<YearsScreen />, { wrapper });
    expect(await screen.findByText('You do not have permission to see this setup.')).toBeTruthy();
    expect(mockGet).not.toHaveBeenCalled();
  });
  test('view only: no add or lock buttons', async () => {
    mockMe = { userId: 'u-1', roles: [], permissions: ['org.config.view'] };
    route({ '/financial-years': { items: years } });
    await render(<YearsScreen />, { wrapper });
    await screen.findByText('2026-27');
    expect(screen.queryByText('Add next year')).toBeNull();
    expect(screen.queryByText('Lock year 2026-27')).toBeNull();
  });
});

describe('tax', () => {
  const data = {
    '/settings/tax-rates': {
      current: [
        {
          id: 't1',
          code: 'GST5',
          name: 'GST 5%',
          kind: 'GST',
          ratePct: '5.00',
          effectiveFrom: '2025-04-01',
          reason: null,
        },
      ],
      history: [],
    },
    '/settings/hsn-tax': {
      current: [{ hsnCode: '3808', taxCode: 'GST5', effectiveFrom: '2025-04-01' }],
      history: [],
    },
    '/settings/tax': { compositionScheme: false, rounding: 'PAISA', version: 3 },
  };
  test('lists rates, HSN and settings', async () => {
    route(data);
    await render(<TaxScreen />, { wrapper });
    expect(await screen.findByText('GST5 · GST 5%')).toBeTruthy();
    expect(screen.getByText(/GST · 5% · from 2025-04-01/)).toBeTruthy();
    expect(screen.getByText('3808 → GST5')).toBeTruthy();
    expect(screen.getByText(/Composition dealer.*: Off/)).toBeTruthy();
  });
  test('adding a rate sends the rate as a string with a clean code', async () => {
    route(data);
    mockPost.mockResolvedValue({});
    await render(<TaxScreen />, { wrapper });
    await fireEvent.press(await screen.findByText('Add or change a tax rate'));
    await fireEvent.press(screen.getByText('Save'));
    expect(await screen.findByText('Code must be 2 to 20 letters, digits or underscore.')).toBeTruthy();
    expect(mockPost).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText('Tax code (for example GST5)'), 'gst12');
    await fireEvent.changeText(screen.getByLabelText('Name'), 'GST 12%');
    await fireEvent.changeText(screen.getByLabelText('Rate % (0 to 100, up to 2 places)'), '12');
    await fireEvent.changeText(screen.getByLabelText('Effective from (YYYY-MM-DD)'), '2026-11-01');
    await fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    expect(mockPost.mock.calls[0][0]).toBe('/settings/tax-rates');
    expect(mockPost.mock.calls[0][1].body).toEqual({
      code: 'GST12',
      name: 'GST 12%',
      kind: 'GST',
      ratePct: '12',
      effectiveFrom: '2026-11-01',
      reason: null,
    });
  });
  test('mapping an HSN code checks the digits, then posts', async () => {
    route(data);
    mockPost.mockResolvedValue({});
    await render(<TaxScreen />, { wrapper });
    await fireEvent.press(await screen.findByText('Map an HSN code'));
    await fireEvent.changeText(screen.getByLabelText('HSN code (4, 6 or 8 digits)'), '38');
    await fireEvent.press(screen.getByText('Save'));
    expect(await screen.findByText('HSN must be 4, 6 or 8 digits.')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('HSN code (4, 6 or 8 digits)'), '3105');
    await fireEvent.press(screen.getByLabelText('GST5 (5%)'));
    await fireEvent.changeText(screen.getByLabelText('Effective from (YYYY-MM-DD)'), '2026-11-01');
    await fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    expect(mockPost.mock.calls[0][0]).toBe('/settings/hsn-tax');
    expect(mockPost.mock.calls[0][1].body).toEqual({
      hsnCode: '3105',
      taxCode: 'GST5',
      effectiveFrom: '2026-11-01',
    });
  });
  test('tax settings are saved with the version (If-Match)', async () => {
    route(data);
    mockPut.mockResolvedValue({});
    await render(<TaxScreen />, { wrapper });
    await fireEvent.press(await screen.findByText('Change tax settings'));
    await fireEvent.press(screen.getByLabelText('To the nearest rupee'));
    await fireEvent.press(screen.getAllByLabelText('On')[0]!);
    await fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(mockPut).toHaveBeenCalledTimes(1));
    expect(mockPut.mock.calls[0][0]).toBe('/settings/tax');
    expect(mockPut.mock.calls[0][1].version).toBe(3);
    expect(mockPut.mock.calls[0][1].body).toEqual({ compositionScheme: true, rounding: 'RUPEE' });
  });
  test('no manage permission: view only', async () => {
    mockMe = { userId: 'u-1', roles: [], permissions: ['org.config.view'] };
    route(data);
    await render(<TaxScreen />, { wrapper });
    await screen.findByText('GST5 · GST 5%');
    expect(screen.queryByText('Add or change a tax rate')).toBeNull();
    expect(screen.queryByText('Change tax settings')).toBeNull();
  });
});

describe('numbering', () => {
  const series = (over = {}) => ({
    id: 's1',
    branchId: 'b1',
    docType: 'TAX_INVOICE',
    fy: '2026-27',
    prefix: 'INV/',
    padding: 6,
    nextNumber: 1,
    issued: 0,
    nextExample: 'INV/000001',
    version: 1,
    ...over,
  });
  const base = {
    '/branches': { items: [{ id: 'b1', name: 'Main', status: 'ACTIVE' }] },
    '/financial-years': { items: years },
  };
  test('edits an unused series; a used one is frozen', async () => {
    mockGet.mockImplementation((p: string) =>
      Promise.resolve(
        p === '/settings/number-series'
          ? { items: [series(), series({ id: 's2', docType: 'RECEIPT', prefix: 'RC-', issued: 4 })] }
          : (base as Record<string, unknown>)[p],
      ),
    );
    mockPut.mockResolvedValue({});
    await render(<NumberingScreen />, { wrapper });
    expect(await screen.findByText(/Prefix INV\/ · 6 digits · next INV\/000001 · issued 0/)).toBeTruthy();
    expect(screen.getByText('4 numbers already issued, so this series is frozen.')).toBeTruthy();
    expect(screen.queryByText('Edit receipt')).toBeNull();
    await fireEvent.press(screen.getByText('Edit tax invoice'));
    await fireEvent.changeText(screen.getByLabelText('Prefix (letters, digits, / and -)'), 'INVOICE-2026-');
    await fireEvent.press(screen.getByText('Save'));
    expect(
      await screen.findByText('For GST invoices prefix plus digits can be 16 characters at most.'),
    ).toBeTruthy();
    expect(mockPut).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText('Prefix (letters, digits, / and -)'), 'TI/');
    await fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(mockPut).toHaveBeenCalledTimes(1));
    expect(mockPut.mock.calls[0][1].body).toEqual({
      branchId: 'b1',
      docType: 'TAX_INVOICE',
      fy: '2026-27',
      prefix: 'TI/',
      padding: 6,
      nextNumber: 1,
    });
    expect(mockGet).toHaveBeenCalledWith(
      '/settings/number-series',
      expect.objectContaining({ query: { branchId: 'b1', fy: '2026-27' } }),
    );
  });
});

describe('print templates', () => {
  const tpl = (over = {}) => ({
    docType: 'TAX_INVOICE',
    paper: 'A4',
    showLogo: true,
    showLicenceNumbers: true,
    showBatch: true,
    showExpiry: true,
    showHsn: true,
    showTerms: true,
    showUpiQr: false,
    terms: null,
    footer: null,
    version: 2,
    isDefault: false,
    ...over,
  });
  test('HSN cannot be hidden on a tax invoice; other flags and paper save with the version', async () => {
    route({ '/settings/print-templates': { items: [tpl()] } });
    mockPut.mockResolvedValue({});
    await render(<PrintScreen />, { wrapper });
    await fireEvent.press(await screen.findByText('Edit tax invoice'));
    expect(screen.getByText('Show HSN (cannot be hidden)')).toBeTruthy();
    await fireEvent.press(screen.getAllByLabelText('Off')[2]!); // HSN row
    await fireEvent.press(screen.getByLabelText('A5'));
    await fireEvent.press(screen.getAllByLabelText('Off')[0]!); // logo row
    await fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(mockPut).toHaveBeenCalledTimes(1));
    const [path, opts] = mockPut.mock.calls[0];
    expect(path).toBe('/settings/print-templates');
    expect(opts.version).toBe(2);
    expect(opts.body).toMatchObject({
      docType: 'TAX_INVOICE',
      paper: 'A5',
      showHsn: true,
      showLicenceNumbers: true,
      showLogo: false,
      terms: null,
      footer: null,
    });
  });
  test('no manage permission: no edit button', async () => {
    mockMe = { userId: 'u-1', roles: [], permissions: ['org.config.view'] };
    route({ '/settings/print-templates': { items: [tpl()] } });
    await render(<PrintScreen />, { wrapper });
    await screen.findByText('tax invoice');
    expect(screen.queryByText('Edit tax invoice')).toBeNull();
  });
});

const branch = (over = {}) => ({
  id: 'b1',
  code: 'MAIN',
  name: 'Main',
  address: null,
  stateCode: '27',
  gstin: '27ABCDE1234F1Z5',
  phone: null,
  managerUserId: null,
  openingDate: null,
  timezone: 'Asia/Kolkata',
  isHeadOffice: true,
  status: 'ACTIVE',
  version: 5,
  ...over,
});
describe('branches', () => {
  test('add sends only filled fields with an upper-case code', async () => {
    route({ '/branches': { items: [branch()] } });
    mockPost.mockResolvedValue({});
    await render(<BranchesScreen />, { wrapper });
    await fireEvent.press(await screen.findByText('Add branch'));
    await fireEvent.press(screen.getByText('Save'));
    expect(await screen.findByText('Code must be 2 to 10 letters or digits.')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Code (2 to 10 letters or digits)'), 'pune');
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Pune');
    await fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    expect(mockPost.mock.calls[0][0]).toBe('/branches');
    expect(mockPost.mock.calls[0][1].body).toEqual({ name: 'Pune', code: 'PUNE' });
  });
  test('edit sends the version and only the changed field; the head office cannot be deactivated', async () => {
    route({ '/branches': { items: [branch()] } });
    mockPatch.mockResolvedValue({});
    await render(<BranchesScreen />, { wrapper });
    expect(await screen.findByText(/Main · MAIN · head office/)).toBeTruthy();
    expect(screen.queryByText('Deactivate Main')).toBeNull();
    await fireEvent.press(screen.getByText('Edit Main'));
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Main Store');
    await fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(mockPatch).toHaveBeenCalledTimes(1));
    expect(mockPatch.mock.calls[0][0]).toBe('/branches/b1');
    expect(mockPatch.mock.calls[0][1].version).toBe(5);
    expect(mockPatch.mock.calls[0][1].body).toEqual({ name: 'Main Store' });
  });
  test('deactivate needs a reason; an inactive branch can be reactivated', async () => {
    route({
      '/branches': {
        items: [
          branch({ isHeadOffice: false }),
          branch({ id: 'b2', name: 'Old', code: 'OLD', isHeadOffice: false, status: 'INACTIVE' }),
        ],
      },
    });
    mockPost.mockResolvedValue({});
    await render(<BranchesScreen />, { wrapper });
    await fireEvent.press(await screen.findByText('Deactivate Main'));
    await fireEvent.press(screen.getByText('Confirm deactivate'));
    expect(await screen.findByText('Give a reason of 10 to 500 letters.')).toBeTruthy();
    expect(mockPost).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText('Reason (10 to 500 letters)'), 'closed for the season');
    await fireEvent.press(screen.getByText('Confirm deactivate'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    expect(mockPost.mock.calls[0][0]).toBe('/branches/b1:deactivate');
    expect(mockPost.mock.calls[0][1].body).toEqual({ reason: 'closed for the season' });
    await fireEvent.press(await screen.findByText('Reactivate Old'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(2));
    expect(mockPost.mock.calls[1][0]).toBe('/branches/b2:reactivate');
  });
});

const wh = (over = {}) => ({
  id: 'w1',
  branchId: 'b1',
  code: 'MAIN-1',
  name: 'Main godown',
  kind: 'GODOWN',
  sellable: true,
  status: 'ACTIVE',
  version: 2,
  ...over,
});
describe('warehouses and bins', () => {
  const base = {
    '/warehouses': { items: [wh(), wh({ id: 'w2', name: 'Old store', code: 'OLD', status: 'INACTIVE' })] },
    '/branches': { items: [branch()] },
  };
  test('add warehouse, deactivate with a reason, reactivate', async () => {
    route(base);
    mockPost.mockResolvedValue({});
    await render(<WarehousesScreen />, { wrapper });
    await fireEvent.press(await screen.findByText('Add warehouse'));
    await fireEvent.press(screen.getByText('Save'));
    expect(await screen.findByText('Choose a branch.')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Main'));
    await fireEvent.changeText(screen.getByLabelText('Code (2 to 20 letters, digits or -)'), 'cold-1');
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Cold room');
    await fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    expect(mockPost.mock.calls[0][0]).toBe('/warehouses');
    expect(mockPost.mock.calls[0][1].body).toEqual({
      branchId: 'b1',
      code: 'COLD-1',
      name: 'Cold room',
      kind: 'SELLABLE',
    });

    await fireEvent.press(await screen.findByText('Deactivate Main godown'));
    await fireEvent.changeText(
      screen.getByLabelText('Reason (10 to 500 letters)'),
      'moved to the new godown',
    );
    await fireEvent.press(screen.getByText('Confirm deactivate'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(2));
    expect(mockPost.mock.calls[1][0]).toBe('/warehouses/w1:deactivate');

    await fireEvent.press(await screen.findByText('Reactivate Old store'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(3));
    expect(mockPost.mock.calls[2][0]).toBe('/warehouses/w2:reactivate');
  });
  test('edit sends the version and only the changed field', async () => {
    route(base);
    mockPatch.mockResolvedValue({});
    await render(<WarehousesScreen />, { wrapper });
    await fireEvent.press(await screen.findByText('Edit Main godown'));
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Main store');
    await fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(mockPatch).toHaveBeenCalledTimes(1));
    expect(mockPatch.mock.calls[0][0]).toBe('/warehouses/w1');
    expect(mockPatch.mock.calls[0][1].version).toBe(2);
    expect(mockPatch.mock.calls[0][1].body).toEqual({ name: 'Main store' });
  });
  test('bins: list, add and switch off', async () => {
    route({
      ...base,
      '/warehouses/w1/bins': {
        items: [{ id: 'bn1', warehouseId: 'w1', label: 'A-1', rack: 'R1', shelf: null, active: true }],
      },
    });
    mockPost.mockResolvedValue({});
    mockPatch.mockResolvedValue({});
    await render(<WarehousesScreen />, { wrapper });
    await fireEvent.press(await screen.findByText('Bins Main godown'));
    expect(await screen.findByText('A-1')).toBeTruthy();
    await fireEvent.press(screen.getByText('Add bin'));
    await fireEvent.press(screen.getByText('Save'));
    expect(await screen.findByText('Label must be 1 to 40 letters.')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Label'), 'B-2');
    await fireEvent.changeText(screen.getByLabelText('Rack'), 'R2');
    await fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    expect(mockPost.mock.calls[0][0]).toBe('/warehouses/w1/bins');
    expect(mockPost.mock.calls[0][1].body).toEqual({ label: 'B-2', rack: 'R2' });
    await fireEvent.press(await screen.findByText('Deactivate A-1'));
    await waitFor(() => expect(mockPatch).toHaveBeenCalledTimes(1));
    expect(mockPatch.mock.calls[0][0]).toBe('/bins/bn1');
    expect(mockPatch.mock.calls[0][1].body).toEqual({ active: false });
  });
  test('Hindi', async () => {
    await setLanguage('hi');
    route(base);
    await render(<WarehousesScreen />, { wrapper });
    expect(await screen.findByText('गोदाम और बिन')).toBeTruthy();
  });
});

import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '../src/api/errors';
import { i18n, setLanguage } from '../src/i18n';
import parts from '../i18n-parts/cmp.json';
import HubScreen from '../src/features/compliance/HubScreen';
import Gstr1Screen from '../src/features/compliance/Gstr1Screen';
import { HUBS } from '../src/features/compliance/cmp-tabs';
import { humanise, pick } from '../src/features/compliance/cmp-api';

const mockGet = jest.fn();
const mockPost = jest.fn();
let mockMe: { userId: string; roles: string[]; permissions?: string[] };
const mockClient = { get: (...a: unknown[]) => mockGet(...a), post: (...a: unknown[]) => mockPost(...a) };
jest.mock('../src/auth/AuthProvider', () => ({
  useAuth: () => ({
    status: 'signedIn',
    me: mockMe,
    client: mockClient,
    signIn: jest.fn(),
    signOut: jest.fn(),
  }),
}));
jest.mock('../src/device', () => ({ newId: () => 'key-x' }));

let qc: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={qc}>{children}</QueryClientProvider>
);

beforeAll(() => {
  for (const lang of ['en', 'hi', 'mr'] as const)
    i18n.addResourceBundle(lang, 'translation', (parts as Record<string, object>)[lang], true, true);
});
beforeEach(async () => {
  [mockGet, mockPost].forEach((m) => m.mockReset());
  mockMe = { userId: 'u-1', roles: [], permissions: undefined };
  qc = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retryDelay: 0 } } });
  await setLanguage('en');
});

const gstr1 = {
  period: '2026-11',
  summary: { taxable: '100000.00', tax: '5000.00', invoices: 12, notes: 1 },
  snapshot: null,
  checks: [
    { key: 'TAXABLE_MATCH', ok: true, expected: '100000.00', actual: '100000.00' },
    { key: 'TAX_MATCH', ok: false, expected: '5000.00', actual: '4999.00' },
  ],
  warnings: [{ message: 'Customer GSTIN missing on 2 invoices' }],
  sections: {
    b2b: [
      { ctin: '27AAAAA0000A1Z5', name: 'Patil Agro', invoices: [{ value: '1180.00' }, { value: '2000.50' }] },
    ],
    b2cl: [],
    b2cs: [],
    cdnr: [],
    cdnur: [],
    exempt: [],
    docs: [],
    amendments: [],
    hsn: [
      {
        hsn: '3808',
        uqc: 'KGS',
        description: 'Pesticide',
        qty: '12.500',
        rate: '18.00',
        taxable: '1000.00',
        igst: '0.00',
        cgst: '90.00',
        sgst: '90.00',
      },
    ],
  },
};

describe('GSTR-1', () => {
  it('shows the server figures, checks and warnings, and the B2B total', async () => {
    mockGet.mockResolvedValue(gstr1);
    await render(<Gstr1Screen />, { wrapper });
    expect(await screen.findByText('₹1,00,000.00')).toBeTruthy();
    expect(screen.getByText(/Customer GSTIN missing/)).toBeTruthy();
    expect(screen.getByText(/Mismatch: Tax match/)).toBeTruthy();
    expect(screen.getByText('27AAAAA0000A1Z5')).toBeTruthy();
    expect(screen.getByText('₹3,180.50')).toBeTruthy();
    expect(mockGet.mock.calls[0]![0]).toBe('/gst/gstr1');
    expect(mockGet.mock.calls[0]![1].query.period).toMatch(/^\d{4}-\d{2}$/);
  });

  it('switches to the HSN section', async () => {
    mockGet.mockResolvedValue(gstr1);
    await render(<Gstr1Screen />, { wrapper });
    await screen.findByText('27AAAAA0000A1Z5');
    fireEvent.press(screen.getByRole('radio', { name: 'HSN' }));
    expect(await screen.findByText('12.500')).toBeTruthy();
  });

  it('freezes after a confirm, with the warnings acknowledged and one idempotency key', async () => {
    mockGet.mockResolvedValue(gstr1);
    mockPost.mockRejectedValueOnce(new ApiError(0, null, 'c-1')).mockResolvedValue({});
    await render(<Gstr1Screen />, { wrapper });
    fireEvent.press(await screen.findByRole('button', { name: 'Freeze GSTR-1 snapshot' }));
    fireEvent.press(await screen.findByRole('button', { name: 'Yes, do it' }));
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    fireEvent.press(await screen.findByRole('button', { name: 'Yes, do it' }));
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(2));
    const [path, opts] = mockPost.mock.calls[1]!;
    expect(path).toBe('/gst/gstr1/snapshot');
    expect(opts.body.acknowledgeWarnings).toBe(true);
    expect(opts.body).not.toHaveProperty('tenantId');
    expect(opts.idempotencyKey).toBe(mockPost.mock.calls[0]![1].idempotencyKey);
    expect(await screen.findByText('Snapshot frozen.')).toBeTruthy();
  });

  it('hides the freeze buttons without the snapshot permission', async () => {
    mockMe.permissions = ['compliance.gst.view'];
    mockGet.mockResolvedValue(gstr1);
    await render(<Gstr1Screen />, { wrapper });
    await screen.findByText('27AAAAA0000A1Z5');
    expect(screen.queryByRole('button', { name: 'Freeze GSTR-1 snapshot' })).toBeNull();
  });

  it('shows permission denied without a request', async () => {
    mockMe.permissions = ['x'];
    await render(<Gstr1Screen />, { wrapper });
    expect(screen.getByText('You do not have permission to see this.')).toBeTruthy();
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('shows offline and error with the correlation id', async () => {
    mockGet.mockRejectedValue(new ApiError(0, null, 'c-1'));
    const a = await render(<Gstr1Screen />, { wrapper });
    expect(await screen.findByText('No network. Check your connection and try again.')).toBeTruthy();
    a.unmount();
  });

  it('shows the correlation id on a server error', async () => {
    mockGet.mockRejectedValue(new ApiError(500, { title: 'INTERNAL' }, 'corr-77'));
    await render(<Gstr1Screen />, { wrapper });
    expect(await screen.findByText(/corr-77/)).toBeTruthy();
  });

  it('speaks Hindi and Marathi', async () => {
    mockGet.mockResolvedValue(gstr1);
    await setLanguage('hi');
    const a = await render(<Gstr1Screen />, { wrapper });
    expect(await screen.findByText('GSTR-1 (बिक्री रिटर्न)')).toBeTruthy();
    a.unmount();
    await setLanguage('mr');
    await render(<Gstr1Screen />, { wrapper });
    expect(await screen.findByText('GSTR-1 (विक्री रिटर्न)')).toBeTruthy();
  });
});

describe('licences hub', () => {
  const regs = {
    items: [
      {
        id: 'r1',
        skuCode: 'PST-01',
        regNumber: 'CIR-123',
        validTo: '2027-03-31',
        status: 'ACTIVE',
        version: 4,
      },
      {
        id: 'r2',
        skuCode: 'PST-02',
        regNumber: 'CIR-999',
        validTo: '2026-01-31',
        status: 'SUSPENDED',
        version: 2,
      },
    ],
  };

  it('lists registrations and suspends with a reason and the row version', async () => {
    mockGet.mockResolvedValue(regs);
    mockPost.mockResolvedValue({});
    await render(<HubScreen hub="licences" />, { wrapper });
    expect(await screen.findByText('PST-01 · CIR-123')).toBeTruthy();
    expect(mockGet.mock.calls[0]![0]).toBe('/compliance/registrations');
    fireEvent.press(screen.getByRole('button', { name: 'Suspend' }));
    const confirm = await screen.findByRole('button', { name: 'Yes, do it' });
    expect(confirm.props.accessibilityState?.disabled).toBe(true);
    fireEvent.changeText(
      await screen.findByLabelText('Reason (at least 3 characters)'),
      'Licence under review',
    );
    fireEvent.press(await screen.findByRole('button', { name: 'Yes, do it' }));
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    const [path, opts] = mockPost.mock.calls[0]!;
    expect(path).toBe('/compliance/registrations/r1/suspend');
    expect(opts.body).toEqual({ reason: 'Licence under review' });
    expect(opts.version).toBe(4);
    expect(opts.idempotencyKey).toBe('key-x');
  });

  it('restores a suspended registration with If-Match and no reason', async () => {
    mockGet.mockResolvedValue(regs);
    mockPost.mockResolvedValue({});
    await render(<HubScreen hub="licences" />, { wrapper });
    await screen.findByText('PST-02 · CIR-999');
    fireEvent.press(screen.getByRole('button', { name: 'Restore' }));
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    expect(mockPost.mock.calls[0]![0]).toBe('/compliance/registrations/r2/restore');
    expect(mockPost.mock.calls[0]![1].version).toBe(2);
    expect(await screen.findByText('Done.')).toBeTruthy();
  });

  it('hides write buttons when the user can only view', async () => {
    mockMe.permissions = ['compliance.registers.view'];
    mockGet.mockResolvedValue(regs);
    await render(<HubScreen hub="licences" />, { wrapper });
    await screen.findByText('PST-01 · CIR-123');
    expect(screen.queryByRole('button', { name: 'Suspend' })).toBeNull();
  });

  it('acknowledges an expiry alert from the alerts tab, asking for open ones only', async () => {
    mockGet.mockImplementation((p: string) =>
      Promise.resolve(
        p === '/compliance/alerts'
          ? { items: [{ id: 'a1', title: 'Fertiliser licence', dueDate: '2026-12-01', leadDays: 30 }] }
          : { items: [] },
      ),
    );
    mockPost.mockResolvedValue({});
    await render(<HubScreen hub="licences" />, { wrapper });
    fireEvent.press(await screen.findByRole('radio', { name: 'Expiry alerts' }));
    expect(await screen.findByText('Fertiliser licence')).toBeTruthy();
    expect(mockGet).toHaveBeenCalledWith(
      '/compliance/alerts',
      expect.objectContaining({ query: { open: 'true' } }),
    );
    fireEvent.press(screen.getByRole('button', { name: 'Acknowledge' }));
    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith(
        '/compliance/alerts/a1/acknowledge',
        expect.objectContaining({ body: {} }),
      ),
    );
  });

  it('shows the empty state', async () => {
    mockGet.mockResolvedValue({ items: [] });
    await render(<HubScreen hub="licences" />, { wrapper });
    expect(await screen.findByText('Nothing to show yet.')).toBeTruthy();
  });

  it('shows permission denied when no tab is allowed', async () => {
    mockMe.permissions = ['other'];
    await render(<HubScreen hub="licences" />, { wrapper });
    expect(screen.getByText('You do not have permission to see this.')).toBeTruthy();
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('shows offline', async () => {
    mockGet.mockRejectedValue(new ApiError(0, null, 'c-1'));
    await render(<HubScreen hub="licences" />, { wrapper });
    expect(await screen.findByText('No network. Check your connection and try again.')).toBeTruthy();
  });

  it('shows the correlation id on a server error', async () => {
    mockGet.mockRejectedValue(new ApiError(500, { title: 'INTERNAL' }, 'corr-9'));
    await render(<HubScreen hub="licences" />, { wrapper });
    expect(await screen.findByText(/corr-9/)).toBeTruthy();
  });
});

describe('registers, tax records and safety hubs', () => {
  it('shows the pesticide register for the chosen month with quantities as given', async () => {
    mockGet.mockResolvedValue({
      rows: [
        {
          skuCode: 'PST-01',
          batchNo: 'B7',
          opening: '10.000',
          receipts: '5.000',
          sales: '3.250',
          other: '0.000',
          closing: '11.750',
          missing: ['licence no'],
        },
      ],
    });
    await render(<HubScreen hub="agriRegisters" />, { wrapper });
    expect(await screen.findByText('PST-01 · B7')).toBeTruthy();
    expect(screen.getByText('11.750')).toBeTruthy();
    expect(screen.getByText('licence no')).toBeTruthy();
    expect(mockGet.mock.calls[0]![0]).toBe('/compliance/pesticide-register');
    expect(mockGet.mock.calls[0]![1].query.period).toMatch(/^\d{4}-\d{2}$/);
    mockGet.mockClear();
    fireEvent.press(screen.getByRole('radio', { name: /Last month/ }));
    await waitFor(() => expect(mockGet).toHaveBeenCalled());
  });

  it('shows the TDS report with the server total and money formatting', async () => {
    mockGet.mockImplementation((p: string) =>
      Promise.resolve(
        p === '/reports/tds'
          ? {
              total: '1500.50',
              rows: [
                {
                  section: '194C',
                  partyName: 'Transport Co',
                  documents: 2,
                  base: '100000.00',
                  deductOn: '100000.00',
                  amount: '1500.50',
                  panMissing: false,
                },
              ],
            }
          : {
              items: [
                {
                  id: 'e1',
                  selfInvoiceNo: 'RCM-1',
                  supplierName: 'Farmer X',
                  entryDate: '2026-11-02',
                  taxable: '1000.00',
                  igst: '0.00',
                  cgst: '25.00',
                  sgst: '25.00',
                  itcClaimable: true,
                  status: 'POSTED',
                },
              ],
            },
      ),
    );
    await render(<HubScreen hub="taxRecords" />, { wrapper });
    expect(await screen.findByText('RCM-1 · Farmer X')).toBeTruthy();
    fireEvent.press(screen.getByRole('radio', { name: 'TDS / TCS report' }));
    expect(await screen.findByText('194C · Transport Co')).toBeTruthy();
    expect(screen.getAllByText('₹1,500.50').length).toBeGreaterThan(0);
    const call = mockGet.mock.calls.find((c) => c[0] === '/reports/tds')!;
    expect(call[1].query.from).toMatch(/-01$/);
  });

  it('reverses a reverse-charge entry only after a confirm', async () => {
    mockGet.mockResolvedValue({
      items: [{ id: 'e1', selfInvoiceNo: 'RCM-1', supplierName: 'F', status: 'POSTED' }],
    });
    mockPost.mockResolvedValue({});
    await render(<HubScreen hub="taxRecords" />, { wrapper });
    fireEvent.press(await screen.findByRole('button', { name: 'Reverse entry' }));
    expect(mockPost).not.toHaveBeenCalled();
    fireEvent.press(await screen.findByRole('button', { name: 'Yes, do it' }));
    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith('/rcm/entries/e1/reverse', expect.objectContaining({ body: {} })),
    );
  });

  it('lists recalls with nested counts', async () => {
    mockGet.mockResolvedValue({
      items: [
        {
          id: 'c1',
          caseNo: 'RC-1',
          title: 'Batch 7 contamination',
          source: 'MANUFACTURER',
          severity: 'CRITICAL',
          status: 'OPEN',
          metrics: { found: 8, quarantinedUnits: 40, returned: 2, unresolved: 6 },
        },
      ],
    });
    await render(<HubScreen hub="safety" />, { wrapper });
    expect(await screen.findByText('RC-1 · Batch 7 contamination')).toBeTruthy();
    expect(screen.getByText('40')).toBeTruthy();
    expect(screen.getByText('Critical')).toBeTruthy();
  });

  it('only shows tabs the user may open', async () => {
    mockMe.permissions = ['compliance.recall.manage'];
    mockGet.mockResolvedValue({ items: [] });
    await render(<HubScreen hub="safety" />, { wrapper });
    await screen.findByText('Nothing to show yet.');
    expect(screen.getByRole('radio', { name: 'Recalls' })).toBeTruthy();
    expect(screen.queryByRole('radio', { name: 'Samples' })).toBeNull();
  });
});

describe('helpers and translations', () => {
  it('reads nested fields and humanises codes', () => {
    expect(pick({ metrics: { found: 3 } }, 'metrics.found')).toBe(3);
    expect(pick({ a: 1 }, 'a.b')).toBeUndefined();
    expect(humanise('UNDER_REVIEW')).toBe('Under review');
  });

  it('has every label in English, Hindi and Marathi', () => {
    const p = parts as Record<
      string,
      { cmp: { f: Record<string, string>; tab: Record<string, string>; act: Record<string, string> } }
    >;
    const fieldKeys = Object.values(HUBS).flatMap((h) =>
      h.tabs.flatMap((t) => [...t.title, ...t.fields].map((c) => c.k.replace(/\./g, '_'))),
    );
    const tabIds = Object.values(HUBS).flatMap((h) => h.tabs.map((t) => t.id));
    const actIds = Object.values(HUBS).flatMap((h) =>
      h.tabs.flatMap((t) => (t.actions ?? []).map((a) => a.id)),
    );
    for (const l of ['en', 'hi', 'mr']) {
      for (const k of fieldKeys) expect(p[l]!.cmp.f[k]).toBeTruthy();
      for (const k of tabIds) expect(p[l]!.cmp.tab[k]).toBeTruthy();
      for (const k of actIds) expect(p[l]!.cmp.act[k]).toBeTruthy();
    }
  });
});

import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setLanguage } from '../src/i18n';
import YearsScreen from '../src/features/setup/YearsScreen';
import PrintScreen from '../src/features/setup/PrintScreen';
import SettingsEditScreen from '../src/features/adm/SettingsEditScreen';
import { yearDeletable, yearEditable, yearWhyNot, type FinancialYear } from '../src/features/setup/api';

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
    },
  }),
}));
jest.mock('../src/device', () => ({ newId: () => `key-${++mockId}` }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }), Stack: { Screen: () => null } }));

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
const route = (map: Record<string, unknown>) =>
  mockGet.mockImplementation((p: string) =>
    p in map ? Promise.resolve(map[p]) : Promise.reject(new Error(`unexpected GET ${p}`)),
  );

const y = (
  id: string,
  label: string,
  start: string,
  end: string,
  extra: Partial<FinancialYear>,
): FinancialYear => ({
  id,
  label,
  startDate: start,
  endDate: end,
  status: 'OPEN',
  lockedAt: null,
  periodCount: 12,
  ...extra,
});
const used = y('y1', 'FY 2026-27', '2026-04-01', '2027-03-31', { inUse: true, future: false });
const fresh = y('y2', 'FY 2027-28', '2027-04-01', '2028-03-31', { inUse: false, future: true });

describe('financial years', () => {
  test('rules like the web: edit while nothing is booked; delete only the last year before it starts', () => {
    expect(yearEditable(used)).toBe(false);
    expect(yearWhyNot(used, 'edit')).toBe('inUse');
    expect(yearEditable(fresh)).toBe(true);
    expect(yearDeletable(fresh, [used, fresh])).toBe(true);
    expect(yearWhyNot(fresh, 'delete', [fresh, used])).toBe('notLast');
    expect(yearWhyNot({ ...fresh, future: false }, 'delete', [fresh])).toBe('started');
    expect(yearWhyNot({ ...fresh, status: 'LOCKED' }, 'edit')).toBe('locked');
    // an older server that sends no flag: nothing is offered
    expect(yearEditable({ ...fresh, inUse: undefined })).toBe(false);
  });

  test('edit: the start is fixed by the previous year; PUT with both dates', async () => {
    route({ '/financial-years': { items: [used, fresh] } });
    mockPut.mockResolvedValue(fresh);
    await render(<YearsScreen />, { wrapper });
    expect(screen.queryByText('Edit FY 2026-27')).toBeNull();
    await fireEvent.press(await screen.findByText('Edit FY 2027-28'));
    expect(screen.getByText('Fixed by the previous year')).toBeTruthy();
    await fireEvent.changeText(screen.getByDisplayValue('2028-03-31'), '2028-03-30');
    await fireEvent.press(screen.getByText('Save dates'));
    await waitFor(() =>
      expect(mockPut).toHaveBeenCalledWith('/financial-years/y2', {
        body: { startDate: '2027-04-01', endDate: '2028-03-30' },
        idempotencyKey: 'key-1',
      }),
    );
    expect(await screen.findByText('Financial year updated')).toBeTruthy();
  });

  test('delete the last unused year with a recorded reason', async () => {
    route({ '/financial-years': { items: [used, fresh] } });
    mockPost.mockResolvedValue({ id: 'y2', label: 'FY 2027-28' });
    await render(<YearsScreen />, { wrapper });
    await fireEvent.press(await screen.findByText('Delete FY 2027-28'));
    await fireEvent.press(screen.getByText('Delete year'));
    expect(mockPost).not.toHaveBeenCalled(); // no reason yet
    await fireEvent.changeText(
      screen.getByLabelText('Reason (10 to 500 letters)'),
      'Created by mistake while testing',
    );
    await fireEvent.press(screen.getByText('Delete year'));
    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith('/financial-years/y2:delete', {
        body: { reason: 'Created by mistake while testing' },
        idempotencyKey: 'key-1',
      }),
    );
  });

  test('a used last year says why it cannot be deleted', async () => {
    route({ '/financial-years': { items: [used] } });
    await render(<YearsScreen />, { wrapper });
    expect(await screen.findByText(/something is booked in it/)).toBeTruthy();
    expect(screen.queryByText('Delete FY 2026-27')).toBeNull();
  });
});

describe('print templates', () => {
  const tpl = {
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
    version: 3,
    isDefault: false,
  };
  test('delete after a confirm, and add a deleted one back', async () => {
    route({ '/settings/print-templates': { items: [tpl], removed: ['DELIVERY_CHALLAN'] } });
    mockPost.mockResolvedValue({});
    await render(<PrintScreen />, { wrapper });
    await fireEvent.press(await screen.findByText('Delete tax invoice'));
    expect(screen.getByText(/still print with the standard default layout/)).toBeTruthy();
    await fireEvent.press(screen.getByText('Delete template'));
    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith('/settings/print-templates:delete', {
        body: { docType: 'TAX_INVOICE' },
        idempotencyKey: 'key-1',
      }),
    );
    await fireEvent.press(screen.getByText('delivery challan'));
    await fireEvent.press(screen.getAllByText('Add template back').at(-1)!);
    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith('/settings/print-templates:restore', {
        body: { docType: 'DELIVERY_CHALLAN' },
        idempotencyKey: expect.any(String),
      }),
    );
  });
  test('a role that may only look sees no delete', async () => {
    mockMe = { userId: 'u-2', roles: [], permissions: ['org.config.view'] };
    route({ '/settings/print-templates': { items: [tpl], removed: ['DELIVERY_CHALLAN'] } });
    await render(<PrintScreen />, { wrapper });
    expect(await screen.findByText('tax invoice')).toBeTruthy();
    expect(screen.queryByText('Delete tax invoice')).toBeNull();
    expect(screen.queryByText('Add template back')).toBeNull();
  });
});

describe('payment modes', () => {
  const modes = {
    items: [
      { code: 'CASH', enabled: true, ledgerAccountId: 'l-cash', upiVpa: null, version: 2 },
      { code: 'UPI', enabled: false, ledgerAccountId: null, upiVpa: null, version: 1 },
    ],
    removed: ['CARD'],
  };
  const accounts = {
    items: [
      { id: 'l-exp', code: '5100', name: 'Rent', type: 'EXPENSE' },
      { id: 'l-sun', code: '1300', name: 'Sundry debtors', type: 'ASSET' },
      { id: 'l-bank', code: '1210', name: 'HDFC current', type: 'ASSET', cashBank: true },
      { id: 'l-cash', code: '1100', name: 'Cash in hand', type: 'ASSET', cashBank: true },
    ],
  };
  beforeEach(() => {
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/settings/company') return { legalName: 'Kisan Agro', version: 1 };
      if (path === '/settings/payment-modes') return modes;
      if (path === '/settings/general')
        return { settings: {}, costingMethod: { effective: 'FIFO', scheduled: [] } };
      if (path === '/finance/accounts') return accounts;
      throw new Error(`unexpected ${path}`);
    });
  });

  test('the ledger by code and name; a ledger linked to UPI (cash and bank first)', async () => {
    mockPut.mockResolvedValue({});
    await render(<SettingsEditScreen />, { wrapper });
    expect(await screen.findByText('Ledger account: 1100 - Cash in hand')).toBeTruthy();
    await fireEvent.press(screen.getByText('Link a ledger to UPI'));
    const chips = screen.getAllByText(/^1\d{3} - /).map((x) => x.props.children);
    expect(chips.slice(-3)).toEqual(['1210 - HDFC current', '1100 - Cash in hand', '1300 - Sundry debtors']);
    expect(screen.queryByText('5100 - Rent')).toBeNull();
    await fireEvent.press(screen.getAllByText('1210 - HDFC current').at(-1)!);
    await waitFor(() =>
      expect(mockPut).toHaveBeenCalledWith('/settings/payment-modes', {
        body: { code: 'UPI', ledgerAccountId: 'l-bank' },
        version: 1,
        idempotencyKey: 'key-1',
      }),
    );
  });

  test('delete after a confirm; add a deleted one back', async () => {
    mockPost.mockResolvedValue({});
    await render(<SettingsEditScreen />, { wrapper });
    await fireEvent.press(await screen.findByText('Delete CASH'));
    expect(screen.getByText(/can no longer be taken at billing/)).toBeTruthy();
    await fireEvent.press(screen.getByText('Delete payment mode'));
    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith('/settings/payment-modes:delete', {
        body: { code: 'CASH' },
        idempotencyKey: 'key-1',
      }),
    );
    await fireEvent.press(screen.getByText('CARD'));
    await fireEvent.press(screen.getAllByText('Add payment mode back').at(-1)!);
    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith('/settings/payment-modes:restore', {
        body: { code: 'CARD' },
        idempotencyKey: expect.any(String),
      }),
    );
  });
});

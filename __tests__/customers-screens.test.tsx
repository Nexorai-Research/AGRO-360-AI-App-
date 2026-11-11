import type { ReactNode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '../src/api/errors';
import { i18n } from '../src/i18n';
import CustomersScreen from '../app/customers/index';
import Customer360Screen from '../app/customers/[id]';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useLocalSearchParams: () => ({ id: 'c1' }),
  Stack: { Screen: () => null },
}));

const mockAuth: {
  client: { get: jest.Mock } | null;
  me: { userId: string; tenantId: string; roles: string[]; permissions?: string[] };
} = {
  client: null,
  me: {
    userId: 'u1',
    tenantId: 't1',
    roles: ['staff'],
    permissions: ['customer.view', 'customer.ledger.view'],
  },
};
jest.mock('../src/auth/AuthProvider', () => ({ useAuth: () => mockAuth }));

const cust = (over: Record<string, unknown> = {}) => ({
  id: 'c1',
  code: 'CUS-00001',
  name: 'Ramesh Patil',
  mobile: '98xxxxxx10',
  village: 'Shirur',
  categoryName: 'Farmer',
  status: 'ACTIVE',
  creditHold: false,
  ...over,
});

const fixture360 = {
  profile: {
    ...cust(),
    altMobile: null,
    sharedMobile: false,
    taluka: 'Shirur',
    district: 'Pune',
    language: 'mr',
    gstin: null,
    version: 3,
  },
  credit: {
    customerId: 'c1',
    creditLimit: '50000.0000',
    seasonLimit: null,
    hold: true,
    holdReason: 'Overdue',
    outstanding: '1234567.5000',
    available: '0.0000',
  },
  purchases: {
    thisSeason: { season: 'KHARIF', year: 2026, invoices: 2, amount: '4500.00' },
    lastSeason: { season: 'RABI', year: 2025, invoices: 0, amount: '0.00' },
  },
  recentPurchases: [
    {
      invoice_id: 'i1',
      number: 'INV-1',
      d: '2026-11-02',
      status: 'FINAL',
      sku_code: 'S1',
      sku_name: 'Urea 45kg',
      qty: '2.000',
      unit_price: '270.0000',
      line_total: '540.0000',
      batch_no: 'B1',
      returned: '1.000',
    },
  ],
};

async function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const r = await render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
  return { qc, ...r };
}

beforeEach(async () => {
  mockPush.mockReset();
  mockAuth.client = { get: jest.fn() };
  mockAuth.me.permissions = ['customer.view', 'customer.ledger.view'];
  await i18n.changeLanguage('en');
});

describe('customer list', () => {
  it('shows customers, opens one, and searches after a pause', async () => {
    mockAuth.client!.get.mockResolvedValue({
      items: [cust(), cust({ id: 'c2', name: 'Sunita More', creditHold: true })],
    });
    await wrap(<CustomersScreen />);
    expect(await screen.findByText('Ramesh Patil')).toBeTruthy();
    expect(screen.getByText('Credit hold')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Ramesh Patil, CUS-00001'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/customers/[id]', params: { id: 'c1' } });

    await fireEvent.changeText(screen.getByLabelText('Search name, mobile, village, code'), 'More');
    expect(mockAuth.client!.get).toHaveBeenCalledTimes(1); // not yet: the user is still typing
    await waitFor(() => expect(mockAuth.client!.get).toHaveBeenCalledTimes(2), { timeout: 2000 });
    expect(mockAuth.client!.get.mock.calls[1]![1].query).toEqual({ q: 'More', limit: 50 });
  });

  it('shows the empty state', async () => {
    mockAuth.client!.get.mockResolvedValue({ items: [] });
    await wrap(<CustomersScreen />);
    expect(await screen.findByText('No customers match.')).toBeTruthy();
  });

  it('shows a translated error with a retry when the network is down and nothing is cached', async () => {
    mockAuth.client!.get.mockRejectedValue(new ApiError(0, null));
    await wrap(<CustomersScreen />);
    expect(await screen.findByText(/No network/)).toBeTruthy();
    mockAuth.client!.get.mockResolvedValue({ items: [cust()] });
    await fireEvent.press(screen.getByText('Try again'));
    expect(await screen.findByText('Ramesh Patil')).toBeTruthy();
  });

  it('shows permission denied on a 403 and does not call the API when the role lacks customer.view', async () => {
    mockAuth.client!.get.mockRejectedValue(new ApiError(403, { title: 'FORBIDDEN' }));
    const a = await wrap(<CustomersScreen />);
    expect(await screen.findByText('You do not have permission to see this.')).toBeTruthy();
    await a.unmount();

    mockAuth.client!.get.mockClear();
    mockAuth.me.permissions = ['sales.view'];
    await wrap(<CustomersScreen />);
    expect(await screen.findByText('You do not have permission to see this.')).toBeTruthy();
    expect(mockAuth.client!.get).not.toHaveBeenCalled();
  });

  it('keeps the list and says "saved data as of" when a refresh fails offline', async () => {
    mockAuth.client!.get.mockResolvedValueOnce({ items: [cust()] });
    const { qc } = await wrap(<CustomersScreen />);
    expect(await screen.findByText('Ramesh Patil')).toBeTruthy();
    mockAuth.client!.get.mockRejectedValue(new ApiError(0, null));
    await act(async () => {
      await qc.refetchQueries({ queryKey: ['customers'] });
    });
    expect(await screen.findByText(/No network. Showing saved data as of \d\d:\d\d/)).toBeTruthy();
    expect(screen.getByText('Ramesh Patil')).toBeTruthy();
  });

  it('is available in Hindi', async () => {
    await i18n.changeLanguage('hi');
    mockAuth.client!.get.mockResolvedValue({ items: [] });
    await wrap(<CustomersScreen />);
    expect(await screen.findByText('कोई ग्राहक नहीं मिला।')).toBeTruthy();
  });
});

describe('customer 360', () => {
  const route = (path: string): Promise<unknown> => {
    if (path === '/customers/c1/360') return Promise.resolve(fixture360);
    if (path === '/customers/c1/ledger')
      return Promise.resolve({
        opening: '0.0000',
        closing: '1234567.5000',
        entries: [
          {
            journalId: 'j1',
            date: '2026-11-02',
            sourceType: 'INVOICE',
            purpose: 'Sale INV-1',
            debit: '540.0000',
            credit: '0.0000',
            balance: '540.0000',
          },
        ],
      });
    return Promise.reject(new Error('unexpected ' + path));
  };

  it('shows profile, credit with Indian money grouping, seasons and recent purchases', async () => {
    mockAuth.client!.get.mockImplementation(route);
    await wrap(<Customer360Screen />);
    expect((await screen.findAllByText('Ramesh Patil')).length).toBeGreaterThan(0);
    expect(screen.getByText('₹12,34,567.50')).toBeTruthy(); // outstanding, no float rounding
    expect(screen.getByText('₹50,000.00')).toBeTruthy();
    expect(screen.getByText(/Credit hold: Overdue/)).toBeTruthy();
    expect(screen.getByText('Urea 45kg')).toBeTruthy();
    expect(screen.getByText('Returned 1.000')).toBeTruthy();
    expect(screen.getByText('Kharif 2026')).toBeTruthy();
  });

  it('loads the ledger only when asked', async () => {
    mockAuth.client!.get.mockImplementation(route);
    await wrap(<Customer360Screen />);
    await screen.findByText('Show ledger');
    expect(mockAuth.client!.get.mock.calls.map((c) => c[0])).not.toContain('/customers/c1/ledger');
    await fireEvent.press(screen.getByText('Show ledger'));
    expect(await screen.findByText('Sale INV-1')).toBeTruthy();
    expect(screen.getByText('Opening balance')).toBeTruthy();
    expect(screen.getByText('+ ₹540.00')).toBeTruthy();
  });

  it('hides the ledger and says credit is hidden when the role has no finance permission', async () => {
    mockAuth.me.permissions = ['customer.view'];
    mockAuth.client!.get.mockImplementation((p: string) =>
      p.endsWith('/360') ? Promise.resolve({ ...fixture360, credit: null }) : route(p),
    );
    await wrap(<Customer360Screen />);
    expect(await screen.findByText('Credit details are not available to your role.')).toBeTruthy();
    expect(screen.queryByText('Show ledger')).toBeNull();
  });

  it('shows permission denied inside the ledger section when the server refuses it', async () => {
    mockAuth.client!.get.mockImplementation((p: string) =>
      p.endsWith('/ledger') ? Promise.reject(new ApiError(403, { title: 'FORBIDDEN' })) : route(p),
    );
    await wrap(<Customer360Screen />);
    await fireEvent.press(await screen.findByText('Show ledger'));
    expect(await screen.findByText('You do not have permission to see this.')).toBeTruthy();
    expect(screen.getByText('Urea 45kg')).toBeTruthy(); // the rest of the page stays
  });

  it('shows not found as an error with retry', async () => {
    mockAuth.client!.get.mockRejectedValue(
      new ApiError(404, { title: 'NOT_FOUND', correlationId: 'corr-1' }),
    );
    await wrap(<Customer360Screen />);
    expect(await screen.findByText('Not found.')).toBeTruthy();
    expect(screen.getByText('Try again')).toBeTruthy();
  });

  it('keeps old data with an "as of" notice when a refresh fails offline', async () => {
    mockAuth.client!.get.mockImplementation(route);
    const { qc } = await wrap(<Customer360Screen />);
    await screen.findByText('Urea 45kg');
    mockAuth.client!.get.mockRejectedValue(new ApiError(0, null));
    await act(async () => {
      await qc.refetchQueries({ queryKey: ['customers'] });
    });
    expect(await screen.findByText(/No network. Showing saved data as of/)).toBeTruthy();
    expect(screen.getByText('Urea 45kg')).toBeTruthy();
  });
});

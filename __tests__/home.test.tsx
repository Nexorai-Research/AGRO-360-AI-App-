import type { ReactNode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '../src/api/errors';
import { i18n, setLanguage } from '../src/i18n';
import HomeScreen from '../src/features/home/HomeScreen';
import { formatINRShort } from '../src/features/home/format';
import { pickHomeTiles, type OwnerDashboard, type Tile } from '../src/features/home/api';

const mockGet = jest.fn();
const mockSignOut = jest.fn(async () => {});
let mockMe: { userId: string; roles: string[]; permissions?: string[] } | null;

jest.mock('../src/auth/AuthProvider', () => ({
  useAuth: () => ({ status: 'signedIn', me: mockMe, client: { get: mockGet }, signIn: jest.fn(), signOut: mockSignOut }),
}));

const tile = (id: string, value: string | null, unit: Tile['unit'] = 'money', extra: Partial<Tile> = {}): Tile => ({
  id,
  label: id,
  state: value === null ? 'INSUFFICIENT_DATA' : 'OK',
  value,
  unit,
  previous: null,
  changePct: null,
  period: { from: '2026-11-11', to: '2026-11-11' },
  asOf: '2026-11-11T08:30:00.000Z',
  link: '/api/v1/x',
  hint: null,
  ...extra,
});

const dashboard = (over: Partial<OwnerDashboard> = {}): OwnerDashboard => ({
  period: 'today',
  from: '2026-11-11',
  to: '2026-11-11',
  asOf: '2026-11-11T08:30:00.000Z',
  tiles: [
    tile('net_sales', '1234567.50', 'money', { changePct: '12.5' }),
    tile('bills', '42', 'count'),
    tile('receivables_outstanding', '87500.00'),
    tile('low_stock_count', '3', 'count'),
    tile('stock_value', null),
    tile('gross_margin', '999.00'), // a tile the home screen does not show
  ],
  trend: [
    { day: '2026-11-10', netSales: '1000.00' },
    { day: '2026-11-11', netSales: '2000.00' },
  ],
  topProducts: [],
  topCustomers: [],
  branches: [],
  ...over,
});

let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
const show = () => render(<HomeScreen />, { wrapper });

beforeEach(async () => {
  mockGet.mockReset();
  mockSignOut.mockClear();
  mockMe = { userId: 'u-1', roles: ['OWNER'], permissions: ['reports.sales', 'inventory.view'] };
  client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retryDelay: 0 } } });
  await setLanguage('en');
});

describe('home dashboard', () => {
  it('asks the owner dashboard for today and shows the tiles, money as Indian rupees', async () => {
    mockGet.mockResolvedValue(dashboard());
    await show();
    expect(await screen.findByText('₹12.35 L')).toBeTruthy();
    expect(mockGet).toHaveBeenCalledWith('/reports/dashboard/owner', expect.objectContaining({ query: { period: 'today' } }));
    expect(screen.getByText("Today's sales")).toBeTruthy();
    expect(screen.getByText('42')).toBeTruthy();
    expect(screen.getByText('₹87,500')).toBeTruthy();
    expect(screen.getByText('Bills today')).toBeTruthy();
    expect(screen.getByText('+12.5% vs previous period')).toBeTruthy();
  });

  it('shows a dash and "Not enough data" for a tile the server could not answer, and skips tiles not meant for the phone', async () => {
    mockGet.mockResolvedValue(dashboard());
    await show();
    await screen.findByText('₹12.35 L');
    expect(screen.getByText('—')).toBeTruthy();
    expect(screen.getByText('Not enough data')).toBeTruthy();
    expect(screen.queryByText('gross_margin')).toBeNull();
    expect(screen.queryByText('₹999')).toBeNull();
  });

  it('shows the 14 day trend', async () => {
    mockGet.mockResolvedValue(dashboard());
    await show();
    await screen.findByText('Sales, last 14 days');
    expect(screen.getByLabelText('2026-11-11: ₹2,000')).toBeTruthy();
  });

  it('shows a loading state first', async () => {
    mockGet.mockReturnValue(new Promise(() => {}));
    await show();
    expect(await screen.findAllByText('Loading...')).not.toHaveLength(0);
  });

  it('shows an empty message when the server sends no tiles', async () => {
    mockGet.mockResolvedValue(dashboard({ tiles: [], trend: [] }));
    await show();
    expect(await screen.findByText('Nothing to show yet. Numbers appear after your first bill.')).toBeTruthy();
  });

  it('shows a translated error with the correlation id and retries on tap', async () => {
    mockGet.mockRejectedValueOnce(new ApiError(500, { title: 'INTERNAL', correlationId: 'corr-9' }));
    await show();
    expect(await screen.findByText('Something went wrong. Code INTERNAL, reference corr-9.')).toBeTruthy();
    mockGet.mockResolvedValueOnce(dashboard());
    await fireEvent.press(screen.getByLabelText('Try again'));
    expect(await screen.findByText('₹12.35 L')).toBeTruthy();
    expect(mockGet).toHaveBeenCalledTimes(2);
  });

  it('shows the cached numbers with an "as of" time when a refresh fails for lack of network', async () => {
    mockGet.mockResolvedValueOnce(dashboard());
    await show();
    await screen.findByText('₹12.35 L');
    mockGet.mockRejectedValue(new ApiError(0, null));
    await act(async () => {
      const list = screen.getByTestId('home-list');
      await list.props.refreshControl.props.onRefresh();
    });
    await waitFor(() => expect(screen.getByText(/You are offline\. Showing data as of/)).toBeTruthy());
    expect(screen.getByText('₹12.35 L')).toBeTruthy(); // the old numbers stay on screen
  });

  it('hides the dashboard and does not call the server when the user lacks reports.sales', async () => {
    mockMe = { userId: 'u-2', roles: ['CASHIER'], permissions: ['sales.view'] };
    await show();
    expect(await screen.findByText('You do not have permission to see the dashboard.')).toBeTruthy();
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('shows permission denied when the server answers 403 even though the menu allowed it', async () => {
    mockGet.mockRejectedValue(new ApiError(403, { title: 'FORBIDDEN' }));
    await show();
    expect(await screen.findByText('You do not have permission to see the dashboard.')).toBeTruthy();
  });

  it('keeps a cached dashboard per user', async () => {
    mockGet.mockResolvedValue(dashboard());
    await show();
    await screen.findByText('₹12.35 L');
    expect(client.getQueryData(['home', 'owner', 'u-1', 'today'])).toBeTruthy();
    expect(client.getQueryData(['home', 'owner', 'u-2', 'today'])).toBeUndefined();
  });

  it('shows the profile, language picker and signs out, clearing the cache', async () => {
    mockGet.mockResolvedValue(dashboard());
    await show();
    await screen.findByText('₹12.35 L');
    expect(screen.getByText('Hello, u-1')).toBeTruthy();
    expect(screen.getByText('Roles: OWNER')).toBeTruthy();
    expect(screen.getByText('Your permissions: 2')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Show permissions'));
    expect(screen.getByText(/reports\.sales/)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Sign out'));
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(client.getQueryData(['home', 'owner', 'u-1', 'today'])).toBeUndefined();
  });

  it('shows the screen in Hindi and Marathi', async () => {
    mockGet.mockResolvedValue(dashboard());
    await show();
    await screen.findByText('₹12.35 L');
    await act(async () => {
      await setLanguage('hi');
    });
    expect(screen.getByText('आज की बिक्री')).toBeTruthy();
    await act(async () => {
      await setLanguage('mr');
    });
    expect(screen.getByText('आजची विक्री')).toBeTruthy();
    expect(i18n.language).toBe('mr');
  });
});

describe('home helpers', () => {
  it('formats rupees in lakh and crore without floats', () => {
    expect(formatINRShort('999.40')).toBe('₹999');
    expect(formatINRShort('123456')).toBe('₹1.23 L');
    expect(formatINRShort('12345678')).toBe('₹1.23 Cr');
    expect(formatINRShort('-250000')).toBe('-₹2.50 L');
    expect(formatINRShort('9999999.99')).toBe('₹100.00 L');
  });

  it('picks only the phone tiles, in order', () => {
    expect(pickHomeTiles(dashboard()).map((t) => t.id)).toEqual(['net_sales', 'bills', 'receivables_outstanding', 'low_stock_count', 'stock_value']);
  });
});

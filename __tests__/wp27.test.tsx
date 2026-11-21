import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setLanguage } from '../src/i18n';
import { todayIST } from '../src/features/collections/receipt';
import {
  ObservabilityScreen,
  PlatformObservabilityScreen,
} from '../src/features/platform/ObservabilityScreens';
import {
  addDays,
  defaultPeriod,
  earliestDay,
  isCustom,
  periodKey,
  periodQuery,
  rangeError,
} from '../src/features/platform/obs-period';

const mockGet = jest.fn();
let mockMe: { userId: string; roles: string[]; permissions?: string[] };
jest.mock('../src/auth/AuthProvider', () => ({
  useAuth: () => ({ status: 'signedIn', me: mockMe, client: { get: (...a: unknown[]) => mockGet(...a) } }),
}));
jest.mock('../src/device', () => ({ newId: () => 'key-1' }));

let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);
beforeEach(async () => {
  mockGet.mockReset();
  mockMe = { userId: 'op-1', roles: ['platform_admin'] };
  client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retryDelay: 0 } } });
  await setLanguage('en');
});

const today = todayIST();
const totals = {
  events: 5,
  errors: 0,
  slow: 0,
  p95Ms: 100,
  activeUsers: 2,
  franchises: 1,
  quietFranchises: 0,
};
const base = { days: 30, retentionDays: 90, totals, daily: [], surfaces: [], pages: [], issues: [] };

describe('the period like the web', () => {
  test('the last N days by default; a chosen range sends from and to instead of days', () => {
    const p = defaultPeriod();
    expect(isCustom(p)).toBe(false);
    expect(periodQuery(p)).toEqual({ days: '30' });
    const r = { days: '30', from: '2026-11-01', to: '2026-11-10' };
    expect(isCustom(r)).toBe(true);
    expect(periodQuery(r)).toEqual({ from: '2026-11-01', to: '2026-11-10' });
    expect(periodKey(r)).toBe('2026-11-01..2026-11-10');
    expect(periodKey(p)).toBe('30');
  });
  test('a range: both dates, From not after To, not in the future, inside the 90 days kept', () => {
    const t = '2026-11-21';
    expect(earliestDay(t)).toBe('2026-08-24');
    expect(addDays(t, -1)).toBe('2026-11-20');
    expect(rangeError('', '2026-11-20', t)).toBe('both');
    expect(rangeError('21-11-2026', '2026-11-20', t)).toBe('format');
    expect(rangeError('2026-02-30', '2026-11-20', t)).toBe('format');
    expect(rangeError('2026-11-20', '2026-11-19', t)).toBe('order');
    expect(rangeError('2026-11-20', '2026-11-22', t)).toBe('future');
    expect(rangeError('2026-08-23', '2026-11-20', t)).toBe('old');
    expect(rangeError('2026-08-24', '2026-11-21', t)).toBeNull();
    expect(rangeError('2026-11-21', '2026-11-21', t)).toBeNull();
  });
});

describe('observability screens', () => {
  test('the franchise overview: choose dates, a wrong range blocks the button, a good one asks with from and to', async () => {
    mockMe = { userId: 'u-1', roles: ['owner'], permissions: ['identity.security.manage'] };
    mockGet.mockResolvedValue({ ...base, adoption: {}, users: [] });
    await render(<ObservabilityScreen />, { wrapper });
    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    expect(mockGet.mock.calls[0][1].query).toEqual({ days: '30' });
    await fireEvent.press(screen.getByText('Choose dates'));
    await fireEvent.changeText(screen.getByLabelText('To (YYYY-MM-DD)'), addDays(today, 1));
    expect(screen.getByText('A date in the future cannot be chosen.')).toBeTruthy();
    expect(screen.getByLabelText('Show this period').props.accessibilityState?.disabled).toBe(true);
    const from = addDays(today, -6);
    await fireEvent.changeText(screen.getByLabelText('From (YYYY-MM-DD)'), from);
    await fireEvent.changeText(screen.getByLabelText('To (YYYY-MM-DD)'), addDays(today, -2));
    await fireEvent.press(screen.getByLabelText('Show this period'));
    await waitFor(() =>
      expect(
        mockGet.mock.calls.some((c) => c[1].query.from === from && c[1].query.to === addDays(today, -2)),
      ).toBe(true),
    );
    const last = mockGet.mock.calls.at(-1)!;
    expect(last[0]).toBe('/observability/overview');
    expect(last[1].query).toEqual({ from, to: addDays(today, -2) });
  });

  test('choosing "Last 7 days" again goes back to days', async () => {
    mockMe = { userId: 'u-1', roles: ['owner'], permissions: ['identity.security.manage'] };
    mockGet.mockResolvedValue({ ...base, adoption: {}, users: [] });
    await render(<ObservabilityScreen />, { wrapper });
    await fireEvent.press(await screen.findByText('Choose dates'));
    await fireEvent.press(screen.getByLabelText('Show this period'));
    await fireEvent.press(screen.getByText('Last 7 days'));
    await waitFor(() => expect(mockGet.mock.calls.at(-1)![1].query).toEqual({ days: '7' }));
  });

  test('the platform overview and one franchise use the same period', async () => {
    const f = {
      tenantId: 't1',
      name: 'Kisan Agro',
      code: 'KISAN',
      status: 'ACTIVE',
      activeUsers: 3,
      events: 10,
      errors: 0,
      slow: 0,
      p95Ms: 300,
      lastSeen: null,
      surfaces: {},
    };
    const from = addDays(today, -10);
    const to = addDays(today, -3);
    mockGet.mockImplementation((p: string) =>
      Promise.resolve(
        p === '/platform/observability/overview'
          ? { ...base, franchises: [f] }
          : {
              ...base,
              from,
              to,
              franchise: { name: 'Kisan Agro', code: 'KISAN', status: 'ACTIVE' },
              users: [],
            },
      ),
    );
    await render(<PlatformObservabilityScreen />, { wrapper });
    await fireEvent.press(await screen.findByText('Choose dates'));
    await fireEvent.changeText(screen.getByLabelText('From (YYYY-MM-DD)'), from);
    await fireEvent.changeText(screen.getByLabelText('To (YYYY-MM-DD)'), to);
    await fireEvent.press(screen.getByLabelText('Show this period'));
    await waitFor(() =>
      expect(
        mockGet.mock.calls.some(
          (c) =>
            c[0] === '/platform/observability/overview' && c[1].query.from === from && c[1].query.to === to,
        ),
      ).toBe(true),
    );
    await fireEvent.press(await screen.findByText('Open Kisan Agro'));
    await waitFor(() =>
      expect(
        mockGet.mock.calls.some(
          (c) =>
            c[0] === '/platform/observability/franchises/t1' &&
            c[1].query.from === from &&
            c[1].query.to === to,
        ),
      ).toBe(true),
    );
    expect(await screen.findByText(new RegExp(`${from} to ${to}`))).toBeTruthy();
  });
});

import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as SecureStore from 'expo-secure-store';
import { setLanguage } from '../src/i18n';
import HomeScreen from '../src/features/home/HomeScreen';

const mockGet = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), canGoBack: () => true, replace: jest.fn() },
}));
jest.mock('../src/auth/AuthProvider', () => ({
  useAuth: () => ({
    status: 'signedIn',
    me: { userId: 'u1', roles: ['franchise_admin'], permissions: ['reports.sales'] },
    client: { get: mockGet },
    signOut: jest.fn(),
  }),
}));

const dash = {
  period: 'today',
  from: '2026-11-12',
  to: '2026-11-12',
  asOf: '2026-11-12T08:30:00.000Z',
  tiles: [
    {
      id: 'bills',
      label: 'bills',
      state: 'OK',
      value: '42',
      unit: 'count',
      previous: null,
      changePct: null,
      period: { from: '2026-11-12', to: '2026-11-12' },
      asOf: '2026-11-12T08:30:00.000Z',
      link: '/x',
      hint: null,
    },
  ],
  trend: [{ day: '2026-11-12', netSales: '2000.00' }],
};

function wrap() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <HomeScreen />
    </QueryClientProvider>,
  );
}

beforeEach(async () => {
  jest.clearAllMocks();
  mockGet.mockResolvedValue(dash);
  await SecureStore.deleteItemAsync('agro360.home.summary');
  await setLanguage('en');
});

describe('home summary switch', () => {
  it('is on by default: numbers and the module cards both show', async () => {
    await wrap();
    expect(await screen.findByText('Bills today')).toBeTruthy();
    expect(screen.getByTestId('summary-switch').props.value).toBe(true);
    expect(screen.getByTestId('module-ops')).toBeTruthy();
  });

  it('switching off hides the numbers, keeps the cards and remembers the choice', async () => {
    await wrap();
    await screen.findByText('Bills today');
    await fireEvent(screen.getByTestId('summary-switch'), 'valueChange', false);
    await waitFor(() => expect(screen.queryByText('Bills today')).toBeNull());
    expect(screen.getByTestId('module-ops')).toBeTruthy();
    expect(await SecureStore.getItemAsync('agro360.home.summary')).toBe('off');
  });

  it('a saved off choice starts hidden, and switching on shows the numbers again', async () => {
    await SecureStore.setItemAsync('agro360.home.summary', 'off');
    await wrap();
    await waitFor(() => expect(screen.getByTestId('summary-switch').props.value).toBe(false));
    expect(screen.queryByText('Bills today')).toBeNull();
    await fireEvent(screen.getByTestId('summary-switch'), 'valueChange', true);
    expect(await screen.findByText('Bills today')).toBeTruthy();
  });
});

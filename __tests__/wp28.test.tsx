import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { i18n, setLanguage } from '../src/i18n';
import AccountScreen from '../src/features/account/AccountScreen';
import SecurityScreen from '../src/features/adm/SecurityScreen';
import UserSecurityScreen from '../src/features/adm/UserSecurityScreen';
import UsersScreen from '../src/features/admin/UsersScreen';
import { eventUser, placeInline, placeLine, placeText } from '../src/features/account/place';

const mockGet = jest.fn();
let mockMe: { userId: string; roles: string[]; permissions?: string[] };
jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useRouter: () => ({ push: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'u-9', name: 'Asha' }),
}));
jest.mock('../src/auth/AuthProvider', () => ({
  useAuth: () => ({
    status: 'signedIn',
    me: mockMe,
    client: { get: (...a: unknown[]) => mockGet(...a), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
    signIn: jest.fn(),
    signOut: jest.fn(),
  }),
}));
jest.mock('../src/device', () => ({ newId: () => 'key-1' }));

let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);
beforeEach(async () => {
  mockGet.mockReset();
  mockMe = { userId: 'u-1', roles: [], permissions: undefined };
  client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retryDelay: 0 } } });
  await setLanguage('en');
});
const t = i18n.getFixedT('en');

describe('place like the web', () => {
  test('the place first; "Not available" with an address and no place; "-" with nothing', () => {
    expect(placeText(t, { ip: '49.36.*.*', location: 'Pune, Maharashtra, India' })).toBe(
      'Pune, Maharashtra, India',
    );
    expect(placeText(t, { ip: '49.36.*.*', location: null })).toBe('Not available');
    expect(placeText(t, { ip: null })).toBe('-');
    expect(placeLine(t, { ip: '49.36.*.*', location: 'Pune' })).toBe('Location: Pune · address 49.36.*.*');
    expect(placeLine(t, { ip: null })).toBe('Location: -');
    expect(placeInline(t, { ip: '10.1.*.*' })).toBe('Not available (10.1.*.*)');
  });
  test('a security event user id is the prefixed reference when the server sends one', () => {
    const short = (id: string) => id.slice(0, 8);
    expect(eventUser({ userRef: '001-0007', userId: '12345678-aaaa' }, short)).toBe('001-0007');
    expect(eventUser({ userId: '12345678-aaaa' }, short)).toBe('12345678');
    expect(eventUser({ userId: null }, short)).toBe('-');
  });
});

describe('screens', () => {
  test('my sessions show the place and keep the masked address', async () => {
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/me/preferences')
        return {
          displayName: 'Asha',
          language: 'en',
          dateFormat: 'DD/MM/YYYY',
          theme: 'light',
          printer: null,
          defaultBranchId: null,
        };
      if (path === '/auth/sessions')
        return {
          items: [
            {
              id: 's-1',
              ip: '49.36.*.*',
              location: 'Pune, Maharashtra, India',
              browser: 'AGRO app',
              startedAt: '2026-11-10T04:00:00Z',
              lastAccessAt: '2026-11-11T04:00:00Z',
            },
            {
              id: 's-2',
              ip: '10.1.*.*',
              location: null,
              browser: 'Chrome',
              startedAt: '2026-11-10T04:00:00Z',
              lastAccessAt: '2026-11-11T04:00:00Z',
            },
          ],
        };
      if (path === '/devices') return { items: [] };
      throw new Error(`unexpected ${path}`);
    });
    await render(<AccountScreen />, { wrapper });
    expect(await screen.findByText('Location: Pune, Maharashtra, India · address 49.36.*.*')).toBeTruthy();
    expect(screen.getByText('Location: Not available · address 10.1.*.*')).toBeTruthy();
  });

  test("one user's sessions show the place", async () => {
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/users')
        return {
          items: [{ id: 'u-2', username: 'ramesh', fullName: 'Ramesh Patil', status: 'ACTIVE' }],
          next_cursor: null,
        };
      if (path === '/users/u-2/sessions')
        return {
          items: [
            {
              id: 's-1',
              ip: '49.36.*.*',
              location: 'Nashik, Maharashtra, India',
              browser: 'Chrome',
              startedAt: '2026-11-10T04:00:00Z',
              lastAccessAt: '2026-11-11T04:00:00Z',
            },
          ],
        };
      throw new Error('unexpected ' + path);
    });
    await render(<UserSecurityScreen />, { wrapper });
    await screen.findByText('Ramesh Patil');
    await fireEvent.press(screen.getByLabelText('Choose'));
    expect(await screen.findByText('Location: Nashik, Maharashtra, India · address 49.36.*.*')).toBeTruthy();
  });

  test('security events show the prefixed user id and the place', async () => {
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/settings/security')
        return {
          minLength: 8,
          requireLettersNumbers: true,
          historyCount: 3,
          mfaRequiredRoles: [],
          version: 1,
        };
      if (path === '/security/incidents') return { items: [] };
      if (path === '/security/events')
        return {
          items: [
            {
              id: 'e-1',
              type: 'LOGIN_OK',
              userId: '12345678-aaaa',
              userRef: '001-0007',
              ip: '49.36.*.*',
              location: 'Pune, Maharashtra, India',
              at: '2026-11-10T08:00:00Z',
            },
          ],
        };
      throw new Error(`unexpected ${path}`);
    });
    await render(<SecurityScreen />, { wrapper });
    expect(
      await screen.findByText(/LOGIN_OK · 001-0007 · Pune, Maharashtra, India \(49.36.\*.\*\)/),
    ).toBeTruthy();
  });

  test('the users list asks for the newest first', async () => {
    mockGet.mockImplementation(async (path: string) =>
      path === '/roles' ? { items: [] } : { items: [], nextCursor: null },
    );
    await render(<UsersScreen />, { wrapper });
    await screen.findByTestId('state-empty').catch(() => undefined);
    const call = mockGet.mock.calls.find((c) => c[0] === '/users');
    expect(call?.[1].query).toMatchObject({ order: 'newest', limit: 50 });
  });
});

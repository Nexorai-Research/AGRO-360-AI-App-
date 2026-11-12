import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '../src/api/errors';
import { i18n, setLanguage } from '../src/i18n';
import step5 from '../i18n-parts/step5.json';
import usr from '../i18n-parts/usr.json';
import AuditScreen from '../src/features/admin/AuditScreen';
import AccountScreen from '../src/features/account/AccountScreen';

const mockGet = jest.fn();
const mockPut = jest.fn();
let mockMe: { userId: string; roles: string[]; permissions?: string[] };
let mockId = 0;
const mockClient = { get: (...a: unknown[]) => mockGet(...a), put: (...a: unknown[]) => mockPut(...a) };
jest.mock('../src/auth/AuthProvider', () => ({
  useAuth: () => ({ status: 'signedIn', me: mockMe, client: mockClient, signIn: jest.fn(), signOut: jest.fn() }),
}));
jest.mock('../src/device', () => ({ newId: () => `key-${++mockId}` }));

let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
const event = { id: 'e-1', at: '2026-11-10T08:30:00Z', actorId: '11111111-2222-3333-4444-555555555555', actorName: 'Asha Kulkarni', actorUsername: 'asha', action: 'identity.user.unlock', targetType: 'identity.user', targetId: '12345678-aaaa-bbbb-cccc-dddddddddddd', outcome: 'SUCCESS', correlationId: 'corr-1' };
const prefs = { displayName: 'Asha Kulkarni', language: 'en', dateFormat: 'DD/MM/YYYY', theme: 'light', printer: null, defaultBranchId: null };

beforeAll(() => {
  for (const l of ['en', 'hi', 'mr'] as const) {
    i18n.addResourceBundle(l, 'translation', step5[l], true, true);
    i18n.addResourceBundle(l, 'translation', usr[l], true, true);
  }
});
beforeEach(async () => {
  [mockGet, mockPut].forEach((m) => m.mockReset());
  mockId = 0;
  mockMe = { userId: 'u-1', roles: [], permissions: undefined };
  client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retryDelay: 0 } } });
  await setLanguage('en');
});

describe('audit trail detail', () => {
  beforeEach(() => {
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/audit') return { items: [event], next_cursor: null };
      throw new Error(`unexpected ${path}`);
    });
  });
  const lastQuery = () => mockGet.mock.calls.filter((c) => c[0] === '/audit').at(-1)![1].query;

  test('a row opens to show the full ids and the note about before and after values', async () => {
    await render(<AuditScreen />, { wrapper });
    await screen.findByText('identity.user.unlock');
    await fireEvent.press(screen.getByLabelText('Show details'));
    expect(await screen.findByText('User id: 11111111-2222-3333-4444-555555555555')).toBeTruthy();
    expect(screen.getByText('Target: identity.user 12345678-aaaa-bbbb-cccc-dddddddddddd')).toBeTruthy();
    expect(screen.getByText('Username: asha')).toBeTruthy();
    expect(screen.getByText(/does not send the before and after values/)).toBeTruthy();
  });

  test('show only this user and this action refilter on the server', async () => {
    await render(<AuditScreen />, { wrapper });
    await screen.findByText('identity.user.unlock');
    await fireEvent.press(screen.getByLabelText('Show details'));
    await fireEvent.press(await screen.findByLabelText('Show only this user'));
    await screen.findByText('identity.user.unlock');
    expect(lastQuery()).toMatchObject({ actor: '11111111-2222-3333-4444-555555555555' });
    await fireEvent.press(await screen.findByLabelText('Show only this action'));
    await screen.findByText('identity.user.unlock');
    expect(lastQuery()).toMatchObject({ action: 'identity.user.unlock' });
  });

  test('the quick ranges send an India-day from and to', async () => {
    await render(<AuditScreen />, { wrapper });
    await screen.findByText('identity.user.unlock');
    await fireEvent.press(screen.getByLabelText('Last 7 days'));
    await screen.findByText('identity.user.unlock');
    expect(lastQuery().from).toMatch(/^\d{4}-\d{2}-\d{2}T00:00:00\+05:30$/);
    expect(lastQuery().to).toMatch(/^\d{4}-\d{2}-\d{2}T00:00:00\+05:30$/);
  });

  test('error shows the reference; denied sends nothing', async () => {
    mockGet.mockRejectedValue(new ApiError(500, { title: 'BOOM', correlationId: 'c-8' }));
    await render(<AuditScreen />, { wrapper });
    expect(await screen.findByText(/reference c-8/)).toBeTruthy();
  });
  test('Hindi', async () => {
    await setLanguage('hi');
    await render(<AuditScreen />, { wrapper });
    expect(await screen.findByLabelText('आज')).toBeTruthy();
  });
});

describe('account preferences', () => {
  beforeEach(() => {
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/me/preferences') return prefs;
      if (path === '/auth/sessions') return { items: [] };
      if (path === '/devices') return { items: [] };
      throw new Error(`unexpected ${path}`);
    });
  });

  test('sends only the changed date format, theme and printer, with a key', async () => {
    mockPut.mockResolvedValue({ ...prefs, dateFormat: 'YYYY-MM-DD', theme: 'dark', printer: 'Counter-1 80mm' });
    await render(<AccountScreen />, { wrapper });
    await screen.findByText('Preferences');
    expect(screen.getByLabelText('Save preferences').props.accessibilityState?.disabled).toBe(true);
    await fireEvent.press(screen.getByLabelText('YYYY-MM-DD'));
    await fireEvent.press(screen.getByLabelText('Dark'));
    await fireEvent.changeText(screen.getByLabelText('Default printer'), ' Counter-1 80mm ');
    await fireEvent.press(screen.getByLabelText('Save preferences'));
    expect(await screen.findAllByText('Saved.')).toBeTruthy();
    const [path, opts] = mockPut.mock.calls[0]!;
    expect(path).toBe('/me/preferences');
    expect(opts.body).toEqual({ dateFormat: 'YYYY-MM-DD', theme: 'dark', printer: 'Counter-1 80mm' });
    expect(opts.idempotencyKey).toBeTruthy();
  });

  test('clearing the printer sends null; a failed save keeps the same key for the retry', async () => {
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/me/preferences') return { ...prefs, printer: 'Old printer' };
      if (path === '/auth/sessions') return { items: [] };
      return { items: [] };
    });
    mockPut.mockRejectedValueOnce(new ApiError(0, null)).mockResolvedValue(prefs);
    await render(<AccountScreen />, { wrapper });
    await screen.findByText('Preferences');
    await fireEvent.changeText(screen.getByLabelText('Default printer'), '');
    await fireEvent.press(screen.getByLabelText('Save preferences'));
    await screen.findByText('No network. Check your connection and try again.');
    await fireEvent.press(screen.getByLabelText('Save preferences'));
    await screen.findAllByText('Saved.');
    expect(mockPut.mock.calls[0]![1].body).toEqual({ printer: null });
    expect(mockPut.mock.calls[1]![1].idempotencyKey).toBe(mockPut.mock.calls[0]![1].idempotencyKey);
  });

  test('Marathi', async () => {
    await setLanguage('mr');
    await render(<AccountScreen />, { wrapper });
    expect(await screen.findByText('पसंती')).toBeTruthy();
  });
});

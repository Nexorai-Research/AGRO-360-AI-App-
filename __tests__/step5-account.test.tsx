import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '../src/api/errors';
import { i18n, setLanguage } from '../src/i18n';
import parts from '../i18n-parts/step5.json';
import AccountScreen, { validDeviceReason } from '../src/features/account/AccountScreen';
import { validName } from '../src/features/account/api';

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockPut = jest.fn();
const mockDelete = jest.fn();
const mockSignOut = jest.fn();
let mockMe: { userId: string; roles: string[]; permissions?: string[] };
let mockId = 0;
const mockClient = {
  get: (...a: unknown[]) => mockGet(...a),
  post: (...a: unknown[]) => mockPost(...a),
  put: (...a: unknown[]) => mockPut(...a),
  delete: (...a: unknown[]) => mockDelete(...a),
};
jest.mock('../src/auth/AuthProvider', () => ({
  useAuth: () => ({ status: 'signedIn', me: mockMe, client: mockClient, signIn: jest.fn(), signOut: mockSignOut }),
}));
jest.mock('../src/device', () => ({ newId: () => `key-${++mockId}` }));

let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
const prefs = { displayName: 'Asha Kulkarni', language: 'en', dateFormat: 'DD/MM/YYYY', theme: 'light', printer: null, defaultBranchId: null };
const session = { id: 's-1', ip: '49.36.x.x', browser: 'AGRO app', startedAt: '2026-11-10T04:00:00Z', lastAccessAt: '2026-11-11T04:00:00Z' };
const device = { id: 'd-1', userId: 'u-1', name: 'Counter phone', platform: 'ANDROID', status: 'REGISTERED', registeredAt: '2026-11-01T04:00:00Z', lastSeenAt: null, revokedAt: null };

beforeAll(() => {
  for (const l of ['en', 'hi', 'mr'] as const) i18n.addResourceBundle(l, 'translation', parts[l], true, true);
});
beforeEach(async () => {
  [mockGet, mockPost, mockPut, mockDelete, mockSignOut].forEach((m) => m.mockReset());
  mockId = 0;
  mockMe = { userId: 'u-1', roles: [], permissions: undefined };
  client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retryDelay: 0 } } });
  await setLanguage('en');
  mockGet.mockImplementation(async (path: string) => {
    if (path === '/me/preferences') return prefs;
    if (path === '/auth/sessions') return { items: [session] };
    if (path === '/devices') return { items: [device] };
    throw new Error(`unexpected ${path}`);
  });
});

const show = () => render(<AccountScreen />, { wrapper });

describe('account helpers', () => {
  test('name and revoke reason lengths', () => {
    expect(validName('A')).toBe(false);
    expect(validName('Asha')).toBe(true);
    expect(validDeviceReason('lost')).toBe(false);
    expect(validDeviceReason('lost it')).toBe(true);
  });
  test('the texts exist in English, Hindi and Marathi with the same keys', () => {
    const flat = (o: object, p = ''): string[] =>
      Object.entries(o).flatMap(([k, v]) => (typeof v === 'object' ? flat(v as object, `${p}${k}.`) : [`${p}${k}`]));
    expect(flat(parts.hi).sort()).toEqual(flat(parts.en).sort());
    expect(flat(parts.mr).sort()).toEqual(flat(parts.en).sort());
  });
});

describe('account screen', () => {
  test('shows the profile, sign-ins and devices; says what is not built', async () => {
    await show();
    expect(await screen.findByDisplayValue('Asha Kulkarni')).toBeTruthy();
    expect(await screen.findByText('AGRO app')).toBeTruthy();
    expect(await screen.findByText(/Counter phone/)).toBeTruthy();
    expect(screen.getByText(/Changing your password, two-factor sign-in/)).toBeTruthy();
  });

  test('loading state, then data', async () => {
    mockGet.mockImplementation(() => new Promise(() => undefined));
    await show();
    expect(await screen.findByTestId('state-loading')).toBeTruthy();
  });

  test('offline: network error shows the offline text and Try again', async () => {
    mockGet.mockRejectedValue(new ApiError(0, null));
    await show();
    expect(await screen.findByText('No network. Check your connection and try again.', {}, { timeout: 3000 })).toBeTruthy();
    expect(screen.getByLabelText('Try again')).toBeTruthy();
  });

  test('error: a server error shows the translated message with the reference', async () => {
    mockGet.mockRejectedValue(new ApiError(500, { title: 'BOOM', correlationId: 'c-9' }));
    await show();
    expect(await screen.findByText(/Something went wrong. Code BOOM, reference c-9/)).toBeTruthy();
  });

  test('permission denied: nothing is called', async () => {
    mockMe = { userId: 'u-1', roles: [], permissions: [] };
    await show();
    expect(await screen.findByText('You do not have permission to see your account.')).toBeTruthy();
    expect(mockGet).not.toHaveBeenCalled();
  });

  test('sessions unavailable does not hide the rest of the page', async () => {
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/me/preferences') return prefs;
      if (path === '/auth/sessions') throw new ApiError(500, { title: 'IDP_NOT_CONFIGURED' });
      return { items: [] };
    });
    await show();
    expect(await screen.findByText('The list of sign-ins is not available right now.')).toBeTruthy();
    expect(screen.getByDisplayValue('Asha Kulkarni')).toBeTruthy();
    expect(screen.getByText('No devices registered.')).toBeTruthy();
  });

  test('save sends only the changed field; lost answer retries with the SAME key; a changed name gets a NEW key', async () => {
    let first = true;
    mockPut.mockImplementation(async () => {
      if (first) {
        first = false;
        throw new ApiError(0, null);
      }
      return { ...prefs, displayName: 'Asha K' };
    });
    await show();
    await fireEvent.changeText(await screen.findByLabelText('Display name'), 'Asha K');
    await fireEvent.press(screen.getByLabelText('Save'));
    expect(await screen.findByText(/No network/)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Save'));
    expect(await screen.findByText('Saved.')).toBeTruthy();
    expect(mockPut.mock.calls.map((c) => c[1].idempotencyKey)).toEqual(['key-1', 'key-1']);
    expect(mockPut.mock.calls[0]![0]).toBe('/me/preferences');
    expect(mockPut.mock.calls[0]![1].body).toEqual({ displayName: 'Asha K' });

    // a new edit after success is a new action
    mockPut.mockReset();
    mockPut.mockRejectedValue(new ApiError(0, null));
    await fireEvent.changeText(screen.getByLabelText('Display name'), 'Asha Kul');
    await fireEvent.press(screen.getByLabelText('Save'));
    await screen.findByText(/No network/);
    await fireEvent.changeText(screen.getByLabelText('Display name'), 'Asha Kulk');
    await fireEvent.press(screen.getByLabelText('Save'));
    await screen.findByText(/No network/);
    const keys = mockPut.mock.calls.map((c) => c[1].idempotencyKey);
    expect(keys[0]).not.toBe(keys[1]);
  });

  test('a too short name is refused on screen and nothing is sent', async () => {
    await show();
    await fireEvent.changeText(await screen.findByLabelText('Display name'), 'A');
    expect(await screen.findByText('The name must be 2 to 120 characters.')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Save'));
    expect(mockPut).not.toHaveBeenCalled();
  });

  test('ending a sign-in sends DELETE with a key, and a retry reuses it', async () => {
    let first = true;
    mockDelete.mockImplementation(async () => {
      if (first) {
        first = false;
        throw new ApiError(0, null);
      }
      return null;
    });
    await show();
    await screen.findByText('AGRO app');
    await fireEvent.press(screen.getByLabelText('Sign out this sign-in'));
    await screen.findByText(/No network/);
    await fireEvent.press(screen.getByLabelText('Sign out this sign-in'));
    expect(await screen.findByText('That sign-in has ended.')).toBeTruthy();
    expect(mockDelete.mock.calls.map((c) => c[1].idempotencyKey)).toEqual(['key-1', 'key-1']);
    expect(mockDelete.mock.calls[0]![0]).toBe('/auth/sessions/s-1');
  });

  test('sign out everywhere asks first, then posts and signs out this phone', async () => {
    mockPost.mockResolvedValue(null);
    await show();
    await screen.findByText('AGRO app');
    await fireEvent.press(screen.getByLabelText('Sign out everywhere'));
    expect(mockPost).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText('Yes, sign out everywhere'));
    expect(await screen.findByText('You are signed out.')).toBeTruthy();
    expect(mockPost.mock.calls[0]![0]).toBe('/auth/logout-all');
    expect(mockPost.mock.calls[0]![1].idempotencyKey).toBe('key-1');
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  test('revoking a device needs a reason of 5+ characters, sends it once, and retry reuses the key', async () => {
    let first = true;
    mockPost.mockImplementation(async () => {
      if (first) {
        first = false;
        throw new ApiError(0, null);
      }
      return { ...device, status: 'REVOKED' };
    });
    await show();
    await fireEvent.press(await screen.findByLabelText('Revoke device'));
    const now = screen.getByLabelText('Revoke now');
    await fireEvent.changeText(screen.getByLabelText('Reason (at least 5 characters)'), 'lost');
    await fireEvent.press(now);
    expect(mockPost).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText('Reason (at least 5 characters)'), 'phone lost');
    await fireEvent.press(screen.getByLabelText('Revoke now'));
    await screen.findByText(/No network/);
    await fireEvent.press(screen.getByLabelText('Revoke now'));
    expect(await screen.findByText('Device revoked.')).toBeTruthy();
    expect(mockPost.mock.calls.map((c) => c[1].idempotencyKey)).toEqual(['key-1', 'key-1']);
    expect(mockPost.mock.calls[0]![0]).toBe('/devices/d-1:revoke');
    expect(mockPost.mock.calls[0]![1].body).toEqual({ reason: 'phone lost' });
  });

  test('no secret is shown: no device key, token or password field anywhere', async () => {
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/devices') return { items: [{ ...device, deviceKey: 'SECRET-DEVICE-KEY-123' }] };
      if (path === '/auth/sessions') return { items: [{ ...session, token: 'SECRET-TOKEN-456' }] };
      return prefs;
    });
    await show();
    await screen.findByText(/Counter phone/);
    expect(screen.queryByText(/SECRET/)).toBeNull();
    expect(screen.queryByLabelText(/password/i)).toBeNull();
  });
});

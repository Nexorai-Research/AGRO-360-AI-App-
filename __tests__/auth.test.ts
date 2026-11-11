import * as SecureStore from 'expo-secure-store';

import * as auth from '../src/auth/auth';
import { loadTokens } from '../src/auth/storage';

const mockRefresh = jest.fn();
const mockExchange = jest.fn();
const mockPrompt = jest.fn();
const mockOpenAuth = jest.fn(async () => ({ type: 'dismiss' }));

jest.mock('expo-auth-session', () => ({
  makeRedirectUri: () => 'agro360://auth',
  ResponseType: { Code: 'code' },
  AuthRequest: jest.fn().mockImplementation(() => ({ promptAsync: mockPrompt, codeVerifier: 'verifier' })),
  exchangeCodeAsync: (...a: unknown[]) => mockExchange(...a),
  refreshAsync: (...a: unknown[]) => mockRefresh(...a),
}));
jest.mock('expo-web-browser', () => ({
  maybeCompleteAuthSession: jest.fn(),
  openAuthSessionAsync: (...a: unknown[]) => mockOpenAuth(...(a as [])),
}));
jest.mock('../src/config', () => ({
  config: { env: 'dev', apiBaseUrl: 'https://api.test/api/v1', oidcIssuer: 'https://kc.test/realms/agro360', oidcClientId: 'agro360-mobile', redirectScheme: 'agro360' },
}));

const resp = (access: string, refresh = 'r2', expiresIn = 300) => ({ accessToken: access, refreshToken: refresh, idToken: 'id1', expiresIn });

async function signedIn() {
  mockPrompt.mockResolvedValueOnce({ type: 'success', params: { code: 'abc' } });
  mockExchange.mockResolvedValueOnce(resp('a1', 'r1', 1)); // nearly expired, so the next accessToken() must refresh
  expect(await auth.signIn('ravi@FR001')).toBe(true);
}

beforeEach(async () => {
  jest.clearAllMocks();
  await auth.signOut();
});

describe('auth', () => {
  it('signs in with PKCE, passes the code verifier and keeps tokens only in secure storage', async () => {
    await signedIn();
    const call = mockExchange.mock.calls[0] as [{ code: string; extraParams: Record<string, string>; clientId: string }];
    expect(call[0].code).toBe('abc');
    expect(call[0].extraParams.code_verifier).toBe('verifier');
    expect(call[0].clientId).toBe('agro360-mobile');
    expect((await loadTokens())?.accessToken).toBe('a1');
  });

  it('returns false and stores nothing when the user cancels', async () => {
    mockPrompt.mockResolvedValueOnce({ type: 'cancel' });
    expect(await auth.signIn()).toBe(false);
    expect(await loadTokens()).toBeNull();
  });

  it('refreshes once for many concurrent callers (refresh tokens are single use)', async () => {
    await signedIn();
    mockRefresh.mockImplementation(() => new Promise((r) => setTimeout(() => r(resp('a2', 'r2')), 10)));
    const tokens = await Promise.all([auth.accessToken(), auth.accessToken(), auth.refresh()]);
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(tokens).toEqual(['a2', 'a2', 'a2']);
    expect((await loadTokens())?.refreshToken).toBe('r2');
  });

  it('clears tokens when the server refuses the refresh token', async () => {
    await signedIn();
    mockRefresh.mockRejectedValueOnce(Object.assign(new Error('invalid_grant'), { code: 'invalid_grant' }));
    expect(await auth.refresh()).toBeNull();
    expect(await loadTokens()).toBeNull();
    expect(auth.isSignedIn()).toBe(false);
  });

  it('keeps the session when the refresh fails only because of the network', async () => {
    await signedIn();
    mockRefresh.mockRejectedValueOnce(new Error('Network request failed'));
    expect(await auth.refresh()).toBeNull();
    expect(await loadTokens()).not.toBeNull();
  });

  it('signOut clears storage and ends the Keycloak session with the id token hint', async () => {
    await signedIn();
    await auth.signOut();
    expect(await loadTokens()).toBeNull();
    expect(auth.isSignedIn()).toBe(false);
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('agro360.tokens');
    const url = String((mockOpenAuth.mock.calls[0] as unknown[])[0]);
    expect(url).toContain('/protocol/openid-connect/logout');
    expect(url).toContain('id_token_hint=id1');
  });

  it('restore loads a saved session', async () => {
    await signedIn();
    expect(await auth.restore()).toBe(true);
  });
});

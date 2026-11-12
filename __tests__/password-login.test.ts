import * as auth from '../src/auth/auth';
import { loadTokens } from '../src/auth/storage';

jest.mock('expo-auth-session', () => ({
  makeRedirectUri: () => 'agro360://auth',
  ResponseType: { Code: 'code' },
}));
jest.mock('expo-web-browser', () => ({
  maybeCompleteAuthSession: jest.fn(),
  openAuthSessionAsync: jest.fn(),
}));
jest.mock('../src/config', () => ({
  config: {
    env: 'staging',
    apiBaseUrl: 'https://api.test/api/v1',
    oidcIssuer: 'https://kc.test/realms/agro360',
    oidcClientId: 'agro360-web',
    redirectScheme: 'agro360',
    passwordLogin: true,
  },
}));

const fetchMock = jest.fn();
beforeEach(async () => {
  jest.clearAllMocks();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
  await auth.signOut();
  fetchMock.mockReset();
});

describe('password sign in (test servers only)', () => {
  it('posts the password grant, keeps tokens in secure storage and returns ok', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'a1', refresh_token: 'r1', id_token: 'i1', expires_in: 900 }),
    });
    expect(await auth.signInWithPassword('a.owner', 'secret')).toBe('ok');
    const [url, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(url).toBe('https://kc.test/realms/agro360/protocol/openid-connect/token');
    const body = new URLSearchParams(init.body);
    expect(body.get('grant_type')).toBe('password');
    expect(body.get('client_id')).toBe('agro360-web');
    expect(body.get('username')).toBe('a.owner');
    expect((await loadTokens())?.accessToken).toBe('a1');
    expect(await auth.accessToken()).toBe('a1');
  });

  it('a refused login returns invalid and stores nothing', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: 'invalid_grant' }),
    });
    expect(await auth.signInWithPassword('a.owner', 'wrong')).toBe('invalid');
    expect(await loadTokens()).toBeNull();
  });

  it('no network returns network and stores nothing', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    expect(await auth.signInWithPassword('a.owner', 'x')).toBe('network');
    expect(await loadTokens()).toBeNull();
  });

  it('sign out clears tokens and ends the server session with the refresh token', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'a1', refresh_token: 'r1', expires_in: 900 }),
    });
    await auth.signInWithPassword('a.owner', 'secret');
    fetchMock.mockResolvedValueOnce({ ok: true });
    await auth.signOut();
    expect(await loadTokens()).toBeNull();
    const [url, init] = fetchMock.mock.calls[1] as [string, { body: string }];
    expect(url).toContain('/protocol/openid-connect/logout');
    expect(new URLSearchParams(init.body).get('refresh_token')).toBe('r1');
  });

  it('retries once without a stray space the keyboard added after the password', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ access_token: 'a1', expires_in: 900 }),
    });
    expect(await auth.signInWithPassword(' a.owner ', 'secret ')).toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const second = new URLSearchParams((fetchMock.mock.calls[1] as [string, { body: string }])[1].body);
    expect(second.get('password')).toBe('secret');
    expect(second.get('username')).toBe('a.owner');
  });

  it('a wrong password with no stray space is tried once only', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) });
    expect(await auth.signInWithPassword('a.owner', 'secret')).toBe('invalid');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('a server error is not called a wrong password', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });
    expect(await auth.signInWithPassword('a.owner', 'secret')).toBe('server');
  });
});

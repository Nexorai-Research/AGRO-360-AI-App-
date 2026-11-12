import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createClient, type ApiClient } from '../api/client';
import { config } from '../config';
import { getAppVersion, newId } from '../device';
import * as auth from './auth';

export interface Me {
  userId: string;
  tenantId?: string;
  roles: string[];
  branchScope?: unknown;
  permissions?: string[];
}

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn';

export interface AuthState {
  status: AuthStatus;
  me: Me | null;
  signIn: (loginHint?: string) => Promise<void>;
  signInWithPassword: (username: string, password: string) => Promise<auth.PasswordResult | 'denied'>;
  signOut: () => Promise<void>;
  client: ApiClient | null;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [me, setMe] = useState<Me | null>(null);

  const client = useMemo(
    () =>
      createClient({
        baseUrl: config.apiBaseUrl,
        appVersion: getAppVersion(),
        getToken: auth.accessToken,
        refreshToken: auth.refresh,
        onSignedOut: () => {
          setMe(null);
          setStatus('signedOut');
        },
        uuid: newId,
      }),
    [],
  );

  const loadMe = useCallback(async (c: ApiClient) => {
    try {
      setMe(await c.get<Me>('/me'));
      setStatus('signedIn');
      return true;
    } catch {
      await auth.signOut();
      setMe(null);
      setStatus('signedOut');
      return false;
    }
  }, []);

  useEffect(() => {
    if (!client) return;
    void auth.restore().then((has) => {
      if (has) void loadMe(client);
      else setStatus('signedOut');
    });
  }, [client, loadMe]);

  const value = useMemo<AuthState>(
    () => ({
      status,
      me,
      client,
      signIn: async (hint) => {
        if (client && (await auth.signIn(hint))) await loadMe(client);
      },
      signInWithPassword: async (u, p) => {
        const r = await auth.signInWithPassword(u, p);
        if (r !== 'ok' || !client) return r;
        // signed in at Keycloak but the API refused this user: say so instead of silently returning to the login page
        return (await loadMe(client)) ? 'ok' : 'denied';
      },
      signOut: async () => {
        await auth.signOut();
        setMe(null);
        setStatus('signedOut');
      },
    }),
    [status, me, client, loadMe],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside AuthProvider');
  return v;
}

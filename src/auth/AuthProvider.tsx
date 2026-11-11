import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createClient, type ApiClient } from '../api/client';
import { config } from '../config';
import { getAppVersion, getDeviceId, newId } from '../device';
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
  signOut: () => Promise<void>;
  client: ApiClient | null;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [me, setMe] = useState<Me | null>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);

  const client = useMemo(
    () =>
      deviceId === null
        ? null
        : createClient({
            baseUrl: config.apiBaseUrl,
            deviceId,
            appVersion: getAppVersion(),
            getToken: auth.accessToken,
            refreshToken: auth.refresh,
            onSignedOut: () => {
              setMe(null);
              setStatus('signedOut');
            },
            uuid: newId,
          }),
    [deviceId],
  );

  const loadMe = useCallback(async (c: ApiClient) => {
    try {
      setMe(await c.get<Me>('/me'));
      setStatus('signedIn');
    } catch {
      await auth.signOut();
      setMe(null);
      setStatus('signedOut');
    }
  }, []);

  useEffect(() => {
    void getDeviceId().then(setDeviceId);
  }, []);

  useEffect(() => {
    if (!client) return;
    void auth.restore().then((has) => (has ? loadMe(client) : setStatus('signedOut')));
  }, [client, loadMe]);

  const value = useMemo<AuthState>(
    () => ({
      status,
      me,
      client,
      signIn: async (hint) => {
        if (client && (await auth.signIn(hint))) await loadMe(client);
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

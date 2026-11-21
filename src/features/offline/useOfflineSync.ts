import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthProvider';
import { syncNow } from './offline';

export const SYNC_EVERY_MS = 30_000;
export const offlineKey = (userId: string) => ['offline', userId] as const;

/** While a user is signed in, bills waiting in the journal are sent every 30 seconds (with backoff) and when the app comes back. */
export function useOfflineSync() {
  const { status, me, client } = useAuth();
  const qc = useQueryClient();
  const userId = me?.userId ?? '';
  useEffect(() => {
    if (status !== 'signedIn' || !client || !userId) return;
    const tick = () =>
      void syncNow(client, userId)
        .then((out) => {
          if (out) void qc.invalidateQueries({ queryKey: offlineKey(userId) });
        })
        .catch(() => undefined); // an app that is too old is shown on the offline bills screen, not here
    tick();
    const timer = setInterval(tick, SYNC_EVERY_MS);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') tick();
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [status, client, userId, qc]);
}

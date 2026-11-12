import { useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { ApiError, errorMessage } from '@/api/errors';
import { colors } from '@/ui/theme';
import { useActionKey } from '@/ui/kit';

import { StateView } from '../stock/StateView';

export { Card, Chips, Field, Notice, kit, useActionKey } from '@/ui/kit';

/**
 * Runs one write at a time. On success the key is dropped (the next action is a new one) and the message shown; on a failure
 * (including a lost answer) the key stays, so pressing the button again retries the SAME action with the SAME key.
 */
export function useAction(keys: ReturnType<typeof useActionKey>) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const failText = useFailureText();
  async function run(fn: () => Promise<unknown>, done: string, after?: () => void) {
    if (busy) return;
    setBusy(true);
    setFailure(null);
    setMsg(null);
    try {
      await fn();
      keys.reset();
      setMsg(done);
      after?.();
    } catch (e) {
      setFailure(failText(e));
    } finally {
      setBusy(false);
    }
  }
  const clear = () => {
    setMsg(null);
    setFailure(null);
  };
  return { busy, msg, failure, run, clear };
}

export const isNetwork = (e: unknown) => e instanceof ApiError && e.code === 'NETWORK';

/** The app only hides screens; the server decides. Permissions not loaded yet: show the screen and let the server answer. */
export function useCan() {
  const { me } = useAuth();
  return (p: string) => me?.permissions === undefined || me.permissions.includes(p);
}

/** The translated text of any failure, with a reference code. */
export function useFailureText() {
  const { t } = useTranslation();
  return (e: unknown) => {
    const m = errorMessage(e);
    return t(m.key, { ...m.params, correlationId: m.params.correlationId ?? '-' });
  };
}

interface QueryLike {
  isPending: boolean;
  fetchStatus: string;
  error: unknown;
  refetch: () => unknown;
}

/** Loading, denied, offline and error states for a screen built on one query. Renders the children when there is data. */
export function Gate({
  query,
  denied,
  deniedText,
  offlineText,
  children,
}: {
  query: QueryLike;
  denied: boolean;
  deniedText: string;
  offlineText: string;
  children: ReactNode;
}) {
  const fail = useFailureText();
  if (denied) return <StateView state="denied" message={deniedText} />;
  if (query.isPending && query.fetchStatus !== 'idle') return <StateView state="loading" />;
  if (query.error) {
    const offline = isNetwork(query.error);
    const forbidden = query.error instanceof ApiError && query.error.status === 403;
    return (
      <StateView
        state={offline ? 'offline' : forbidden ? 'denied' : 'error'}
        message={offline ? offlineText : forbidden ? deniedText : fail(query.error)}
        onRetry={() => void query.refetch()}
      />
    );
  }
  return <>{children}</>;
}

/** One horizontal bar made of Views, 0..100 percent. No chart library. */
export function Bar({ pct, label }: { pct: number; label?: string }) {
  const w = Math.max(0, Math.min(100, Number.isFinite(pct) ? pct : 0));
  return (
    <View accessibilityLabel={label} style={bar.track}>
      <View style={[bar.fill, { width: `${w}%` }]} />
    </View>
  );
}

/** A label on the left and a value on the right. */
export function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={bar.row}>
      <Text style={[bar.l, strong && bar.strong]}>{label}</Text>
      <Text style={[bar.v, strong && bar.strong]}>{value}</Text>
    </View>
  );
}

const bar = StyleSheet.create({
  track: { height: 8, borderRadius: 4, backgroundColor: colors.line, overflow: 'hidden' },
  fill: { height: 8, backgroundColor: colors.brand },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  l: { flex: 1, fontSize: 14, color: colors.muted },
  v: { fontSize: 14, color: colors.ink, textAlign: 'right' },
  strong: { fontWeight: '700', color: colors.ink },
});

import type { ReactNode } from 'react';
import type { TFunction } from 'i18next';
import { StyleSheet } from 'react-native';
import { useAuth } from '@/auth/AuthProvider';
import { ApiError, errorMessage, type ErrorMessage } from '@/api/errors';
import { Chips as KitChips, useActionKey } from '@/ui/kit';
import { colors, radius } from '@/ui/theme';
import { StateView } from '../stock/StateView';

export const isNetwork = (e: unknown) => e instanceof ApiError && e.code === 'NETWORK';

/** What the signed-in person may do. The server still checks every call; this only hides screens and buttons. */
export function useAccess() {
  const { me, client } = useAuth();
  const can = (p: string) => me?.permissions === undefined || me.permissions.includes(p);
  return { me, client, can, userId: me?.userId ?? '' };
}

/**
 * One Idempotency-Key per user action. The same key comes back while the action (its fingerprint) stays the same, so a retry after a
 * lost answer is the same action for the server. A changed body gets a new key. Call clear() after the server confirmed.
 */
export function useIdemKey() {
  const a = useActionKey();
  return { keyFor: a.keyFor, clear: a.reset };
}

type TFn = TFunction;
export const failText = (t: TFn, e: ErrorMessage) =>
  t(e.key, { ...e.params, correlationId: e.params.correlationId ?? '-' });

interface QueryLike {
  isPending: boolean;
  fetchStatus: string;
  error: unknown;
  refetch: () => unknown;
}

/** Returns the loading / offline / error view for a query, or null when there is data to draw. */
export function queryState(q: QueryLike, t: TFn, offlineText: string): ReactNode {
  if (q.isPending && q.fetchStatus !== 'idle') return <StateView state="loading" />;
  if (q.error) {
    const net = isNetwork(q.error);
    return (
      <StateView
        state={net ? 'offline' : 'error'}
        message={net ? offlineText : failText(t, errorMessage(q.error))}
        onRetry={() => void q.refetch()}
      />
    );
  }
  return null;
}

export { Card } from '@/ui/kit';

/** Same shared chips; this wrapper only takes [id, label] pairs. */
export function Chips<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <KitChips
      label={label}
      value={value}
      onChange={onChange}
      options={options.map(([id, l]) => ({ id, label: l }))}
    />
  );
}

export const k = StyleSheet.create({
  page: { padding: 16, gap: 10, backgroundColor: colors.bg },
  title: { fontSize: 22, fontWeight: '700', color: colors.ink },
  h2: { fontSize: 17, fontWeight: '700', color: colors.ink, marginTop: 6 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
    gap: 8,
  },
  name: { fontSize: 16, color: colors.ink, fontWeight: '600' },
  sub: { fontSize: 14, color: colors.muted },
  ok: { fontSize: 16, color: colors.ok, fontWeight: '600' },
  error: { fontSize: 15, color: colors.danger },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius,
    paddingHorizontal: 12,
    fontSize: 16,
    backgroundColor: '#fff',
    color: colors.ink,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: radius,
    borderWidth: 1,
    borderColor: colors.line,
    justifyContent: 'center',
    backgroundColor: colors.card,
  },
  chipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipTxt: { fontSize: 15, color: colors.ink },
  chipTxtOn: { color: colors.brandInk, fontWeight: '600' },
});

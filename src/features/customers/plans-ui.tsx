import { useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '@/ui/Button';
import { colors, radius } from '@/ui/theme';
import { useSal } from '../collections/sal-hook';
import { pkey } from './plans-api';
import { StateView, isDenied, isNetwork } from './ui';

/** A card that stays closed until opened; nothing is read from the server while it is closed. */
export function Collapse({ title, children }: { title: string; children: (open: boolean) => ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={s.card}>
      <Button kind="ghost" label={`${open ? '▾' : '▸'} ${title}`} onPress={() => setOpen((v) => !v)} />
      {open ? children(open) : null}
    </View>
  );
}

/** Loading, denied, offline and error states for one query inside a card. */
export function Body<T>({ q, children }: { q: UseQueryResult<T, unknown>; children: (d: T) => ReactNode }) {
  if (q.isPending && q.fetchStatus !== 'idle') return <StateView kind="loading" />;
  if (q.isError && isDenied(q.error)) return <StateView kind="denied" />;
  if (q.isError) return <StateView kind="error" error={q.error} onRetry={() => void q.refetch()} />;
  return q.data !== undefined ? <>{children(q.data)}</> : null;
}

export function usePanel<T>(
  open: boolean,
  name: string,
  customerId: string,
  load?: (c: NonNullable<ReturnType<typeof useSal>['client']>, signal: AbortSignal) => Promise<T>,
  allowed = true,
) {
  const sal = useSal();
  const q = useQuery({
    queryKey: pkey(sal.userId, name, customerId),
    enabled: open && sal.ready && allowed,
    retry: (n, e) => isNetwork(e) && n < 1,
    queryFn: ({ signal }) => (load ? load(sal.client!, signal) : Promise.resolve(null as T)),
  });
  return { sal, q };
}

export const s = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 10,
    gap: 8,
  },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  item: { gap: 2, paddingVertical: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  name: { fontSize: 15, fontWeight: '600', color: colors.ink },
  sub: { fontSize: 13, color: colors.muted },
  label: { fontSize: 13, color: colors.muted },
  err: { fontSize: 13, color: colors.danger },
  h: { fontSize: 15, fontWeight: '700', color: colors.ink },
});
export const Msg = ({ ok, text }: { ok: boolean; text: string }) => (
  <Text accessibilityRole="alert" style={ok ? { color: colors.ok } : s.err}>
    {text}
  </Text>
);
export const useT = useTranslation;

import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@/ui/Button';
import { colors } from '@/ui/theme';
import { StateView } from '../stock/StateView';
import { Gate, retryNetworkOnce } from '../purchase/Gate';
import { Chips, Notice, k, useActionKey } from '../purchase/ui';
import { useSal } from '../collections/sal-hook';
import { P, akey, fetchRisks, scanRisks } from './api-g67';

const tone = (s: string) => (s === 'HIGH' ? colors.danger : s === 'MEDIUM' ? colors.warn : colors.muted);

export default function RiskRegisterScreen() {
  const { t } = useTranslation();
  const s = useSal();
  const router = useRouter();
  const qc = useQueryClient();
  const key = useActionKey();
  const [status, setStatus] = useState('');
  const allowed = s.can(P.view);
  const q = useQuery({
    queryKey: akey(s.userId, 'risks', status),
    queryFn: ({ signal }) => fetchRisks(s.client!, status, signal),
    enabled: s.ready && allowed,
    retry: retryNetworkOnce,
  });
  if (!allowed) return <StateView state="denied" message={t('ai.denied')} />;
  const items = q.data?.items ?? [];
  const scan = () =>
    void s.act(
      t('ai.rk.scanned'),
      () => scanRisks(s.client!, undefined, key.keyFor('scan')),
      () => (key.reset(), void qc.invalidateQueries({ queryKey: ['ai', 'risks'] })),
    );
  return (
    <ScrollView
      contentContainerStyle={k.page}
      refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}
    >
      <Stack.Screen options={{ headerShown: true, title: t('nav.aiRisks') }} />
      <Text style={k.title}>{t('ai.rk.title')}</Text>
      <Text style={k.sub}>{t('ai.rk.note')}</Text>
      {s.msg ? <Notice tone="ok" text={s.msg} /> : null}
      {s.failure ? <Notice tone="error" text={s.failure} /> : null}
      {q.data ? (
        <Text style={k.sub}>
          {t('ai.rk.summary', {
            high: q.data.summary.open.HIGH ?? 0,
            medium: q.data.summary.open.MEDIUM ?? 0,
            low: q.data.summary.open.LOW ?? 0,
          })}
        </Text>
      ) : null}
      <Chips
        options={['', 'OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'DISMISSED'].map((x) => ({
          value: x,
          label: x ? t(`ai.rk.st.${x}`) : t('ai.rk.all'),
        }))}
        value={status}
        onChange={setStatus}
      />
      {s.can(P.decide) ? (
        <Button kind="ghost" label={t('ai.rk.scan')} disabled={s.busy} onPress={scan} />
      ) : null}
      <Gate q={q} ns="ai" emptyKey="ai.rk.none" isEmpty={items.length === 0}>
        {items.map((r) => (
          <Pressable
            key={r.id}
            accessibilityRole="button"
            accessibilityLabel={r.title}
            onPress={() => router.push({ pathname: '/ai-risk', params: { id: r.id } } as never)}
            style={k.card}
          >
            <Text style={[k.name, { color: tone(r.severity) }]}>{r.title}</Text>
            <Text style={k.sub}>
              {t(`ai.rk.kind.${r.kind}`, { defaultValue: r.kind })} · {t(`ai.rk.st.${r.status}`)}
              {r.dueDate ? ` · ${t('ai.rk.due', { date: r.dueDate })}` : ''}
            </Text>
          </Pressable>
        ))}
      </Gate>
    </ScrollView>
  );
}

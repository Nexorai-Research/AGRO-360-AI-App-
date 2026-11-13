import { useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Stack, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@/ui/Button';
import { colors } from '@/ui/theme';
import { StateView } from '../stock/StateView';
import { Gate, retryNetworkOnce } from '../purchase/Gate';
import { Chips, Notice, k, useActionKey } from '../purchase/ui';
import { useSal } from '../collections/sal-hook';
import { AP, akey, fetchBranchRefs, fetchDigest, snoozeItem, type DigestItem } from './api';

const tone = (s: DigestItem['severity']) =>
  s === 'HIGH' ? colors.danger : s === 'MEDIUM' ? colors.warn : colors.muted;

/** Where the evidence of a finding lives in the app (the API path of the finding is for the server, not for the phone). */
export const evidenceRoute = (kind: string, subjectRef: string): string | null => {
  switch (kind) {
    case 'COLLECTION':
    case 'CHURN':
    case 'CREDIT_EXTENSION':
      return /^[0-9a-f-]{36}$/i.test(subjectRef) ? `/customers/${subjectRef}` : '/collections';
    case 'STOCKOUT':
      return '/stock';
    case 'EXPIRY':
      return '/inventory-expiry';
    case 'COMPLIANCE':
      return '/compliance';
    default:
      return null;
  }
};

export default function DigestScreen() {
  const { t } = useTranslation();
  const s = useSal();
  const router = useRouter();
  const key = useActionKey();
  const [branch, setBranch] = useState('all');
  const ok = s.ready && s.can(AP.digest);
  const branches = useQuery({
    queryKey: akey(s.userId, 'branches'),
    queryFn: ({ signal }) => fetchBranchRefs(s.client!, signal),
    enabled: ok,
    retry: retryNetworkOnce,
  });
  const q = useQuery({
    queryKey: akey(s.userId, 'digest', branch),
    queryFn: ({ signal }) => fetchDigest(s.client!, branch, signal),
    enabled: ok,
    retry: retryNetworkOnce,
  });
  if (!s.can(AP.digest)) return <StateView state="denied" message={t('ai.denied')} />;
  const d = q.data;
  const opts = [
    { value: 'all', label: t('ai.allBranches') },
    ...(branches.data ?? []).map((b) => ({ value: b.id, label: b.name })),
  ];
  function snooze(it: DigestItem) {
    const body = { dedupeKey: it.dedupeKey, days: 7, reason: t('ai.snoozeReason') };
    void s.act(
      t('ai.snoozed'),
      () => snoozeItem(s.client!, body, key.keyFor(`${it.dedupeKey}|7`)),
      () => (key.reset(), void q.refetch()),
    );
  }
  return (
    <ScrollView
      contentContainerStyle={k.page}
      refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}
    >
      <Stack.Screen options={{ headerShown: true, title: t('nav.aiDigest') }} />
      <Text style={k.title}>{t('ai.digestTitle')}</Text>
      {s.msg ? <Notice tone="ok" text={s.msg} /> : null}
      {s.failure ? <Notice tone="error" text={s.failure} /> : null}
      {(branches.data ?? []).length > 1 ? <Chips options={opts} value={branch} onChange={setBranch} /> : null}
      <Gate q={q} ns="ai" emptyKey="ai.digestNone" isEmpty={false}>
        {d ? (
          <>
            <View style={k.card}>
              <Text style={k.name}>{d.summary}</Text>
              <Text style={k.sub}>
                {t('ai.counts', { high: d.counts.HIGH, medium: d.counts.MEDIUM, low: d.counts.LOW })} ·{' '}
                {d.date}
              </Text>
              {d.snoozed > 0 ? <Text style={k.sub}>{t('ai.snoozedCount', { n: d.snoozed })}</Text> : null}
              {d.notScanned.length > 0 ? (
                <Text style={k.warn}>{t('ai.notScanned', { parts: d.notScanned.join(', ') })}</Text>
              ) : null}
              <Text style={k.sub}>{t('ai.advice')}</Text>
            </View>
            {d.items.length === 0 ? <Text style={k.ok}>{t('ai.digestNone')}</Text> : null}
            {d.items.map((it) => {
              const go = evidenceRoute(it.kind, it.subjectRef);
              return (
                <View key={it.dedupeKey} style={k.card}>
                  <Text style={[k.name, { color: tone(it.severity) }]}>
                    {t(`ai.sev.${it.severity}`)} · {it.title}
                  </Text>
                  <Text style={k.sub}>{it.detail}</Text>
                  <View style={k.row}>
                    {go ? (
                      <Button kind="ghost" label={t('ai.open')} onPress={() => router.push(go as never)} />
                    ) : null}
                    {s.can('ai.recommendation.decide') ? (
                      <Button
                        kind="ghost"
                        label={t('ai.snooze')}
                        disabled={s.busy}
                        onPress={() => snooze(it)}
                      />
                    ) : null}
                  </View>
                </View>
              );
            })}
          </>
        ) : null}
      </Gate>
    </ScrollView>
  );
}

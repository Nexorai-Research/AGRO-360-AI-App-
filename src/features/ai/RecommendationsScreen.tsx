import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Stack, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StateView } from '../stock/StateView';
import { Gate, retryNetworkOnce } from '../purchase/Gate';
import { Chips, k } from '../purchase/ui';
import { useSal } from '../collections/sal-hook';
import { AI_VIEW, REC_STATUS, akey, fetchRecommendations } from './api';

export default function RecommendationsScreen() {
  const { t } = useTranslation();
  const s = useSal();
  const router = useRouter();
  const [status, setStatus] = useState<string>('PRESENTED');
  const ok = s.ready && s.can(AI_VIEW);
  const q = useQuery({
    queryKey: akey(s.userId, 'recs', status),
    queryFn: ({ signal }) => fetchRecommendations(s.client!, status, signal),
    enabled: ok,
    retry: retryNetworkOnce,
  });
  if (!s.can(AI_VIEW)) return <StateView state="denied" message={t('ai.denied')} />;
  return (
    <ScrollView
      contentContainerStyle={k.page}
      refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}
    >
      <Stack.Screen options={{ headerShown: true, title: t('nav.aiRecs') }} />
      <Text style={k.title}>{t('ai.rec.title')}</Text>
      <Text style={k.sub}>{t('ai.rec.intro')}</Text>
      <Chips
        options={REC_STATUS.map((x) => ({ value: x, label: t(`ai.rec.st.${x}`) }))}
        value={status}
        onChange={setStatus}
      />
      <Gate q={q} ns="ai" emptyKey="ai.rec.none" isEmpty={(q.data ?? []).length === 0}>
        {(q.data ?? []).map((r) => (
          <Pressable
            key={r.id}
            accessibilityRole="button"
            accessibilityLabel={`${t(`ai.rec.kind.${r.kind}`, { defaultValue: r.kind })} ${r.id}`}
            onPress={() => router.push(`/ai-recommendation/${r.id}` as never)}
            style={k.card}
          >
            <Text style={k.name}>{t(`ai.rec.kind.${r.kind}`, { defaultValue: r.kind })}</Text>
            <Text style={k.sub}>
              {t(`ai.rec.st.${r.status}`, { defaultValue: r.status })} ·{' '}
              {t('ai.rec.expires', { date: r.expiresAt.slice(0, 10) })}
            </Text>
            {r.confidence !== null ? (
              <Text style={k.sub}>{t('ai.rec.confidence', { n: Math.round(r.confidence * 100) })}</Text>
            ) : null}
          </Pressable>
        ))}
      </Gate>
    </ScrollView>
  );
}

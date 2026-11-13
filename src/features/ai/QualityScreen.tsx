import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { colors } from '@/ui/theme';
import { StateView } from '../stock/StateView';
import { Gate, retryNetworkOnce } from '../purchase/Gate';
import { k } from '../purchase/ui';
import { useSal } from '../collections/sal-hook';
import { P, akey, fetchQuality } from './api-g67';

const tone = (b: string | null) => (b === 'GOOD' ? colors.ok : b === 'FAIR' ? colors.warn : colors.danger);

export default function QualityScreen() {
  const { t } = useTranslation();
  const s = useSal();
  const allowed = s.can(P.use) && s.can(P.inventory);
  const q = useQuery({
    queryKey: akey(s.userId, 'quality'),
    queryFn: ({ signal }) => fetchQuality(s.client!, signal),
    enabled: s.ready && allowed,
    retry: retryNetworkOnce,
  });
  if (!allowed) return <StateView state="denied" message={t('ai.denied')} />;
  const d = q.data;
  return (
    <ScrollView
      contentContainerStyle={k.page}
      refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}
    >
      <Stack.Screen options={{ headerShown: true, title: t('nav.aiQuality') }} />
      <Text style={k.title}>{t('ai.dq.title')}</Text>
      <Gate q={q} ns="ai" emptyKey="ai.dq.none" isEmpty={false}>
        {d ? (
          <>
            <View style={k.card}>
              <Text style={k.name}>
                {d.overall === null ? t('ai.dq.noScore') : t('ai.dq.overall', { n: d.overall })}
              </Text>
              <Text style={k.sub}>{d.note}</Text>
            </View>
            {d.sources.map((x) => (
              <View key={x.source} style={k.card}>
                <Text style={[k.name, { color: tone(x.band) }]}>
                  {t(`ai.dq.src.${x.source}`, { defaultValue: x.source })}:{' '}
                  {x.score === null ? '-' : `${x.score}/100`}
                </Text>
                <Text style={k.sub}>
                  {x.score === null
                    ? t('ai.fc.insufficient', { reason: x.reason ?? '-' })
                    : t('ai.dq.checked', { n: x.checked })}
                </Text>
                {(x.issues ?? []).map((i, n) => (
                  <Text key={n} style={k.sub}>
                    • {i.label ?? i.code}
                    {i.count !== undefined ? ` (${i.count})` : ''}
                  </Text>
                ))}
              </View>
            ))}
            {d.notScanned.length > 0 ? (
              <Text style={k.warn}>{t('ai.dq.notScanned', { list: d.notScanned.join(', ') })}</Text>
            ) : null}
          </>
        ) : null}
      </Gate>
    </ScrollView>
  );
}

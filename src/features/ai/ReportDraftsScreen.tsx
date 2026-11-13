import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StateView } from '../stock/StateView';
import { Gate, retryNetworkOnce } from '../purchase/Gate';
import { k } from '../purchase/ui';
import { useSal } from '../collections/sal-hook';
import { AP, akey } from './api';
import { fetchReportDrafts } from './api-g5';

export default function ReportDraftsScreen() {
  const { t } = useTranslation();
  const s = useSal();
  const q = useQuery({
    queryKey: akey(s.userId, 'report-drafts'),
    queryFn: ({ signal }) => fetchReportDrafts(s.client!, signal),
    enabled: s.ready && s.can(AP.digest),
    retry: retryNetworkOnce,
  });
  if (!s.can(AP.digest)) return <StateView state="denied" message={t('ai.denied')} />;
  const items = q.data ?? [];
  return (
    <ScrollView
      contentContainerStyle={k.page}
      refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}
    >
      <Stack.Screen options={{ headerShown: true, title: t('nav.aiReportDrafts') }} />
      <Text style={k.title}>{t('ai.rd.title')}</Text>
      <Gate q={q} ns="ai" emptyKey="ai.rd.none" isEmpty={items.length === 0}>
        {items.map((d) => (
          <View key={d.id} style={k.card}>
            <Text style={k.name}>{d.title}</Text>
            <Text style={k.sub}>
              {t('ai.rd.meta', {
                v: d.currentVersion,
                date: d.updatedAt.slice(0, 10),
                source: d.current.source,
              })}
            </Text>
            {d.current.paragraphs.map((p) => (
              <Text key={p} style={k.sub}>
                {p}
              </Text>
            ))}
          </View>
        ))}
        <Text style={k.sub}>{t('ai.rd.note')}</Text>
      </Gate>
    </ScrollView>
  );
}

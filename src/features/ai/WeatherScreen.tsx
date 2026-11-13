import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { colors } from '@/ui/theme';
import { StateView } from '../stock/StateView';
import { Gate, retryNetworkOnce } from '../purchase/Gate';
import { k } from '../purchase/ui';
import { useSal } from '../collections/sal-hook';
import { AP, akey, fetchWeather } from './api';

export default function WeatherScreen() {
  const { t } = useTranslation();
  const s = useSal();
  const ok = s.ready && s.can(AP.digest);
  const q = useQuery({
    queryKey: akey(s.userId, 'weather'),
    queryFn: ({ signal }) => fetchWeather(s.client!, signal),
    enabled: ok,
    retry: retryNetworkOnce,
  });
  if (!s.can(AP.digest)) return <StateView state="denied" message={t('ai.denied')} />;
  const items = q.data?.items ?? [];
  return (
    <ScrollView
      contentContainerStyle={k.page}
      refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}
    >
      <Stack.Screen options={{ headerShown: true, title: t('nav.aiWeather') }} />
      <Text style={k.title}>{t('ai.wx.title')}</Text>
      <Gate q={q} ns="ai" emptyKey="ai.wx.none" isEmpty={items.length === 0}>
        {q.data && !q.data.providerConfigured ? <Text style={k.sub}>{t('ai.wx.noProvider')}</Text> : null}
        {items.map((w, i) => (
          <View key={w.location?.id ?? i} style={k.card}>
            <Text style={k.name}>{w.location?.name ?? t('ai.wx.noLocation')}</Text>
            {w.unavailable ? <Text style={k.warn}>{w.unavailable}</Text> : null}
            {w.fetchedAt ? (
              <Text style={k.sub}>
                {t('ai.wx.source', {
                  source: w.source ?? '-',
                  time: w.fetchedAt.slice(0, 16).replace('T', ' '),
                })}
              </Text>
            ) : null}
            {w.evaluation?.summary ? (
              <Text style={k.sub}>
                {t('ai.wx.summary', {
                  rain: w.evaluation.summary.rainMm,
                  min: w.evaluation.summary.minTempC,
                  max: w.evaluation.summary.maxTempC,
                  wind: w.evaluation.summary.maxWindKmh,
                })}
              </Text>
            ) : null}
            {w.evaluation?.covered && w.evaluation.alerts.length === 0 ? (
              <Text style={k.ok}>{t('ai.wx.calm')}</Text>
            ) : null}
            {(w.evaluation?.alerts ?? []).map((a) => (
              <View key={a.code}>
                <Text
                  style={{
                    color: a.severity === 'HIGH' ? colors.danger : colors.warn,
                    fontSize: 15,
                    fontWeight: '600',
                  }}
                >
                  {a.title}
                </Text>
                <Text style={k.sub}>{a.detail}</Text>
                <Text style={k.sub}>{a.advisory}</Text>
              </View>
            ))}
          </View>
        ))}
        <Text style={k.sub}>{t('ai.wx.note')}</Text>
      </Gate>
    </ScrollView>
  );
}

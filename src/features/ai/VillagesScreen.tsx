import { useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { colors } from '@/ui/theme';
import { StateView } from '../stock/StateView';
import { Gate, retryNetworkOnce } from '../purchase/Gate';
import { Chips, k } from '../purchase/ui';
import { useSal } from '../collections/sal-hook';
import { AP, akey, fetchBranchRefs } from './api';
import { fetchVillages } from './api-g4';
import { rupee } from './fmt';

const tone = (t: string) => (t === 'RISING' ? colors.ok : t === 'FALLING' ? colors.danger : colors.warn);

export default function VillagesScreen() {
  const { t } = useTranslation();
  const s = useSal();
  const [branch, setBranch] = useState('');
  const ok = s.ready && s.can(AP.digest);
  const branches = useQuery({
    queryKey: akey(s.userId, 'branches'),
    queryFn: ({ signal }) => fetchBranchRefs(s.client!, signal),
    enabled: ok,
    retry: retryNetworkOnce,
  });
  const q = useQuery({
    queryKey: akey(s.userId, 'villages', branch),
    queryFn: ({ signal }) => fetchVillages(s.client!, branch, signal),
    enabled: ok,
    retry: retryNetworkOnce,
  });
  if (!s.can(AP.digest)) return <StateView state="denied" message={t('ai.denied')} />;
  const d = q.data;
  return (
    <ScrollView
      contentContainerStyle={k.page}
      refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}
    >
      <Stack.Screen options={{ headerShown: true, title: t('nav.aiVillages') }} />
      <Text style={k.title}>{t('ai.vl.title')}</Text>
      {(branches.data ?? []).length > 1 ? (
        <Chips
          options={[
            { value: '', label: t('ai.allBranches') },
            ...(branches.data ?? []).map((b) => ({ value: b.id, label: b.name })),
          ]}
          value={branch}
          onChange={setBranch}
        />
      ) : null}
      <Gate q={q} ns="ai" emptyKey="ai.vl.none" isEmpty={false}>
        {d && d.state !== 'OK' ? (
          <Text style={k.warn}>{t('ai.fc.insufficient', { reason: d.reason ?? '-' })}</Text>
        ) : null}
        {(d?.villages ?? []).map((v) => (
          <View key={v.village} style={k.card}>
            <Text style={k.name}>{v.village}</Text>
            <Text style={{ color: tone(v.trend), fontSize: 15, fontWeight: '600' }}>
              {t(`ai.vl.trend.${v.trend}`)}
              {v.changePct !== null ? ` · ${v.changePct}%` : ''}
            </Text>
            <Text style={k.sub}>
              {t('ai.vl.facts', {
                customers: v.customers,
                bills: v.bills,
                spend: rupee(v.spend),
                overdue: rupee(v.overdue),
              })}
            </Text>
            <Text style={k.sub}>{v.explanation}</Text>
            {v.demand.slice(0, 4).map((x) => (
              <Text key={`${x.season}-${x.category}`} style={k.sub}>
                • {t(`ai.vl.season.${x.season}`, { defaultValue: x.season })}: {x.category} ({x.sharePct}%)
              </Text>
            ))}
          </View>
        ))}
        {d && d.suppressedVillages > 0 ? (
          <Text style={k.sub}>{t('ai.vl.hidden', { n: d.suppressedVillages })}</Text>
        ) : null}
        {d ? <Text style={k.sub}>{d.rule}</Text> : null}
      </Gate>
    </ScrollView>
  );
}

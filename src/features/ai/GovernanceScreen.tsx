import { useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StateView } from '../stock/StateView';
import { Gate, retryNetworkOnce } from '../purchase/Gate';
import { Chips, k } from '../purchase/ui';
import { useSal } from '../collections/sal-hook';
import { P, akey, fetchEvaluation, fetchQuota } from './api-g67';

export default function GovernanceScreen() {
  const { t } = useTranslation();
  const s = useSal();
  const [days, setDays] = useState('90');
  const allowed = s.can(P.govern);
  const quota = useQuery({
    queryKey: akey(s.userId, 'quota'),
    queryFn: ({ signal }) => fetchQuota(s.client!, signal),
    enabled: s.ready && allowed,
    retry: retryNetworkOnce,
  });
  const ev = useQuery({
    queryKey: akey(s.userId, 'eval', days),
    queryFn: ({ signal }) => fetchEvaluation(s.client!, Number(days), signal),
    enabled: s.ready && allowed,
    retry: retryNetworkOnce,
  });
  if (!allowed) return <StateView state="denied" message={t('ai.denied')} />;
  const u = quota.data;
  const e = ev.data;
  return (
    <ScrollView
      contentContainerStyle={k.page}
      refreshControl={
        <RefreshControl
          refreshing={quota.isRefetching}
          onRefresh={() => (void quota.refetch(), void ev.refetch())}
        />
      }
    >
      <Stack.Screen options={{ headerShown: true, title: t('nav.aiGovern') }} />
      <Text style={k.title}>{t('ai.gv.title')}</Text>
      <Gate q={quota} ns="ai" emptyKey="ai.gv.none" isEmpty={false}>
        {u ? (
          <View style={k.card}>
            <Text style={k.name}>{t('ai.gv.used', { used: u.used, quota: u.effectiveQuota })}</Text>
            <Text style={k.sub}>{t('ai.gv.remaining', { n: u.remaining })}</Text>
            <Text style={k.sub}>{t('ai.gv.limitedBy', { by: u.limitedBy })}</Text>
            <Text style={k.sub}>{u.note}</Text>
          </View>
        ) : null}
      </Gate>
      <Chips
        options={['30', '90', '180'].map((d) => ({ value: d, label: t('ai.gv.days', { n: d }) }))}
        value={days}
        onChange={setDays}
      />
      <Gate q={ev} ns="ai" emptyKey="ai.gv.none" isEmpty={false}>
        {e ? (
          <View style={k.card}>
            <Text style={k.name}>{t('ai.gv.report', { n: e.days })}</Text>
            <Text style={k.sub}>{t('ai.gv.model', { v: e.modelVersion })}</Text>
            <Text style={k.sub}>
              {t('ai.gv.counts', {
                comparisons: e.comparisons.length,
                promotions: e.promotions.length,
                drift: e.driftCases.length,
                methods: e.methodsInForce.length,
              })}
            </Text>
            {e.accuracyTrend.map((a) => (
              <Text key={a.branchId} style={k.sub}>
                {t('ai.gv.trend', { branch: a.branch, n: a.points.length })}
              </Text>
            ))}
            <Text style={k.sub}>{t('ai.gv.csvNote')}</Text>
          </View>
        ) : null}
      </Gate>
    </ScrollView>
  );
}

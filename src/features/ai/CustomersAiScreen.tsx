import { useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Stack, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@/ui/Button';
import { colors } from '@/ui/theme';
import { StateView } from '../stock/StateView';
import { Gate, retryNetworkOnce } from '../purchase/Gate';
import { Chips, k } from '../purchase/ui';
import { useSal } from '../collections/sal-hook';
import { AI_CUST, AI_REC, AP, akey, fetchChurn, fetchCollectionPlan, fetchCreditRisk } from './api';
import { rupee } from './fmt';

type Tab = 'credit' | 'collect' | 'inactive';
const bandColor = (b: string | null) =>
  b === 'HIGH' ? colors.danger : b === 'MEDIUM' ? colors.warn : colors.ok;

export default function CustomersAiScreen() {
  const { t } = useTranslation();
  const s = useSal();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('credit');
  const needs = tab === 'inactive' ? AI_CUST : AI_REC;
  const allowed = s.can(AP.digest) && s.can(needs);
  const on = s.ready && allowed;
  const credit = useQuery({
    queryKey: akey(s.userId, 'credit'),
    queryFn: ({ signal }) => fetchCreditRisk(s.client!, signal),
    enabled: on && tab === 'credit',
    retry: retryNetworkOnce,
  });
  const plan = useQuery({
    queryKey: akey(s.userId, 'collect'),
    queryFn: ({ signal }) => fetchCollectionPlan(s.client!, signal),
    enabled: on && tab === 'collect',
    retry: retryNetworkOnce,
  });
  const churn = useQuery({
    queryKey: akey(s.userId, 'churn'),
    queryFn: ({ signal }) => fetchChurn(s.client!, signal),
    enabled: on && tab === 'inactive',
    retry: retryNetworkOnce,
  });
  const open = (id: string) => router.push(`/customers/${id}` as never);
  const active = tab === 'credit' ? credit : tab === 'collect' ? plan : churn;
  const head = (
    <>
      <Stack.Screen options={{ headerShown: true, title: t('nav.aiCustomers') }} />
      <Text style={k.title}>{t('ai.cu.title')}</Text>
      <Chips
        options={(['credit', 'collect', 'inactive'] as const).map((x) => ({
          value: x,
          label: t(`ai.cu.tab.${x}`),
        }))}
        value={tab}
        onChange={(v) => setTab(v as Tab)}
      />
    </>
  );
  if (!allowed)
    return (
      <ScrollView contentContainerStyle={k.page}>
        {head}
        <StateView state="denied" message={t('ai.denied')} />
      </ScrollView>
    );
  return (
    <ScrollView
      contentContainerStyle={k.page}
      refreshControl={
        <RefreshControl refreshing={active.isRefetching} onRefresh={() => void active.refetch()} />
      }
    >
      {head}
      <Text style={k.sub}>{t('ai.cu.note')}</Text>
      {tab === 'credit' ? (
        <Gate q={credit} ns="ai" emptyKey="ai.cu.none" isEmpty={(credit.data ?? []).length === 0}>
          {(credit.data ?? []).map((r) => (
            <View key={r.customerId} style={k.card}>
              <Text style={k.name}>{r.label}</Text>
              {r.state === 'OK' ? (
                <>
                  <Text style={{ color: bandColor(r.band), fontSize: 15, fontWeight: '600' }}>
                    {t(`ai.cu.band.${r.band}`)} · {t('ai.cu.score', { n: r.score })}
                  </Text>
                  {r.factors.map((f) => (
                    <Text key={f.name} style={k.sub}>
                      • {f.detail} (+{f.points})
                    </Text>
                  ))}
                </>
              ) : (
                <Text style={k.sub}>{t('ai.fc.insufficient', { reason: r.reason ?? '-' })}</Text>
              )}
              <Button kind="ghost" label={t('ai.open')} onPress={() => open(r.customerId)} />
            </View>
          ))}
        </Gate>
      ) : null}
      {tab === 'collect' ? (
        <Gate q={plan} ns="ai" emptyKey="ai.cu.noneCollect" isEmpty={(plan.data ?? []).length === 0}>
          {(plan.data ?? []).map((r) => (
            <View key={r.customerId} style={k.card}>
              <Text style={k.name}>
                {r.rank}. {r.label}
              </Text>
              <Text style={k.warn}>
                {t('ai.cu.overdue', { amount: rupee(r.overdue), days: r.oldestOverdueDays })}
              </Text>
              <Text style={k.sub}>{r.why}</Text>
              {r.followUp ? <Text style={k.sub}>{r.followUp.note}</Text> : null}
              {r.bestDay ? (
                <Text style={k.sub}>
                  {r.bestDay.state === 'OK'
                    ? t('ai.cu.bestDay', { day: r.bestDay.weekday })
                    : t('ai.cu.noPattern')}
                </Text>
              ) : null}
              {r.channel ? (
                <Text style={r.channel.state === 'BLOCKED' ? k.warn : k.sub}>{r.channel.reason}</Text>
              ) : r.channelNote ? (
                <Text style={k.sub}>{r.channelNote}</Text>
              ) : null}
              <Button kind="ghost" label={t('ai.open')} onPress={() => open(r.customerId)} />
            </View>
          ))}
        </Gate>
      ) : null}
      {tab === 'inactive' ? (
        <Gate q={churn} ns="ai" emptyKey="ai.cu.noneChurn" isEmpty={(churn.data ?? []).length === 0}>
          {(churn.data ?? []).map((r) => (
            <View key={r.customerId} style={k.card}>
              <Text style={k.name}>{r.label}</Text>
              <Text style={r.state === 'INACTIVE' ? k.warn : k.sub}>
                {t(`ai.cu.st.${r.state}`)} · {r.reason}
              </Text>
              {r.spendChangePct !== null ? (
                <Text style={k.sub}>{t('ai.cu.spend', { n: r.spendChangePct })}</Text>
              ) : null}
              <Button kind="ghost" label={t('ai.open')} onPress={() => open(r.customerId)} />
            </View>
          ))}
        </Gate>
      ) : null}
    </ScrollView>
  );
}

import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { colors } from '@/ui/theme';
import { StateView } from '../stock/StateView';
import { Gate, retryNetworkOnce } from '../purchase/Gate';
import { k } from '../purchase/ui';
import { useSal } from '../collections/sal-hook';
import { AI_FIN, AI_REC, AP, akey, fetchCashOutlook } from './api';
import { rupee } from './fmt';

const tone = (st: string) =>
  st === 'SHORTFALL' ? colors.danger : st === 'BELOW_BUFFER' ? colors.warn : colors.ok;

export default function CashFlowScreen() {
  const { t } = useTranslation();
  const s = useSal();
  const ok = s.ready && s.can(AP.digest) && s.can(AI_FIN) && s.can(AI_REC);
  const q = useQuery({
    queryKey: akey(s.userId, 'cash'),
    queryFn: ({ signal }) => fetchCashOutlook(s.client!, signal),
    enabled: ok,
    retry: retryNetworkOnce,
  });
  if (!s.can(AP.digest) || !s.can(AI_FIN) || !s.can(AI_REC))
    return <StateView state="denied" message={t('ai.denied')} />;
  const d = q.data;
  return (
    <ScrollView
      contentContainerStyle={k.page}
      refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}
    >
      <Stack.Screen options={{ headerShown: true, title: t('nav.aiCash') }} />
      <Text style={k.title}>{t('ai.cf.title')}</Text>
      <Gate q={q} ns="ai" emptyKey="ai.cf.none" isEmpty={false}>
        {d ? (
          d.state !== 'OK' ? (
            <Text style={k.warn}>{t('ai.fc.insufficient', { reason: d.reason ?? '-' })}</Text>
          ) : (
            <>
              <View style={k.card}>
                <Text style={k.name}>{t('ai.cf.now', { amount: rupee(d.cashAndBank) })}</Text>
                <Text style={d.firstProblemDays ? k.warn : k.ok}>
                  {d.firstProblemDays ? t('ai.cf.problem', { n: d.firstProblemDays }) : t('ai.cf.fine')}
                </Text>
                <Text style={k.sub}>{t('ai.cf.notMoney')}</Text>
              </View>
              {d.horizons.map((h) => (
                <View key={h.days} style={k.card}>
                  <Text style={[k.name, { color: tone(h.status) }]}>
                    {t('ai.cf.inDays', { n: h.days })}: {rupee(h.projected)} · {t(`ai.cf.st.${h.status}`)}
                  </Text>
                  <Text style={k.sub}>
                    {t('ai.cf.in', { amount: rupee(h.inflow) })} ·{' '}
                    {t('ai.cf.out', { amount: rupee(h.outflow) })}
                  </Text>
                </View>
              ))}
              {!d.payroll.included ? (
                <Text style={k.sub}>{t('ai.cf.noPayroll', { reason: d.payroll.reason ?? '-' })}</Text>
              ) : null}
              {!d.tax.included ? (
                <Text style={k.sub}>{t('ai.cf.noTax', { reason: d.tax.reason ?? '-' })}</Text>
              ) : null}
              {d.assumptions.map((a) => (
                <Text key={a} style={k.sub}>
                  • {a}
                </Text>
              ))}
            </>
          )
        ) : null}
      </Gate>
    </ScrollView>
  );
}

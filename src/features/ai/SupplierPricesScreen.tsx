import { useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StateView } from '../stock/StateView';
import { Gate, retryNetworkOnce } from '../purchase/Gate';
import { Chips, k } from '../purchase/ui';
import { useSal } from '../collections/sal-hook';
import { AI_PUR, AP, akey, fetchSupplierView } from './api';
import { units } from './fmt';

const DAYS = [90, 180, 365];

export default function SupplierPricesScreen() {
  const { t } = useTranslation();
  const s = useSal();
  const [days, setDays] = useState(365);
  const ok = s.ready && s.can(AP.digest) && s.can(AI_PUR);
  const q = useQuery({
    queryKey: akey(s.userId, 'supplier-prices', String(days)),
    queryFn: ({ signal }) => fetchSupplierView(s.client!, days, signal),
    enabled: ok,
    retry: retryNetworkOnce,
  });
  if (!s.can(AP.digest) || !s.can(AI_PUR)) return <StateView state="denied" message={t('ai.denied')} />;
  const d = q.data;
  return (
    <ScrollView
      contentContainerStyle={k.page}
      refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}
    >
      <Stack.Screen options={{ headerShown: true, title: t('nav.aiSupplierPrices') }} />
      <Text style={k.title}>{t('ai.sp.title')}</Text>
      <Text style={k.sub}>{t('ai.sp.intro')}</Text>
      <Chips
        options={DAYS.map((x) => ({ value: String(x), label: t('ai.ex.days', { n: x }) }))}
        value={String(days)}
        onChange={(v) => setDays(Number(v))}
      />
      <Gate q={q} ns="ai" emptyKey="ai.sp.none" isEmpty={false}>
        {d ? (
          d.state !== 'OK' ? (
            <Text style={k.warn}>{t('ai.fc.insufficient', { reason: d.reason ?? '-' })}</Text>
          ) : (
            <>
              <Text style={k.sub}>{t('ai.sp.judged', { n: d.judgedLines, skipped: d.skippedLines })}</Text>
              {d.items.length === 0 ? <Text style={k.ok}>{t('ai.sp.none')}</Text> : null}
              {d.items.map((r) => (
                <View key={r.supplierId} style={k.card}>
                  <Text style={k.name}>{r.supplierName}</Text>
                  <Text style={r.flagged > 0 ? k.warn : k.sub}>
                    {t('ai.sp.flagged', {
                      flagged: r.flagged,
                      lines: r.lines,
                      share: Math.round(r.flaggedShare * 100),
                    })}
                  </Text>
                  <Text style={k.sub}>
                    {t('ai.sp.avg', { pct: units(r.avgDeviationPct) })} ·{' '}
                    {t('ai.sp.products', { n: r.products })}
                  </Text>
                </View>
              ))}
              <Text style={k.sub}>{t('ai.advice')}</Text>
            </>
          )
        ) : null}
      </Gate>
    </ScrollView>
  );
}

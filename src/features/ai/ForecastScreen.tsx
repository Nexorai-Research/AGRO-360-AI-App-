import { useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StateView } from '../stock/StateView';
import { Gate, retryNetworkOnce } from '../purchase/Gate';
import { Chips, k } from '../purchase/ui';
import { useSal } from '../collections/sal-hook';
import { AI_INV, AP, akey, fetchBranchRefs, fetchForecastTable, type ForecastRow } from './api';
import { pct, units } from './fmt';

const WEEKS = [4, 8, 13];

function Row({ r }: { r: ForecastRow }) {
  const { t } = useTranslation();
  const f = r.forecast;
  return (
    <View style={k.card}>
      <Text style={k.name}>{r.skuName}</Text>
      <Text style={k.sub}>{t('ai.fc.onHand', { n: units(r.onHand) })}</Text>
      {f.state === 'OK' ? (
        <>
          <Text style={k.ok}>
            {t('ai.fc.total', { n: units(f.total) })}
            {f.totalLow !== null && f.totalHigh !== null
              ? ` (${t('ai.fc.range', { low: units(f.totalLow), high: units(f.totalHigh) })})`
              : ` (${t('ai.fc.noRange')})`}
          </Text>
          <Text style={k.sub}>{f.weeks.map((w) => `${w.from.slice(5)}: ${units(w.value)}`).join(' · ')}</Text>
          <Text style={k.sub}>
            {t('ai.fc.method', { method: f.method })}
            {f.wape !== null ? ` · ${t('ai.fc.error', { pct: pct(f.wape) })}` : ''}
          </Text>
        </>
      ) : (
        <Text style={k.warn}>{t('ai.fc.insufficient', { reason: f.reason ?? '-' })}</Text>
      )}
      {r.adopted ? (
        <Text style={k.sub}>
          {r.adopted.fellBackToBaseline
            ? t('ai.fc.fellBack')
            : t('ai.fc.adopted', { method: r.adopted.method })}
        </Text>
      ) : null}
    </View>
  );
}

export default function ForecastScreen() {
  const { t } = useTranslation();
  const s = useSal();
  const [branch, setBranch] = useState('');
  const [weeks, setWeeks] = useState(4);
  const [more, setMore] = useState(false);
  const ok = s.ready && s.can(AP.digest) && s.can(AI_INV);
  const branches = useQuery({
    queryKey: akey(s.userId, 'branches'),
    queryFn: ({ signal }) => fetchBranchRefs(s.client!, signal),
    enabled: ok,
    retry: retryNetworkOnce,
  });
  const q = useQuery({
    queryKey: akey(s.userId, 'forecast', `${branch}|${weeks}|${more}`),
    queryFn: ({ signal }) => fetchForecastTable(s.client!, { branch, weeks, limit: more ? 200 : 40 }, signal),
    enabled: ok,
    retry: retryNetworkOnce,
  });
  if (!s.can(AP.digest) || !s.can(AI_INV)) return <StateView state="denied" message={t('ai.denied')} />;
  const d = q.data;
  return (
    <ScrollView
      contentContainerStyle={k.page}
      refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}
    >
      <Stack.Screen options={{ headerShown: true, title: t('nav.aiForecast') }} />
      <Text style={k.title}>{t('ai.fc.title')}</Text>
      {(branches.data ?? []).length > 1 ? (
        <Chips
          options={(branches.data ?? []).map((b) => ({ value: b.id, label: b.name }))}
          value={branch || d?.branchId || ''}
          onChange={setBranch}
        />
      ) : null}
      <Chips
        options={WEEKS.map((w) => ({ value: String(w), label: t('ai.fc.weeks', { n: w }) }))}
        value={String(weeks)}
        onChange={(v) => setWeeks(Number(v))}
      />
      <Gate q={q} ns="ai" emptyKey="ai.fc.none" isEmpty={false}>
        {d ? (
          <>
            <View style={k.card}>
              <Text style={k.name}>
                {t('ai.fc.summary', { n: d.summary.forecast, total: d.summary.products })}
              </Text>
              {d.summary.insufficientData > 0 ? (
                <Text style={k.warn}>{t('ai.fc.few', { n: d.summary.insufficientData })}</Text>
              ) : null}
              <Text style={k.sub}>{t('ai.advice')}</Text>
              <Text style={k.sub}>{d.note}</Text>
            </View>
            {d.items.length === 0 ? <Text style={k.sub}>{t('ai.fc.none')}</Text> : null}
            {d.items.map((r) => (
              <Row key={r.skuId} r={r} />
            ))}
            {!more && d.items.length >= 40 ? (
              <Text accessibilityRole="button" style={k.ok} onPress={() => setMore(true)}>
                {t('ai.fc.showMore')}
              </Text>
            ) : null}
          </>
        ) : null}
      </Gate>
    </ScrollView>
  );
}

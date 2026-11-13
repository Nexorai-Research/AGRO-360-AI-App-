import { useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StateView } from '../stock/StateView';
import { Gate, retryNetworkOnce } from '../purchase/Gate';
import { Chips, k } from '../purchase/ui';
import { useSal } from '../collections/sal-hook';
import { AI_INV, AP, akey, fetchBranchRefs, fetchSeasonCatalogue, type SeasonLine } from './api';
import { pct, units } from './fmt';

const STARTS = [0, 4, 8, 12];
const LENGTHS = [8, 12, 26];

function Line({ l }: { l: SeasonLine }) {
  const { t } = useTranslation();
  return (
    <View style={k.card}>
      <Text style={k.name}>{l.skuName}</Text>
      {l.state === 'OK' ? (
        <>
          <Text style={k.ok}>
            {t('ai.se.expected', { n: units(l.expected) })} ({units(l.low)}–{units(l.high)})
          </Text>
          <Text style={k.sub}>
            {t('ai.se.toBuy', { n: units(l.toBuy) })}
            {l.orderBy ? ` · ${t('ai.se.orderBy', { date: l.orderBy })}` : ''}
          </Text>
          <Text style={k.sub}>
            {t('ai.se.lastYear', { n: units(l.lastYearUnits) })} · {t('ai.se.growth', { n: pct(l.growth) })}
          </Text>
          {l.assumptions.map((a) => (
            <Text key={a} style={k.sub}>
              • {a}
            </Text>
          ))}
        </>
      ) : (
        <Text style={k.warn}>{t('ai.fc.insufficient', { reason: l.reason ?? '-' })}</Text>
      )}
    </View>
  );
}

export default function SeasonScreen() {
  const { t } = useTranslation();
  const s = useSal();
  const [branch, setBranch] = useState('');
  const [start, setStart] = useState(0);
  const [len, setLen] = useState(8);
  const ok = s.ready && s.can(AP.digest) && s.can(AI_INV);
  const branches = useQuery({
    queryKey: akey(s.userId, 'branches'),
    queryFn: ({ signal }) => fetchBranchRefs(s.client!, signal),
    enabled: ok,
    retry: retryNetworkOnce,
  });
  const q = useQuery({
    queryKey: akey(s.userId, 'season', `${branch}|${start}|${len}`),
    queryFn: ({ signal }) =>
      fetchSeasonCatalogue(s.client!, { branch, startInWeeks: start, weeks: len, top: 20 }, signal),
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
      <Stack.Screen options={{ headerShown: true, title: t('nav.aiSeason') }} />
      <Text style={k.title}>{t('ai.se.title')}</Text>
      {(branches.data ?? []).length > 1 ? (
        <Chips
          options={(branches.data ?? []).map((b) => ({ value: b.id, label: b.name }))}
          value={branch || d?.branchId || ''}
          onChange={setBranch}
        />
      ) : null}
      <Text style={k.sub}>{t('ai.se.startsIn')}</Text>
      <Chips
        options={STARTS.map((w) => ({ value: String(w), label: t('ai.fc.weeks', { n: w }) }))}
        value={String(start)}
        onChange={(v) => setStart(Number(v))}
      />
      <Text style={k.sub}>{t('ai.se.length')}</Text>
      <Chips
        options={LENGTHS.map((w) => ({ value: String(w), label: t('ai.fc.weeks', { n: w }) }))}
        value={String(len)}
        onChange={(v) => setLen(Number(v))}
      />
      <Gate q={q} ns="ai" emptyKey="ai.fc.none" isEmpty={false}>
        {d ? (
          <>
            <View style={k.card}>
              <Text style={k.name}>{t('ai.se.summary', { n: d.planned, total: d.products })}</Text>
              <Text style={k.ok}>{t('ai.se.totalBuy', { n: units(d.totalUnitsToBuy) })}</Text>
              {d.earliestOrderBy ? (
                <Text style={k.sub}>{t('ai.se.earliest', { date: d.earliestOrderBy })}</Text>
              ) : null}
              {d.notPlanned > 0 ? <Text style={k.warn}>{t('ai.fc.few', { n: d.notPlanned })}</Text> : null}
              <Text style={k.sub}>{t('ai.advice')}</Text>
            </View>
            {d.lines.map((l) => (
              <Line key={l.skuId} l={l} />
            ))}
          </>
        ) : null}
      </Gate>
    </ScrollView>
  );
}

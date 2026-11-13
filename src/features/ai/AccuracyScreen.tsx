import { useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@/ui/Button';
import { StateView } from '../stock/StateView';
import { Gate, retryNetworkOnce } from '../purchase/Gate';
import { Chips, Notice, k, useActionKey } from '../purchase/ui';
import { useSal } from '../collections/sal-hook';
import { AI_DECIDE, AI_INV, AP, akey, fetchAccuracyOverview, fetchBranchRefs, runDriftScan } from './api';
import { pct } from './fmt';

export default function AccuracyScreen() {
  const { t } = useTranslation();
  const s = useSal();
  const key = useActionKey();
  const [branch, setBranch] = useState('');
  const ok = s.ready && s.can(AP.digest) && s.can(AI_INV);
  const branches = useQuery({
    queryKey: akey(s.userId, 'branches'),
    queryFn: ({ signal }) => fetchBranchRefs(s.client!, signal),
    enabled: ok,
    retry: retryNetworkOnce,
  });
  const cur = branch || branches.data?.[0]?.id || '';
  const q = useQuery({
    queryKey: akey(s.userId, 'accuracy', cur),
    queryFn: ({ signal }) => fetchAccuracyOverview(s.client!, cur, signal),
    enabled: ok && cur !== '',
    retry: retryNetworkOnce,
  });
  if (!s.can(AP.digest) || !s.can(AI_INV)) return <StateView state="denied" message={t('ai.denied')} />;
  const d = q.data;
  function scan() {
    void s.act(
      t('ai.ac.scanned'),
      () => runDriftScan(s.client!, cur, key.keyFor(cur)),
      () => (key.reset(), void q.refetch()),
    );
  }
  return (
    <ScrollView
      contentContainerStyle={k.page}
      refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}
    >
      <Stack.Screen options={{ headerShown: true, title: t('nav.aiAccuracy') }} />
      <Text style={k.title}>{t('ai.ac.title')}</Text>
      {s.msg ? <Notice tone="ok" text={s.msg} /> : null}
      {s.failure ? <Notice tone="error" text={s.failure} /> : null}
      {(branches.data ?? []).length > 1 ? (
        <Chips
          options={(branches.data ?? []).map((b) => ({ value: b.id, label: b.name }))}
          value={cur}
          onChange={setBranch}
        />
      ) : null}
      <Gate q={q} ns="ai" emptyKey="ai.ac.none" isEmpty={false}>
        {d ? (
          <>
            <View style={k.card}>
              <Text style={k.name}>
                {t('ai.ac.measured', { n: d.summary.measured, total: d.summary.products })}
              </Text>
              <Text style={k.ok}>{t('ai.ac.error', { pct: pct(d.summary.wape) })}</Text>
              <Text style={k.sub}>{t('ai.ac.naive', { pct: pct(d.summary.naiveWape) })}</Text>
              {d.summary.beatsNaivePct !== null ? (
                <Text style={k.sub}>{t('ai.ac.beats', { n: Math.round(d.summary.beatsNaivePct) })}</Text>
              ) : null}
              {d.summary.notMeasured > 0 ? (
                <Text style={k.warn}>{t('ai.fc.few', { n: d.summary.notMeasured })}</Text>
              ) : null}
              <Text style={k.sub}>{t('ai.ac.how')}</Text>
            </View>
            {d.summary.worst.length > 0 ? (
              <View style={k.card}>
                <Text style={k.name}>{t('ai.ac.worst')}</Text>
                {d.summary.worst.map((w) => (
                  <Text key={w.skuId} style={k.sub}>
                    {w.skuName}: {pct(w.wape)}
                  </Text>
                ))}
              </View>
            ) : null}
            <View style={k.card}>
              <Text style={k.name}>{t('ai.ac.drift')}</Text>
              {d.drifted.length === 0 ? <Text style={k.ok}>{t('ai.ac.noDrift')}</Text> : null}
              {d.drifted.map((x) => (
                <Text key={x.skuId} style={k.warn}>
                  {x.skuName}: {pct(x.drift.referenceWape)} → {pct(x.drift.recentWape)}
                </Text>
              ))}
              {s.can(AI_DECIDE) ? (
                <Button kind="ghost" label={t('ai.ac.scan')} disabled={s.busy} onPress={scan} />
              ) : null}
              <Text style={k.sub}>{t('ai.ac.noSwitch')}</Text>
            </View>
            {d.history.length > 0 ? (
              <View style={k.card}>
                <Text style={k.name}>{t('ai.ac.history')}</Text>
                {d.history.slice(-8).map((h) => (
                  <Text key={h.takenOn} style={k.sub}>
                    {h.takenOn}: {pct(h.wape)} ({h.products})
                  </Text>
                ))}
              </View>
            ) : null}
          </>
        ) : null}
      </Gate>
    </ScrollView>
  );
}

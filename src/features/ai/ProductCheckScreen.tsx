import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@/ui/Button';
import { StateView } from '../stock/StateView';
import { Gate, retryNetworkOnce } from '../purchase/Gate';
import { Chips, Notice, k, useActionKey } from '../purchase/ui';
import { useSal } from '../collections/sal-hook';
import {
  AI_DECIDE,
  AI_INV,
  AP,
  akey,
  fetchAccuracy,
  fetchBranchRefs,
  fetchCompareGbm,
  fetchDrift,
  fetchExplain,
  fetchSeasonalAnomaly,
  saveCompareGbm,
  type ProductRef,
} from './api';
import { pct, units } from './fmt';
import { ProductPicker } from './ProductPicker';

const TABS = ['explain', 'accuracy', 'drift', 'seasonal', 'compare'] as const;
type Tab = (typeof TABS)[number];

export default function ProductCheckScreen() {
  const { t } = useTranslation();
  const s = useSal();
  const key = useActionKey();
  const [product, setProduct] = useState<ProductRef | null>(null);
  const [branch, setBranch] = useState('');
  const [tab, setTab] = useState<Tab>('explain');
  const ok = s.ready && s.can(AP.digest) && s.can(AI_INV);
  const branches = useQuery({
    queryKey: akey(s.userId, 'branches'),
    queryFn: ({ signal }) => fetchBranchRefs(s.client!, signal),
    enabled: ok,
    retry: retryNetworkOnce,
  });
  const cur = branch || branches.data?.[0]?.id || '';
  const on = ok && !!product && cur !== '';
  const base = { enabled: on, retry: retryNetworkOnce } as const;
  const id = product?.id ?? '';
  const explain = useQuery({
    ...base,
    enabled: on && tab === 'explain',
    queryKey: akey(s.userId, 'explain', `${id}|${cur}`),
    queryFn: ({ signal }) => fetchExplain(s.client!, id, cur, signal),
  });
  const acc = useQuery({
    ...base,
    enabled: on && tab === 'accuracy',
    queryKey: akey(s.userId, 'acc', `${id}|${cur}`),
    queryFn: ({ signal }) => fetchAccuracy(s.client!, id, cur, signal),
  });
  const drift = useQuery({
    ...base,
    enabled: on && tab === 'drift',
    queryKey: akey(s.userId, 'drift', `${id}|${cur}`),
    queryFn: ({ signal }) => fetchDrift(s.client!, id, cur, signal),
  });
  const sea = useQuery({
    ...base,
    enabled: on && tab === 'seasonal',
    queryKey: akey(s.userId, 'sea', `${id}|${cur}`),
    queryFn: ({ signal }) => fetchSeasonalAnomaly(s.client!, id, cur, signal),
  });
  const cmp = useQuery({
    ...base,
    enabled: on && tab === 'compare',
    queryKey: akey(s.userId, 'cmp', `${id}|${cur}`),
    queryFn: ({ signal }) => fetchCompareGbm(s.client!, id, cur, signal),
  });
  if (!s.can(AP.digest) || !s.can(AI_INV)) return <StateView state="denied" message={t('ai.denied')} />;
  const insufficient = (r: string | null) => (
    <Text style={k.warn}>{t('ai.fc.insufficient', { reason: r ?? '-' })}</Text>
  );
  function save() {
    void s.act(
      t('ai.pc.saved'),
      () => saveCompareGbm(s.client!, { product: id, branch: cur }, key.keyFor(`${id}|${cur}`)),
      () => key.reset(),
    );
  }
  return (
    <ScrollView contentContainerStyle={k.page} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ headerShown: true, title: t('nav.aiProductCheck') }} />
      <Text style={k.title}>{t('ai.pc.title')}</Text>
      {s.msg ? <Notice tone="ok" text={s.msg} /> : null}
      {s.failure ? <Notice tone="error" text={s.failure} /> : null}
      {(branches.data ?? []).length > 1 ? (
        <Chips
          options={(branches.data ?? []).map((b) => ({ value: b.id, label: b.name }))}
          value={cur}
          onChange={setBranch}
        />
      ) : null}
      <ProductPicker value={product} onPick={setProduct} />
      {product ? (
        <>
          <Chips
            options={TABS.map((x) => ({ value: x, label: t(`ai.pc.tab.${x}`) }))}
            value={tab}
            onChange={(v) => setTab(v as Tab)}
          />
          {tab === 'explain' ? (
            <Gate q={explain} ns="ai" emptyKey="ai.fc.none" isEmpty={false}>
              {explain.data?.explanation ? (
                <View style={k.card}>
                  <Text style={k.name}>{explain.data.explanation.summary}</Text>
                  {explain.data.explanation.drivers.map((d) => (
                    <Text key={d.name} style={k.sub}>
                      • {d.name}: {d.detail}
                    </Text>
                  ))}
                  {explain.data.explanation.caveats.map((c) => (
                    <Text key={c} style={k.warn}>
                      {c}
                    </Text>
                  ))}
                </View>
              ) : (
                insufficient(explain.data?.reason ?? null)
              )}
            </Gate>
          ) : null}
          {tab === 'accuracy' ? (
            <Gate q={acc} ns="ai" emptyKey="ai.fc.none" isEmpty={false}>
              {acc.data?.accuracy.state === 'OK' ? (
                <View style={k.card}>
                  <Text style={k.ok}>{t('ai.ac.error', { pct: pct(acc.data.accuracy.wape) })}</Text>
                  <Text style={k.sub}>{t('ai.ac.naive', { pct: pct(acc.data.accuracy.naiveWape) })}</Text>
                  <Text style={k.sub}>
                    {acc.data.accuracy.beatsNaive ? t('ai.pc.beatsYes') : t('ai.pc.beatsNo')} ·{' '}
                    {t('ai.pc.folds', { n: acc.data.accuracy.folds })}
                  </Text>
                  {acc.data.accuracy.bias !== null ? (
                    <Text style={k.sub}>
                      {acc.data.accuracy.bias > 0
                        ? t('ai.pc.over', { pct: pct(acc.data.accuracy.bias) })
                        : t('ai.pc.under', { pct: pct(-acc.data.accuracy.bias) })}
                    </Text>
                  ) : null}
                </View>
              ) : (
                insufficient(acc.data?.accuracy.reason ?? null)
              )}
            </Gate>
          ) : null}
          {tab === 'drift' ? (
            <Gate q={drift} ns="ai" emptyKey="ai.fc.none" isEmpty={false}>
              {drift.data?.drift.state === 'OK' ? (
                <View style={k.card}>
                  <Text style={drift.data.drift.drifted ? k.warn : k.ok}>
                    {drift.data.drift.drifted ? t('ai.pc.drifted') : t('ai.pc.steady')}
                  </Text>
                  <Text style={k.sub}>
                    {t('ai.pc.driftNums', {
                      before: pct(drift.data.drift.referenceWape),
                      now: pct(drift.data.drift.recentWape),
                    })}
                  </Text>
                  <Text style={k.sub}>{t('ai.ac.noSwitch')}</Text>
                </View>
              ) : (
                insufficient(drift.data?.drift.reason ?? null)
              )}
            </Gate>
          ) : null}
          {tab === 'seasonal' ? (
            <Gate q={sea} ns="ai" emptyKey="ai.fc.none" isEmpty={false}>
              {sea.data?.state === 'OK' ? (
                <View style={k.card}>
                  <Text style={sea.data.anomaly ? k.warn : k.ok}>
                    {sea.data.anomaly
                      ? sea.data.direction === 'ABOVE'
                        ? t('ai.pc.above')
                        : t('ai.pc.below')
                      : t('ai.pc.normal')}
                  </Text>
                  <Text style={k.sub}>
                    {t('ai.pc.vsLastYear', { now: units(sea.data.current), then: units(sea.data.lastYear) })}
                  </Text>
                  <Text style={k.sub}>{sea.data.detail}</Text>
                </View>
              ) : (
                insufficient(sea.data?.reason ?? null)
              )}
            </Gate>
          ) : null}
          {tab === 'compare' ? (
            <Gate q={cmp} ns="ai" emptyKey="ai.fc.none" isEmpty={false}>
              {cmp.data?.comparison.state === 'OK' ? (
                <View style={k.card}>
                  {cmp.data.comparison.scores.map((sc) => (
                    <Text key={sc.id} style={sc.role === 'CHAMPION' ? k.name : k.sub}>
                      {sc.role === 'CHAMPION' ? t('ai.pc.champion') : t('ai.pc.challenger')}: {sc.label} ·{' '}
                      {pct(sc.wape)}
                    </Text>
                  ))}
                  <Text style={cmp.data.comparison.decision === 'REVIEW_CHALLENGER' ? k.warn : k.ok}>
                    {cmp.data.comparison.decision === 'REVIEW_CHALLENGER'
                      ? t('ai.pc.review')
                      : t('ai.pc.keep')}
                  </Text>
                  <Text style={k.sub}>{cmp.data.comparison.note}</Text>
                  <Text style={k.sub}>{t('ai.ac.noSwitch')}</Text>
                  {s.can(AI_DECIDE) ? (
                    <Button kind="ghost" label={t('ai.pc.save')} disabled={s.busy} onPress={save} />
                  ) : null}
                </View>
              ) : (
                insufficient(cmp.data?.comparison.reason ?? null)
              )}
            </Gate>
          ) : null}
          <Text style={k.sub}>{t('ai.advice')}</Text>
        </>
      ) : null}
    </ScrollView>
  );
}

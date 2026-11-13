import { useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Stack, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@/ui/Button';
import { StateView } from '../stock/StateView';
import { Gate, retryNetworkOnce } from '../purchase/Gate';
import { Chips, Notice, k, useActionKey } from '../purchase/ui';
import { useSal } from '../collections/sal-hook';
import {
  AI_DECIDE,
  AI_INV,
  AI_PUR,
  AP,
  akey,
  fetchBasket,
  fetchBranchRefs,
  proposeBasket,
  type BasketLine,
} from './api';
import { rupee, units } from './fmt';

function Line({ l }: { l: BasketLine }) {
  const { t } = useTranslation();
  const bad = l.status === 'UNFUNDED' || l.status === 'COST_UNKNOWN';
  return (
    <View style={k.card}>
      <Text style={k.name}>{l.skuName}</Text>
      <Text style={bad ? k.warn : k.ok}>
        {t('ai.ro.qty', { n: units(l.fundedQty), want: units(l.quantity) })} · {t(`ai.ro.st.${l.status}`)}
      </Text>
      <Text style={k.sub}>
        {t('ai.ro.cost', { cost: rupee(l.cost), unit: rupee(l.unitCost) })}
        {l.daysOfCover !== null ? ` · ${t('ai.ro.cover', { n: units(l.daysOfCover) })}` : ''}
      </Text>
      {l.supplier.chosen ? (
        <Text style={k.sub}>
          {t('ai.ro.supplier', { name: l.supplier.chosen.supplierName })}
          {l.supplier.chosen.leadDays !== null
            ? ` · ${t('ai.ro.lead', { n: l.supplier.chosen.leadDays })}`
            : ''}
        </Text>
      ) : (
        <Text style={k.sub}>{t('ai.ro.noSupplier', { reason: l.supplier.reason ?? '-' })}</Text>
      )}
      {l.shelf.state === 'TRIMMED' ? <Text style={k.warn}>{l.shelf.note}</Text> : null}
      {l.shortfallQty > 0 ? (
        <Text style={k.warn}>
          {t('ai.ro.short', { n: units(l.shortfallQty), value: rupee(l.shortfallValue) })}
        </Text>
      ) : null}
      {l.note ? <Text style={k.sub}>{l.note}</Text> : null}
    </View>
  );
}

export default function ReorderScreen() {
  const { t } = useTranslation();
  const s = useSal();
  const router = useRouter();
  const key = useActionKey();
  const [branch, setBranch] = useState('');
  const ok = s.ready && s.can(AP.digest) && s.can(AI_INV) && s.can(AI_PUR);
  const branches = useQuery({
    queryKey: akey(s.userId, 'branches'),
    queryFn: ({ signal }) => fetchBranchRefs(s.client!, signal),
    enabled: ok,
    retry: retryNetworkOnce,
  });
  const cur = branch || branches.data?.[0]?.id || '';
  const q = useQuery({
    queryKey: akey(s.userId, 'basket', cur),
    queryFn: ({ signal }) => fetchBasket(s.client!, cur, signal),
    enabled: ok && cur !== '',
    retry: retryNetworkOnce,
  });
  if (!s.can(AP.digest) || !s.can(AI_INV) || !s.can(AI_PUR))
    return <StateView state="denied" message={t('ai.denied')} />;
  const d = q.data;
  function propose() {
    void s.act(
      t('ai.ro.proposed'),
      () => proposeBasket(s.client!, cur, key.keyFor(cur)),
      () => (key.reset(), router.push('/ai-recommendations' as never)),
    );
  }
  return (
    <ScrollView
      contentContainerStyle={k.page}
      refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}
    >
      <Stack.Screen options={{ headerShown: true, title: t('nav.aiReorder') }} />
      <Text style={k.title}>{t('ai.ro.title')}</Text>
      {s.msg ? <Notice tone="ok" text={s.msg} /> : null}
      {s.failure ? <Notice tone="error" text={s.failure} /> : null}
      {(branches.data ?? []).length > 1 ? (
        <Chips
          options={(branches.data ?? []).map((b) => ({ value: b.id, label: b.name }))}
          value={cur}
          onChange={setBranch}
        />
      ) : null}
      <Gate q={q} ns="ai" emptyKey="ai.ro.none" isEmpty={false}>
        {d ? (
          <>
            <View style={k.card}>
              <Text style={k.name}>{t('ai.ro.lines', { n: d.lines.length })}</Text>
              <Text style={k.sub}>
                {t('ai.ro.wanted', { value: rupee(d.basket.wantedValue) })} ·{' '}
                {t('ai.ro.funded', { value: rupee(d.basket.fundedValue) })}
              </Text>
              {d.basket.budget !== null ? (
                <Text style={k.sub}>{t('ai.ro.budget', { value: rupee(d.basket.budget) })}</Text>
              ) : null}
              {d.basket.shortfallValue > 0 ? (
                <Text style={k.warn}>{t('ai.ro.shortAll', { value: rupee(d.basket.shortfallValue) })}</Text>
              ) : null}
              <Text style={k.sub}>{t('ai.ro.noOrder')}</Text>
              <Text style={k.sub}>{t('ai.advice')}</Text>
            </View>
            {s.can(AI_DECIDE) && d.lines.length > 0 ? (
              <Button label={t('ai.ro.propose')} disabled={s.busy} onPress={propose} />
            ) : null}
            {d.lines.length === 0 ? <Text style={k.ok}>{t('ai.ro.none')}</Text> : null}
            {d.lines.map((l) => (
              <Line key={l.skuId} l={l} />
            ))}
            {d.skipped.length > 0 ? (
              <View style={k.card}>
                <Text style={k.name}>{t('ai.ro.skipped')}</Text>
                {d.skipped.map((x) => (
                  <Text key={x.skuId} style={k.sub}>
                    {x.skuName}: {x.reason}
                  </Text>
                ))}
              </View>
            ) : null}
            {d.assumptions.map((a) => (
              <Text key={a} style={k.sub}>
                • {a}
              </Text>
            ))}
          </>
        ) : null}
      </Gate>
    </ScrollView>
  );
}

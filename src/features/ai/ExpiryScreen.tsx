import { useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Stack, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@/ui/Button';
import { colors } from '@/ui/theme';
import { StateView } from '../stock/StateView';
import { Gate, retryNetworkOnce } from '../purchase/Gate';
import { Chips, Notice, k, useActionKey } from '../purchase/ui';
import { useSal } from '../collections/sal-hook';
import {
  AI_DECIDE,
  AI_INV,
  AP,
  akey,
  fetchBranchRefs,
  fetchExpiryPlan,
  proposeExpiry,
  type ExpiryItem,
} from './api';
import { pct, units } from './fmt';

const DAYS = [30, 60, 90, 180];
const tone = (s: ExpiryItem['severity']) =>
  s === 'EXPIRED' || s === 'HIGH' ? colors.danger : s === 'MEDIUM' ? colors.warn : colors.muted;

export default function ExpiryScreen() {
  const { t } = useTranslation();
  const s = useSal();
  const router = useRouter();
  const key = useActionKey();
  const [branch, setBranch] = useState('');
  const [days, setDays] = useState(60);
  const ok = s.ready && s.can(AP.digest) && s.can(AI_INV);
  const branches = useQuery({
    queryKey: akey(s.userId, 'branches'),
    queryFn: ({ signal }) => fetchBranchRefs(s.client!, signal),
    enabled: ok,
    retry: retryNetworkOnce,
  });
  const q = useQuery({
    queryKey: akey(s.userId, 'expiry', `${branch}|${days}`),
    queryFn: ({ signal }) => fetchExpiryPlan(s.client!, { branch, withinDays: days }, signal),
    enabled: ok,
    retry: retryNetworkOnce,
  });
  if (!s.can(AP.digest) || !s.can(AI_INV)) return <StateView state="denied" message={t('ai.denied')} />;
  const d = q.data;
  function propose(it: ExpiryItem, kind: 'discount' | 'transfer' | 'return') {
    void s.act(
      t('ai.ex.proposed'),
      () =>
        proposeExpiry(
          s.client!,
          kind,
          { batch: it.batchId, branch: it.branchId },
          key.keyFor(`${kind}|${it.batchId}|${it.branchId}`),
        ),
      () => (key.reset(), router.push('/ai-recommendations' as never)),
    );
  }
  return (
    <ScrollView
      contentContainerStyle={k.page}
      refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}
    >
      <Stack.Screen options={{ headerShown: true, title: t('nav.aiExpiry') }} />
      <Text style={k.title}>{t('ai.ex.title')}</Text>
      {s.msg ? <Notice tone="ok" text={s.msg} /> : null}
      {s.failure ? <Notice tone="error" text={s.failure} /> : null}
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
      <Chips
        options={DAYS.map((x) => ({ value: String(x), label: t('ai.ex.days', { n: x }) }))}
        value={String(days)}
        onChange={(v) => setDays(Number(v))}
      />
      <Gate q={q} ns="ai" emptyKey="ai.ex.none" isEmpty={false}>
        {d ? (
          <>
            {!d.costKnown ? <Text style={k.warn}>{t('ai.ex.noCost')}</Text> : null}
            <Text style={k.sub}>{t('ai.advice')}</Text>
            {d.items.length === 0 ? <Text style={k.ok}>{t('ai.ex.none')}</Text> : null}
            {d.items.map((it) => {
              const canDiscount = it.action === 'DISCOUNT' && it.discountPct !== null && d.costKnown;
              return (
                <View key={`${it.batchId}-${it.branchId}`} style={k.card}>
                  <Text style={[k.name, { color: tone(it.severity) }]}>
                    {it.skuName} · {it.batchNo}
                  </Text>
                  <Text style={k.sub}>
                    {t('ai.ex.expires', { date: it.expiryDate, n: it.daysLeft })} ·{' '}
                    {t('ai.ex.qty', { n: units(it.qty) })}
                  </Text>
                  <Text style={k.warn}>
                    {t('ai.ex.atRisk', { n: units(it.atRiskQty) })} · {t(`ai.ex.sev.${it.severity}`)}
                  </Text>
                  {it.discountPct !== null ? (
                    <Text style={k.sub}>
                      {t('ai.ex.discount', { pct: units(it.discountPct) })}
                      {it.currentPrice && it.discountedPrice
                        ? ` (${it.currentPrice} → ${it.discountedPrice})`
                        : ''}
                      {it.marginPct !== null
                        ? ` · ${t('ai.ex.margin', { pct: pct(it.marginPct / 100) })}`
                        : ''}
                    </Text>
                  ) : null}
                  {it.locked ? <Text style={k.warn}>{t('ai.ex.locked')}</Text> : null}
                  {it.transfer ? (
                    <Text style={k.sub}>
                      {t('ai.ex.transfer', { to: it.transfer.toBranchName, n: units(it.transfer.quantity) })}
                    </Text>
                  ) : null}
                  {it.purchaseReturn ? (
                    <Text style={k.sub}>
                      {t('ai.ex.return', {
                        n: it.purchaseReturn.quantity,
                        who: it.purchaseReturn.supplierName,
                      })}
                    </Text>
                  ) : null}
                  <Text style={k.sub}>{it.note}</Text>
                  {s.can(AI_DECIDE) ? (
                    <View style={k.row}>
                      {canDiscount && !it.locked ? (
                        <Button
                          kind="ghost"
                          label={t('ai.ex.pDiscount')}
                          disabled={s.busy}
                          onPress={() => propose(it, 'discount')}
                        />
                      ) : null}
                      {it.transfer ? (
                        <Button
                          kind="ghost"
                          label={t('ai.ex.pTransfer')}
                          disabled={s.busy}
                          onPress={() => propose(it, 'transfer')}
                        />
                      ) : null}
                      {it.purchaseReturn ? (
                        <Button
                          kind="ghost"
                          label={t('ai.ex.pReturn')}
                          disabled={s.busy}
                          onPress={() => propose(it, 'return')}
                        />
                      ) : null}
                    </View>
                  ) : null}
                </View>
              );
            })}
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

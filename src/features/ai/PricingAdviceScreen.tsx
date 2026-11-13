import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Stack, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@/ui/Button';
import { formatINR } from '@/money';
import { StateView } from '../stock/StateView';
import { Gate, retryNetworkOnce } from '../purchase/Gate';
import { Chips, Notice, k, useActionKey } from '../purchase/ui';
import { useSal } from '../collections/sal-hook';
import {
  AP,
  akey,
  fetchBranchRefs,
  fetchPriceAdvice,
  proposePriceRevision,
  type PriceAdvice,
  type ProductRef,
} from './api';
import { pct, rupee } from './fmt';
import { ProductPicker } from './ProductPicker';

const NEED = ['pricing.manage', 'inventory.value.view'];

export default function PricingAdviceScreen() {
  const { t } = useTranslation();
  const s = useSal();
  const router = useRouter();
  const key = useActionKey();
  const [product, setProduct] = useState<ProductRef | null>(null);
  const [branch, setBranch] = useState('');
  const allowed = s.can(AP.digest) && NEED.every((p) => s.can(p));
  const branches = useQuery({
    queryKey: akey(s.userId, 'branches'),
    queryFn: ({ signal }) => fetchBranchRefs(s.client!, signal),
    enabled: s.ready && allowed,
    retry: retryNetworkOnce,
  });
  const cur = branch || branches.data?.[0]?.id || '';
  const id = product?.id ?? '';
  const q = useQuery({
    queryKey: akey(s.userId, 'price-advice', `${id}|${cur}`),
    queryFn: ({ signal }) => fetchPriceAdvice(s.client!, id, cur, signal),
    enabled: s.ready && allowed && !!product && cur !== '',
    retry: retryNetworkOnce,
  });
  if (!allowed) return <StateView state="denied" message={t('ai.denied')} />;
  function propose(a: PriceAdvice) {
    const body = { product: id, branch: cur, ...(a.categoryId ? { customerCategory: a.categoryId } : {}) };
    void s.act(
      t('ai.pa.proposed'),
      () => proposePriceRevision(s.client!, body, key.keyFor(JSON.stringify(body))),
      () => (key.reset(), router.push('/ai-recommendations' as never)),
    );
  }
  return (
    <ScrollView contentContainerStyle={k.page} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ headerShown: true, title: t('nav.aiPricing') }} />
      <Text style={k.title}>{t('ai.pa.title')}</Text>
      <Text style={k.sub}>{t('ai.pa.intro')}</Text>
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
        <Gate q={q} ns="ai" emptyKey="ai.pa.none" isEmpty={false}>
          {q.data?.note ? <Text style={k.warn}>{q.data.note}</Text> : null}
          {(q.data?.items ?? []).map((a) => {
            const sg = a.suggestion;
            return (
              <View key={a.categoryId ?? 'default'} style={k.card}>
                <Text style={k.name}>{a.category}</Text>
                <Text style={k.sub}>{t('ai.pa.now', { price: formatINR(a.price) })}</Text>
                {sg.state === 'OK' && sg.suggestedPrice !== null ? (
                  <>
                    <Text style={k.ok}>
                      {t('ai.pa.suggest', { price: rupee(sg.suggestedPrice) })}
                      {sg.suggestedMarginPct !== null
                        ? ` · ${t('ai.ex.margin', { pct: pct(sg.suggestedMarginPct / 100) })}`
                        : ''}
                    </Text>
                    {sg.mustFix ? <Text style={k.warn}>{t('ai.pa.mustFix')}</Text> : null}
                    <Button
                      kind="ghost"
                      label={t('ai.pa.propose')}
                      disabled={s.busy}
                      onPress={() => propose(a)}
                    />
                  </>
                ) : (
                  <Text style={k.sub}>{t('ai.pa.noChange')}</Text>
                )}
                <Text style={k.sub}>{sg.note}</Text>
              </View>
            );
          })}
          {(q.data?.assumptions ?? []).map((a) => (
            <Text key={a} style={k.sub}>
              • {a}
            </Text>
          ))}
          <Text style={k.sub}>{t('ai.advice')}</Text>
        </Gate>
      ) : null}
    </ScrollView>
  );
}

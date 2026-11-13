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
  AI_CUST,
  AP,
  akey,
  fetchBranchRefs,
  fetchMarketingTemplates,
  previewMarketing,
  type MarketingPreview,
  type ProductRef,
} from './api';
import { ProductPicker } from './ProductPicker';

const NEED = [AI_CUST, 'crm.greeting.manage'];

export default function MarketingScreen() {
  const { t } = useTranslation();
  const s = useSal();
  const key = useActionKey();
  const [tpl, setTpl] = useState('');
  const [lang, setLang] = useState('en');
  const [channel, setChannel] = useState('SMS');
  const [branch, setBranch] = useState('');
  const [product, setProduct] = useState<ProductRef | null>(null);
  const [out, setOut] = useState<MarketingPreview | null>(null);
  const allowed = s.can(AP.digest) && NEED.every((p) => s.can(p));
  const on = s.ready && allowed;
  const templates = useQuery({
    queryKey: akey(s.userId, 'mk-templates'),
    queryFn: ({ signal }) => fetchMarketingTemplates(s.client!, signal),
    enabled: on,
    retry: retryNetworkOnce,
  });
  const branches = useQuery({
    queryKey: akey(s.userId, 'branches'),
    queryFn: ({ signal }) => fetchBranchRefs(s.client!, signal),
    enabled: on,
    retry: retryNetworkOnce,
  });
  if (!allowed) return <StateView state="denied" message={t('ai.denied')} />;
  const list = templates.data?.templates ?? [];
  const cur = list.find((x) => x.code === tpl) ?? list[0];
  const br = branch || branches.data?.[0]?.id || '';
  const needsProduct = !!cur?.needs.includes('product');
  const ready = !!cur && br !== '' && (!needsProduct || !!product);
  function make() {
    if (!ready || !cur) return;
    const body = {
      template: cur.code,
      language: lang,
      channel,
      branch: br,
      ...(needsProduct && product ? { product: product.id } : {}),
    };
    void s.act(
      t('ai.mk.done'),
      async () => setOut(await previewMarketing(s.client!, body, key.keyFor(JSON.stringify(body)))),
      () => key.reset(),
    );
  }
  return (
    <ScrollView contentContainerStyle={k.page} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ headerShown: true, title: t('nav.aiMarketing') }} />
      <Text style={k.title}>{t('ai.mk.title')}</Text>
      <Text style={k.sub}>{t('ai.mk.intro')}</Text>
      {s.msg ? <Notice tone="ok" text={s.msg} /> : null}
      {s.failure ? <Notice tone="error" text={s.failure} /> : null}
      <Gate q={templates} ns="ai" emptyKey="ai.mk.none" isEmpty={false}>
        <Chips
          options={list.map((x) => ({ value: x.code, label: x.label }))}
          value={cur?.code ?? ''}
          onChange={(v) => (setTpl(v), setOut(null))}
        />
        <Chips
          options={(templates.data?.languages ?? []).map((l) => ({
            value: l,
            label: t(`ai.mk.lang.${l}`, { defaultValue: l }),
          }))}
          value={lang}
          onChange={(v) => (setLang(v), setOut(null))}
        />
        <Chips
          options={(templates.data?.channels ?? []).map((c) => ({
            value: c.channel,
            label: `${c.channel} (${c.limit})`,
          }))}
          value={channel}
          onChange={(v) => (setChannel(v), setOut(null))}
        />
        {(branches.data ?? []).length > 1 ? (
          <Chips
            options={(branches.data ?? []).map((b) => ({ value: b.id, label: b.name }))}
            value={br}
            onChange={setBranch}
          />
        ) : null}
        {needsProduct ? <ProductPicker value={product} onPick={setProduct} /> : null}
        <Button label={t('ai.mk.make')} disabled={s.busy || !ready} onPress={make} />
        {out ? (
          <View style={k.card}>
            <Text selectable style={k.name}>
              {out.text}
            </Text>
            <Text style={out.length > out.limit ? k.error : k.sub}>
              {t('ai.mk.length', { n: out.length, limit: out.limit })}
            </Text>
            {out.problems.length > 0 ? (
              <Text style={k.error}>{t('ai.mk.problems', { n: out.problems.length })}</Text>
            ) : null}
            {out.notes.map((n) => (
              <Text key={n} style={k.sub}>
                • {n}
              </Text>
            ))}
            <Text style={k.sub}>{t('ai.mk.notSent')}</Text>
          </View>
        ) : null}
        <Text style={k.sub}>{templates.data?.sending}</Text>
      </Gate>
    </ScrollView>
  );
}

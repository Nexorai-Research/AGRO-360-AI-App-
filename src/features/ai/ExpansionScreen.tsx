import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Button } from '@/ui/Button';
import { StateView } from '../stock/StateView';
import { retryNetworkOnce } from '../purchase/Gate';
import { Field, Notice, k, useActionKey } from '../purchase/ui';
import { useSal } from '../collections/sal-hook';
import { AP, akey } from './api';
import {
  deleteExpansion,
  fetchExpansions,
  saveExpansion,
  simulateExpansion,
  type ExpansionInputs,
  type ExpansionResult,
} from './api-g5';
import { rupee } from './fmt';

const NUM = /^\d{1,10}(\.\d{1,2})?$/;
const SIGNED = /^-?\d{1,3}(\.\d{1,2})?$/;

/** Reads the form into the numbers the server needs, or null with the first bad field. */
export function parseForm(f: {
  investment: string;
  fixed: string;
  sales: string;
  ramp: string;
  margin: string;
  wc: string;
}): { ok: true; v: ExpansionInputs } | { ok: false; field: string } {
  if (!NUM.test(f.investment.trim())) return { ok: false, field: 'investment' };
  if (!NUM.test(f.fixed.trim())) return { ok: false, field: 'fixed' };
  if (!NUM.test(f.sales.trim())) return { ok: false, field: 'sales' };
  const ramp = f.ramp.split(',').map((x) => x.trim());
  if (
    ramp.length < 1 ||
    ramp.length > 24 ||
    ramp.some((x) => !/^\d{1,3}(\.\d{1,2})?$/.test(x) || Number(x) > 150)
  )
    return { ok: false, field: 'ramp' };
  if (f.margin.trim() !== '' && (!SIGNED.test(f.margin.trim()) || Math.abs(Number(f.margin)) > 100))
    return { ok: false, field: 'margin' };
  if (!/^\d{1,3}$/.test(f.wc.trim()) || Number(f.wc) > 365) return { ok: false, field: 'wc' };
  return {
    ok: true,
    v: {
      investment: Number(f.investment),
      monthlyFixedCost: Number(f.fixed),
      matureMonthlySales: Number(f.sales),
      rampPct: ramp.map(Number),
      workingCapitalDays: Number(f.wc),
      ...(f.margin.trim() !== '' ? { grossMarginPct: Number(f.margin) } : {}),
    },
  };
}

const month = (t: TFunction, m: number | null) =>
  m === null ? t('ai.ex2.never') : t('ai.ex2.month', { n: m });

export default function ExpansionScreen() {
  const { t } = useTranslation();
  const s = useSal();
  const qc = useQueryClient();
  const kSim = useActionKey();
  const kSave = useActionKey();
  const kDel = useActionKey();
  const [f, setF] = useState({
    investment: '',
    fixed: '',
    sales: '',
    ramp: '30,50,70,100',
    margin: '',
    wc: '30',
  });
  const [name, setName] = useState('');
  const [tried, setTried] = useState(false);
  const [res, setRes] = useState<ExpansionResult | null>(null);
  const on = s.ready && s.can(AP.digest);
  const saved = useQuery({
    queryKey: akey(s.userId, 'expansions'),
    queryFn: ({ signal }) => fetchExpansions(s.client!, signal),
    enabled: on,
    retry: retryNetworkOnce,
  });
  if (!s.can(AP.digest)) return <StateView state="denied" message={t('ai.denied')} />;
  const p = parseForm(f);
  const set = (key: keyof typeof f) => (v: string) => (setF({ ...f, [key]: v }), setRes(null));
  const bad = (field: string) => (tried && !p.ok && p.field === field ? t('ai.ex2.bad') : null);
  function run() {
    setTried(true);
    if (!p.ok) return;
    const body = p.v;
    void s.act(
      t('ai.ex2.done'),
      async () => setRes(await simulateExpansion(s.client!, body, kSim.keyFor(JSON.stringify(body)))),
      () => kSim.reset(),
    );
  }
  function save() {
    if (!p.ok || name.trim().length < 2) return;
    const body = p.v;
    void s.act(
      t('ai.ex2.saved'),
      () => saveExpansion(s.client!, name.trim(), body, kSave.keyFor(`${name}|${JSON.stringify(body)}`)),
      () => (
        kSave.reset(),
        setName(''),
        void qc.invalidateQueries({ queryKey: akey(s.userId, 'expansions') })
      ),
    );
  }
  function remove(id: string) {
    void s.act(
      t('ai.ex2.deleted'),
      () => deleteExpansion(s.client!, id, kDel.keyFor(id)),
      () => (kDel.reset(), void qc.invalidateQueries({ queryKey: akey(s.userId, 'expansions') })),
    );
  }
  const b = res?.base;
  return (
    <ScrollView contentContainerStyle={k.page} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ headerShown: true, title: t('nav.aiExpansion') }} />
      <Text style={k.title}>{t('ai.ex2.title')}</Text>
      <Text style={k.sub}>{t('ai.ex2.intro')}</Text>
      {s.msg ? <Notice tone="ok" text={s.msg} /> : null}
      {s.failure ? <Notice tone="error" text={s.failure} /> : null}
      <Field
        label={t('ai.ex2.investment')}
        value={f.investment}
        onChange={set('investment')}
        keyboard="decimal-pad"
        error={bad('investment')}
      />
      <Field
        label={t('ai.ex2.fixed')}
        value={f.fixed}
        onChange={set('fixed')}
        keyboard="decimal-pad"
        error={bad('fixed')}
      />
      <Field
        label={t('ai.ex2.sales')}
        value={f.sales}
        onChange={set('sales')}
        keyboard="decimal-pad"
        error={bad('sales')}
      />
      <Field label={t('ai.ex2.ramp')} value={f.ramp} onChange={set('ramp')} error={bad('ramp')} />
      <Field
        label={t('ai.ex2.margin')}
        value={f.margin}
        onChange={set('margin')}
        keyboard="decimal-pad"
        error={bad('margin')}
      />
      <Field label={t('ai.ex2.wc')} value={f.wc} onChange={set('wc')} keyboard="numeric" error={bad('wc')} />
      <Button label={t('ai.ex2.run')} disabled={s.busy} onPress={run} />
      {res && b ? (
        <View style={k.card}>
          <Text style={k.warn}>{res.label}</Text>
          <Text style={k.name}>{t('ai.ex2.breakEven', { m: month(t, b.breakEvenMonth) })}</Text>
          <Text style={k.name}>{t('ai.ex2.payback', { m: month(t, b.paybackMonth) })}</Text>
          <Text style={k.sub}>{t('ai.ex2.cash24', { amount: rupee(b.cumulativeCash24) })}</Text>
          <Text style={k.sub}>{t('ai.ex2.peak', { amount: rupee(b.peakFunding) })}</Text>
          {res.sensitivity.map((x) => (
            <Text key={x.label} style={k.sub}>
              {x.label}: {t('ai.ex2.payback', { m: month(t, x.paybackMonth) })}
            </Text>
          ))}
          {res.notes.map((n) => (
            <Text key={n} style={k.sub}>
              • {n}
            </Text>
          ))}
          <Field label={t('ai.ex2.name')} value={name} onChange={setName} />
          <Button
            kind="ghost"
            label={t('ai.ex2.save')}
            disabled={s.busy || name.trim().length < 2}
            onPress={save}
          />
        </View>
      ) : null}
      {(saved.data ?? []).map((x) => (
        <View key={x.id} style={k.card}>
          <Text style={k.name}>{x.name}</Text>
          {x.result ? (
            <Text style={k.sub}>{t('ai.ex2.payback', { m: month(t, x.result.base.paybackMonth) })}</Text>
          ) : null}
          <Button kind="ghost" label={t('ai.ex2.delete')} disabled={s.busy} onPress={() => remove(x.id)} />
        </View>
      ))}
    </ScrollView>
  );
}

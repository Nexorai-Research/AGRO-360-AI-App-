import { useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { formatINR } from '@/money';
import { Button } from '@/ui/Button';
import { StateView } from '../stock/StateView';
import { Gate, retryNetworkOnce } from '../purchase/Gate';
import { Chips, Field, Notice, k, useActionKey } from '../purchase/ui';
import { useSal } from '../collections/sal-hook';
import { XP, fetchAccountRefs, fetchBranchRefs, fetchInter, postInter, xkey } from './fx-api';
import { AccountPicker } from './fx-ui';
import { interBody, interErrors, type InterForm } from './fx-logic';

const empty: InterForm = {
  fromBranch: '',
  toBranch: '',
  cashAccountId: '',
  amount: '',
  date: '',
  description: '',
};

export default function InterScreen() {
  const { t } = useTranslation();
  const s = useSal();
  const key = useActionKey();
  const [f, setF] = useState<InterForm | null>(null);
  const [tried, setTried] = useState(false);
  const ok = s.ready && s.can(XP.view);
  const list = useQuery({
    queryKey: xkey(s.userId, 'inter'),
    queryFn: ({ signal }) => fetchInter(s.client!, signal),
    enabled: ok,
    retry: retryNetworkOnce,
  });
  const branches = useQuery({
    queryKey: xkey(s.userId, 'branches'),
    queryFn: ({ signal }) => fetchBranchRefs(s.client!, signal),
    enabled: ok,
    retry: retryNetworkOnce,
  });
  const accounts = useQuery({
    queryKey: xkey(s.userId, 'accounts'),
    queryFn: ({ signal }) => fetchAccountRefs(s.client!, signal),
    enabled: ok && f !== null,
    retry: retryNetworkOnce,
  });
  if (!s.can(XP.view)) return <StateView state="denied" message={t('fx.denied')} />;
  const name = (id: string) => branches.data?.find((b) => b.id === id)?.name ?? id.slice(0, 8);
  const errs = f ? interErrors(f) : [];
  const set = (p: Partial<InterForm>) => setF((x) => (x ? { ...x, ...p } : x));
  const bo = (b: { id: string; name: string }) => ({ value: b.id, label: b.name });
  function save() {
    if (!f) return;
    setTried(true);
    if (interErrors(f).length > 0) return;
    const body = interBody(f);
    void s.act(
      t('fx.inter.saved'),
      () => postInter(s.client!, body, key.keyFor(JSON.stringify(body))),
      () => (setF(null), setTried(false), key.reset(), void list.refetch()),
    );
  }
  const e = (c: string, m: string) => (tried && errs.includes(c as never) ? t(m) : null);
  return (
    <ScrollView
      contentContainerStyle={k.page}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={() => void list.refetch()} />}
    >
      <Stack.Screen options={{ headerShown: true, title: t('nav.finInter') }} />
      <Text style={k.title}>{t('fx.inter.title')}</Text>
      {s.msg ? <Notice tone="ok" text={s.msg} /> : null}
      {s.failure ? <Notice tone="error" text={s.failure} /> : null}
      {s.can(XP.inter) && !f ? (
        <Button label={t('fx.inter.new')} onPress={() => (key.reset(), setF(empty))} />
      ) : null}
      {f ? (
        <View style={k.card}>
          <Text style={k.sub}>{t('fx.inter.intro')}</Text>
          <Text style={k.label}>{t('fx.inter.from')}</Text>
          <Chips
            options={(branches.data ?? []).map(bo)}
            value={f.fromBranch}
            onChange={(v) => set({ fromBranch: v })}
          />
          {e('from', 'fx.inter.v.from') ? <Text style={k.error}>{t('fx.inter.v.from')}</Text> : null}
          <Text style={k.label}>{t('fx.inter.to')}</Text>
          <Chips
            options={(branches.data ?? []).map(bo)}
            value={f.toBranch}
            onChange={(v) => set({ toBranch: v })}
          />
          {tried && errs.includes('to') ? <Text style={k.error}>{t('fx.inter.v.to')}</Text> : null}
          {tried && errs.includes('same') ? <Text style={k.error}>{t('fx.inter.v.same')}</Text> : null}
          <AccountPicker
            label={t('fx.inter.cash')}
            accounts={(accounts.data ?? []).filter((a) => a.cashBank !== false)}
            value={f.cashAccountId}
            onChange={(v) => set({ cashAccountId: v })}
            error={e('cash', 'fx.inter.v.cash')}
          />
          <Field
            label={t('fx.amount')}
            value={f.amount}
            onChange={(v) => set({ amount: v })}
            keyboard="decimal-pad"
            error={e('amount', 'fx.v.money')}
          />
          <Field
            label={t('fx.inter.date')}
            value={f.date}
            onChange={(v) => set({ date: v })}
            placeholder="YYYY-MM-DD"
            error={e('date', 'fx.v.date')}
          />
          <Field
            label={t('fx.inter.what')}
            value={f.description}
            onChange={(v) => set({ description: v })}
            error={e('what', 'fx.inter.v.what')}
          />
          <View style={k.row}>
            <Button label={t('fx.save')} disabled={s.busy} onPress={save} />
            <Button kind="ghost" label={t('fx.cancel')} onPress={() => (setF(null), setTried(false))} />
          </View>
        </View>
      ) : null}
      <Gate q={list} ns="fx" emptyKey="fx.inter.none" isEmpty={(list.data ?? []).length === 0}>
        {(list.data ?? []).map((x) => (
          <View key={x.id} style={k.card}>
            <Text style={k.name}>
              {x.txnNo} · {formatINR(x.amount)}
            </Text>
            <Text style={k.sub}>
              {x.date} · {name(x.fromBranch)} → {name(x.toBranch)}
            </Text>
            <Text style={k.sub}>{x.description}</Text>
          </View>
        ))}
      </Gate>
    </ScrollView>
  );
}

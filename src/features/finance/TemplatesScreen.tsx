import { useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { formatINR } from '@/money';
import { Button } from '@/ui/Button';
import { StateView } from '../stock/StateView';
import { Gate, retryNetworkOnce } from '../purchase/Gate';
import { Field, Notice, k, useActionKey } from '../purchase/ui';
import { useSal } from '../collections/sal-hook';
import {
  XP,
  createTemplate,
  fetchAccountRefs,
  fetchExpenseReport,
  fetchTemplates,
  generateDrafts,
  setTemplateActive,
  xkey,
} from './fx-api';
import { AccountPicker } from './fx-ui';
import { templateBody, templateErrors, type TemplateForm } from './fx-logic';

const empty = (): TemplateForm => ({
  name: '',
  accountId: '',
  payee: '',
  amount: '',
  dayOfMonth: '1',
  startDate: new Date().toISOString().slice(0, 10),
});

export default function TemplatesScreen() {
  const { t } = useTranslation();
  const s = useSal();
  const key = useActionKey();
  const [f, setF] = useState<TemplateForm | null>(null);
  const [tried, setTried] = useState(false);
  const [rep, setRep] = useState(false);
  const ok = s.ready && s.can(XP.view);
  const list = useQuery({
    queryKey: xkey(s.userId, 'templates'),
    queryFn: ({ signal }) => fetchTemplates(s.client!, signal),
    enabled: ok,
    retry: retryNetworkOnce,
  });
  const accounts = useQuery({
    queryKey: xkey(s.userId, 'accounts'),
    queryFn: ({ signal }) => fetchAccountRefs(s.client!, signal),
    enabled: ok && f !== null,
    retry: retryNetworkOnce,
  });
  const report = useQuery({
    queryKey: xkey(s.userId, 'exprep'),
    queryFn: ({ signal }) => fetchExpenseReport(s.client!, signal),
    enabled: ok && rep && s.can(XP.reports),
    retry: retryNetworkOnce,
  });
  if (!s.can(XP.view)) return <StateView state="denied" message={t('fx.denied')} />;
  const manage = s.can(XP.expCreate);
  const errs = f ? templateErrors(f) : [];
  const set = (p: Partial<TemplateForm>) => setF((x) => (x ? { ...x, ...p } : x));
  const e = (c: string, m: string) => (tried && errs.includes(c as never) ? t(m) : null);
  function save() {
    if (!f) return;
    setTried(true);
    if (templateErrors(f).length > 0) return;
    const body = templateBody(f);
    void s.act(
      t('fx.tpl.saved'),
      () => createTemplate(s.client!, body, key.keyFor(JSON.stringify(body))),
      () => (setF(null), setTried(false), key.reset(), void list.refetch()),
    );
  }
  return (
    <ScrollView
      contentContainerStyle={k.page}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={() => void list.refetch()} />}
    >
      <Stack.Screen options={{ headerShown: true, title: t('nav.finTemplates') }} />
      <Text style={k.title}>{t('fx.tpl.title')}</Text>
      <Text style={k.sub}>{t('fx.tpl.intro')}</Text>
      {s.msg ? <Notice tone="ok" text={s.msg} /> : null}
      {s.failure ? <Notice tone="error" text={s.failure} /> : null}
      {manage && !f ? (
        <View style={k.row}>
          <Button label={t('fx.tpl.add')} onPress={() => (key.reset(), setF(empty()))} />
          <Button
            kind="ghost"
            label={t('fx.tpl.generate')}
            disabled={s.busy}
            onPress={() =>
              void s.act(
                t('fx.tpl.generated'),
                () => generateDrafts(s.client!, key.keyFor('generate')),
                () => (key.reset(), void list.refetch()),
              )
            }
          />
        </View>
      ) : null}
      {f ? (
        <View style={k.card}>
          <Field
            label={t('fx.tpl.name')}
            value={f.name}
            onChange={(v) => set({ name: v })}
            error={e('name', 'fx.tpl.v.name')}
          />
          <AccountPicker
            label={t('fx.tpl.category')}
            accounts={accounts.data ?? []}
            value={f.accountId}
            onChange={(v) => set({ accountId: v })}
            error={e('account', 'fx.tpl.v.account')}
          />
          <Field
            label={t('fx.tpl.payee')}
            value={f.payee}
            onChange={(v) => set({ payee: v })}
            error={e('payee', 'fx.tpl.v.payee')}
          />
          <Field
            label={t('fx.amount')}
            value={f.amount}
            onChange={(v) => set({ amount: v })}
            keyboard="decimal-pad"
            error={e('amount', 'fx.v.money')}
          />
          <Field
            label={t('fx.tpl.day')}
            value={f.dayOfMonth}
            onChange={(v) => set({ dayOfMonth: v })}
            keyboard="numeric"
            error={e('day', 'fx.tpl.v.day')}
          />
          <Field
            label={t('fx.tpl.start')}
            value={f.startDate}
            onChange={(v) => set({ startDate: v })}
            error={e('date', 'fx.v.date')}
          />
          <View style={k.row}>
            <Button label={t('fx.save')} disabled={s.busy} onPress={save} />
            <Button kind="ghost" label={t('fx.cancel')} onPress={() => (setF(null), setTried(false))} />
          </View>
        </View>
      ) : null}
      <Gate q={list} ns="fx" emptyKey="fx.tpl.none" isEmpty={(list.data ?? []).length === 0}>
        {(list.data ?? []).map((x) => (
          <View key={x.id} style={k.card}>
            <Text style={k.name}>
              {x.name} · {formatINR(x.amount)}
            </Text>
            <Text style={k.sub}>
              {x.payee} · {t('fx.tpl.dayNext', { day: x.dayOfMonth, next: x.nextDate })} ·{' '}
              {t(x.active ? 'fx.on' : 'fx.off')}
            </Text>
            {manage ? (
              <Button
                kind="ghost"
                label={`${t(x.active ? 'fx.tpl.switchOff' : 'fx.tpl.switchOn')} ${x.name}`}
                disabled={s.busy}
                onPress={() =>
                  void s.act(
                    t('fx.tpl.toggled'),
                    () =>
                      setTemplateActive(
                        s.client!,
                        x,
                        !x.active,
                        key.keyFor(`${x.id}|${x.version}|${!x.active}`),
                      ),
                    () => (key.reset(), void list.refetch()),
                  )
                }
              />
            ) : null}
          </View>
        ))}
      </Gate>
      {s.can(XP.reports) ? (
        <>
          <Button kind="ghost" label={t('fx.tpl.report')} onPress={() => setRep(!rep)} />
          {rep ? (
            <Gate
              q={report}
              ns="fx"
              emptyKey="fx.tpl.noReport"
              isEmpty={(report.data?.rows ?? []).length === 0}
            >
              <Text style={k.name}>
                {t('fx.tpl.reportRange', { from: report.data?.from, to: report.data?.to })}
              </Text>
              {(report.data?.rows ?? []).map((r) => (
                <View key={r.code} style={k.card}>
                  <Text style={k.name}>
                    {r.code} {r.name}
                  </Text>
                  <Text style={k.sub}>
                    {r.count} · {formatINR(r.amount)} · {t('fx.tpl.gst')} {formatINR(r.tax)}
                  </Text>
                </View>
              ))}
              <Text style={k.name}>
                {t('fx.tpl.total', { amount: formatINR(report.data?.total ?? '0') })}
              </Text>
            </Gate>
          ) : null}
        </>
      ) : null}
    </ScrollView>
  );
}

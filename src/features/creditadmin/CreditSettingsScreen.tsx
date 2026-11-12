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
import { CXPERM, cxkey, fetchSettings, runDailyPass, saveSettings } from './api';
import { buildSettings, settingsErrors, settingsToForm, type SettingsForm } from './logic';

const ONOFF = (t: (k: string) => string) => [
  { value: 'on', label: t('crx.on') },
  { value: 'off', label: t('crx.off') },
];

export default function CreditSettingsScreen() {
  const { t } = useTranslation();
  const s = useSal();
  const key = useActionKey();
  const passKey = useActionKey();
  const [form, setForm] = useState<SettingsForm | null>(null);
  const [tried, setTried] = useState(false);

  const q = useQuery({
    queryKey: cxkey(s.userId, 'settings'),
    queryFn: ({ signal }) => fetchSettings(s.client!, signal),
    enabled: s.ready && s.can(CXPERM.settingsView),
    retry: retryNetworkOnce,
  });
  if (!s.can(CXPERM.settingsView)) return <StateView state="denied" message={t('crx.settings.denied')} />;

  const errs = form ? settingsErrors(form) : [];
  const set = <K extends keyof SettingsForm>(f: K, v: SettingsForm[K]) =>
    setForm((p) => (p ? { ...p, [f]: v } : p));
  const yn = (v: boolean) => t(v ? 'crx.on' : 'crx.off');
  const money = (v: string | null) => (v === null ? t('crx.noLimit') : formatINR(v));

  function save() {
    if (!form || !q.data) return;
    setTried(true);
    if (settingsErrors(form).length > 0) return;
    const body = buildSettings(form);
    void s.act(
      t('crx.settings.saved'),
      () =>
        saveSettings(
          s.client!,
          q.data!.version,
          body,
          key.keyFor(`${q.data!.version}|${JSON.stringify(body)}`),
        ),
      () => {
        setForm(null);
        setTried(false);
        key.reset();
        void q.refetch();
      },
    );
  }
  function runPass() {
    void s.act(
      t('crx.settings.passDone'),
      () => runDailyPass(s.client!, passKey.keyFor('pass')),
      () => passKey.reset(),
    );
  }

  const d = q.data;
  const bad = (e: string) => (tried && errs.includes(e as never) ? t(`crx.settings.v.${e}`) : null);
  return (
    <ScrollView
      contentContainerStyle={k.page}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}
    >
      <Stack.Screen options={{ headerShown: true, title: t('nav.creditSettings') }} />
      <Text style={k.title}>{t('crx.settings.title')}</Text>
      {s.msg ? <Notice tone="ok" text={s.msg} /> : null}
      {s.failure ? <Notice tone="error" text={s.failure} /> : null}
      <Gate q={q} ns="crx.settings" emptyKey="crx.settings.denied" isEmpty={false}>
        {d && !form ? (
          <View style={k.card}>
            <Text style={k.name}>
              {t('crx.settings.interest')}: {yn(d.interestEnabled)}
              {d.interestEnabled
                ? ` · ${t('crx.settings.rateLine', { rate: d.interestRatePa.replace(/\.?0+$/, ''), days: d.interestGraceDays })}`
                : ''}
            </Text>
            <Text style={k.sub}>
              {t('crx.settings.interestFirst')}: {yn(d.interestFirst)}
            </Text>
            <Text style={k.sub}>
              {t('crx.settings.autoHold')}: {yn(d.autoHoldEnabled)}
              {d.autoHoldEnabled
                ? ` · ${d.holdOverdueDays ? t('crx.settings.moreThanDays', { n: d.holdOverdueDays }) : ''} ${d.holdOverdueAmount ? t('crx.settings.moreThanAmount', { amount: formatINR(d.holdOverdueAmount) }) : ''}`
                : ''}
            </Text>
            <Text style={k.sub}>
              {t('crx.settings.holdOnBounce')}: {yn(d.holdOnBounce)}
            </Text>
            <Text style={k.sub}>
              {t('crx.settings.bounceCharge')}: {formatINR(d.bounceCharge)}
            </Text>
            <Text style={k.sub}>
              {t('crx.settings.settlementLimit')}: {money(d.settlementLimit)}
            </Text>
            {s.can(CXPERM.settingsManage) ? (
              <View style={k.row}>
                <Button
                  label={t('crx.settings.change')}
                  onPress={() => (key.reset(), setForm(settingsToForm(d)))}
                />
                <Button kind="ghost" label={t('crx.settings.runPass')} disabled={s.busy} onPress={runPass} />
              </View>
            ) : null}
          </View>
        ) : null}
        {d && form ? (
          <View style={k.card}>
            <Text style={k.sub}>{t('crx.settings.intro')}</Text>
            <Text style={k.label}>{t('crx.settings.interestLabel')}</Text>
            <Chips
              options={ONOFF(t)}
              value={form.interestEnabled ? 'on' : 'off'}
              onChange={(v) => set('interestEnabled', v === 'on')}
            />
            <Field
              label={t('crx.settings.rateLabel')}
              value={form.interestRatePa}
              onChange={(v) => set('interestRatePa', v)}
              keyboard="decimal-pad"
              error={bad('rate')}
            />
            <Field
              label={t('crx.settings.graceLabel')}
              value={form.interestGraceDays}
              onChange={(v) => set('interestGraceDays', v)}
              keyboard="numeric"
              error={bad('grace')}
            />
            <Text style={k.label}>{t('crx.settings.interestFirstLabel')}</Text>
            <Chips
              options={ONOFF(t)}
              value={form.interestFirst ? 'on' : 'off'}
              onChange={(v) => set('interestFirst', v === 'on')}
            />
            <Text style={k.label}>{t('crx.settings.autoHoldLabel')}</Text>
            <Chips
              options={ONOFF(t)}
              value={form.autoHoldEnabled ? 'on' : 'off'}
              onChange={(v) => set('autoHoldEnabled', v === 'on')}
            />
            <Field
              label={t('crx.settings.holdDaysLabel')}
              value={form.holdOverdueDays}
              onChange={(v) => set('holdOverdueDays', v)}
              keyboard="numeric"
              error={bad('holdDays')}
            />
            <Field
              label={t('crx.settings.holdAmountLabel')}
              value={form.holdOverdueAmount}
              onChange={(v) => set('holdOverdueAmount', v)}
              keyboard="decimal-pad"
              error={bad('holdAmount')}
            />
            <Text style={k.label}>{t('crx.settings.holdOnBounceLabel')}</Text>
            <Chips
              options={ONOFF(t)}
              value={form.holdOnBounce ? 'on' : 'off'}
              onChange={(v) => set('holdOnBounce', v === 'on')}
            />
            <Field
              label={t('crx.settings.bounceChargeLabel')}
              value={form.bounceCharge}
              onChange={(v) => set('bounceCharge', v)}
              keyboard="decimal-pad"
              error={bad('bounceCharge')}
            />
            <Field
              label={t('crx.settings.settlementLimitLabel')}
              value={form.settlementLimit}
              onChange={(v) => set('settlementLimit', v)}
              keyboard="decimal-pad"
              error={bad('settlementLimit')}
            />
            <View style={k.row}>
              <Button label={t('crx.save')} disabled={s.busy} onPress={save} />
              <Button kind="ghost" label={t('crx.cancel')} onPress={() => (setForm(null), setTried(false))} />
            </View>
          </View>
        ) : null}
      </Gate>
    </ScrollView>
  );
}

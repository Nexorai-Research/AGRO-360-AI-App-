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
import { XP, fetchFinSettings, saveFinSettings, xkey } from './fx-api';
import { settingsBody, settingsErrors, settingsToForm, type SettingsForm } from './fx-logic';

export default function FinSettingsScreen() {
  const { t } = useTranslation();
  const s = useSal();
  const key = useActionKey();
  const [f, setF] = useState<SettingsForm | null>(null);
  const [tried, setTried] = useState(false);
  const q = useQuery({
    queryKey: xkey(s.userId, 'settings'),
    queryFn: ({ signal }) => fetchFinSettings(s.client!, signal),
    enabled: s.ready && s.can(XP.view),
    retry: retryNetworkOnce,
  });
  if (!s.can(XP.view)) return <StateView state="denied" message={t('fx.denied')} />;
  const errs = f ? settingsErrors(f) : [];
  const set = <K extends keyof SettingsForm>(n: K, v: SettingsForm[K]) =>
    setF((p) => (p ? { ...p, [n]: v } : p));
  const bad = (n: string) => (tried && errs.includes(n as never) ? t('fx.v.moneyOpt') : null);
  function save() {
    if (!f || !q.data) return;
    setTried(true);
    if (settingsErrors(f).length > 0) return;
    const body = settingsBody(f);
    const version = q.data.version;
    void s.act(
      t('fx.settings.saved'),
      () => saveFinSettings(s.client!, version, body, key.keyFor(`${version}|${JSON.stringify(body)}`)),
      () => (setF(null), setTried(false), key.reset(), void q.refetch()),
    );
  }
  const d = q.data;
  const m = (v: string | null) => (v === null ? t('fx.noLimit') : formatINR(v));
  return (
    <ScrollView
      contentContainerStyle={k.page}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}
    >
      <Stack.Screen options={{ headerShown: true, title: t('nav.finSettings') }} />
      <Text style={k.title}>{t('fx.settings.title')}</Text>
      {s.msg ? <Notice tone="ok" text={s.msg} /> : null}
      {s.failure ? <Notice tone="error" text={s.failure} /> : null}
      <Gate q={q} ns="fx" emptyKey="fx.denied" isEmpty={false}>
        {d && !f ? (
          <View style={k.card}>
            <Text style={k.sub}>
              {t('fx.settings.journal')}: {m(d.journalApprovalAmount)}
            </Text>
            <Text style={k.sub}>
              {t('fx.settings.cash')}: {m(d.cashPaymentLimit)}
            </Text>
            <Text style={k.sub}>
              {t('fx.settings.attachment')}: {m(d.attachmentRequiredAbove)}
            </Text>
            <Text style={k.sub}>
              {t('fx.settings.expenseApproval')}: {m(d.expenseApprovalAmount)}
            </Text>
            <Text style={k.sub}>
              {t('fx.settings.basis')}: {t(`fx.settings.basis${d.expenseBasis}`)}
            </Text>
            <Text style={k.sub}>
              {t('fx.settings.costCentre')}: {t(d.requireCostCentre ? 'fx.on' : 'fx.off')}
            </Text>
            {s.can(XP.settings) ? (
              <Button
                label={t('fx.settings.change')}
                onPress={() => (key.reset(), setF(settingsToForm(d)))}
              />
            ) : null}
          </View>
        ) : null}
        {d && f ? (
          <View style={k.card}>
            <Text style={k.sub}>{t('fx.settings.intro')}</Text>
            <Field
              label={t('fx.settings.journal')}
              value={f.journalApprovalAmount}
              onChange={(v) => set('journalApprovalAmount', v)}
              keyboard="decimal-pad"
              error={bad('journalApprovalAmount')}
            />
            <Field
              label={t('fx.settings.cash')}
              value={f.cashPaymentLimit}
              onChange={(v) => set('cashPaymentLimit', v)}
              keyboard="decimal-pad"
              error={bad('cashPaymentLimit')}
            />
            <Field
              label={t('fx.settings.attachment')}
              value={f.attachmentRequiredAbove}
              onChange={(v) => set('attachmentRequiredAbove', v)}
              keyboard="decimal-pad"
              error={bad('attachmentRequiredAbove')}
            />
            <Field
              label={t('fx.settings.expenseApproval')}
              value={f.expenseApprovalAmount}
              onChange={(v) => set('expenseApprovalAmount', v)}
              keyboard="decimal-pad"
              error={bad('expenseApprovalAmount')}
            />
            <Text style={k.label}>{t('fx.settings.basis')}</Text>
            <Chips
              options={[
                { value: 'CASH', label: t('fx.settings.basisCASH') },
                { value: 'ACCRUAL', label: t('fx.settings.basisACCRUAL') },
              ]}
              value={f.expenseBasis}
              onChange={(v) => set('expenseBasis', v as 'CASH' | 'ACCRUAL')}
            />
            <Text style={k.label}>{t('fx.settings.costCentreLabel')}</Text>
            <Chips
              options={[
                { value: 'on', label: t('fx.on') },
                { value: 'off', label: t('fx.off') },
              ]}
              value={f.requireCostCentre ? 'on' : 'off'}
              onChange={(v) => set('requireCostCentre', v === 'on')}
            />
            <View style={k.row}>
              <Button label={t('fx.save')} disabled={s.busy} onPress={save} />
              <Button kind="ghost" label={t('fx.cancel')} onPress={() => (setF(null), setTried(false))} />
            </View>
          </View>
        ) : null}
      </Gate>
    </ScrollView>
  );
}

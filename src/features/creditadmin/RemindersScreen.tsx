import { useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@/ui/Button';
import { StateView } from '../stock/StateView';
import { Gate, retryNetworkOnce } from '../purchase/Gate';
import { Chips, Field, Notice, k, useActionKey } from '../purchase/ui';
import { useSal } from '../collections/sal-hook';
import {
  CXPERM,
  cxkey,
  fetchReminderLog,
  fetchReminderRules,
  runReminders,
  saveReminderRules,
  type ReminderRule,
} from './api';
import { MAX_RULES, buildRule, emptyRule, ruleErrors, ruleToForm, type RuleForm } from './logic';

export default function RemindersScreen() {
  const { t } = useTranslation();
  const s = useSal();
  const key = useActionKey();
  const runKey = useActionKey();
  const [editing, setEditing] = useState<{ index: number | null } | null>(null);
  const [form, setForm] = useState<RuleForm>(emptyRule());
  const [tried, setTried] = useState(false);
  const ok = s.ready && s.can(CXPERM.reminders);

  const rules = useQuery({
    queryKey: cxkey(s.userId, 'rules'),
    queryFn: ({ signal }) => fetchReminderRules(s.client!, signal),
    enabled: ok,
    retry: retryNetworkOnce,
  });
  const log = useQuery({
    queryKey: cxkey(s.userId, 'rem-log'),
    queryFn: ({ signal }) => fetchReminderLog(s.client!, signal),
    enabled: ok,
    retry: retryNetworkOnce,
  });
  if (!s.can(CXPERM.reminders)) return <StateView state="denied" message={t('crx.rem.denied')} />;

  const set = <K extends keyof RuleForm>(f: K, v: RuleForm[K]) => setForm((p) => ({ ...p, [f]: v }));
  const errs = ruleErrors(form);
  const bad = (e: string) => (tried && errs.includes(e as never) ? t(`crx.rem.v.${e}`) : null);

  function close() {
    setEditing(null);
    setForm(emptyRule());
    setTried(false);
    key.reset();
  }
  function persist(next: ReminderRule[], done: string, fp: string) {
    void s.act(done, () => saveReminderRules(s.client!, next, key.keyFor(fp)), close);
  }
  function save() {
    if (!editing || !rules.data) return;
    setTried(true);
    if (ruleErrors(form).length > 0) return;
    const all = rules.data;
    const rule = buildRule(form, editing.index === null ? null : (all[editing.index]?.id ?? null));
    const next =
      editing.index === null ? [...all, rule] : all.map((r, i) => (i === editing.index ? rule : r));
    persist(next, t('crx.rem.saved'), JSON.stringify(next));
  }
  function run() {
    void s.act(
      t('crx.rem.runDone'),
      () => runReminders(s.client!, runKey.keyFor('run')),
      () => runKey.reset(),
    );
  }

  const rows = rules.data ?? [];
  const when = (n: number) =>
    n < 0 ? t('crx.rem.before', { n: -n }) : n === 0 ? t('crx.rem.onDue') : t('crx.rem.after', { n });
  return (
    <ScrollView
      contentContainerStyle={k.page}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={rules.isRefetching}
          onRefresh={() => {
            void rules.refetch();
            void log.refetch();
          }}
        />
      }
    >
      <Stack.Screen options={{ headerShown: true, title: t('nav.creditReminders') }} />
      <Text style={k.title}>{t('crx.rem.title')}</Text>
      {s.msg ? <Notice tone="ok" text={s.msg} /> : null}
      {s.failure ? <Notice tone="error" text={s.failure} /> : null}

      {editing ? (
        <View style={k.card}>
          <Text style={k.sub}>{t('crx.rem.intro')}</Text>
          <Field
            label={t('crx.rem.name')}
            value={form.name}
            onChange={(v) => set('name', v)}
            error={bad('name')}
          />
          <Field
            label={t('crx.rem.offset')}
            value={form.offsetDays}
            onChange={(v) => set('offsetDays', v)}
            keyboard="numeric"
            error={bad('offset')}
          />
          <Chips
            options={[
              { value: 'SMS', label: 'SMS' },
              { value: 'WHATSAPP', label: 'WhatsApp' },
            ]}
            value={form.channel}
            onChange={(v) => set('channel', v as RuleForm['channel'])}
          />
          <Field
            label={t('crx.rem.bodyEn')}
            value={form.bodyEn}
            onChange={(v) => set('bodyEn', v)}
            multiline
            error={bad('bodyEn')}
          />
          <Field
            label={t('crx.rem.bodyHi')}
            value={form.bodyHi}
            onChange={(v) => set('bodyHi', v)}
            multiline
            error={bad('bodyHi')}
          />
          <Field
            label={t('crx.rem.bodyMr')}
            value={form.bodyMr}
            onChange={(v) => set('bodyMr', v)}
            multiline
            error={bad('bodyMr')}
          />
          <Chips
            options={[
              { value: 'on', label: t('crx.on') },
              { value: 'off', label: t('crx.off') },
            ]}
            value={form.active ? 'on' : 'off'}
            onChange={(v) => set('active', v === 'on')}
          />
          <View style={k.row}>
            <Button label={t('crx.save')} disabled={s.busy} onPress={save} />
            <Button kind="ghost" label={t('crx.cancel')} onPress={close} />
          </View>
        </View>
      ) : (
        <View style={k.row}>
          {rows.length < MAX_RULES ? (
            <Button
              label={t('crx.rem.add')}
              onPress={() => (close(), setForm(emptyRule()), setEditing({ index: null }))}
            />
          ) : null}
          <Button kind="ghost" label={t('crx.rem.runNow')} disabled={s.busy} onPress={run} />
        </View>
      )}

      <Gate q={rules} ns="crx.rem" emptyKey="crx.rem.empty" isEmpty={rows.length === 0}>
        {rows.map((r, i) => (
          <View key={r.id ?? i} style={k.card}>
            <Text style={k.name}>{r.name}</Text>
            <Text style={k.sub}>
              {when(r.offsetDays)} · {r.channel === 'SMS' ? 'SMS' : 'WhatsApp'} ·{' '}
              {t(r.active ? 'crx.on' : 'crx.off')}
            </Text>
            <Text style={k.sub}>{r.bodyEn}</Text>
            {!editing ? (
              <Button
                kind="ghost"
                label={`${t('crx.rem.edit')} ${r.name}`}
                onPress={() => (close(), setForm(ruleToForm(r)), setEditing({ index: i }))}
              />
            ) : null}
          </View>
        ))}
      </Gate>

      <Text style={k.h2}>{t('crx.rem.logTitle')}</Text>
      <Gate q={log} ns="crx.rem" emptyKey="crx.rem.logEmpty" isEmpty={(log.data ?? []).length === 0}>
        {(log.data ?? []).map((x) => (
          <View key={x.id} style={k.card}>
            <Text style={k.name}>
              {x.customerName} · {x.ruleName}
            </Text>
            <Text style={k.sub}>
              {x.runDate}
              {x.docNumber ? ` · ${x.docNumber}` : ''} · {x.status}
              {x.message ? ` · ${x.message.status}` : ''}
            </Text>
            {x.reason || x.message?.suppressReason || x.message?.error ? (
              <Text style={k.warn}>{x.reason ?? x.message?.suppressReason ?? x.message?.error}</Text>
            ) : null}
          </View>
        ))}
      </Gate>
    </ScrollView>
  );
}

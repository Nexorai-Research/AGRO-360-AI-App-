import { useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { formatINR } from '@/money';
import { Button } from '@/ui/Button';
import { StateView } from '../stock/StateView';
import { Gate, retryNetworkOnce } from '../purchase/Gate';
import { Chips, Field, Notice, k, useActionKey, useErrorText } from '../purchase/ui';
import { fetchOpenTasks, searchCustomers, type CollectionTask } from './api';
import {
  OUTCOMES,
  XPERM,
  cancelPromise,
  createPromise,
  fetchPromises,
  fetchReceiptList,
  recordOutcome,
  xkey,
  type Outcome,
} from './extras-api';
import { buildOutcome, buildPromise, outcomeErrors, promiseErrors } from './extras-logic';

type Tab = 'tasks' | 'promises' | 'receipts';

export default function FollowUpScreen() {
  const { t } = useTranslation();
  const errText = useErrorText();
  const { me, client } = useAuth();
  const qc = useQueryClient();
  const userId = me?.userId ?? '';
  const can = (p: string) => me?.permissions === undefined || me.permissions.includes(p);
  const ready = client !== null && me !== null;
  const outcomeKey = useActionKey();
  const promiseKey = useActionKey();
  const cancelKey = useActionKey();

  const tabs: { value: Tab; label: string }[] = [
    ...(can(XPERM.tasks) ? [{ value: 'tasks' as Tab, label: t('followup.tabTasks') }] : []),
    ...(can(XPERM.promise) ? [{ value: 'promises' as Tab, label: t('followup.tabPromises') }] : []),
    ...(can(XPERM.receipts) ? [{ value: 'receipts' as Tab, label: t('followup.tabReceipts') }] : []),
  ];
  const [tab, setTab] = useState<Tab | ''>('');
  const shown = (tab || tabs[0]?.value || 'tasks') as Tab;

  // outcome form
  const [taskId, setTaskId] = useState('');
  const [outcome, setOutcome] = useState<Outcome | ''>('');
  const [note, setNote] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState('');
  // new promise form
  const [adding, setAdding] = useState(false);
  const [term, setTerm] = useState('');
  const [customer, setCustomer] = useState<{ id: string; name: string } | null>(null);
  const [pAmount, setPAmount] = useState('');
  const [pDate, setPDate] = useState('');
  const [pNote, setPNote] = useState('');

  const [tried, setTried] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const tasks = useQuery({
    queryKey: xkey(userId, 'tasks'),
    queryFn: ({ signal }) => fetchOpenTasks(client!, signal),
    enabled: ready && shown === 'tasks' && can(XPERM.tasks),
    retry: retryNetworkOnce,
  });
  const promises = useQuery({
    queryKey: xkey(userId, 'promises'),
    queryFn: ({ signal }) => fetchPromises(client!, signal),
    enabled: ready && shown === 'promises' && can(XPERM.promise),
    retry: retryNetworkOnce,
  });
  const receipts = useQuery({
    queryKey: xkey(userId, 'receipts'),
    queryFn: ({ signal }) => fetchReceiptList(client!, signal),
    enabled: ready && shown === 'receipts' && can(XPERM.receipts),
    retry: retryNetworkOnce,
  });
  const found = useQuery({
    queryKey: xkey(userId, 'customers', term),
    queryFn: ({ signal }) => searchCustomers(client!, term, signal),
    enabled: ready && adding && term.trim().length >= 2,
  });

  async function act(done: string, fn: () => Promise<unknown>, after: () => void) {
    if (busy) return;
    setBusy(true);
    setFailure(null);
    setMsg(null);
    try {
      await fn();
      after();
      setTried(false);
      setMsg(done);
      await qc.invalidateQueries({ queryKey: ['followup'] });
      await qc.invalidateQueries({ queryKey: ['collections'] });
    } catch (e) {
      setFailure(errText(e));
    } finally {
      setBusy(false);
    }
  }

  if (tabs.length === 0) return <StateView state="denied" message={t('followup.denied')} />;

  const fields = { note, amount, date };
  const oErr = outcome ? outcomeErrors(outcome, fields) : [];
  const pErr = promiseErrors({ customerId: customer?.id ?? '', amount: pAmount, date: pDate, note: pNote });
  const active = shown === 'tasks' ? tasks : shown === 'promises' ? promises : receipts;

  function saveOutcome(task: CollectionTask) {
    setTried(true);
    if (!outcome || oErr.length > 0) return;
    const body = buildOutcome(outcome, fields);
    void act(
      t('followup.outcomeSaved'),
      () => recordOutcome(client!, task.id, body, outcomeKey.keyFor(`${task.id}|${JSON.stringify(body)}`)),
      () => {
        outcomeKey.reset();
        setTaskId('');
        setOutcome('');
        setNote('');
        setAmount('');
        setDate('');
      },
    );
  }
  function savePromise() {
    setTried(true);
    if (pErr.length > 0 || !customer) return;
    const body = buildPromise({ amount: pAmount, date: pDate, note: pNote });
    void act(
      t('followup.promiseSaved'),
      () => createPromise(client!, customer.id, body, promiseKey.keyFor(`${customer.id}|${JSON.stringify(body)}`)),
      () => {
        promiseKey.reset();
        setAdding(false);
        setCustomer(null);
        setPAmount('');
        setPDate('');
        setPNote('');
        setTerm('');
      },
    );
  }

  return (
    <ScrollView
      contentContainerStyle={k.page}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={active.isRefetching} onRefresh={() => void active.refetch()} />}
    >
      <Stack.Screen options={{ headerShown: true, title: t('nav.followup') }} />
      <Text style={k.title}>{t('followup.title')}</Text>
      <Chips options={tabs} value={shown} onChange={(v) => setTab(v as Tab)} />
      {msg ? <Notice tone="ok" text={msg} /> : null}
      {failure ? <Notice tone="error" text={failure} /> : null}

      {shown === 'tasks' ? (
        <Gate q={tasks} ns="followup" emptyKey="followup.emptyTasks" isEmpty={(tasks.data ?? []).length === 0}>
          {(tasks.data ?? []).map((task) => (
            <View key={task.id} style={k.card}>
              <Text style={k.name}>
                {task.customerName} · {formatINR(task.overdueAmount)}
              </Text>
              <Text style={k.sub}>{[task.village, t('followup.days', { days: task.oldestDays })].filter(Boolean).join(' · ')}</Text>
              {taskId !== task.id ? (
                <Button kind="ghost" label={`${t('followup.record')} ${task.customerName}`} onPress={() => (setTaskId(task.id), setOutcome(''), setTried(false), setMsg(null))} />
              ) : (
                <>
                  <Chips options={OUTCOMES.map((o) => ({ value: o, label: t(`followup.outcome.${o}`) }))} value={outcome} onChange={(v) => setOutcome(v as Outcome)} />
                  {outcome === 'PROMISE' ? (
                    <>
                      <Field label={t('followup.promiseAmount')} value={amount} onChange={setAmount} keyboard="decimal-pad" error={tried && oErr.includes('amount') ? t('followup.v.amount') : null} />
                      <Field label={t('followup.promiseDate')} value={date} onChange={setDate} placeholder="YYYY-MM-DD" error={tried && oErr.includes('date') ? t('followup.v.date') : null} />
                    </>
                  ) : null}
                  {outcome ? (
                    <Field
                      label={t('followup.note')}
                      value={note}
                      onChange={setNote}
                      multiline
                      error={tried && oErr.includes('note') ? t('followup.v.disputeNote') : tried && oErr.includes('noteLong') ? t('followup.v.noteLong') : null}
                    />
                  ) : null}
                  {tried && !outcome ? <Text style={k.error}>{t('followup.v.outcome')}</Text> : null}
                  <Button label={t('followup.saveOutcome')} disabled={busy} onPress={() => saveOutcome(task)} />
                </>
              )}
            </View>
          ))}
        </Gate>
      ) : null}

      {shown === 'promises' ? (
        <>
          {!adding ? <Button label={t('followup.newPromise')} onPress={() => (setAdding(true), setTried(false), setMsg(null))} /> : (
            <View style={k.card}>
              <Field label={t('followup.customer')} value={term} onChange={setTerm} />
              {customer ? <Text style={k.ok}>{t('followup.picked', { name: customer.name })}</Text> : null}
              {(found.data ?? []).map((c) => (
                <Button key={c.id} kind="ghost" label={c.name} onPress={() => (setCustomer({ id: c.id, name: c.name }), setTerm(''))} />
              ))}
              {tried && pErr.includes('customer') ? <Text style={k.error}>{t('followup.v.customer')}</Text> : null}
              <Field label={t('followup.promiseAmount')} value={pAmount} onChange={setPAmount} keyboard="decimal-pad" error={tried && pErr.includes('amount') ? t('followup.v.amount') : null} />
              <Field label={t('followup.promiseDate')} value={pDate} onChange={setPDate} placeholder="YYYY-MM-DD" error={tried && pErr.includes('date') ? t('followup.v.date') : null} />
              <Field label={t('followup.note')} value={pNote} onChange={setPNote} multiline />
              <View style={k.row}>
                <Button label={t('followup.savePromise')} disabled={busy} onPress={savePromise} />
                <Button kind="ghost" label={t('followup.close')} onPress={() => setAdding(false)} />
              </View>
            </View>
          )}
          <Gate q={promises} ns="followup" emptyKey="followup.emptyPromises" isEmpty={(promises.data ?? []).length === 0}>
            {(promises.data ?? []).map((p) => (
              <View key={p.id} style={k.card}>
                <Text style={k.name}>
                  {p.customerName} · {formatINR(p.promisedAmount)}
                </Text>
                <Text style={k.sub}>
                  {t('followup.promiseLine', { date: p.promiseDate, received: formatINR(p.receivedAmount), status: t(`followup.pstatus.${p.status}`, { defaultValue: p.status }) })}
                </Text>
                {p.status === 'PENDING' ? (
                  <Button
                    kind="ghost"
                    label={`${t('followup.cancelPromise')} ${p.customerName}`}
                    disabled={busy}
                    onPress={() =>
                      void act(t('followup.promiseCancelled'), () => cancelPromise(client!, p.id, cancelKey.keyFor(`cancel|${p.id}`)), () => cancelKey.reset())
                    }
                  />
                ) : null}
              </View>
            ))}
          </Gate>
        </>
      ) : null}

      {shown === 'receipts' ? (
        <Gate q={receipts} ns="followup" emptyKey="followup.emptyReceipts" isEmpty={(receipts.data ?? []).length === 0}>
          {(receipts.data ?? []).map((r) => (
            <View key={r.id} style={k.card}>
              <Text style={k.name}>
                {r.number} · {formatINR(r.amount)}
              </Text>
              <Text style={k.sub}>
                {[r.receiptDate, r.modeCode, r.reference, r.status === 'VOID' ? t('followup.void') : null].filter(Boolean).join(' · ')}
              </Text>
            </View>
          ))}
        </Gate>
      ) : null}
    </ScrollView>
  );
}

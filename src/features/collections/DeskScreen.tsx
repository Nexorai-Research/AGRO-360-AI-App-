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
import { fetchPayModes } from '../pos/api';
import { todayIST } from './receipt';
import { searchCustomers } from './api';
import {
  SPERM,
  assignTask,
  decide,
  fetchEfficiency,
  fetchSettlements,
  fetchStaff,
  fetchTeamTasks,
  fetchWriteOffs,
  generateTasks,
  proposeSettlement,
  proposeWriteOff,
  recoverWriteOff,
  skey,
} from './sal-api';
import { recoveryErrors, staffName, validReason, writeOffErrors } from './sal-logic';
import { useSal } from './sal-hook';

type Tab = 'tasks' | 'writeoffs' | 'settlements';

export default function DeskScreen() {
  const { t } = useTranslation();
  const s = useSal();
  const key = useActionKey();
  const tabs: { value: Tab; label: string }[] = [
    ...(s.can(SPERM.assign) ? [{ value: 'tasks' as Tab, label: t('desk.tabTasks') }] : []),
    ...(s.can(SPERM.receivables)
      ? [
          { value: 'writeoffs' as Tab, label: t('desk.tabWriteoffs') },
          { value: 'settlements' as Tab, label: t('desk.tabSettlements') },
        ]
      : []),
  ];
  const [tab, setTab] = useState<Tab | ''>('');
  const shown = (tab || tabs[0]?.value || 'tasks') as Tab;

  const [assigning, setAssigning] = useState<string | null>(null);
  // new proposal (write-off or settlement)
  const [adding, setAdding] = useState(false);
  const [term, setTerm] = useState('');
  const [customer, setCustomer] = useState<{ id: string; name: string } | null>(null);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [evidence, setEvidence] = useState('');
  // decision / recovery on one row
  const [row, setRow] = useState<{ id: string; what: 'approve' | 'reject' | 'recover' } | null>(null);
  const [note, setNote] = useState('');
  const [rAmount, setRAmount] = useState('');
  const [rMode, setRMode] = useState('');
  const [rDate, setRDate] = useState(() => todayIST());
  const [rRef, setRRef] = useState('');
  const [tried, setTried] = useState(false);

  const ready = s.ready && tabs.length > 0;
  const tasks = useQuery({
    queryKey: skey(s.userId, 'desk-tasks'),
    queryFn: ({ signal }) => fetchTeamTasks(s.client!, signal),
    enabled: ready && shown === 'tasks' && s.can(SPERM.assign),
    retry: retryNetworkOnce,
  });
  const eff = useQuery({
    queryKey: skey(s.userId, 'desk-eff'),
    queryFn: ({ signal }) => fetchEfficiency(s.client!, signal),
    enabled: ready && shown === 'tasks' && s.can(SPERM.assign),
    retry: retryNetworkOnce,
  });
  const staff = useQuery({
    queryKey: skey(s.userId, 'staff'),
    queryFn: ({ signal }) => fetchStaff(s.client!, signal),
    enabled: ready && shown === 'tasks' && assigning !== null && s.can(SPERM.assign),
    retry: false,
  });
  const wo = useQuery({
    queryKey: skey(s.userId, 'writeoffs'),
    queryFn: ({ signal }) => fetchWriteOffs(s.client!, signal),
    enabled: ready && shown === 'writeoffs' && s.can(SPERM.receivables),
    retry: retryNetworkOnce,
  });
  const st = useQuery({
    queryKey: skey(s.userId, 'settlements'),
    queryFn: ({ signal }) => fetchSettlements(s.client!, signal),
    enabled: ready && shown === 'settlements' && s.can(SPERM.receivables),
    retry: retryNetworkOnce,
  });
  const modes = useQuery({
    queryKey: skey(s.userId, 'modes'),
    queryFn: ({ signal }) => fetchPayModes(s.client!, signal),
    enabled: ready && row?.what === 'recover',
    retry: false,
  });
  const found = useQuery({
    queryKey: skey(s.userId, 'desk-find', term.trim()),
    queryFn: ({ signal }) => searchCustomers(s.client!, term.trim(), signal),
    enabled: ready && adding && !customer && term.trim().length >= 2,
  });

  if (tabs.length === 0) return <StateView state="denied" message={t('desk.denied')} />;

  const active = shown === 'tasks' ? tasks : shown === 'writeoffs' ? wo : st;
  const woErr = writeOffErrors({ customerId: customer?.id ?? '', amount, reason, evidence });
  const stErr = !customer ? ['customer'] : validReason(reason) ? [] : ['reason'];

  function resetForms() {
    key.reset();
    setAdding(false);
    setCustomer(null);
    setTerm('');
    setAmount('');
    setReason('');
    setEvidence('');
    setRow(null);
    setNote('');
    setRAmount('');
    setRRef('');
    setAssigning(null);
    setTried(false);
  }

  function saveProposal() {
    setTried(true);
    if (!customer) return;
    if (shown === 'writeoffs') {
      if (woErr.length > 0) return;
      const body = {
        customerId: customer.id,
        amount: amount.trim(),
        reason: reason.trim(),
        evidence: evidence.trim(),
      };
      void s.act(
        t('desk.proposed'),
        () => proposeWriteOff(s.client!, body, key.keyFor(`wo|${JSON.stringify(body)}`)),
        resetForms,
      );
    } else {
      if (stErr.length > 0) return;
      const body = { customerId: customer.id, reason: reason.trim() };
      void s.act(
        t('desk.proposed'),
        () => proposeSettlement(s.client!, body, key.keyFor(`st|${JSON.stringify(body)}`)),
        resetForms,
      );
    }
  }
  function decideRow(kind: 'write-offs' | 'settlements', id: string, what: 'approve' | 'reject') {
    void s.act(
      t(what === 'approve' ? 'desk.approved' : 'desk.rejected'),
      () =>
        decide(s.client!, kind, id, what, note.trim(), key.keyFor(`d|${kind}|${id}|${what}|${note.trim()}`)),
      resetForms,
    );
  }
  function recover(id: string) {
    setTried(true);
    if (recoveryErrors({ amount: rAmount, modeCode: rMode, date: rDate }).length > 0) return;
    const body = {
      amount: rAmount.trim(),
      modeCode: rMode,
      recoveryDate: rDate.trim(),
      ...(rRef.trim() ? { reference: rRef.trim() } : {}),
    };
    void s.act(
      t('desk.recovered'),
      () => recoverWriteOff(s.client!, id, body, key.keyFor(`r|${id}|${JSON.stringify(body)}`)),
      resetForms,
    );
  }

  const proposalForm = (
    <View style={k.card}>
      <Field label={t('desk.customer')} value={term} onChange={setTerm} />
      {customer ? <Text style={k.ok}>{t('desk.picked', { name: customer.name })}</Text> : null}
      {!customer
        ? (found.data ?? []).map((c) => (
            <Button
              key={c.id}
              kind="ghost"
              label={c.name}
              onPress={() => (setCustomer({ id: c.id, name: c.name }), setTerm(''))}
            />
          ))
        : null}
      {tried && !customer ? <Text style={k.error}>{t('desk.v.customer')}</Text> : null}
      {shown === 'writeoffs' ? (
        <Field
          label={t('desk.amount')}
          value={amount}
          onChange={setAmount}
          keyboard="decimal-pad"
          error={tried && woErr.includes('amount') ? t('desk.v.amount') : null}
        />
      ) : null}
      <Field
        label={t('desk.reason')}
        value={reason}
        onChange={setReason}
        error={
          tried && (shown === 'writeoffs' ? woErr.includes('reason') : stErr.includes('reason'))
            ? t('desk.v.reason')
            : null
        }
      />
      {shown === 'writeoffs' ? (
        <Field
          label={t('desk.evidence')}
          value={evidence}
          onChange={setEvidence}
          multiline
          error={tried && woErr.includes('evidence') ? t('desk.v.evidence') : null}
        />
      ) : (
        <Text style={k.sub}>{t('desk.settleHint')}</Text>
      )}
      <View style={k.row}>
        <Button label={t('desk.propose')} disabled={s.busy} onPress={saveProposal} />
        <Button kind="ghost" label={t('desk.close')} onPress={resetForms} />
      </View>
    </View>
  );

  const decisionBox = (kind: 'write-offs' | 'settlements', id: string) =>
    row?.id === id && row.what !== 'recover' ? (
      <>
        <Field label={t('desk.note')} value={note} onChange={setNote} />
        <View style={k.row}>
          <Button
            label={t(row.what === 'approve' ? 'desk.approve' : 'desk.reject')}
            disabled={s.busy}
            onPress={() => decideRow(kind, id, row.what as 'approve' | 'reject')}
          />
          <Button kind="ghost" label={t('desk.close')} onPress={resetForms} />
        </View>
      </>
    ) : null;

  return (
    <ScrollView
      contentContainerStyle={k.page}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl refreshing={active.isRefetching} onRefresh={() => void active.refetch()} />
      }
    >
      <Stack.Screen options={{ headerShown: true, title: t('nav.desk') }} />
      <Text style={k.title}>{t('desk.title')}</Text>
      <Chips options={tabs} value={shown} onChange={(v) => (resetForms(), setTab(v as Tab))} />
      {s.msg ? <Notice tone="ok" text={s.msg} /> : null}
      {s.failure ? <Notice tone="error" text={s.failure} /> : null}

      {shown === 'tasks' ? (
        <>
          <Button
            label={t('desk.generate')}
            disabled={s.busy}
            onPress={() =>
              void s.act(
                t('desk.generated'),
                () => generateTasks(s.client!, key.keyFor('generate')),
                () => key.reset(),
              )
            }
          />
          {eff.data ? (
            <View style={k.card}>
              <Text style={k.h2}>{t('desk.efficiency', { from: eff.data.from, to: eff.data.to })}</Text>
              {eff.data.rows.length === 0 ? <Text style={k.sub}>{t('desk.noEfficiency')}</Text> : null}
              {eff.data.rows.map((r) => (
                <Text key={r.assignedTo ?? 'mgr'} style={k.sub}>
                  {t('desk.effLine', {
                    who: r.assignedTo ? r.assignedTo.slice(-6) : t('desk.manager'),
                    done: r.done,
                    open: r.open,
                    paid: r.paid,
                    promise: r.promise,
                    rate: r.resolutionRate,
                  })}
                </Text>
              ))}
            </View>
          ) : null}
          <Gate q={tasks} ns="desk" emptyKey="desk.emptyTasks" isEmpty={(tasks.data ?? []).length === 0}>
            {(tasks.data ?? []).map((task) => (
              <View key={task.id} style={k.card}>
                <Text style={k.name}>
                  {task.customerName} · {formatINR(task.overdueAmount)}
                </Text>
                <Text style={k.sub}>
                  {[
                    task.village,
                    t('desk.days', { days: task.oldestDays }),
                    task.assignedTo
                      ? t('desk.assigned', { who: task.assignedTo.slice(-6) })
                      : t('desk.unassigned'),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
                {assigning !== task.id ? (
                  <Button
                    kind="ghost"
                    label={`${t('desk.assign')} ${task.customerName}`}
                    onPress={() => (resetForms(), setAssigning(task.id))}
                  />
                ) : (
                  <>
                    {staff.isPending && staff.fetchStatus !== 'idle' ? (
                      <Text style={k.sub}>{t('common.loading')}</Text>
                    ) : null}
                    {staff.error ? <Text style={k.warn}>{t('desk.staffUnavailable')}</Text> : null}
                    {(staff.data ?? []).map((u) => (
                      <Button
                        key={u.id}
                        kind="ghost"
                        label={staffName(u)}
                        disabled={s.busy}
                        onPress={() =>
                          void s.act(
                            t('desk.assignedOk'),
                            () => assignTask(s.client!, task.id, u.id, key.keyFor(`as|${task.id}|${u.id}`)),
                            resetForms,
                          )
                        }
                      />
                    ))}
                    <Button
                      kind="ghost"
                      label={t('desk.toManager')}
                      disabled={s.busy}
                      onPress={() =>
                        void s.act(
                          t('desk.assignedOk'),
                          () => assignTask(s.client!, task.id, null, key.keyFor(`as|${task.id}|null`)),
                          resetForms,
                        )
                      }
                    />
                    <Button kind="ghost" label={t('desk.close')} onPress={resetForms} />
                  </>
                )}
              </View>
            ))}
          </Gate>
        </>
      ) : null}

      {shown === 'writeoffs' ? (
        <>
          {s.can(SPERM.writeoff) && !adding ? (
            <Button label={t('desk.newWriteoff')} onPress={() => (resetForms(), setAdding(true))} />
          ) : null}
          {adding ? proposalForm : null}
          {wo.data ? (
            <Text style={k.sub}>
              {t('desk.woTotals', {
                proposed: formatINR(wo.data.totals.proposed),
                approved: formatINR(wo.data.totals.approved),
                recovered: formatINR(wo.data.totals.recovered),
              })}
            </Text>
          ) : null}
          <Gate q={wo} ns="desk" emptyKey="desk.emptyWriteoffs" isEmpty={(wo.data?.items ?? []).length === 0}>
            {(wo.data?.items ?? []).map((w) => (
              <View key={w.id} style={k.card}>
                <Text style={k.name}>
                  {w.number} · {w.customerName} · {formatINR(w.amount)}
                </Text>
                <Text
                  style={k.sub}
                >{`${t(`desk.wstatus.${w.status}`)} · ${w.reason}${Number(w.recovered) > 0 ? ` · ${t('desk.recoveredAmt', { amount: formatINR(w.recovered) })}` : ''}`}</Text>
                {row?.id !== w.id ? (
                  <View style={k.row}>
                    {w.status === 'PROPOSED' && s.can(SPERM.writeoffApprove) ? (
                      <>
                        <Button
                          kind="ghost"
                          label={`${t('desk.approve')} ${w.number}`}
                          onPress={() => (resetForms(), setRow({ id: w.id, what: 'approve' }))}
                        />
                        <Button
                          kind="ghost"
                          label={`${t('desk.reject')} ${w.number}`}
                          onPress={() => (resetForms(), setRow({ id: w.id, what: 'reject' }))}
                        />
                      </>
                    ) : null}
                    {w.status === 'APPROVED' && s.can(SPERM.writeoff) ? (
                      <Button
                        kind="ghost"
                        label={`${t('desk.recover')} ${w.number}`}
                        onPress={() => (resetForms(), setRow({ id: w.id, what: 'recover' }))}
                      />
                    ) : null}
                  </View>
                ) : null}
                {decisionBox('write-offs', w.id)}
                {row?.id === w.id && row.what === 'recover' ? (
                  <>
                    <Field
                      label={t('desk.amount')}
                      value={rAmount}
                      onChange={setRAmount}
                      keyboard="decimal-pad"
                      error={
                        tried &&
                        recoveryErrors({ amount: rAmount, modeCode: rMode, date: rDate }).includes('amount')
                          ? t('desk.v.amount')
                          : null
                      }
                    />
                    <Chips
                      options={(modes.data ?? [])
                        .filter((m) => m.code !== 'CREDIT')
                        .map((m) => ({ value: m.code, label: m.code }))}
                      value={rMode}
                      onChange={setRMode}
                    />
                    {tried && !rMode ? <Text style={k.error}>{t('desk.v.mode')}</Text> : null}
                    <Field
                      label={t('desk.recoveryDate')}
                      value={rDate}
                      onChange={setRDate}
                      placeholder="YYYY-MM-DD"
                      error={
                        tried &&
                        recoveryErrors({ amount: rAmount, modeCode: rMode, date: rDate }).includes('date')
                          ? t('desk.v.date')
                          : null
                      }
                    />
                    <Field label={t('desk.reference')} value={rRef} onChange={setRRef} />
                    <View style={k.row}>
                      <Button label={t('desk.recover')} disabled={s.busy} onPress={() => recover(w.id)} />
                      <Button kind="ghost" label={t('desk.close')} onPress={resetForms} />
                    </View>
                  </>
                ) : null}
              </View>
            ))}
          </Gate>
        </>
      ) : null}

      {shown === 'settlements' ? (
        <>
          {s.can(SPERM.settlement) && !adding ? (
            <Button label={t('desk.newSettlement')} onPress={() => (resetForms(), setAdding(true))} />
          ) : null}
          {adding ? proposalForm : null}
          <Gate q={st} ns="desk" emptyKey="desk.emptySettlements" isEmpty={(st.data ?? []).length === 0}>
            {(st.data ?? []).map((x) => (
              <View key={x.id} style={k.card}>
                <Text style={k.name}>
                  {x.number} · {x.customerName} · {formatINR(x.discount)}
                </Text>
                <Text style={k.sub}>{`${t(`desk.sstatus.${x.status}`)} · ${x.reason}`}</Text>
                {x.status === 'PENDING' && s.can(SPERM.settlement) && row?.id !== x.id ? (
                  <View style={k.row}>
                    <Button
                      kind="ghost"
                      label={`${t('desk.approve')} ${x.number}`}
                      onPress={() => (resetForms(), setRow({ id: x.id, what: 'approve' }))}
                    />
                    <Button
                      kind="ghost"
                      label={`${t('desk.reject')} ${x.number}`}
                      onPress={() => (resetForms(), setRow({ id: x.id, what: 'reject' }))}
                    />
                  </View>
                ) : null}
                {decisionBox('settlements', x.id)}
              </View>
            ))}
          </Gate>
        </>
      ) : null}
    </ScrollView>
  );
}

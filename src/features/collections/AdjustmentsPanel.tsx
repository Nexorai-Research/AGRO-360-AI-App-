import { useState } from 'react';
import { Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { formatINR } from '@/money';
import { Button } from '@/ui/Button';
import { Gate, retryNetworkOnce } from '../purchase/Gate';
import { Chips, Field, k, useActionKey } from '../purchase/ui';
import { fetchBranches, searchCustomers } from './api';
import {
  ACCOUNTS,
  ADJ_PERM,
  adjustmentBody,
  adjustmentErrors,
  fetchAdjustments,
  postAdjustment,
  type AdjKind,
  type AdjustmentForm,
} from './adjust-api';
import { todayIST } from './receipt';
import { skey } from './sal-api';
import type { useSal } from './sal-hook';

const empty = (): AdjustmentForm => ({
  customerId: '',
  branchId: '',
  kind: 'CREDIT',
  amount: '',
  accountCode: ACCOUNTS.CREDIT[0]!,
  adjustmentDate: todayIST(),
  reason: '',
});

/** Customer credit / debit adjustments: the list, and a new one with one key per form (a retry posts once). */
export function AdjustmentsPanel({ s }: { s: ReturnType<typeof useSal> }) {
  const { t } = useTranslation();
  const key = useActionKey();
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState<AdjustmentForm>(empty());
  const [term, setTerm] = useState('');
  const [picked, setPicked] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const [posted, setPosted] = useState<string | null>(null);
  const list = useQuery({
    queryKey: skey(s.userId, 'adjustments'),
    queryFn: ({ signal }) => fetchAdjustments(s.client!, signal),
    enabled: s.ready,
    retry: retryNetworkOnce,
  });
  const branches = useQuery({
    queryKey: skey(s.userId, 'adj-branches'),
    queryFn: ({ signal }) => fetchBranches(s.client!, signal),
    enabled: s.ready && adding,
    retry: retryNetworkOnce,
  });
  const found = useQuery({
    queryKey: skey(s.userId, 'adj-find', term.trim()),
    queryFn: ({ signal }) => searchCustomers(s.client!, term.trim(), signal),
    enabled: s.ready && adding && !f.customerId && term.trim().length >= 2,
  });
  const errs = adjustmentErrors(f);
  const bad = (e: string) => (tried && errs.includes(e as never) ? t(`wp1.adj.v.${e}`) : null);
  const close = () => (
    setAdding(false),
    setF(empty()),
    setPicked(null),
    setTerm(''),
    setTried(false),
    key.reset()
  );
  const setKind = (kind: AdjKind) => setF({ ...f, kind, accountCode: ACCOUNTS[kind][0]! });

  function save() {
    setTried(true);
    if (adjustmentErrors(f).length > 0) return;
    const body = adjustmentBody(f);
    setPosted(null);
    void s.act(
      t('wp1.adj.posted'),
      async () => {
        const r = await postAdjustment(s.client!, body, key.keyFor(JSON.stringify(body)));
        setPosted(t('wp1.adj.postedOne', { number: r.number, amount: formatINR(r.amount) }));
      },
      close,
    );
  }

  return (
    <>
      <Text style={k.sub}>{t('wp1.adj.intro')}</Text>
      {posted ? <Text style={k.ok}>{posted}</Text> : null}
      {s.can(ADJ_PERM.post) && !adding ? (
        <Button label={t('wp1.adj.new')} onPress={() => (key.reset(), setAdding(true))} />
      ) : null}
      {adding ? (
        <View style={k.card}>
          <Field label={t('desk.customer')} value={term} onChange={setTerm} />
          {picked ? <Text style={k.ok}>{t('desk.picked', { name: picked })}</Text> : null}
          {!f.customerId
            ? (found.data ?? []).map((c) => (
                <Button
                  key={c.id}
                  kind="ghost"
                  label={c.name}
                  onPress={() => (setF({ ...f, customerId: c.id }), setPicked(c.name), setTerm(''))}
                />
              ))
            : null}
          {bad('customer') ? <Text style={k.error}>{bad('customer')}</Text> : null}
          <Text style={k.sub}>{t('wp1.adj.branch')}</Text>
          {branches.data ? (
            <Chips
              options={branches.data.map((b) => ({ value: b.id, label: b.name }))}
              value={f.branchId}
              onChange={(v) => setF({ ...f, branchId: v })}
            />
          ) : null}
          {bad('branch') ? <Text style={k.error}>{bad('branch')}</Text> : null}
          <Text style={k.sub}>{t('wp1.adj.kind')}</Text>
          <Chips
            options={[
              { value: 'CREDIT', label: t('wp1.adj.credit') },
              { value: 'DEBIT', label: t('wp1.adj.debit') },
            ]}
            value={f.kind}
            onChange={(v) => setKind(v as AdjKind)}
          />
          <Field
            label={t('wp1.adj.amount')}
            value={f.amount}
            onChange={(v) => setF({ ...f, amount: v })}
            keyboard="decimal-pad"
            error={bad('amount')}
          />
          <Text style={k.sub}>{t('wp1.adj.account')}</Text>
          <Chips
            options={ACCOUNTS[f.kind].map((a) => ({ value: a, label: `${a} - ${t(`wp1.adj.acc.${a}`)}` }))}
            value={f.accountCode}
            onChange={(v) => setF({ ...f, accountCode: v })}
          />
          <Field
            label={t('wp1.adj.date')}
            value={f.adjustmentDate}
            onChange={(v) => setF({ ...f, adjustmentDate: v })}
            placeholder="YYYY-MM-DD"
            error={bad('date')}
          />
          <Field
            label={t('wp1.adj.reason')}
            value={f.reason}
            onChange={(v) => setF({ ...f, reason: v })}
            multiline
            error={bad('reason')}
          />
          <View style={k.row}>
            <Button label={t('wp1.adj.post')} disabled={s.busy} onPress={save} />
            <Button kind="ghost" label={t('desk.close')} onPress={close} />
          </View>
        </View>
      ) : null}
      <Gate q={list} ns="desk" emptyKey="wp1.adj.none" isEmpty={(list.data ?? []).length === 0}>
        {(list.data ?? []).map((a) => (
          <View key={a.id} style={k.card}>
            <Text style={k.name}>
              {a.number} · {t(a.kind === 'CREDIT' ? 'wp1.adj.credit' : 'wp1.adj.debit')}
            </Text>
            <Text style={k.sub}>
              {[a.customerName, a.adjustmentDate, formatINR(a.amount), a.accountCode]
                .filter(Boolean)
                .join(' · ')}
            </Text>
            <Text style={k.sub}>{a.reason}</Text>
          </View>
        ))}
      </Gate>
    </>
  );
}

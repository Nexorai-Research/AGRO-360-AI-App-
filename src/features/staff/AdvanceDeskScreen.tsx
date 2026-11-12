import { useState } from 'react';
import { Text } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Decimal } from 'decimal.js';
import { useAuth } from '@/auth/AuthProvider';
import { dec, formatINR } from '@/money';
import { Button } from '@/ui/Button';
import { todayIST } from '../collections/receipt';
import { StateView } from '../stock/StateView';
import { checkAmount, checkInstallments, isDate, isPeriod, shortDate, type AmountError } from '../hr/logic';
import { P, fetchAdvanceDesk, fetchAdvanceLedger, fetchEmployees, stfKey, type AdvanceRow } from './api';
import { Banner, Card, Chips, Field, Gate, Line, Screen, isNetwork, kit, useCan, useWrite } from './ui';

type Write = ReturnType<typeof useWrite>;
const AMOUNT_KEY: Record<AmountError, string> = {
  required: 'advances.amountRequired',
  format: 'advances.amountFormat',
  zero: 'advances.amountZero',
  max: 'advances.amountMax',
};

export default function AdvanceDeskScreen() {
  const { t } = useTranslation();
  const { me, client } = useAuth();
  const can = useCan();
  const qc = useQueryClient();
  const userId = me?.userId ?? '';
  const allowed = can(P.advance);
  const ready = client !== null && me !== null && allowed;
  const [form, setForm] = useState(false);
  const [repay, setRepay] = useState<AdvanceRow | null>(null);
  const [ledger, setLedger] = useState<string | null>(null);
  const w = useWrite();
  const refresh = () => void qc.invalidateQueries({ queryKey: ['stf', userId, 'advances'] });

  const list = useQuery({
    queryKey: stfKey(userId, 'advances'),
    queryFn: ({ signal }) => fetchAdvanceDesk(client!, signal),
    enabled: ready,
    retry: (n, e) => isNetwork(e) && n < 1,
  });

  return (
    <Screen title={t('stf.adv.title')}>
      <Gate query={list} denied={!allowed} deniedText={t('stf.denied')} offlineText={t('stf.offline')}>
        <Banner w={w} />
        {list.data ? (
          <Card>
            <Line label={t('advances.open')} value={String(list.data.summary.openCount)} />
            <Line label={t('advances.outstanding')} value={formatINR(list.data.summary.outstanding)} strong />
          </Card>
        ) : null}
        <Text style={kit.sub}>{t('stf.adv.note')}</Text>
        {form ? (
          <NewAdvance w={w} onDone={() => (setForm(false), refresh())} onCancel={() => setForm(false)} />
        ) : (
          <Button label={t('stf.adv.new')} onPress={() => (w.clear(), w.newAction(), setForm(true))} />
        )}
        {repay ? (
          <RepayForm
            a={repay}
            w={w}
            onDone={() => (setRepay(null), refresh())}
            onCancel={() => setRepay(null)}
          />
        ) : null}
        {(list.data?.items ?? []).length === 0 ? (
          <StateView state="empty" message={t('advances.empty')} />
        ) : null}
        {(list.data?.items ?? []).map((a) => (
          <Card key={a.id}>
            <Text style={kit.name}>
              {a.advanceNo} · {a.employeeName}
            </Text>
            <Line label={t('stf.amount')} value={formatINR(a.amount)} strong />
            <Line label={t('advances.recovered')} value={formatINR(a.recovered)} />
            <Line label={t('advances.balance')} value={formatINR(a.balance)} />
            <Text style={kit.sub}>
              {t('advances.plan', {
                count: a.installments,
                amount: formatINR(a.installmentAmount),
                from: a.startPeriod,
              })}{' '}
              · {shortDate(a.issuedOn)}
            </Text>
            <Text style={kit.sub}>{t(`stf.adv.st_${a.status}`, { defaultValue: a.status })}</Text>
            {a.status === 'PENDING' && can(P.approve) ? (
              <Button
                label={t('stf.adv.approve')}
                disabled={w.busy}
                onPress={() =>
                  void w.send('POST', `/hr/advances/${a.id}/approve`, {}, t('stf.adv.approved'), refresh)
                }
              />
            ) : null}
            {a.status === 'PENDING' ? (
              <Button
                kind="ghost"
                label={t('stf.cancel')}
                disabled={w.busy}
                onPress={() =>
                  void w.send(
                    'POST',
                    `/hr/advances/${a.id}/cancel`,
                    undefined,
                    t('stf.adv.cancelled'),
                    refresh,
                  )
                }
              />
            ) : null}
            {a.status === 'OPEN' || a.status === 'RECOVERING' ? (
              <Button kind="ghost" label={t('stf.adv.repay')} onPress={() => (w.clear(), setRepay(a))} />
            ) : null}
            <Button
              kind="ghost"
              label={ledger === a.id ? t('stf.adv.hideLedger') : t('stf.adv.ledger')}
              onPress={() => setLedger(ledger === a.id ? null : a.id)}
            />
            {ledger === a.id ? <Ledger id={a.id} /> : null}
          </Card>
        ))}
      </Gate>
    </Screen>
  );
}

function Ledger({ id }: { id: string }) {
  const { t } = useTranslation();
  const { me, client } = useAuth();
  const q = useQuery({
    queryKey: stfKey(me?.userId ?? '', 'advance-ledger', id),
    queryFn: ({ signal }) => fetchAdvanceLedger(client!, id, signal),
    enabled: client !== null,
  });
  return (
    <Gate query={q} denied={false} deniedText={t('stf.denied')} offlineText={t('stf.offline')}>
      {(q.data?.recoveries ?? []).length === 0 ? (
        <Text style={kit.sub}>{t('stf.adv.noRecoveries')}</Text>
      ) : null}
      {(q.data?.recoveries ?? []).map((r) => (
        <Line key={r.id} label={`${shortDate(r.recoveredOn)} · ${r.kind}`} value={formatINR(r.amount)} />
      ))}
    </Gate>
  );
}

function RepayForm({
  a,
  w,
  onDone,
  onCancel,
}: {
  a: AdvanceRow;
  w: Write;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayIST());
  const err = amount === '' ? null : checkAmount(amount);
  const over = err === null && amount !== '' && dec(amount.trim()).gt(a.balance);
  const valid = amount !== '' && err === null && !over && isDate(date) && date <= todayIST();
  return (
    <Card>
      <Text style={kit.name}>{t('stf.adv.repayTitle', { no: a.advanceNo })}</Text>
      <Text style={kit.sub}>{t('stf.adv.repayNote', { balance: formatINR(a.balance) })}</Text>
      <Field
        label={t('stf.adv.received')}
        value={amount}
        onChange={setAmount}
        keyboard="decimal-pad"
        error={err ? t(AMOUNT_KEY[err]) : over ? t('stf.adv.overBalance') : null}
      />
      <Field
        label={t('stf.date')}
        value={date}
        onChange={setDate}
        placeholder="YYYY-MM-DD"
        error={!isDate(date) || date > todayIST() ? t('stf.att.badDate') : null}
      />
      <Button
        label={t('stf.adv.record')}
        disabled={w.busy || !valid}
        onPress={() =>
          void w.send(
            'POST',
            `/hr/advances/${a.id}/repay`,
            { amount: dec(amount.trim()).toFixed(2), date: date.trim() },
            t('stf.adv.repaid'),
            onDone,
          )
        }
      />
      <Button kind="ghost" label={t('stf.cancel')} onPress={onCancel} />
    </Card>
  );
}

function NewAdvance({ w, onDone, onCancel }: { w: Write; onDone: () => void; onCancel: () => void }) {
  const { t } = useTranslation();
  const { me, client } = useAuth();
  const [q, setQ] = useState('');
  const [emp, setEmp] = useState('');
  const [amount, setAmount] = useState('');
  const [count, setCount] = useState('1');
  const [start, setStart] = useState(todayIST().slice(0, 7));
  const [reason, setReason] = useState('');
  const list = useQuery({
    queryKey: stfKey(me?.userId ?? '', 'adv-emps'),
    queryFn: ({ signal }) => fetchEmployees(client!, { status: 'ACTIVE' }, signal),
    enabled: client !== null,
    staleTime: 5 * 60_000,
  });
  const shown = (list.data?.items ?? [])
    .filter((e) => `${e.code} ${e.name}`.toLowerCase().includes(q.trim().toLowerCase()))
    .slice(0, 8);
  const err = amount === '' ? null : checkAmount(amount);
  const valid = emp !== '' && amount !== '' && err === null && checkInstallments(count) && isPeriod(start);
  const per = valid ? dec(amount.trim()).div(count.trim()).toFixed(2, Decimal.ROUND_UP) : null;
  return (
    <Card>
      <Field label={t('stf.emp.search')} value={q} onChange={setQ} />
      {list.error ? <Text style={kit.sub}>{t('stf.sal.noEmployees')}</Text> : null}
      <Chips
        label={t('stf.sal.employee')}
        options={shown.map((e) => ({ id: e.id, label: `${e.code} ${e.name}` }))}
        value={emp}
        onChange={setEmp}
      />
      <Field
        label={t('advances.amount')}
        value={amount}
        onChange={setAmount}
        keyboard="decimal-pad"
        error={err ? t(AMOUNT_KEY[err]) : null}
      />
      <Field
        label={t('advances.installments')}
        value={count}
        onChange={setCount}
        keyboard="number-pad"
        error={count !== '' && !checkInstallments(count) ? t('advances.badInstallments') : null}
      />
      <Field
        label={t('advances.startPeriod')}
        value={start}
        onChange={setStart}
        placeholder="YYYY-MM"
        error={start !== '' && !isPeriod(start) ? t('advances.badPeriod') : null}
      />
      <Field label={t('advances.reason')} value={reason} onChange={setReason} />
      {per ? <Text style={kit.sub}>{t('advances.perInstallment', { amount: formatINR(per) })}</Text> : null}
      <Button
        label={t('advances.submit')}
        disabled={w.busy || !valid}
        onPress={() =>
          void w.send(
            'POST',
            '/hr/advances',
            {
              employeeId: emp,
              amount: dec(amount.trim()).toFixed(2),
              installments: Number(count),
              startPeriod: start.trim(),
              ...(reason.trim() ? { reason: reason.trim() } : {}),
            },
            t('advances.requested'),
            onDone,
          )
        }
      />
      <Button kind="ghost" label={t('stf.cancel')} onPress={onCancel} />
    </Card>
  );
}

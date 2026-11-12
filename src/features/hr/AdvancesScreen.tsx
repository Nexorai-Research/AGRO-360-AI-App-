import { useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Decimal } from 'decimal.js';
import { useAuth } from '@/auth/AuthProvider';
import { dec, formatINR } from '@/money';
import { Button } from '@/ui/Button';
import { todayIST } from '../collections/receipt';
import { StateView } from '../stock/StateView';
import { HR_PERM, fetchAdvances, fetchMe, hrKey, requestAdvance } from './api';
import { Card, Field, Gate, Line, Notice, isNetwork, kit, useAction, useActionKey, useCan } from './kit';
import { checkAmount, checkInstallments, isPeriod, shortDate, type AmountError } from './logic';

const AMOUNT_KEY: Record<AmountError, string> = {
  required: 'advances.amountRequired',
  format: 'advances.amountFormat',
  zero: 'advances.amountZero',
  max: 'advances.amountMax',
};

export default function AdvancesScreen() {
  const { t } = useTranslation();
  const { me, client } = useAuth();
  const can = useCan();
  const qc = useQueryClient();
  const userId = me?.userId ?? '';
  const allowed = can(HR_PERM.advance);
  const ready = client !== null && me !== null && allowed;

  const [form, setForm] = useState(false);
  const [amount, setAmount] = useState('');
  const [count, setCount] = useState('1');
  const [start, setStart] = useState(todayIST().slice(0, 7));
  const [reason, setReason] = useState('');

  const keys = useActionKey();
  const act = useAction(keys);
  const retry = (n: number, e: unknown) => isNetwork(e) && n < 1;

  const list = useQuery({
    queryKey: hrKey(userId, 'advances'),
    queryFn: ({ signal }) => fetchAdvances(client!, signal),
    enabled: ready,
    retry,
  });
  const emp = useQuery({
    queryKey: hrKey(userId, 'me'),
    queryFn: ({ signal }) => fetchMe(client!, signal),
    enabled: ready && form,
    staleTime: 10 * 60_000,
  });

  const amountErr = amount === '' ? null : checkAmount(amount);
  const valid =
    checkAmount(amount) === null && checkInstallments(count) && isPeriod(start) && emp.data !== undefined;
  const per = valid ? dec(amount.trim()).div(count.trim()).toFixed(2, Decimal.ROUND_UP) : null;

  const send = () => {
    const body = {
      employeeId: emp.data!.id,
      amount: dec(amount.trim()).toFixed(2),
      installments: Number(count),
      startPeriod: start.trim(),
      ...(reason.trim() ? { reason: reason.trim() } : {}),
    };
    return act.run(
      () => requestAdvance(client!, body, keys.keyFor(JSON.stringify(body))),
      t('advances.requested'),
      () => {
        setForm(false);
        setAmount('');
        setReason('');
        void qc.invalidateQueries({ queryKey: ['hr', userId, 'advances'] });
      },
    );
  };

  const items = list.data?.items ?? [];
  return (
    <ScrollView contentContainerStyle={kit.page} keyboardShouldPersistTaps="handled">
      <Text style={kit.title} accessibilityRole="header">
        {t('advances.title')}
      </Text>
      <Gate
        query={list}
        denied={!allowed}
        deniedText={t('advances.denied')}
        offlineText={t('advances.offline')}
      >
        {act.msg ? <Notice tone="ok" text={act.msg} /> : null}
        {act.failure ? <Notice tone="error" text={act.failure} /> : null}
        {list.data ? (
          <Card>
            <Line label={t('advances.open')} value={String(list.data.summary.openCount)} />
            <Line label={t('advances.outstanding')} value={formatINR(list.data.summary.outstanding)} strong />
          </Card>
        ) : null}

        {form ? (
          <Card>
            {emp.isPending ? <StateView state="loading" /> : null}
            {emp.error ? <Notice tone="error" text={t('advances.noEmployee')} /> : null}
            <Field
              label={t('advances.amount')}
              value={amount}
              onChange={setAmount}
              keyboard="decimal-pad"
              error={amountErr ? t(AMOUNT_KEY[amountErr]) : null}
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
            {per ? (
              <Text style={kit.sub}>{t('advances.perInstallment', { amount: formatINR(per) })}</Text>
            ) : null}
            <Button label={t('advances.submit')} disabled={act.busy || !valid} onPress={() => void send()} />
            <Button kind="ghost" label={t('advances.close')} onPress={() => setForm(false)} />
          </Card>
        ) : (
          <Button label={t('advances.request')} onPress={() => (act.clear(), keys.reset(), setForm(true))} />
        )}

        {items.length === 0 ? <StateView state="empty" message={t('advances.empty')} /> : null}
        {items.map((a) => (
          <Card key={a.id}>
            <Text style={kit.name}>
              {a.advanceNo} · {formatINR(a.amount)}
            </Text>
            <Text style={kit.sub}>{a.employeeName}</Text>
            <Line label={t('advances.recovered')} value={formatINR(a.recovered)} />
            <Line label={t('advances.balance')} value={formatINR(a.balance)} strong />
            <Text style={kit.sub}>
              {t('advances.plan', {
                count: a.installments,
                amount: formatINR(a.installmentAmount),
                from: a.startPeriod,
              })}{' '}
              · {shortDate(a.issuedOn)}
            </Text>
            <Text style={kit.sub}>{t(`advances.status_${a.status}`, { defaultValue: a.status })}</Text>
          </Card>
        ))}
      </Gate>
    </ScrollView>
  );
}

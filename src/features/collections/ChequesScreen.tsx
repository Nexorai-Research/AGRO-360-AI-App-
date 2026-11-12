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
import { SPERM, bounceCheque, chequeStep, fetchCheques, skey, type Cheque } from './sal-api';
import { bounceErrors, buildBounce, validOptionalDate } from './sal-logic';
import { useSal } from './sal-hook';

const FILTERS = ['', 'RECEIVED', 'DEPOSITED', 'CLEARED', 'BOUNCED'] as const;

export default function ChequesScreen() {
  const { t } = useTranslation();
  const s = useSal();
  const key = useActionKey();
  const [status, setStatus] = useState('');
  const [open, setOpen] = useState<{ id: string; what: 'deposit' | 'clear' | 'bounce' } | null>(null);
  const [date, setDate] = useState('');
  const [reason, setReason] = useState('');
  const [charge, setCharge] = useState('');
  const [tried, setTried] = useState(false);

  const list = useQuery({
    queryKey: skey(s.userId, 'cheques', status),
    queryFn: ({ signal }) => fetchCheques(s.client!, status, signal),
    enabled: s.ready && s.can(SPERM.ledger),
    retry: retryNetworkOnce,
  });

  if (!s.can(SPERM.ledger)) return <StateView state="denied" message={t('cheques.denied')} />;

  function close() {
    setOpen(null);
    setDate('');
    setReason('');
    setCharge('');
    setTried(false);
    key.reset();
  }
  function submit(c: Cheque) {
    if (!open) return;
    setTried(true);
    if (open.what === 'bounce') {
      const f = { reason, date, charge };
      if (bounceErrors(f).length > 0) return;
      const body = buildBounce(f);
      void s.act(
        t('cheques.bounced'),
        () => bounceCheque(s.client!, c.id, body, key.keyFor(`b|${c.id}|${JSON.stringify(body)}`)),
        close,
      );
      return;
    }
    if (!validOptionalDate(date)) return;
    const step = open.what;
    void s.act(
      t(step === 'deposit' ? 'cheques.deposited' : 'cheques.cleared'),
      () => chequeStep(s.client!, c.id, step, date.trim(), key.keyFor(`${step}|${c.id}|${date.trim()}`)),
      close,
    );
  }

  const bErr = bounceErrors({ reason, date, charge });
  return (
    <ScrollView
      contentContainerStyle={k.page}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={() => void list.refetch()} />}
    >
      <Stack.Screen options={{ headerShown: true, title: t('nav.cheques') }} />
      <Text style={k.title}>{t('cheques.title')}</Text>
      <Chips
        options={FILTERS.map((f) => ({ value: f, label: f ? t(`cheques.status.${f}`) : t('cheques.all') }))}
        value={status}
        onChange={setStatus}
      />
      {s.msg ? <Notice tone="ok" text={s.msg} /> : null}
      {s.failure ? <Notice tone="error" text={s.failure} /> : null}
      <Gate q={list} ns="cheques" emptyKey="cheques.empty" isEmpty={(list.data ?? []).length === 0}>
        {(list.data ?? []).map((c) => (
          <View key={c.id} style={k.card}>
            <Text style={k.name}>
              {c.customerName} · {formatINR(c.amount)}
            </Text>
            <Text style={k.sub}>
              {t('cheques.line', {
                no: c.chequeNo,
                bank: c.bank,
                date: c.chequeDate,
                receipt: c.receiptNumber,
              })}
            </Text>
            <Text style={k.sub}>
              {t(`cheques.status.${c.status}`)}
              {c.postDated && c.status === 'RECEIVED' && !c.readyToDeposit
                ? ` · ${t('cheques.postDated')}`
                : ''}
              {c.status === 'BOUNCED'
                ? ` · ${c.bounceReason ?? ''}${Number(c.bounceCharge) > 0 ? ` · ${t('cheques.charge')} ${formatINR(c.bounceCharge)}` : ''}`
                : ''}
            </Text>
            {s.can(SPERM.cheque) && open?.id !== c.id ? (
              <View style={k.row}>
                {c.status === 'RECEIVED' ? (
                  <Button
                    kind="ghost"
                    label={`${t('cheques.deposit')} ${c.chequeNo}`}
                    onPress={() => (close(), setOpen({ id: c.id, what: 'deposit' }))}
                  />
                ) : null}
                {c.status === 'DEPOSITED' ? (
                  <Button
                    kind="ghost"
                    label={`${t('cheques.clear')} ${c.chequeNo}`}
                    onPress={() => (close(), setOpen({ id: c.id, what: 'clear' }))}
                  />
                ) : null}
                {c.status === 'RECEIVED' || c.status === 'DEPOSITED' ? (
                  <Button
                    kind="ghost"
                    label={`${t('cheques.bounce')} ${c.chequeNo}`}
                    onPress={() => (close(), setOpen({ id: c.id, what: 'bounce' }))}
                  />
                ) : null}
              </View>
            ) : null}
            {open?.id === c.id ? (
              <>
                <Field
                  label={t('cheques.date')}
                  value={date}
                  onChange={setDate}
                  placeholder="YYYY-MM-DD"
                  error={tried && !validOptionalDate(date) ? t('cheques.v.date') : null}
                />
                {open.what === 'bounce' ? (
                  <>
                    <Field
                      label={t('cheques.reason')}
                      value={reason}
                      onChange={setReason}
                      multiline
                      error={tried && bErr.includes('reason') ? t('cheques.v.reason') : null}
                    />
                    <Field
                      label={t('cheques.chargeLabel')}
                      value={charge}
                      onChange={setCharge}
                      keyboard="decimal-pad"
                      error={tried && bErr.includes('charge') ? t('cheques.v.charge') : null}
                    />
                  </>
                ) : null}
                <View style={k.row}>
                  <Button
                    label={t(`cheques.confirm.${open.what}`)}
                    disabled={s.busy}
                    onPress={() => submit(c)}
                  />
                  <Button kind="ghost" label={t('cheques.cancel')} onPress={close} />
                </View>
              </>
            ) : null}
          </View>
        ))}
      </Gate>
    </ScrollView>
  );
}

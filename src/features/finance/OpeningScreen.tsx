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
import { XP, fetchAccountRefs, fetchOpening, reverseVoucher, saveOpening, xkey } from './fx-api';
import { AccountPicker } from './fx-ui';
import {
  openingBody,
  openingErrors,
  openingTotals,
  validMoney,
  validReason10,
  type OpeningLine,
} from './fx-logic';

const todayIso = () => new Date().toISOString().slice(0, 10);

export default function OpeningScreen() {
  const { t } = useTranslation();
  const s = useSal();
  const key = useActionKey();
  const [asOn, setAsOn] = useState('');
  const [lines, setLines] = useState<OpeningLine[]>([]);
  const [acc, setAcc] = useState('');
  const [side, setSide] = useState<'debit' | 'credit'>('debit');
  const [amount, setAmount] = useState('');
  const [tried, setTried] = useState(false);
  const [lineTried, setLineTried] = useState(false);
  const [rev, setRev] = useState(false);
  const [reason, setReason] = useState('');
  const ok = s.ready && s.can(XP.view);
  const op = useQuery({
    queryKey: xkey(s.userId, 'opening'),
    queryFn: ({ signal }) => fetchOpening(s.client!, signal),
    enabled: ok,
    retry: retryNetworkOnce,
  });
  const accounts = useQuery({
    queryKey: xkey(s.userId, 'accounts'),
    queryFn: ({ signal }) => fetchAccountRefs(s.client!, signal),
    enabled: ok && op.data !== undefined && op.data.voucher === null,
    retry: retryNetworkOnce,
  });
  if (!s.can(XP.view)) return <StateView state="denied" message={t('fx.denied')} />;
  const manage = s.can(XP.opening);
  const usable = (accounts.data ?? []).filter(
    (a) => !a.isControl && !a.isOpeningPlug && a.active !== false && !lines.some((l) => l.accountId === a.id),
  );
  const totals = openingTotals(lines);
  const errs = openingErrors(asOn, lines, todayIso());

  function addLine() {
    setLineTried(true);
    const a = (accounts.data ?? []).find((x) => x.id === acc);
    if (!a || !validMoney(amount)) return;
    setLines([...lines, { accountId: a.id, label: `${a.code} ${a.name}`, side, amount: amount.trim() }]);
    setAcc('');
    setAmount('');
    setLineTried(false);
  }
  function save() {
    setTried(true);
    if (openingErrors(asOn, lines, todayIso()).length > 0) return;
    const body = openingBody(asOn, lines);
    void s.act(
      t('fx.opening.saved'),
      () => saveOpening(s.client!, body, key.keyFor(JSON.stringify(body))),
      () => (setLines([]), setAsOn(''), setTried(false), key.reset(), void op.refetch()),
    );
  }
  function reverse(id: string) {
    setTried(true);
    if (!validReason10(reason)) return;
    const r = reason.trim();
    void s.act(
      t('fx.opening.reversed'),
      () => reverseVoucher(s.client!, id, r, key.keyFor(`rev|${id}|${r}`)),
      () => (setRev(false), setReason(''), setTried(false), key.reset(), void op.refetch()),
    );
  }

  const v = op.data?.voucher;
  return (
    <ScrollView
      contentContainerStyle={k.page}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={op.isRefetching} onRefresh={() => void op.refetch()} />}
    >
      <Stack.Screen options={{ headerShown: true, title: t('nav.finOpening') }} />
      <Text style={k.title}>{t('fx.opening.title')}</Text>
      {s.msg ? <Notice tone="ok" text={s.msg} /> : null}
      {s.failure ? <Notice tone="error" text={s.failure} /> : null}
      <Gate q={op} ns="fx" emptyKey="fx.denied" isEmpty={false}>
        {v ? (
          <>
            <View style={k.card}>
              <Text style={k.name}>
                {t('fx.opening.enteredAs', { no: v.voucherNo, date: v.voucherDate })}
              </Text>
              <Text style={k.sub}>
                {op.data?.locked ? t('fx.opening.locked') : t('fx.opening.canReverse')}
              </Text>
            </View>
            {v.lines.map((l, i) => (
              <View key={`${l.accountCode}-${i}`} style={k.card}>
                <Text style={k.name}>
                  {l.accountCode} · {l.accountName}
                </Text>
                <Text style={k.sub}>
                  {Number(l.debit)
                    ? `${t('fx.debit')} ${formatINR(l.debit)}`
                    : `${t('fx.credit')} ${formatINR(l.credit)}`}
                </Text>
              </View>
            ))}
            {manage && !op.data?.locked && !rev ? (
              <Button
                kind="ghost"
                label={t('fx.opening.reverse')}
                onPress={() => (key.reset(), setRev(true))}
              />
            ) : null}
            {rev ? (
              <View style={k.card}>
                <Field
                  label={t('fx.reason10')}
                  value={reason}
                  onChange={setReason}
                  multiline
                  error={tried && !validReason10(reason) ? t('fx.v.reason10') : null}
                />
                <View style={k.row}>
                  <Button
                    label={t('fx.opening.confirmReverse')}
                    disabled={s.busy}
                    onPress={() => reverse(v.id)}
                  />
                  <Button
                    kind="ghost"
                    label={t('fx.cancel')}
                    onPress={() => (setRev(false), setTried(false))}
                  />
                </View>
              </View>
            ) : null}
          </>
        ) : manage ? (
          <View style={k.card}>
            <Text style={k.sub}>{t('fx.opening.intro')}</Text>
            <Field
              label={t('fx.opening.asOn')}
              value={asOn}
              onChange={setAsOn}
              placeholder="YYYY-MM-DD"
              error={tried && errs.includes('date') ? t('fx.opening.v.date') : null}
            />
            <AccountPicker
              label={t('fx.opening.account')}
              accounts={usable}
              value={acc}
              onChange={setAcc}
              error={lineTried && !acc ? t('fx.opening.v.account') : null}
            />
            <Chips
              options={[
                { value: 'debit', label: t('fx.debit') },
                { value: 'credit', label: t('fx.credit') },
              ]}
              value={side}
              onChange={(x) => setSide(x as 'debit' | 'credit')}
            />
            <Field
              label={t('fx.amount')}
              value={amount}
              onChange={setAmount}
              keyboard="decimal-pad"
              error={lineTried && !validMoney(amount) ? t('fx.v.money') : null}
            />
            <Button kind="ghost" label={t('fx.opening.addLine')} onPress={addLine} />
            {lines.map((l) => (
              <View key={l.accountId} style={k.row}>
                <Text style={k.sub}>
                  {l.label} · {t(`fx.${l.side}`)} {formatINR(l.amount)}
                </Text>
                <Button
                  kind="ghost"
                  label={`${t('fx.remove')} ${l.label}`}
                  onPress={() => setLines(lines.filter((x) => x.accountId !== l.accountId))}
                />
              </View>
            ))}
            {tried && errs.includes('lines') ? <Text style={k.error}>{t('fx.opening.v.lines')}</Text> : null}
            <Text style={k.name}>
              {t('fx.opening.totals', {
                debit: formatINR(totals.debit),
                credit: formatINR(totals.credit),
                plug: formatINR(totals.plug),
                side: t(`fx.${totals.plugSide}`),
              })}
            </Text>
            <Button label={t('fx.opening.save')} disabled={s.busy} onPress={save} />
          </View>
        ) : (
          <Text style={k.sub}>{t('fx.opening.none')}</Text>
        )}
      </Gate>
    </ScrollView>
  );
}

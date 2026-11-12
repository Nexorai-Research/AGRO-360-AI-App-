import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { dec, formatINR } from '@/money';
import { Button } from '@/ui/Button';
import { StateView } from '../stock/StateView';
import { PERM, approveOrder, cancelOrder, getOrder, key, rejectOrder, submitOrder, type OrderDetail } from './api';
import { Gate, retryNetworkOnce } from './Gate';
import { orderActions, validReason } from './logic';
import { Field, Notice, k, useActionKey, useErrorText } from './ui';

type Ask = 'reject' | 'cancel' | null;

export default function OrderDetailScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const errText = useErrorText();
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const { me, client } = useAuth();
  const qc = useQueryClient();
  const userId = me?.userId ?? '';
  const can = (p: string) => me?.permissions === undefined || me.permissions.includes(p);
  const ready = client !== null && me !== null && can(PERM.view);
  const actionKey = useActionKey();

  const [ask, setAsk] = useState<Ask>(null);
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const q = useQuery({
    queryKey: key(userId, 'order', id),
    queryFn: ({ signal }) => getOrder(client!, id, signal),
    enabled: ready && id !== '',
    retry: retryNetworkOnce,
  });

  async function run(name: string, done: string, fn: (o: OrderDetail, k: string) => Promise<unknown>) {
    const o = q.data;
    if (!o || busy) return;
    setBusy(true);
    setFailure(null);
    setMsg(null);
    try {
      // the key follows the action, the order and its version and the reason: a retry of the same thing reuses it
      await fn(o, actionKey.keyFor(`${name}|${o.id}|${o.version}|${name === 'reject' || name === 'cancel' ? reason.trim() : ''}`));
      actionKey.reset();
      setMsg(done);
      setAsk(null);
      setReason('');
      await qc.invalidateQueries({ queryKey: ['purchase'] });
    } catch (e) {
      setFailure(errText(e));
    } finally {
      setBusy(false);
    }
  }

  if (!can(PERM.view)) return <StateView state="denied" message={t('purchase.denied')} />;
  const o = q.data;
  const a = o ? orderActions(o, userId, can) : null;

  return (
    <ScrollView contentContainerStyle={k.page} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ headerShown: true, title: t('purchase.orderTitle') }} />
      <Gate q={q} ns="purchase" emptyKey="purchase.emptyOrders" isEmpty={false}>
        {o && a ? (
          <>
            <Text style={k.title}>{o.number ?? t('purchase.draft')}</Text>
            <Text style={k.sub}>
              {[o.supplierName, o.orderDate, t(`purchase.status.${o.status}`, { defaultValue: o.status })].join(' · ')}
            </Text>
            {o.reason ? <Text style={k.sub}>{t('purchase.reasonShown', { reason: o.reason })}</Text> : null}
            {o.lines.map((l) => (
              <View key={l.id} style={k.card}>
                <Text style={k.name}>
                  {l.skuCode} {l.skuName}
                </Text>
                <Text style={k.sub}>
                  {t('purchase.lineText', {
                    qty: dec(l.qty).toString(),
                    rate: dec(l.rate).toString(),
                    total: formatINR(l.lineTotal),
                  })}
                </Text>
                <Text style={k.sub}>
                  {t('purchase.lineReceived', { received: dec(l.receivedQty).toString(), pending: dec(l.pendingQty).toString() })}
                </Text>
              </View>
            ))}
            <Text style={k.name}>{t('purchase.total', { amount: formatINR(o.total) })}</Text>

            {msg ? <Notice tone="ok" text={msg} /> : null}
            {failure ? <Notice tone="error" text={failure} /> : null}
            {a.ownOrder ? <Notice tone="warn" text={t('purchase.anotherApprover')} /> : null}

            <View style={k.row}>
              {a.submit ? (
                <Button
                  label={t('purchase.submit')}
                  disabled={busy}
                  onPress={() => void run('submit', t('purchase.submitted'), (x, key2) => submitOrder(client!, x, key2))}
                />
              ) : null}
              {a.approve ? (
                <Button
                  label={t('purchase.approve')}
                  disabled={busy}
                  onPress={() => void run('approve', t('purchase.approved'), (x, key2) => approveOrder(client!, x, key2))}
                />
              ) : null}
              {a.reject ? <Button kind="ghost" label={t('purchase.reject')} onPress={() => setAsk('reject')} /> : null}
              {a.receive ? (
                <Button kind="ghost" label={t('purchase.receive')} onPress={() => router.push({ pathname: '/purchase/receive/[id]', params: { id: o.id } })} />
              ) : null}
              {a.cancel ? <Button kind="ghost" label={t('purchase.cancelOrder')} onPress={() => setAsk('cancel')} /> : null}
              <Button kind="ghost" label={t('stkOrder.more')} onPress={() => router.push({ pathname: '/purchase/more', params: { id: o.id } } as never)} />
            </View>

            {ask ? (
              <View style={k.card}>
                <Text style={k.sub}>{t(ask === 'reject' ? 'purchase.rejectHint' : 'purchase.cancelHint')}</Text>
                <Field
                  label={t('purchase.reason')}
                  value={reason}
                  onChange={setReason}
                  error={reason !== '' && !validReason(reason) ? t('purchase.v.reason') : null}
                />
                <Button
                  label={t(ask === 'reject' ? 'purchase.rejectNow' : 'purchase.cancelNow')}
                  disabled={busy || !validReason(reason)}
                  onPress={() =>
                    void run(
                      ask,
                      t(ask === 'reject' ? 'purchase.rejected' : 'purchase.cancelled'),
                      (x, key2) => (ask === 'reject' ? rejectOrder(client!, x, reason.trim(), key2) : cancelOrder(client!, x, reason.trim(), key2)),
                    )
                  }
                />
              </View>
            ) : null}
          </>
        ) : null}
      </Gate>
    </ScrollView>
  );
}

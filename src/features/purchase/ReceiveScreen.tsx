import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { ApiError } from '@/api/errors';
import { Button } from '@/ui/Button';
import { BarcodeScanner } from '../stock/BarcodeScanner';
import { StateView } from '../stock/StateView';
import { PERM, createGrn, fetchWarehouses, getOrder, key, productByBarcode, receiveGrn } from './api';
import { Gate, retryNetworkOnce } from './Gate';
import { REJECT_REASONS, buildGrnBody, countScan, isOverReceipt, receiveDraftFor, receiveErrors, type ReceiveDraft, type ReceiveLineDraft } from './logic';
import { Chips, Field, Notice, k, useActionKey, useErrorText } from './ui';

export default function ReceiveScreen() {
  const { t } = useTranslation();
  const errText = useErrorText();
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const { me, client } = useAuth();
  const qc = useQueryClient();
  const userId = me?.userId ?? '';
  const can = (p: string) => me?.permissions === undefined || me.permissions.includes(p);
  const ready = client !== null && me !== null && can(PERM.grn);
  const createKey = useActionKey();
  const receiveKey = useActionKey();

  const [d, setD] = useState<ReceiveDraft | null>(null);
  const [scan, setScan] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  // The receipt is saved first, then posted. If posting fails the saved receipt is kept here and only the posting is retried.
  const [grnId, setGrnId] = useState<string | null>(null);

  const q = useQuery({
    queryKey: key(userId, 'order', id),
    queryFn: ({ signal }) => getOrder(client!, id, signal),
    enabled: ready && id !== '',
    retry: retryNetworkOnce,
  });
  const warehouses = useQuery({ queryKey: key(userId, 'warehouses'), queryFn: ({ signal }) => fetchWarehouses(client!, signal), enabled: ready, staleTime: 5 * 60_000 });

  const order = q.data;
  // the form starts from the order's open lines and keeps the user's edits once there are any
  const cur: ReceiveDraft | null = d ?? (order ? receiveDraftFor(order) : null);
  const setLine = (i: number, patch: Partial<ReceiveLineDraft>) => {
    if (cur) setD({ ...cur, lines: cur.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) });
  };

  async function onScanned(code: string) {
    setScan(false);
    setNote(null);
    try {
      const p = await productByBarcode(client!, code);
      const next = cur ? countScan(cur, p.id) : null;
      if (!next) setNote(t('purchase.scanNotOnOrder', { name: p.name }));
      else setD(next);
    } catch (e) {
      setNote(e instanceof ApiError && e.status === 404 ? t('purchase.barcodeNotFound', { code }) : errText(e));
    }
  }

  if (!can(PERM.grn)) return <StateView state="denied" message={t('purchase.deniedReceive')} />;

  const errors = cur ? receiveErrors(cur) : [];
  const has = (e: (typeof errors)[number]) => tried && errors.includes(e);

  async function save() {
    if (!cur) return;
    setTried(true);
    if (errors.length > 0 || busy) return;
    setBusy(true);
    setFailure(null);
    try {
      let gid = grnId;
      if (!gid) {
        const body = buildGrnBody(id, cur);
        const g = await createGrn(client!, body, createKey.keyFor(JSON.stringify(body)));
        gid = g.id;
        setGrnId(gid);
      }
      await receiveGrn(client!, gid, receiveKey.keyFor(`receive|${gid}`));
      createKey.reset();
      receiveKey.reset();
      setMsg(t('purchase.received'));
      void qc.invalidateQueries({ queryKey: ['purchase'] });
    } catch (e) {
      if (e instanceof ApiError && e.code === 'GRN_OVER_RECEIPT') setFailure(t('purchase.overReceipt'));
      else setFailure(errText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={k.page} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ headerShown: true, title: t('purchase.receiveTitle') }} />
      <Gate q={q} ns="purchase" emptyKey="purchase.emptyOrders" isEmpty={false}>
        {order && cur ? (
          <>
            <Text style={k.title}>{t('purchase.receiveFor', { number: order.number ?? '' })}</Text>
            <Text style={k.sub}>{t('purchase.receiveHint')}</Text>
            <Field label={t('purchase.receiptDate')} value={cur.receiptDate} onChange={(v) => setD({ ...cur, receiptDate: v })} placeholder="YYYY-MM-DD" error={has('date') ? t('purchase.v.date') : null} />
            <Field label={t('purchase.challan')} value={cur.challanNo} onChange={(v) => setD({ ...cur, challanNo: v })} />
            <Text style={k.label}>{t('purchase.rejectTo')}</Text>
            <Chips
              options={(warehouses.data ?? []).map((w) => ({ value: w.id, label: w.name }))}
              value={cur.rejectWarehouseId}
              onChange={(v) => setD({ ...cur, rejectWarehouseId: v })}
            />
            <Button kind="ghost" label={t('purchase.scan')} onPress={() => setScan(true)} />
            {note ? <Notice tone="warn" text={note} /> : null}
            {has('noLines') ? <Text style={k.error}>{t('purchase.v.noReceiveLines')}</Text> : null}

            {cur.lines.map((l, i) => (
              <View key={l.poLineId} style={k.card}>
                <Text style={k.name}>{l.label}</Text>
                <Text style={k.sub}>{t('purchase.pending', { qty: l.pending })}</Text>
                <Field label={`${t('purchase.receivedQty')} ${i + 1}`} value={l.received} onChange={(v) => setLine(i, { received: v })} keyboard="decimal-pad" />
                {isOverReceipt(l) ? <Notice tone="warn" text={t('purchase.overWarn')} /> : null}
                <Field label={`${t('purchase.rejectedQty')} ${i + 1}`} value={l.rejected} onChange={(v) => setLine(i, { rejected: v })} keyboard="decimal-pad" />
                {l.rejected.trim() !== '' && l.rejected.trim() !== '0' ? (
                  <Chips
                    options={REJECT_REASONS.map((r) => ({ value: r, label: t(`purchase.reasons.${r}`) }))}
                    value={l.reason}
                    onChange={(v) => setLine(i, { reason: v })}
                  />
                ) : null}
                <Field label={`${t('purchase.batch')} ${i + 1}`} value={l.batchNo} onChange={(v) => setLine(i, { batchNo: v })} autoCapitalize="characters" />
                <Field label={`${t('purchase.mfg')} ${i + 1}`} value={l.mfgDate} onChange={(v) => setLine(i, { mfgDate: v })} placeholder="YYYY-MM-DD" />
                <Field label={`${t('purchase.expiry')} ${i + 1}`} value={l.expiryDate} onChange={(v) => setLine(i, { expiryDate: v })} placeholder="YYYY-MM-DD" />
              </View>
            ))}
            {has('qty') ? <Text style={k.error}>{t('purchase.v.qty')}</Text> : null}
            {has('rejected') ? <Text style={k.error}>{t('purchase.v.rejected')}</Text> : null}
            {has('reason') ? <Text style={k.error}>{t('purchase.v.rejectReason')}</Text> : null}
            {has('mfg') || has('expiry') ? <Text style={k.error}>{t('purchase.v.batchDate')}</Text> : null}
            {has('dateOrder') ? <Text style={k.error}>{t('purchase.v.dateOrder')}</Text> : null}

            {msg ? <Notice tone="ok" text={msg} /> : null}
            {failure ? <Notice tone="error" text={failure} /> : null}
            {grnId && !msg ? <Notice tone="warn" text={t('purchase.savedNotPosted')} /> : null}
            {!msg ? <Button label={grnId ? t('purchase.postAgain') : t('purchase.receiveNow')} disabled={busy} onPress={() => void save()} /> : null}
          </>
        ) : null}
      </Gate>
      <BarcodeScanner visible={scan} onScanned={(c) => void onScanned(c)} onClose={() => setScan(false)} />
    </ScrollView>
  );
}

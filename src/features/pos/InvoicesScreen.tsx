import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { ApiError, errorMessage, type ErrorMessage } from '@/api/errors';
import { config } from '@/config';
import { newId } from '@/device';
import { dec, formatINR } from '@/money';
import { Button } from '@/ui/Button';
import { colors, radius } from '@/ui/theme';
import { StateView } from '../stock/StateView';
import { printInvoice, shareInvoicePdf } from './print';
import { todayIST } from '../collections/receipt';
import { fetchPayModes } from './api';
import {
  PERM2,
  cancelInvoice,
  fetchInvoices,
  getInvoice,
  key2,
  postReturn,
  shareInvoice,
  type InvoiceDetail,
  type InvoiceRow,
} from './api-more';

const isNetwork = (e: unknown) => e instanceof ApiError && e.code === 'NETWORK';
const QTY_RE = /^\d+(\.\d{1,3})?$/;

/** Quantity to return: more than 0, at most 3 decimals, not above what is still unreturned. Compared as decimals. */
export function checkReturnQty(raw: string, qty: string, returned: string): 'ok' | 'format' | 'tooMany' {
  const v = raw.trim();
  if (!QTY_RE.test(v) || !dec(v).gt(0)) return 'format';
  return dec(v).gt(dec(qty).minus(returned)) ? 'tooMany' : 'ok';
}

export default function InvoicesScreen() {
  const { t } = useTranslation();
  const { me, client } = useAuth();
  const qc = useQueryClient();
  const userId = me?.userId ?? '';
  const can = (p: string) => me?.permissions === undefined || me.permissions.includes(p);
  const ready = client !== null && me !== null && can(PERM2.view);

  const [openId, setOpenId] = useState<string | null>(null);
  const [mode, setMode] = useState<'return' | 'cancel' | null>(null);
  const [detail, setDetail] = useState<InvoiceDetail | null>(null);
  const [lineId, setLineId] = useState('');
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState('');
  const [refund, setRefund] = useState('');
  const [damaged, setDamaged] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [failure, setFailure] = useState<ErrorMessage | null>(null);
  const [busy, setBusy] = useState(false);
  // One key per action, kept while the user does not change anything, so a retry never makes a second credit note or cancel.
  const key = useRef<{ k: string; fp: string } | null>(null);
  const keyFor = (fp: string) => {
    if (!key.current || key.current.fp !== fp) key.current = { k: newId(), fp };
    return key.current.k;
  };

  const list = useQuery({
    queryKey: key2(userId, 'invoices'),
    queryFn: ({ signal }) => fetchInvoices(client!, signal),
    enabled: ready,
    retry: (n, e) => isNetwork(e) && n < 1,
  });
  const modes = useQuery({
    queryKey: ['pos', 'modes', userId],
    queryFn: ({ signal }) => fetchPayModes(client!, signal),
    enabled: ready && mode === 'return',
    staleTime: 5 * 60_000,
  });

  async function open(i: InvoiceRow, m: 'return' | 'cancel') {
    setFailure(null);
    setMsg(null);
    setOpenId(i.id);
    setMode(m);
    setReason('');
    setQty('');
    setDamaged(false);
    key.current = null;
    if (m === 'return') {
      try {
        const d = await getInvoice(client!, i.id);
        setDetail(d);
        setLineId(d.lines[0]?.id ?? '');
        setRefund(d.customerId ? 'CREDIT_TO_ACCOUNT' : '');
      } catch (e) {
        setFailure(errorMessage(e));
      }
    }
  }

  async function run(fn: () => Promise<unknown>, done: string) {
    if (busy) return;
    setBusy(true);
    setFailure(null);
    try {
      await fn();
      key.current = null;
      setMsg(done);
      setMode(null);
      setOpenId(null);
      void qc.invalidateQueries({ queryKey: ['pos2'] });
    } catch (e) {
      setFailure(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const lineSel = detail?.lines.find((l) => l.id === lineId);
  const qtyCheck = lineSel ? checkReturnQty(qty, lineSel.qty, lineSel.returned) : 'format';
  const returnOk = !!detail && qtyCheck === 'ok' && reason.trim() !== '' && refund !== '';

  async function share(i: InvoiceRow, send: boolean) {
    setFailure(null);
    setMsg(null);
    try {
      const r = await shareInvoice(client!, i.id, send, newId());
      const url = r.url ?? `${config.apiBaseUrl}/public/invoices/${r.token}`;
      if (send) setMsg(t('invoices.sent'));
      else await Share.share({ message: t('invoices.shareText', { number: i.number, url }) });
    } catch (e) {
      setFailure(errorMessage(e));
    }
  }

  async function printOrPdf(i: InvoiceRow, pdf: boolean) {
    setFailure(null);
    setMsg(null);
    try {
      if (pdf) {
        if ((await shareInvoicePdf(client!, i.id)) === 'noSharing') setMsg(t('invoices.noSharing'));
      } else await printInvoice(client!, i.id);
    } catch (e) {
      setFailure(errorMessage(e));
    }
  }

  if (!can(PERM2.view)) return <StateView state="denied" message={t('invoices.denied')} />;
  if (list.isPending && list.fetchStatus !== 'idle') return <StateView state="loading" />;
  if (list.error) {
    const m = errorMessage(list.error);
    return (
      <StateView
        state={isNetwork(list.error) ? 'offline' : m.key === 'errors.FORBIDDEN' ? 'denied' : 'error'}
        message={
          isNetwork(list.error)
            ? t('invoices.offline')
            : t(m.key, { ...m.params, correlationId: m.params.correlationId ?? '-' })
        }
        onRetry={() => void list.refetch()}
      />
    );
  }

  return (
    <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
      <Text style={s.title}>{t('invoices.title')}</Text>
      {msg ? (
        <Text style={s.ok} accessibilityRole="alert">
          {msg}
        </Text>
      ) : null}
      {failure ? (
        <Text style={s.error} accessibilityRole="alert">
          {t(failure.key, { ...failure.params, correlationId: failure.params.correlationId ?? '-' })}
        </Text>
      ) : null}
      {(list.data ?? []).length === 0 ? <Text style={s.sub}>{t('invoices.empty')}</Text> : null}
      {(list.data ?? []).map((i) => (
        <View key={i.id} style={s.card}>
          <Text style={s.name}>
            {i.number} · {formatINR(i.total)}
          </Text>
          <Text style={s.sub}>
            {[i.invoiceDate, i.customerName ?? t('invoices.walkIn'), i.status].join(' · ')}
            {dec(i.creditAmount).gt(0)
              ? ` · ${t('invoices.credit', { amount: formatINR(i.creditAmount) })}`
              : ''}
          </Text>
          <View style={s.row}>
            {can(PERM2.print) ? (
              <Button kind="ghost" label={t('invoices.share')} onPress={() => void share(i, false)} />
            ) : null}
            {can(PERM2.print) ? (
              <Button kind="ghost" label={t('invoices.print')} onPress={() => void printOrPdf(i, false)} />
            ) : null}
            {can(PERM2.print) ? (
              <Button kind="ghost" label={t('invoices.pdf')} onPress={() => void printOrPdf(i, true)} />
            ) : null}
            {can(PERM2.print) && i.customerName ? (
              <Button kind="ghost" label={t('invoices.sendWhatsapp')} onPress={() => void share(i, true)} />
            ) : null}
            {can(PERM2.ret) && i.status === 'FINALIZED' ? (
              <Button kind="ghost" label={t('invoices.return')} onPress={() => void open(i, 'return')} />
            ) : null}
            {can(PERM2.cancel) && i.status === 'FINALIZED' ? (
              <Button kind="ghost" label={t('invoices.cancel')} onPress={() => void open(i, 'cancel')} />
            ) : null}
          </View>

          {openId === i.id && mode === 'cancel' ? (
            <View style={s.panel}>
              <Text style={s.sub}>{t('invoices.cancelHint')}</Text>
              <TextInput
                value={reason}
                onChangeText={setReason}
                placeholder={t('invoices.reason')}
                accessibilityLabel={t('invoices.reason')}
                style={s.input}
              />
              <Button
                label={t('invoices.cancelNow')}
                disabled={busy || reason.trim() === ''}
                onPress={() =>
                  void run(
                    () => cancelInvoice(client!, i.id, reason.trim(), keyFor(`c|${i.id}|${reason.trim()}`)),
                    t('invoices.cancelled', { number: i.number }),
                  )
                }
              />
            </View>
          ) : null}

          {openId === i.id && mode === 'return' ? (
            <View style={s.panel}>
              {!detail ? <ActivityIndicator color={colors.brand} /> : null}
              {detail?.lines.map((l) => (
                <Pressable
                  key={l.id}
                  accessibilityRole="radio"
                  accessibilityLabel={l.skuCode}
                  accessibilityState={{ selected: lineId === l.id }}
                  onPress={() => setLineId(l.id)}
                  style={[s.chip, lineId === l.id && s.chipOn]}
                >
                  <Text style={[s.chipTxt, lineId === l.id && s.chipTxtOn]}>
                    {t('invoices.lineText', {
                      code: l.skuCode,
                      qty: dec(l.qty).toString(),
                      returned: dec(l.returned).toString(),
                    })}
                  </Text>
                </Pressable>
              ))}
              {detail ? (
                <>
                  <TextInput
                    value={qty}
                    onChangeText={setQty}
                    placeholder={t('invoices.qty')}
                    accessibilityLabel={t('invoices.qty')}
                    keyboardType="decimal-pad"
                    style={s.input}
                  />
                  {qty !== '' && qtyCheck !== 'ok' ? (
                    <Text style={s.error}>{t(`invoices.v.${qtyCheck}`)}</Text>
                  ) : null}
                  <TextInput
                    value={reason}
                    onChangeText={setReason}
                    placeholder={t('invoices.reason')}
                    accessibilityLabel={t('invoices.reason')}
                    style={s.input}
                  />
                  <View style={s.chips}>
                    {[
                      ...(detail.customerId ? ['CREDIT_TO_ACCOUNT'] : []),
                      ...(modes.data ?? []).map((m) => m.code),
                    ].map((m) => (
                      <Pressable
                        key={m}
                        accessibilityRole="radio"
                        accessibilityLabel={m}
                        accessibilityState={{ selected: refund === m }}
                        onPress={() => setRefund(m)}
                        style={[s.chip, refund === m && s.chipOn]}
                      >
                        <Text style={[s.chipTxt, refund === m && s.chipTxtOn]}>
                          {m === 'CREDIT_TO_ACCOUNT' ? t('invoices.toAccount') : m}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityLabel={t('invoices.damaged')}
                    accessibilityState={{ checked: damaged }}
                    onPress={() => setDamaged((d) => !d)}
                    style={s.chip}
                  >
                    <Text style={s.chipTxt}>
                      {damaged ? '☑ ' : '☐ '}
                      {t('invoices.damaged')}
                    </Text>
                  </Pressable>
                  <Button
                    label={t('invoices.returnNow')}
                    disabled={busy || !returnOk}
                    onPress={() => {
                      const body = {
                        invoiceId: detail.id,
                        returnDate: todayIST(),
                        reason: reason.trim(),
                        refundMode: refund,
                        lines: [{ invoiceLineId: lineId, qty: qty.trim(), toDamaged: damaged }],
                      };
                      void run(
                        () => postReturn(client!, body, keyFor(JSON.stringify(body))),
                        t('invoices.returned', { number: i.number }),
                      );
                    }}
                  />
                </>
              ) : null}
            </View>
          ) : null}
        </View>
      ))}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: { padding: 16, gap: 10, backgroundColor: colors.bg },
  title: { fontSize: 22, fontWeight: '700', color: colors.ink },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
    gap: 8,
  },
  panel: { gap: 8, paddingTop: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  name: { fontSize: 16, color: colors.ink, fontWeight: '600' },
  sub: { fontSize: 14, color: colors.muted },
  ok: { fontSize: 16, color: colors.ok, fontWeight: '600' },
  error: { fontSize: 15, color: colors.danger },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius,
    paddingHorizontal: 12,
    fontSize: 16,
    backgroundColor: '#fff',
    color: colors.ink,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: 48,
    paddingHorizontal: 14,
    borderRadius: radius,
    borderWidth: 1,
    borderColor: colors.line,
    justifyContent: 'center',
    backgroundColor: colors.card,
  },
  chipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipTxt: { fontSize: 15, color: colors.ink },
  chipTxtOn: { color: colors.brandInk, fontWeight: '600' },
});

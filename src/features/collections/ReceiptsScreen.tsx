import { useState } from 'react';
import { RefreshControl, ScrollView, Share, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { dec, formatINR } from '@/money';
import { Button } from '@/ui/Button';
import { StateView } from '../stock/StateView';
import { Gate, retryNetworkOnce } from '../purchase/Gate';
import { Notice, k, useActionKey } from '../purchase/ui';
import { fetchReceiptList } from './extras-api';
import {
  SPERM,
  allocateReceipt,
  fetchReceiptDetail,
  skey,
  unallocateReceipt,
  type ReceiptDetail,
} from './sal-api';
import { useSal } from './sal-hook';

/** The text a customer gets for a receipt. Built on the phone from the server's numbers; the server's own receipt document is not used. */
export function receiptShareText(
  r: ReceiptDetail,
  title: string,
  lines: { amount: string; mode: string; date: string },
): string {
  return [
    `${title} ${r.number}`,
    `${lines.date}: ${r.receiptDate}`,
    `${lines.mode}: ${r.modeCode}${r.reference ? ` (${r.reference})` : ''}`,
    `${lines.amount}: ${formatINR(r.amount)}`,
  ].join('\n');
}

export default function ReceiptsScreen() {
  const { t } = useTranslation();
  const s = useSal();
  const allocKey = useActionKey();
  const [openId, setOpenId] = useState<string | null>(null);
  const [confirmBack, setConfirmBack] = useState(false);

  const list = useQuery({
    queryKey: skey(s.userId, 'receipts'),
    queryFn: ({ signal }) => fetchReceiptList(s.client!, signal),
    enabled: s.ready && s.can(SPERM.ledger),
    retry: retryNetworkOnce,
  });
  const detail = useQuery({
    queryKey: skey(s.userId, 'receipt', openId ?? ''),
    queryFn: ({ signal }) => fetchReceiptDetail(s.client!, openId!, signal),
    enabled: s.ready && openId !== null,
    retry: retryNetworkOnce,
  });

  if (!s.can(SPERM.ledger)) return <StateView state="denied" message={t('receipts.denied')} />;

  const d = detail.data;
  return (
    <ScrollView
      contentContainerStyle={k.page}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={() => void list.refetch()} />}
    >
      <Stack.Screen options={{ headerShown: true, title: t('nav.receipts') }} />
      <Text style={k.title}>{t('receipts.title')}</Text>
      {s.msg ? <Notice tone="ok" text={s.msg} /> : null}
      {s.failure ? <Notice tone="error" text={s.failure} /> : null}

      {openId ? (
        <View style={k.card}>
          <Gate q={detail} ns="receipts" emptyKey="receipts.empty" isEmpty={false}>
            {d ? (
              <>
                <Text style={k.name}>
                  {d.number} · {formatINR(d.amount)}
                </Text>
                <Text style={k.sub}>
                  {[d.receiptDate, d.modeCode, d.reference, d.status === 'VOID' ? t('receipts.void') : null]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
                <Text style={k.sub}>
                  {t('receipts.split', {
                    allocated: formatINR(d.allocated),
                    onAccount: formatINR(d.onAccount),
                  })}
                </Text>
                {d.cheque ? (
                  <Text style={k.sub}>
                    {t('receipts.cheque', {
                      no: d.cheque.chequeNo,
                      bank: d.cheque.bank,
                      date: d.cheque.chequeDate,
                      status: d.cheque.status,
                    })}
                  </Text>
                ) : null}
                {d.allocations.length === 0 ? <Text style={k.sub}>{t('receipts.noAllocations')}</Text> : null}
                {d.allocations.map((a) => (
                  <Text key={a.receivableId} style={k.sub}>
                    {a.docNumber ?? '-'} · {formatINR(a.amount)}
                  </Text>
                ))}
                <View style={k.row}>
                  <Button
                    kind="ghost"
                    label={t('receipts.share')}
                    onPress={() =>
                      void Share.share({
                        message: receiptShareText(d, t('receipts.shareTitle'), {
                          amount: t('receipts.amount'),
                          mode: t('receipts.mode'),
                          date: t('receipts.date'),
                        }),
                      }).catch(() => undefined)
                    }
                  />
                  {s.can(SPERM.allocate) && d.status === 'ACTIVE' && dec(d.onAccount).gt(0) ? (
                    <Button
                      label={t('receipts.allocate')}
                      disabled={s.busy}
                      onPress={() =>
                        void s.act(
                          t('receipts.allocated'),
                          () => allocateReceipt(s.client!, d.id, allocKey.keyFor(`a|${d.id}|${d.onAccount}`)),
                          () => allocKey.reset(),
                        )
                      }
                    />
                  ) : null}
                  {s.can(SPERM.allocate) &&
                  d.status === 'ACTIVE' &&
                  dec(d.allocated).gt(0) &&
                  !confirmBack ? (
                    <Button
                      kind="ghost"
                      label={t('receipts.takeBack')}
                      onPress={() => setConfirmBack(true)}
                    />
                  ) : null}
                </View>
                {confirmBack ? (
                  <>
                    <Text style={k.warn}>
                      {t('receipts.takeBackWarn', { amount: formatINR(d.allocated), number: d.number })}
                    </Text>
                    <View style={k.row}>
                      <Button
                        label={t('receipts.takeBackNow')}
                        disabled={s.busy}
                        onPress={() =>
                          void s.act(
                            t('receipts.takenBack'),
                            () =>
                              unallocateReceipt(s.client!, d.id, allocKey.keyFor(`u|${d.id}|${d.allocated}`)),
                            () => (allocKey.reset(), setConfirmBack(false)),
                          )
                        }
                      />
                      <Button
                        kind="ghost"
                        label={t('receipts.cancel')}
                        onPress={() => setConfirmBack(false)}
                      />
                    </View>
                  </>
                ) : null}
              </>
            ) : null}
          </Gate>
          <Button
            kind="ghost"
            label={t('receipts.back')}
            onPress={() => (setOpenId(null), setConfirmBack(false))}
          />
        </View>
      ) : null}

      <Gate q={list} ns="receipts" emptyKey="receipts.empty" isEmpty={(list.data ?? []).length === 0}>
        {(list.data ?? []).map((r) => (
          <View key={r.id} style={k.card}>
            <Text style={k.name}>
              {r.number} · {formatINR(r.amount)}
            </Text>
            <Text style={k.sub}>
              {[r.receiptDate, r.modeCode, r.status === 'VOID' ? t('receipts.void') : null]
                .filter(Boolean)
                .join(' · ')}
            </Text>
            {dec(r.onAccount).gt(0) && r.status === 'ACTIVE' ? (
              <Text style={k.warn}>{t('receipts.onAccount', { amount: formatINR(r.onAccount) })}</Text>
            ) : null}
            <Button
              kind="ghost"
              label={`${t('receipts.open')} ${r.number}`}
              onPress={() => (setOpenId(r.id), setConfirmBack(false), s.setMsg(null))}
            />
          </View>
        ))}
      </Gate>
    </ScrollView>
  );
}

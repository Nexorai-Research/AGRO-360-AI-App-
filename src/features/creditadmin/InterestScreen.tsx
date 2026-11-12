import { useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { formatINR } from '@/money';
import { Button } from '@/ui/Button';
import { StateView } from '../stock/StateView';
import { Gate, retryNetworkOnce } from '../purchase/Gate';
import { Field, Notice, k, useActionKey } from '../purchase/ui';
import { useSal } from '../collections/sal-hook';
import {
  CXPERM,
  cancelInterestRun,
  createInterestRun,
  cxkey,
  fetchInterestRun,
  fetchInterestRuns,
  postInterestRun,
  waiveInterestLine,
} from './api';
import { validPeriodTo, validReasonText } from './logic';

type Ask = { what: 'cancel' } | { what: 'waive'; lineId: string } | null;

export default function InterestScreen() {
  const { t } = useTranslation();
  const s = useSal();
  const key = useActionKey();
  const [openId, setOpenId] = useState<string | null>(null);
  const [periodTo, setPeriodTo] = useState('');
  const [newOpen, setNewOpen] = useState(false);
  const [ask, setAsk] = useState<Ask>(null);
  const [reason, setReason] = useState('');
  const [tried, setTried] = useState(false);

  const list = useQuery({
    queryKey: cxkey(s.userId, 'interest'),
    queryFn: ({ signal }) => fetchInterestRuns(s.client!, signal),
    enabled: s.ready && s.can(CXPERM.interest),
    retry: retryNetworkOnce,
  });
  const run = useQuery({
    queryKey: cxkey(s.userId, 'interest-run', openId ?? ''),
    queryFn: ({ signal }) => fetchInterestRun(s.client!, openId!, signal),
    enabled: s.ready && s.can(CXPERM.interest) && openId !== null,
    retry: retryNetworkOnce,
  });
  if (!s.can(CXPERM.interest)) return <StateView state="denied" message={t('crx.interest.denied')} />;

  function closeAsk() {
    setAsk(null);
    setReason('');
    setTried(false);
    key.reset();
  }
  function create() {
    setTried(true);
    if (!validPeriodTo(periodTo)) return;
    const to = periodTo.trim();
    void s.act(
      t('crx.interest.drafted'),
      () => createInterestRun(s.client!, to, key.keyFor(`new|${to}`)),
      () => {
        setNewOpen(false);
        setPeriodTo('');
        setTried(false);
        key.reset();
      },
    );
  }
  function post(id: string) {
    void s.act(
      t('crx.interest.posted'),
      () => postInterestRun(s.client!, id, key.keyFor(`post|${id}`)),
      () => key.reset(),
    );
  }
  function confirmAsk(id: string) {
    if (!ask) return;
    setTried(true);
    if (!validReasonText(reason)) return;
    const r = reason.trim();
    if (ask.what === 'cancel')
      void s.act(
        t('crx.interest.cancelled'),
        () => cancelInterestRun(s.client!, id, r, key.keyFor(`cancel|${id}|${r}`)),
        closeAsk,
      );
    else {
      const lineId = ask.lineId;
      void s.act(
        t('crx.interest.waived'),
        () => waiveInterestLine(s.client!, id, lineId, r, key.keyFor(`waive|${id}|${lineId}|${r}`)),
        closeAsk,
      );
    }
  }

  const d = openId ? run.data : undefined;
  return (
    <ScrollView
      contentContainerStyle={k.page}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={() => void list.refetch()} />}
    >
      <Stack.Screen options={{ headerShown: true, title: t('nav.creditInterest') }} />
      <Text style={k.title}>{t('crx.interest.title')}</Text>
      <Text style={k.sub}>{t('crx.interest.intro')}</Text>
      {s.msg ? <Notice tone="ok" text={s.msg} /> : null}
      {s.failure ? <Notice tone="error" text={s.failure} /> : null}

      {openId === null ? (
        <>
          {newOpen ? (
            <View style={k.card}>
              <Field
                label={t('crx.interest.periodTo')}
                value={periodTo}
                onChange={setPeriodTo}
                placeholder="YYYY-MM-DD"
                error={tried && !validPeriodTo(periodTo) ? t('crx.v.date') : null}
              />
              <View style={k.row}>
                <Button label={t('crx.interest.calculate')} disabled={s.busy} onPress={create} />
                <Button
                  kind="ghost"
                  label={t('crx.cancel')}
                  onPress={() => (setNewOpen(false), setTried(false))}
                />
              </View>
            </View>
          ) : (
            <Button label={t('crx.interest.new')} onPress={() => (key.reset(), setNewOpen(true))} />
          )}
          <Gate
            q={list}
            ns="crx.interest"
            emptyKey="crx.interest.empty"
            isEmpty={(list.data ?? []).length === 0}
          >
            {(list.data ?? []).map((r) => (
              <View key={r.id} style={k.card}>
                <Text style={k.name}>
                  {r.number} · {formatINR(r.total)}
                </Text>
                <Text style={k.sub}>
                  {t('crx.interest.period', {
                    from: r.periodFrom,
                    to: r.periodTo,
                    rate: r.ratePa.replace(/\.?0+$/, ''),
                  })}
                </Text>
                <Text style={k.sub}>{t(`crx.interest.status.${r.status}`)}</Text>
                <Button
                  kind="ghost"
                  label={`${t('crx.interest.open')} ${r.number}`}
                  onPress={() => setOpenId(r.id)}
                />
              </View>
            ))}
          </Gate>
        </>
      ) : (
        <>
          <Button kind="ghost" label={t('crx.back')} onPress={() => (setOpenId(null), closeAsk())} />
          <Gate q={run} ns="crx.interest" emptyKey="crx.interest.empty" isEmpty={false}>
            {d ? (
              <>
                <View style={k.card}>
                  <Text style={k.name}>
                    {d.number} · {formatINR(d.total)}
                  </Text>
                  <Text style={k.sub}>
                    {t('crx.interest.period', {
                      from: d.periodFrom,
                      to: d.periodTo,
                      rate: d.ratePa.replace(/\.?0+$/, ''),
                    })}
                  </Text>
                  <Text style={k.sub}>{t(`crx.interest.status.${d.status}`)}</Text>
                  {d.status === 'DRAFT' && ask?.what !== 'cancel' ? (
                    <View style={k.row}>
                      <Button label={t('crx.interest.post')} disabled={s.busy} onPress={() => post(d.id)} />
                      <Button
                        kind="ghost"
                        label={t('crx.interest.cancelRun')}
                        onPress={() => (closeAsk(), setAsk({ what: 'cancel' }))}
                      />
                    </View>
                  ) : null}
                  {ask?.what === 'cancel' ? (
                    <>
                      <Field
                        label={t('crx.reason')}
                        value={reason}
                        onChange={setReason}
                        multiline
                        error={tried && !validReasonText(reason) ? t('crx.v.reason') : null}
                      />
                      <View style={k.row}>
                        <Button
                          label={t('crx.interest.confirmCancel')}
                          disabled={s.busy}
                          onPress={() => confirmAsk(d.id)}
                        />
                        <Button kind="ghost" label={t('crx.cancel')} onPress={closeAsk} />
                      </View>
                    </>
                  ) : null}
                </View>
                {d.lines.map((l) => (
                  <View key={l.id} style={k.card}>
                    <Text style={k.name}>
                      {l.customerName} · {formatINR(l.amount)}
                    </Text>
                    <Text style={k.sub}>
                      {l.detail
                        .map(
                          (i) =>
                            `${i.docNumber ?? t('crx.interest.item')}: ${t('crx.interest.days', { n: i.days })}`,
                        )
                        .join(', ')}
                    </Text>
                    <Text style={k.sub}>
                      {t(`crx.interest.line.${l.status}`)}
                      {l.debitNoteNo ? ` · ${t('crx.interest.debitNote')} ${l.debitNoteNo}` : ''}
                      {l.waiveReason ? ` · ${l.waiveReason}` : ''}
                    </Text>
                    {d.status === 'DRAFT' &&
                    l.status === 'INCLUDED' &&
                    !(ask?.what === 'waive' && ask.lineId === l.id) ? (
                      <Button
                        kind="ghost"
                        label={`${t('crx.interest.waive')} ${l.customerName}`}
                        onPress={() => (closeAsk(), setAsk({ what: 'waive', lineId: l.id }))}
                      />
                    ) : null}
                    {ask?.what === 'waive' && ask.lineId === l.id ? (
                      <>
                        <Field
                          label={t('crx.reason')}
                          value={reason}
                          onChange={setReason}
                          multiline
                          error={tried && !validReasonText(reason) ? t('crx.v.reason') : null}
                        />
                        <View style={k.row}>
                          <Button
                            label={t('crx.interest.confirmWaive')}
                            disabled={s.busy}
                            onPress={() => confirmAsk(d.id)}
                          />
                          <Button kind="ghost" label={t('crx.cancel')} onPress={closeAsk} />
                        </View>
                      </>
                    ) : null}
                  </View>
                ))}
              </>
            ) : null}
          </Gate>
        </>
      )}
    </ScrollView>
  );
}

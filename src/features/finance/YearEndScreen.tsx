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
import { XP, closeYear, fetchYearEnd, fetchYearRefs, xkey } from './fx-api';
import { validReason10 } from './fx-logic';

export default function YearEndScreen() {
  const { t } = useTranslation();
  const s = useSal();
  const key = useActionKey();
  const [pick, setPick] = useState('');
  const [ask, setAsk] = useState(false);
  const [reason, setReason] = useState('');
  const [tried, setTried] = useState(false);
  const ok = s.ready && s.can(XP.view);
  const years = useQuery({
    queryKey: xkey(s.userId, 'years'),
    queryFn: ({ signal }) => fetchYearRefs(s.client!, signal),
    enabled: ok,
    retry: retryNetworkOnce,
  });
  const cur = pick || years.data?.[0]?.id || '';
  const ye = useQuery({
    queryKey: xkey(s.userId, 'yearend', cur),
    queryFn: ({ signal }) => fetchYearEnd(s.client!, cur, signal),
    enabled: ok && cur !== '',
    retry: retryNetworkOnce,
  });
  if (!s.can(XP.view)) return <StateView state="denied" message={t('fx.denied')} />;
  function close() {
    setTried(true);
    if (!validReason10(reason)) return;
    const r = reason.trim();
    void s.act(
      t('fx.year.closedDone'),
      () => closeYear(s.client!, cur, r, key.keyFor(`${cur}|${r}`)),
      () => (
        setAsk(false),
        setReason(''),
        setTried(false),
        key.reset(),
        void ye.refetch(),
        void years.refetch()
      ),
    );
  }
  const v = ye.data;
  return (
    <ScrollView
      contentContainerStyle={k.page}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={ye.isRefetching} onRefresh={() => void ye.refetch()} />}
    >
      <Stack.Screen options={{ headerShown: true, title: t('nav.finYearEnd') }} />
      <Text style={k.title}>{t('fx.year.title')}</Text>
      {s.msg ? <Notice tone="ok" text={s.msg} /> : null}
      {s.failure ? <Notice tone="error" text={s.failure} /> : null}
      <Gate q={years} ns="fx" emptyKey="fx.year.none" isEmpty={(years.data ?? []).length === 0}>
        <Chips
          options={(years.data ?? []).map((y) => ({ value: y.id, label: `${y.label} (${y.status})` }))}
          value={cur}
          onChange={(x) => (setPick(x), setAsk(false))}
        />
        <Gate q={ye} ns="fx" emptyKey="fx.year.none" isEmpty={false}>
          {v ? (
            <>
              <View style={k.card}>
                <Text style={k.name}>{v.fyLabel}</Text>
                <Text style={k.sub}>
                  {v.startDate} → {v.endDate}
                </Text>
                <Text style={k.sub}>{t('fx.year.intro')}</Text>
              </View>
              {v.closed ? (
                <View style={k.card}>
                  <Text style={k.sub}>{t('fx.year.closedOn', { date: v.closed.closedOn })}</Text>
                  <Text style={k.sub}>{t('fx.year.profit', { amount: formatINR(v.closed.netProfit) })}</Text>
                  <Text style={k.sub}>{t('fx.year.next', { label: v.closed.nextFyLabel ?? '-' })}</Text>
                </View>
              ) : (
                <>
                  {v.checks.map((c) => (
                    <View key={c.key} style={k.card}>
                      <Text style={k.name}>{c.label}</Text>
                      <Text style={k.sub}>
                        {c.ok ? t('fx.year.ok') : c.blocking ? t('fx.year.blocks') : t('fx.year.warn')} ·{' '}
                        {c.detail}
                      </Text>
                    </View>
                  ))}
                  {s.can(XP.yearEnd) && !ask ? (
                    <Button label={t('fx.year.close')} onPress={() => (key.reset(), setAsk(true))} />
                  ) : null}
                  {ask ? (
                    <View style={k.card}>
                      <Text style={k.sub}>{t('fx.year.warnLock')}</Text>
                      <Field
                        label={t('fx.reason10')}
                        value={reason}
                        onChange={setReason}
                        multiline
                        error={tried && !validReason10(reason) ? t('fx.v.reason10') : null}
                      />
                      <View style={k.row}>
                        <Button label={t('fx.year.confirm')} disabled={s.busy} onPress={close} />
                        <Button
                          kind="ghost"
                          label={t('fx.cancel')}
                          onPress={() => (setAsk(false), setTried(false))}
                        />
                      </View>
                    </View>
                  ) : null}
                </>
              )}
            </>
          ) : null}
        </Gate>
      </Gate>
    </ScrollView>
  );
}

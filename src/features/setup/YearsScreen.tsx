import { useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@/ui/Button';
import { StateView } from '../stock/StateView';
import { Gate, retryNetworkOnce } from '../purchase/Gate';
import { Field, Notice, k, useActionKey } from '../purchase/ui';
import { useSal } from '../collections/sal-hook';
import {
  SP,
  createYear,
  fetchPeriods,
  fetchYears,
  lockPeriod,
  lockYear,
  skey,
  type FinancialYear,
} from './api';
import { nextDay, validReason, yearErrors } from './logic';

type Ask = { what: 'year'; year: FinancialYear } | { what: 'period'; id: string; label: string } | null;

export default function YearsScreen() {
  const { t } = useTranslation();
  const s = useSal();
  const key = useActionKey();
  const [adding, setAdding] = useState(false);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [months, setMonths] = useState<FinancialYear | null>(null);
  const [ask, setAsk] = useState<Ask>(null);
  const [reason, setReason] = useState('');
  const [tried, setTried] = useState(false);
  const ok = s.ready && s.can(SP.view);

  const years = useQuery({
    queryKey: skey(s.userId, 'years'),
    queryFn: ({ signal }) => fetchYears(s.client!, signal),
    enabled: ok,
    retry: retryNetworkOnce,
  });
  const periods = useQuery({
    queryKey: skey(s.userId, 'periods', months?.id ?? ''),
    queryFn: ({ signal }) => fetchPeriods(s.client!, months!.id, signal),
    enabled: ok && months !== null,
    retry: retryNetworkOnce,
  });
  if (!s.can(SP.view)) return <StateView state="denied" message={t('setup.denied')} />;
  const manage = s.can(SP.year);
  const rows = years.data ?? [];

  function closeAsk() {
    setAsk(null);
    setReason('');
    setTried(false);
    key.reset();
  }
  function openAdd() {
    key.reset();
    setStart(rows.length ? nextDay(rows[rows.length - 1]!.endDate) : '');
    setEnd('');
    setTried(false);
    setAdding(true);
  }
  function add() {
    setTried(true);
    if (yearErrors(start, end).length > 0) return;
    const body = end.trim() ? { startDate: start.trim(), endDate: end.trim() } : { startDate: start.trim() };
    void s.act(
      t('setup.years.created'),
      () => createYear(s.client!, body, key.keyFor(JSON.stringify(body))),
      () => (setAdding(false), key.reset()),
    );
  }
  function confirmLock() {
    if (!ask) return;
    setTried(true);
    if (!validReason(reason)) return;
    const r = reason.trim();
    if (ask.what === 'year') {
      const yid = ask.year.id;
      void s.act(
        t('setup.years.yearLocked'),
        () => lockYear(s.client!, yid, r, key.keyFor(`ly|${yid}|${r}`)),
        () => {
          closeAsk();
          setMonths(null);
        },
      );
    } else {
      const pid = ask.id;
      void s.act(
        t('setup.years.monthLocked'),
        () => lockPeriod(s.client!, pid, r, key.keyFor(`lp|${pid}|${r}`)),
        closeAsk,
      );
    }
  }

  const lockForm = ask ? (
    <View style={k.card}>
      <Text style={k.sub}>
        {ask.what === 'year' ? t('setup.years.lockYearIntro') : t('setup.years.lockMonthIntro')}
      </Text>
      <Field
        label={t('setup.reason')}
        value={reason}
        onChange={setReason}
        multiline
        error={tried && !validReason(reason) ? t('setup.v.reason') : null}
      />
      <View style={k.row}>
        <Button
          label={ask.what === 'year' ? t('setup.years.confirmLockYear') : t('setup.years.confirmLockMonth')}
          disabled={s.busy}
          onPress={confirmLock}
        />
        <Button kind="ghost" label={t('setup.cancel')} onPress={closeAsk} />
      </View>
    </View>
  ) : null;

  return (
    <ScrollView
      contentContainerStyle={k.page}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl refreshing={years.isRefetching} onRefresh={() => void years.refetch()} />
      }
    >
      <Stack.Screen options={{ headerShown: true, title: t('nav.setupYears') }} />
      <Text style={k.title}>{t('setup.years.title')}</Text>
      <Text style={k.sub}>{t('setup.years.intro')}</Text>
      {s.msg ? <Notice tone="ok" text={s.msg} /> : null}
      {s.failure ? <Notice tone="error" text={s.failure} /> : null}

      {months ? (
        <>
          <Button kind="ghost" label={t('setup.back')} onPress={() => (setMonths(null), closeAsk())} />
          <Text style={k.h2}>{t('setup.years.monthsOf', { label: months.label })}</Text>
          {lockForm}
          <Gate
            q={periods}
            ns="setup"
            emptyKey="setup.years.noMonths"
            isEmpty={(periods.data ?? []).length === 0}
          >
            {(periods.data ?? []).map((p) => (
              <View key={p.id} style={k.card}>
                <Text style={k.name}>{p.label}</Text>
                <Text style={k.sub}>
                  {p.startDate} – {p.endDate} · {t(`setup.status.${p.status}`)}
                </Text>
                {manage && p.status === 'OPEN' && ask?.what !== 'period' ? (
                  <Button
                    kind="ghost"
                    label={`${t('setup.years.lockMonth')} ${p.label}`}
                    onPress={() => (closeAsk(), setAsk({ what: 'period', id: p.id, label: p.label }))}
                  />
                ) : null}
              </View>
            ))}
          </Gate>
        </>
      ) : (
        <>
          {manage && !adding ? <Button label={t('setup.years.add')} onPress={openAdd} /> : null}
          {adding ? (
            <View style={k.card}>
              <Text style={k.sub}>{t('setup.years.addIntro')}</Text>
              <Field
                label={t('setup.years.start')}
                value={start}
                onChange={setStart}
                placeholder="YYYY-MM-DD"
                error={tried && yearErrors(start, end).includes('start') ? t('setup.v.date') : null}
              />
              <Field
                label={t('setup.years.end')}
                value={end}
                onChange={setEnd}
                placeholder="YYYY-MM-DD"
                error={tried && yearErrors(start, end).includes('end') ? t('setup.v.endDate') : null}
              />
              <View style={k.row}>
                <Button label={t('setup.years.create')} disabled={s.busy} onPress={add} />
                <Button kind="ghost" label={t('setup.cancel')} onPress={() => setAdding(false)} />
              </View>
            </View>
          ) : null}
          {lockForm}
          <Gate q={years} ns="setup" emptyKey="setup.years.empty" isEmpty={rows.length === 0}>
            {rows.map((y) => (
              <View key={y.id} style={k.card}>
                <Text style={k.name}>{y.label}</Text>
                <Text style={k.sub}>
                  {y.startDate} – {y.endDate} · {t(`setup.status.${y.status}`)}
                </Text>
                <View style={k.row}>
                  <Button
                    kind="ghost"
                    label={`${t('setup.years.months')} ${y.label}`}
                    onPress={() => (closeAsk(), setMonths(y))}
                  />
                  {manage && y.status === 'OPEN' && !(ask?.what === 'year' && ask.year.id === y.id) ? (
                    <Button
                      kind="ghost"
                      label={`${t('setup.years.lockYear')} ${y.label}`}
                      onPress={() => (closeAsk(), setAsk({ what: 'year', year: y }))}
                    />
                  ) : null}
                </View>
              </View>
            ))}
          </Gate>
        </>
      )}
    </ScrollView>
  );
}

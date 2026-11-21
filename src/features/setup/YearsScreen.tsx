import { useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '@/ui/Button';
import { StateView } from '../stock/StateView';
import { Gate, retryNetworkOnce } from '../purchase/Gate';
import { Field, Notice, k, useActionKey } from '../purchase/ui';
import { useSal } from '../collections/sal-hook';
import {
  SP,
  createYear,
  deleteYear,
  editYear,
  fetchPeriods,
  yearDeletable,
  yearEditable,
  yearWhyNot,
  fetchYears,
  lockPeriod,
  lockYear,
  skey,
  type FinancialYear,
} from './api';
import { nextDay, validReason, yearErrors } from './logic';

type Ask =
  | { what: 'year'; year: FinancialYear }
  | { what: 'period'; id: string; label: string }
  | { what: 'edit'; year: FinancialYear }
  | { what: 'delete'; year: FinancialYear }
  | null;

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
  // web parity 16: the dates of the year being edited (declared here, before any early return)
  const [eStart, setEStart] = useState('');
  const [eEnd, setEEnd] = useState('');
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
  // web parity 16: edit the dates of a year nothing is booked in; delete the last one before it starts
  const neighbours = (y: FinancialYear) => {
    const i = rows.findIndex((x) => x.id === y.id);
    return { prev: rows[i - 1], next: rows[i + 1] };
  };
  function openEdit(y: FinancialYear) {
    closeAsk();
    setEStart(y.startDate);
    setEEnd(y.endDate);
    setAsk({ what: 'edit', year: y });
  }
  const editErr = (s0: string, e0: string) => {
    const errs = yearErrors(s0, e0);
    if (!e0.trim()) errs.push('end');
    if (errs.length === 0 && e0.trim() <= s0.trim()) errs.push('end');
    return errs;
  };
  function saveEdit() {
    if (ask?.what !== 'edit') return;
    setTried(true);
    if (editErr(eStart, eEnd).length > 0) return;
    const yid = ask.year.id;
    const body = { startDate: eStart.trim(), endDate: eEnd.trim() };
    void s.act(
      t('wp16.year.updated'),
      () => editYear(s.client!, yid, body, key.keyFor(`ey|${yid}|${JSON.stringify(body)}`)),
      closeAsk,
    );
  }
  function confirmDelete() {
    if (ask?.what !== 'delete') return;
    setTried(true);
    if (!validReason(reason)) return;
    const yid = ask.year.id;
    const r = reason.trim();
    void s.act(
      t('wp16.year.deleted'),
      () => deleteYear(s.client!, yid, r, key.keyFor(`dy|${yid}|${r}`)),
      closeAsk,
    );
  }
  function confirmLock() {
    if (!ask || (ask.what !== 'year' && ask.what !== 'period')) return;
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

  const askYearId = ask && 'year' in ask ? ask.year.id : null;
  const editForm =
    ask?.what === 'edit' ? (
      <View style={k.card}>
        <Text style={k.sub}>{t('wp16.year.editIntro', { label: ask.year.label })}</Text>
        <Field
          label={t('setup.years.start')}
          value={eStart}
          onChange={neighbours(ask.year).prev ? () => undefined : setEStart}
          placeholder="YYYY-MM-DD"
          error={
            neighbours(ask.year).prev
              ? t('wp16.year.fixedByPrev')
              : tried && editErr(eStart, eEnd).includes('start')
                ? t('setup.v.date')
                : null
          }
        />
        <Field
          label={t('setup.years.end')}
          value={eEnd}
          onChange={neighbours(ask.year).next ? () => undefined : setEEnd}
          placeholder="YYYY-MM-DD"
          error={
            neighbours(ask.year).next
              ? t('wp16.year.fixedByNext')
              : tried && editErr(eStart, eEnd).includes('end')
                ? t('setup.v.endDate')
                : null
          }
        />
        <View style={k.row}>
          <Button label={t('wp16.year.save')} disabled={s.busy} onPress={saveEdit} />
          <Button kind="ghost" label={t('setup.cancel')} onPress={closeAsk} />
        </View>
      </View>
    ) : ask?.what === 'delete' ? (
      <View style={k.card}>
        <Text style={k.sub}>
          {t('wp16.year.deleteIntro', {
            label: ask.year.label,
            start: ask.year.startDate,
            end: ask.year.endDate,
          })}
        </Text>
        <Field
          label={t('setup.reason')}
          value={reason}
          onChange={setReason}
          multiline
          error={tried && !validReason(reason) ? t('setup.v.reason') : null}
        />
        <View style={k.row}>
          <Button label={t('wp16.year.confirmDelete')} disabled={s.busy} onPress={confirmDelete} />
          <Button kind="ghost" label={t('setup.cancel')} onPress={closeAsk} />
        </View>
      </View>
    ) : null;

  const lockForm =
    ask && (ask.what === 'year' || ask.what === 'period') ? (
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
          {editForm}
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
                  {manage && yearEditable(y) && askYearId !== y.id ? (
                    <Button
                      kind="ghost"
                      label={`${t('wp16.year.edit')} ${y.label}`}
                      onPress={() => openEdit(y)}
                    />
                  ) : null}
                  {manage && yearDeletable(y, rows) && askYearId !== y.id ? (
                    <Button
                      kind="ghost"
                      label={`${t('wp16.year.delete')} ${y.label}`}
                      onPress={() => (closeAsk(), setAsk({ what: 'delete', year: y }))}
                    />
                  ) : null}
                </View>
                {manage &&
                y.status === 'OPEN' &&
                rows[rows.length - 1]?.id === y.id &&
                yearWhyNot(y, 'delete', rows) ? (
                  <Text style={k.sub}>{t(`wp16.year.why.${yearWhyNot(y, 'delete', rows)}`)}</Text>
                ) : null}
              </View>
            ))}
          </Gate>
        </>
      )}
    </ScrollView>
  );
}

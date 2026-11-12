import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { ApiError, errorMessage, type ErrorMessage } from '@/api/errors';
import { newId } from '@/device';
import { dec, formatINR } from '@/money';
import { Button } from '@/ui/Button';
import { colors, radius } from '@/ui/theme';
import { StateView } from '../stock/StateView';
import { todayIST } from '../collections/receipt';
import { fetchBranches } from './api';
import {
  PERM2,
  addCashMovement,
  closeShift,
  dayEnd,
  fetchDayEnds,
  fetchShifts,
  key2,
  openShift,
  type CashKind,
} from './api-more';

const isNetwork = (e: unknown) => e instanceof ApiError && e.code === 'NETWORK';
const MONEY_RE = /^\d+(\.\d{1,2})?$/;
/** Cash amounts are decimal strings: zero is allowed (an empty drawer), a sign or float noise is not. */
export const validCash = (v: string) => MONEY_RE.test(v.trim());
/** Cash put in or taken out must be more than zero and at most 1,00,00,000 (the server limit). */
export const validMovement = (v: string) =>
  validCash(v) && dec(v.trim()).gt(0) && dec(v.trim()).lte('10000000');
/** A reason of 2 to 200 letters is required by the server. */
export const validReason = (v: string) => v.trim().length >= 2 && v.trim().length <= 200;

export default function ShiftsScreen() {
  const { t } = useTranslation();
  const { me, client } = useAuth();
  const qc = useQueryClient();
  const userId = me?.userId ?? '';
  const can = (p: string) => me?.permissions === undefined || me.permissions.includes(p);
  const ready = client !== null && me !== null && can(PERM2.shift);

  const [form, setForm] = useState<'open' | 'close' | 'dayend' | 'cash' | null>(null);
  const [kind, setKind] = useState<CashKind>('CASH_IN');
  const [shiftId, setShiftId] = useState('');
  const [branch, setBranch] = useState('');
  const [cash, setCash] = useState('');
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [failure, setFailure] = useState<ErrorMessage | null>(null);
  const [busy, setBusy] = useState(false);
  const key = useRef<{ k: string; fp: string } | null>(null);
  const keyFor = (fp: string) => {
    if (!key.current || key.current.fp !== fp) key.current = { k: newId(), fp };
    return key.current.k;
  };

  const shifts = useQuery({
    queryKey: key2(userId, 'shifts'),
    queryFn: ({ signal }) => fetchShifts(client!, signal),
    enabled: ready,
    retry: (n, e) => isNetwork(e) && n < 1,
  });
  const branches = useQuery({
    queryKey: ['pos', 'branches', userId],
    queryFn: ({ signal }) => fetchBranches(client!, signal),
    enabled: ready,
    staleTime: 5 * 60_000,
  });
  const history = useQuery({
    queryKey: key2(userId, 'dayends'),
    queryFn: ({ signal }) => fetchDayEnds(client!, signal),
    enabled: ready && can(PERM2.dayEnd),
    retry: (n, e) => isNetwork(e) && n < 1,
  });
  const branchId = branch || branches.data?.[0]?.id || '';

  async function run(fn: () => Promise<unknown>, done: string) {
    if (busy) return;
    setBusy(true);
    setFailure(null);
    try {
      await fn();
      key.current = null;
      setMsg(done);
      setForm(null);
      setCash('');
      setNote('');
      void qc.invalidateQueries({ queryKey: ['pos2'] });
    } catch (e) {
      setFailure(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const show = (f: 'open' | 'close' | 'dayend' | 'cash', id = '') => {
    key.current = null;
    setMsg(null);
    setFailure(null);
    setShiftId(id);
    setCash(f === 'open' ? '0' : '');
    setKind('CASH_IN');
    setForm(f);
  };

  if (!can(PERM2.shift)) return <StateView state="denied" message={t('shifts.denied')} />;
  if (shifts.isPending && shifts.fetchStatus !== 'idle') return <StateView state="loading" />;
  if (shifts.error) {
    const m = errorMessage(shifts.error);
    return (
      <StateView
        state={isNetwork(shifts.error) ? 'offline' : 'error'}
        message={
          isNetwork(shifts.error)
            ? t('shifts.offline')
            : t(m.key, { ...m.params, correlationId: m.params.correlationId ?? '-' })
        }
        onRetry={() => void shifts.refetch()}
      />
    );
  }

  const moving = form === 'cash';
  const cashErr =
    form && form !== 'dayend' && cash !== '' && !(moving ? validMovement(cash) : validCash(cash));
  const cashOk = moving ? validMovement(cash) && validReason(note) : validCash(cash);
  const closing = (shifts.data ?? []).find((x) => x.id === shiftId);
  const diff = closing && cashOk ? dec(cash).minus(closing.expectedCash) : null;

  return (
    <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
      <Text style={s.title}>{t('shifts.title')}</Text>
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
      <Button label={t('shifts.open')} onPress={() => show('open')} />
      {can(PERM2.dayEnd) ? (
        <Button kind="ghost" label={t('shifts.dayEnd')} onPress={() => show('dayend')} />
      ) : null}

      {form ? (
        <View style={s.card}>
          {form !== 'close' && !moving && (branches.data?.length ?? 0) > 1 ? (
            <View style={s.chips}>
              {branches.data!.map((b) => (
                <Pressable
                  key={b.id}
                  accessibilityRole="radio"
                  accessibilityLabel={b.name}
                  accessibilityState={{ selected: branchId === b.id }}
                  onPress={() => setBranch(b.id)}
                  style={[s.chip, branchId === b.id && s.chipOn]}
                >
                  <Text style={[s.chipTxt, branchId === b.id && s.chipTxtOn]}>{b.name}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          {form === 'dayend' ? (
            <Text style={s.sub}>{t('shifts.dayEndHint', { date: todayIST() })}</Text>
          ) : null}
          {form === 'close' && closing ? (
            <Text style={s.sub}>{t('shifts.expected', { amount: formatINR(closing.expectedCash) })}</Text>
          ) : null}
          {moving ? (
            <View style={s.chips}>
              {(['CASH_IN', 'CASH_OUT'] as const).map((k) => (
                <Pressable
                  key={k}
                  accessibilityRole="radio"
                  accessibilityLabel={t(`shifts.${k}`)}
                  accessibilityState={{ selected: kind === k }}
                  onPress={() => setKind(k)}
                  style={[s.chip, kind === k && s.chipOn]}
                >
                  <Text style={[s.chipTxt, kind === k && s.chipTxtOn]}>{t(`shifts.${k}`)}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          {form !== 'dayend' ? (
            <TextInput
              value={cash}
              onChangeText={setCash}
              placeholder="0.00"
              accessibilityLabel={t(
                form === 'open' ? 'shifts.openingCash' : moving ? 'shifts.amount' : 'shifts.countedCash',
              )}
              keyboardType="decimal-pad"
              style={s.input}
            />
          ) : null}
          {cashErr ? (
            <Text style={s.error}>{t(moving ? 'shifts.badMovement' : 'shifts.badCash')}</Text>
          ) : null}
          {diff && !diff.isZero() ? (
            <Text style={s.warn}>{t('shifts.difference', { amount: formatINR(diff.toFixed(2)) })}</Text>
          ) : null}
          {form === 'close' ? (
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder={t('shifts.note')}
              accessibilityLabel={t('shifts.note')}
              style={s.input}
            />
          ) : null}
          {moving ? (
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder={t('shifts.reason')}
              accessibilityLabel={t('shifts.reason')}
              style={s.input}
            />
          ) : null}
          <Button
            label={t(
              form === 'open'
                ? 'shifts.openNow'
                : form === 'close'
                  ? 'shifts.closeNow'
                  : moving
                    ? 'shifts.cashNow'
                    : 'shifts.dayEndNow',
            )}
            disabled={busy || (form !== 'dayend' && !cashOk) || (!branchId && form !== 'close')}
            onPress={() => {
              if (form === 'open') {
                const b = { branchId, openingCash: dec(cash).toFixed(2) };
                void run(() => openShift(client!, b, keyFor(JSON.stringify(b))), t('shifts.opened'));
              } else if (form === 'cash') {
                const b = { kind, amount: dec(cash).toFixed(2), reason: note.trim() };
                void run(
                  () => addCashMovement(client!, shiftId, b, keyFor(shiftId + JSON.stringify(b))),
                  t('shifts.cashDone'),
                );
              } else if (form === 'close') {
                const b = {
                  countedCash: dec(cash).toFixed(2),
                  ...(note.trim() ? { note: note.trim() } : {}),
                };
                void run(
                  () => closeShift(client!, shiftId, b, keyFor(shiftId + JSON.stringify(b))),
                  t('shifts.closed'),
                );
              } else {
                const b = { branchId, businessDate: todayIST() };
                void run(() => dayEnd(client!, b, keyFor(JSON.stringify(b))), t('shifts.dayClosed'));
              }
            }}
          />
          <Button kind="ghost" label={t('pos.back')} onPress={() => setForm(null)} />
        </View>
      ) : null}

      {(shifts.data ?? []).length === 0 ? <Text style={s.sub}>{t('shifts.empty')}</Text> : null}
      {(shifts.data ?? []).map((x) => (
        <View key={x.id} style={s.card}>
          <Text style={s.name}>
            {x.businessDate} · {x.terminal} · {x.status}
          </Text>
          <Text style={s.sub}>
            {t('shifts.line', { opening: formatINR(x.openingCash), expected: formatINR(x.expectedCash) })}
            {x.countedCash !== null ? ` · ${t('shifts.counted', { amount: formatINR(x.countedCash) })}` : ''}
            {x.difference !== null ? ` · ${t('shifts.diff', { amount: formatINR(x.difference) })}` : ''}
          </Text>
          {x.cashIn !== undefined &&
          x.cashOut !== undefined &&
          (dec(x.cashIn).gt(0) || dec(x.cashOut).gt(0)) ? (
            <Text style={s.sub}>
              {t('shifts.movements', { cashIn: formatINR(x.cashIn), cashOut: formatINR(x.cashOut) })}
            </Text>
          ) : null}
          {x.status === 'OPEN' ? (
            <View style={s.chips}>
              <Button kind="ghost" label={t('shifts.cashMove')} onPress={() => show('cash', x.id)} />
              <Button kind="ghost" label={t('shifts.close')} onPress={() => show('close', x.id)} />
            </View>
          ) : null}
        </View>
      ))}

      {can(PERM2.dayEnd) ? (
        <View style={s.card}>
          <Text style={s.name}>{t('shifts.history')}</Text>
          {history.isPending && history.fetchStatus !== 'idle' ? (
            <Text style={s.sub}>{t('shifts.historyLoading')}</Text>
          ) : null}
          {history.error ? (
            <Text style={s.error}>
              {t(isNetwork(history.error) ? 'shifts.offline' : 'shifts.historyError')}
            </Text>
          ) : null}
          {history.data && history.data.length === 0 ? (
            <Text style={s.sub}>{t('shifts.historyEmpty')}</Text>
          ) : null}
          {(history.data ?? []).map((d) => (
            <Text key={d.id} style={s.sub}>
              {t('shifts.historyLine', {
                date: d.business_date,
                sales: formatINR(d.summary.sales ?? '0'),
                invoices: d.summary.invoices ?? '0',
                diff: formatINR(d.summary.cash_difference ?? '0'),
              })}
            </Text>
          ))}
        </View>
      ) : null}
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
  name: { fontSize: 16, color: colors.ink, fontWeight: '600' },
  sub: { fontSize: 14, color: colors.muted },
  ok: { fontSize: 16, color: colors.ok, fontWeight: '600' },
  warn: { fontSize: 15, color: colors.warn },
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
    paddingHorizontal: 16,
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

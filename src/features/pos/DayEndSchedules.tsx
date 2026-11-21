import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { ApiError, errorMessage, type ErrorMessage } from '@/api/errors';
import { newId } from '@/device';
import { Button } from '@/ui/Button';
import { colors, radius, lineStrong, surface } from '@/ui/theme';
import {
  PERM2,
  fetchDayEndSchedules,
  postponeDayEnd,
  saveDayEndSchedule,
  type DayEndSchedule,
  type DayEndScheduleInput,
} from './api-more';

const HHMM = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
const isNetwork = (e: unknown) => e instanceof ApiError && e.code === 'NETWORK';

/** The server's rules: a time like 21:00, a reminder of 0 to 240 minutes. */
export function scheduleError(f: { closeTime: string; reminderMinutes: string }): 'time' | 'reminder' | null {
  if (!HHMM.test(f.closeTime.trim())) return 'time';
  const m = f.reminderMinutes.trim();
  if (m !== '' && (!/^\d{1,3}$/.test(m) || Number(m) > 240)) return 'reminder';
  return null;
}
/** Postpone by 5 to 240 whole minutes. */
export const validPostpone = (v: string) => /^\d{1,3}$/.test(v.trim()) && Number(v) >= 5 && Number(v) <= 240;

/** Minutes left to the closing time, rounded up like the web; negative once it has passed. */
export const minutesLeft = (s: DayEndSchedule, now: number) => Math.ceil((Date.parse(s.closeAt) - now) / 60000);

/** The branches to remind now: automatic day-end on, the day not closed, inside the reminder window. */
export function dueSchedules(list: DayEndSchedule[], now: number): DayEndSchedule[] {
  return list.filter((s) => s.enabled && !s.closedToday && minutesLeft(s, now) <= s.reminderMinutes);
}
export const isPostponed = (s: DayEndSchedule, now: number) =>
  s.postponedUntil !== null && Date.parse(s.postponedUntil) > now;

const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/** The clock for the countdown, moved on every 15 seconds like the web (the render itself stays pure). */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function useSchedules() {
  const { me, client } = useAuth();
  const can = me?.permissions === undefined || me.permissions.includes(PERM2.dayEnd);
  const enabled = client !== null && me !== null && can;
  const q = useQuery({
    queryKey: ['pos2', 'dayend-schedules', me?.userId ?? ''],
    queryFn: ({ signal }) => fetchDayEndSchedules(client!, signal),
    enabled,
    refetchInterval: 120_000,
    retry: (n, e) => isNetwork(e) && n < 1,
  });
  return { q, enabled, client };
}

/** One Idempotency-Key per user action: the same key is kept while the same request is retried. */
function useKey() {
  const key = useRef<{ k: string; fp: string } | null>(null);
  return {
    of: (fp: string) => {
      if (!key.current || key.current.fp !== fp) key.current = { k: newId(), fp };
      return key.current.k;
    },
    reset: () => {
      key.current = null;
    },
  };
}

/** The countdown shown to people who can close the day: time left, and Postpone 30 minutes (web: dayend-banner). */
export function DayEndBanner() {
  const { t } = useTranslation();
  const { q, enabled, client } = useSchedules();
  const qc = useQueryClient();
  const key = useKey();
  const [fail, setFail] = useState<ErrorMessage | null>(null);
  const [busy, setBusy] = useState(false);
  const now = useNow();
  if (!enabled || !q.data) return null;
  const due = dueSchedules(q.data, now);
  if (due.length === 0) return null;
  const postpone = async (branchId: string) => {
    setBusy(true);
    setFail(null);
    try {
      await postponeDayEnd(client!, branchId, 30, key.of(`${branchId}:30`));
      key.reset();
      await qc.invalidateQueries({ queryKey: ['pos2', 'dayend-schedules'] });
    } catch (e) {
      setFail(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={s.banner} accessibilityRole="alert" accessibilityLiveRegion="polite">
      {due.map((x) => {
        const min = minutesLeft(x, now);
        const text = isPostponed(x, now)
          ? t('wp24.bannerHeld', { branch: x.branchName, time: clock(x.postponedUntil!) })
          : min > 0
            ? t('wp24.bannerLeft', { branch: x.branchName, time: x.closeTime, count: min })
            : t(x.autoClose ? 'wp24.bannerPastAuto' : 'wp24.bannerPast', { branch: x.branchName });
        return (
          <View key={x.branchId} style={s.bannerRow}>
            <Text style={s.bannerTxt}>{text}</Text>
            <Button kind="ghost" label={t('wp24.postpone30')} disabled={busy} onPress={() => void postpone(x.branchId)} />
          </View>
        );
      })}
      {fail ? (
        <Text style={s.error}>{t(fail.key, { ...fail.params, correlationId: fail.params.correlationId ?? '-' })}</Text>
      ) : null}
    </View>
  );
}

/** One card per branch: the schedule, with Edit and Postpone (web: "Automatic day-end"). */
export function DayEndSchedules() {
  const { t } = useTranslation();
  const { q, enabled, client } = useSchedules();
  const qc = useQueryClient();
  const key = useKey();
  const [editing, setEditing] = useState<string | null>(null);
  const [postponing, setPostponing] = useState<string | null>(null);
  const [on, setOn] = useState(false);
  const [time, setTime] = useState('');
  const [reminder, setReminder] = useState('');
  const [auto, setAuto] = useState(true);
  const [minutes, setMinutes] = useState('30');
  const [msg, setMsg] = useState<string | null>(null);
  const [fail, setFail] = useState<ErrorMessage | null>(null);
  const [busy, setBusy] = useState(false);
  const now = useNow();

  if (!enabled) return null;
  const err = editing ? scheduleError({ closeTime: time, reminderMinutes: reminder }) : null;

  async function run(fn: () => Promise<unknown>, done: string) {
    if (busy) return;
    setBusy(true);
    setFail(null);
    try {
      await fn();
      key.reset();
      setMsg(done);
      setEditing(null);
      setPostponing(null);
      await qc.invalidateQueries({ queryKey: ['pos2', 'dayend-schedules'] });
    } catch (e) {
      setFail(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const edit = (x: DayEndSchedule) => {
    setMsg(null);
    setFail(null);
    setPostponing(null);
    key.reset();
    setOn(x.enabled);
    setTime(x.closeTime);
    setReminder(String(x.reminderMinutes));
    setAuto(x.autoClose);
    setEditing(x.branchId);
  };
  const save = (branchId: string) => {
    const b: DayEndScheduleInput = {
      enabled: on,
      closeTime: time.trim(),
      reminderMinutes: Number(reminder.trim() || '0'),
      autoClose: auto,
    };
    const k = key.of(`${branchId}:${JSON.stringify(b)}`);
    void run(() => saveDayEndSchedule(client!, branchId, b, k), t('wp24.saved'));
  };

  return (
    <View style={s.card}>
      <Text style={s.name}>{t('wp24.title')}</Text>
      <Text style={s.sub}>{t('wp24.hint')}</Text>
      {msg ? (
        <Text style={s.ok} accessibilityRole="alert">
          {msg}
        </Text>
      ) : null}
      {fail ? (
        <Text style={s.error} accessibilityRole="alert">
          {t(fail.key, { ...fail.params, correlationId: fail.params.correlationId ?? '-' })}
        </Text>
      ) : null}
      {q.isPending && q.fetchStatus !== 'idle' ? <Text style={s.sub}>{t('wp24.loading')}</Text> : null}
      {q.error ? <Text style={s.error}>{t(isNetwork(q.error) ? 'shifts.offline' : 'wp24.error')}</Text> : null}
      {q.data && q.data.length === 0 ? <Text style={s.sub}>{t('wp24.empty')}</Text> : null}
      {(q.data ?? []).map((x) => {
        return (
          <View key={x.branchId} style={s.item}>
            <Text style={s.name}>{x.branchName}</Text>
            <Text style={s.sub}>
              {x.enabled
                ? t('wp24.line', {
                    time: x.closeTime,
                    reminder: x.reminderMinutes,
                    mode: t(x.autoClose ? 'wp24.modeAuto' : 'wp24.modeRemind'),
                  })
                : t('wp24.off')}
            </Text>
            <Text style={s.sub}>
              {x.closedToday
                ? t('wp24.closedToday')
                : [isPostponed(x, now) ? t('wp24.postponedTo', { time: clock(x.postponedUntil!) }) : null, x.lastResult]
                    .filter(Boolean)
                    .join('. ') || '-'}
            </Text>
            {editing === x.branchId ? (
              <View style={s.form}>
                <Pressable
                  accessibilityRole="switch"
                  accessibilityLabel={t('wp24.enabled')}
                  accessibilityState={{ checked: on }}
                  onPress={() => setOn(!on)}
                  style={[s.chip, on && s.chipOn]}
                >
                  <Text style={[s.chipTxt, on && s.chipTxtOn]}>{t('wp24.enabled')}</Text>
                </Pressable>
                <TextInput
                  value={time}
                  onChangeText={setTime}
                  placeholder="21:00"
                  maxLength={5}
                  accessibilityLabel={t('wp24.closeTime')}
                  style={s.input}
                />
                <TextInput
                  value={reminder}
                  onChangeText={setReminder}
                  keyboardType="number-pad"
                  accessibilityLabel={t('wp24.reminder')}
                  style={s.input}
                />
                <View style={s.chips}>
                  {([true, false] as const).map((m) => (
                    <Pressable
                      key={String(m)}
                      accessibilityRole="radio"
                      accessibilityLabel={t(m ? 'wp24.modeAuto' : 'wp24.modeRemind')}
                      accessibilityState={{ selected: auto === m }}
                      onPress={() => setAuto(m)}
                      style={[s.chip, auto === m && s.chipOn]}
                    >
                      <Text style={[s.chipTxt, auto === m && s.chipTxtOn]}>
                        {t(m ? 'wp24.modeAuto' : 'wp24.modeRemind')}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                {err ? <Text style={s.error}>{t(`wp24.v.${err}`)}</Text> : null}
                <Button label={t('wp24.save')} disabled={busy || err !== null} onPress={() => save(x.branchId)} />
                <Button kind="ghost" label={t('pos.back')} onPress={() => setEditing(null)} />
              </View>
            ) : postponing === x.branchId ? (
              <View style={s.form}>
                <Text style={s.sub}>{t('wp24.postponeHint')}</Text>
                <TextInput
                  value={minutes}
                  onChangeText={setMinutes}
                  keyboardType="number-pad"
                  accessibilityLabel={t('wp24.minutes')}
                  style={s.input}
                />
                {!validPostpone(minutes) ? <Text style={s.error}>{t('wp24.v.minutes')}</Text> : null}
                <Button
                  label={t('wp24.postpone')}
                  disabled={busy || !validPostpone(minutes)}
                  onPress={() =>
                    void run(
                      () => postponeDayEnd(client!, x.branchId, Number(minutes), key.of(`${x.branchId}:${minutes}`)),
                      t('wp24.postponed'),
                    )
                  }
                />
                <Button kind="ghost" label={t('pos.back')} onPress={() => setPostponing(null)} />
              </View>
            ) : (
              <View style={s.chips}>
                <Button kind="ghost" label={t('wp24.edit')} onPress={() => edit(x)} />
                <Button
                  kind="ghost"
                  label={t('wp24.postpone')}
                  disabled={!x.enabled || x.closedToday}
                  onPress={() => {
                    setMsg(null);
                    setFail(null);
                    setMinutes('30');
                    key.reset();
                    setPostponing(x.branchId);
                  }}
                />
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  card: { ...surface.card, padding: 14, gap: 8 },
  item: { gap: 6, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 8 },
  form: { gap: 8 },
  banner: {
    backgroundColor: '#fff7e6',
    borderRadius: radius,
    padding: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: colors.warn,
  },
  bannerRow: { gap: 6 },
  bannerTxt: { fontSize: 15, color: colors.ink, fontWeight: '600' },
  name: { fontSize: 16, color: colors.ink, fontWeight: '600' },
  sub: { fontSize: 14, color: colors.muted },
  ok: { fontSize: 16, color: colors.ok, fontWeight: '600' },
  error: { fontSize: 15, color: colors.danger },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: lineStrong,
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
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    justifyContent: 'center',
    backgroundColor: colors.card,
  },
  chipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipTxt: { fontSize: 15, color: colors.ink },
  chipTxtOn: { color: colors.brandInk, fontWeight: '600' },
});

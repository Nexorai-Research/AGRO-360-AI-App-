import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { errorMessage, type ErrorMessage } from '@/api/errors';
import { newId } from '@/device';
import { Button } from '@/ui/Button';
import { colors, lineStrong, radius, surface } from '@/ui/theme';
import {
  clockOf,
  fetchSchedules,
  minutesLeft,
  postponeDayEnd,
  postponeError,
  reminderOf,
  saveSchedule,
  scheduleError,
  type DaySchedule,
} from './dayend-schedule';

/** Web parity phase 25: the countdown notice and the per-branch schedule of the automatic day-end (pos.dayend). */
export function DayEndSchedulePanel() {
  const { t } = useTranslation();
  const { me, client } = useAuth();
  const qc = useQueryClient();
  const userId = me?.userId ?? '';
  const q = useQuery({
    queryKey: ['pos2', userId, 'dayend-schedules'],
    queryFn: ({ signal }) => fetchSchedules(client!, signal),
    enabled: client !== null,
    refetchInterval: 5 * 60_000,
    retry: false,
  });
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const [editing, setEditing] = useState<DaySchedule | null>(null);
  const [postponing, setPostponing] = useState<DaySchedule | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [auto, setAuto] = useState(true);
  const [time, setTime] = useState('21:00');
  const [reminder, setReminder] = useState('15');
  const [mins, setMins] = useState('30');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [failure, setFailure] = useState<ErrorMessage | null>(null);
  const key = useRef<{ k: string; fp: string } | null>(null);
  const keyFor = (fp: string) => {
    if (!key.current || key.current.fp !== fp) key.current = { k: newId(), fp };
    return key.current.k;
  };

  // A failure here never hides the shifts: the panel is a convenience (the web does the same).
  if (q.error || !q.data || q.data.length === 0) return null;

  async function run(fn: () => Promise<unknown>, done: string) {
    if (busy) return;
    setBusy(true);
    setFailure(null);
    try {
      await fn();
      key.current = null;
      setMsg(done);
      setEditing(null);
      setPostponing(null);
      await qc.invalidateQueries({ queryKey: ['pos2', userId, 'dayend-schedules'] });
    } catch (e) {
      setFailure(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const edit = (x: DaySchedule) => {
    key.current = null;
    setMsg(null);
    setFailure(null);
    setPostponing(null);
    setEditing(x);
    setEnabled(x.enabled);
    setAuto(x.autoClose);
    setTime(x.closeTime);
    setReminder(String(x.reminderMinutes));
  };
  const postpone = (x: DaySchedule) => {
    key.current = null;
    setMsg(null);
    setFailure(null);
    setEditing(null);
    setPostponing(x);
    setMins('30');
  };
  const quick = (x: DaySchedule) =>
    void run(() => postponeDayEnd(client!, x.branchId, 30, keyFor(`${x.branchId}:30`)), t('wp25.postponed30'));

  const due = q.data
    .map((x) => ({ x, r: reminderOf(x, now) }))
    .filter((d): d is { x: DaySchedule; r: NonNullable<ReturnType<typeof reminderOf>> } => d.r !== null);
  const bad = editing ? scheduleError(time, reminder) : null;

  return (
    <View style={s.wrap}>
      {due.map(({ x, r }) => (
        <View key={x.branchId} style={s.banner} accessibilityRole="alert">
          <Text style={s.bannerTxt}>
            {r.kind === 'held'
              ? t('wp25.held', { branch: x.branchName, time: clockOf(x.postponedUntil ?? '') })
              : r.kind === 'left'
                ? t('wp25.left', { branch: x.branchName, time: x.closeTime, count: r.minutes })
                : t(r.kind === 'pastAuto' ? 'wp25.pastAuto' : 'wp25.pastRemind', { branch: x.branchName })}
          </Text>
          <Button kind="ghost" label={t('wp25.postpone30')} disabled={busy} onPress={() => quick(x)} />
        </View>
      ))}
      <View style={s.card}>
        <Text style={s.name}>{t('wp25.title')}</Text>
        <Text style={s.sub}>{t('wp25.hint')}</Text>
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
        {q.data.map((x) => (
          <View key={x.branchId} style={s.row}>
            <Text style={s.branch}>{x.branchName}</Text>
            <Text style={s.sub}>
              {x.enabled
                ? t('wp25.on', {
                    time: x.closeTime,
                    mode: t(x.autoClose ? 'wp25.modeAuto' : 'wp25.modeRemind'),
                  })
                : t('wp25.off')}
              {x.closedToday ? ` · ${t('wp25.closedToday')}` : ''}
              {x.postponedUntil && Date.parse(x.postponedUntil) > now
                ? ` · ${t('wp25.postponedTo', { time: clockOf(x.postponedUntil) })}`
                : ''}
            </Text>
            {x.lastResult ? <Text style={s.sub}>{x.lastResult}</Text> : null}
            {x.enabled && !x.closedToday && minutesLeft(x.closeAt, now) > 0 ? (
              <Text style={s.sub}>{t('wp25.countdown', { count: minutesLeft(x.closeAt, now) })}</Text>
            ) : null}
            <View style={s.chips}>
              <Button kind="ghost" label={t('wp25.edit')} onPress={() => edit(x)} />
              <Button
                kind="ghost"
                label={t('wp25.postpone')}
                disabled={!x.enabled || x.closedToday}
                onPress={() => postpone(x)}
              />
            </View>
            {!x.enabled || x.closedToday ? (
              <Text style={s.sub}>{t(x.closedToday ? 'wp25.whyClosed' : 'wp25.whyOff')}</Text>
            ) : null}
          </View>
        ))}
        {editing ? (
          <View style={s.form}>
            <Text style={s.name}>{t('wp25.editTitle', { branch: editing.branchName })}</Text>
            <Text style={s.sub}>{t('wp25.editHint')}</Text>
            <View style={s.chips}>
              {([true, false] as const).map((v) => (
                <Pressable
                  key={String(v)}
                  accessibilityRole="radio"
                  accessibilityLabel={t(v ? 'wp25.switchOn' : 'wp25.switchOff')}
                  accessibilityState={{ selected: enabled === v }}
                  onPress={() => setEnabled(v)}
                  style={[s.chip, enabled === v && s.chipOn]}
                >
                  <Text style={[s.chipTxt, enabled === v && s.chipTxtOn]}>
                    {t(v ? 'wp25.switchOn' : 'wp25.switchOff')}
                  </Text>
                </Pressable>
              ))}
            </View>
            <TextInput
              value={time}
              onChangeText={setTime}
              placeholder="21:00"
              accessibilityLabel={t('wp25.closeTime')}
              style={s.input}
            />
            <TextInput
              value={reminder}
              onChangeText={setReminder}
              keyboardType="number-pad"
              accessibilityLabel={t('wp25.reminder')}
              style={s.input}
            />
            <View style={s.chips}>
              {([true, false] as const).map((v) => (
                <Pressable
                  key={String(v)}
                  accessibilityRole="radio"
                  accessibilityLabel={t(v ? 'wp25.modeAutoLong' : 'wp25.modeRemindLong')}
                  accessibilityState={{ selected: auto === v }}
                  onPress={() => setAuto(v)}
                  style={[s.chip, auto === v && s.chipOn]}
                >
                  <Text style={[s.chipTxt, auto === v && s.chipTxtOn]}>
                    {t(v ? 'wp25.modeAutoLong' : 'wp25.modeRemindLong')}
                  </Text>
                </Pressable>
              ))}
            </View>
            {bad ? <Text style={s.error}>{t(bad === 'time' ? 'wp25.badTime' : 'wp25.badReminder')}</Text> : null}
            <Button
              label={t('wp25.save')}
              disabled={busy || bad !== null}
              onPress={() => {
                const b = {
                  enabled,
                  closeTime: time.trim(),
                  reminderMinutes: Number(reminder),
                  autoClose: auto,
                };
                void run(
                  () => saveSchedule(client!, editing.branchId, b, keyFor(`${editing.branchId}${JSON.stringify(b)}`)),
                  t('wp25.saved'),
                );
              }}
            />
            <Button kind="ghost" label={t('wp25.cancel')} onPress={() => setEditing(null)} />
          </View>
        ) : null}
        {postponing ? (
          <View style={s.form}>
            <Text style={s.name}>{t('wp25.postponeTitle', { branch: postponing.branchName })}</Text>
            <Text style={s.sub}>{t('wp25.postponeHint')}</Text>
            <TextInput
              value={mins}
              onChangeText={setMins}
              keyboardType="number-pad"
              accessibilityLabel={t('wp25.minutes')}
              style={s.input}
            />
            {postponeError(mins) ? <Text style={s.error}>{t('wp25.badMinutes')}</Text> : null}
            <Button
              label={t('wp25.postponeDo')}
              disabled={busy || postponeError(mins)}
              onPress={() =>
                void run(
                  () =>
                    postponeDayEnd(client!, postponing.branchId, Number(mins), keyFor(`${postponing.branchId}:${mins}`)),
                  t('wp25.postponed'),
                )
              }
            />
            <Button kind="ghost" label={t('wp25.cancel')} onPress={() => setPostponing(null)} />
          </View>
        ) : null}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { gap: 10 },
  banner: { ...surface.card, padding: 14, gap: 8, borderColor: colors.warn, borderWidth: 1 },
  bannerTxt: { fontSize: 15, color: colors.warn, fontWeight: '600' },
  card: { ...surface.card, padding: 14, gap: 8 },
  name: { fontSize: 16, color: colors.ink, fontWeight: '600' },
  branch: { fontSize: 15, color: colors.ink, fontWeight: '600' },
  sub: { fontSize: 14, color: colors.muted },
  ok: { fontSize: 15, color: colors.ok, fontWeight: '600' },
  error: { fontSize: 15, color: colors.danger },
  row: { gap: 4, paddingTop: 6 },
  form: { gap: 8, paddingTop: 8 },
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

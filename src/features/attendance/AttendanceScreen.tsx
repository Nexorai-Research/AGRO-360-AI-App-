import { useRef, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { ApiError, errorMessage } from '@/api/errors';
import { newId } from '@/device';
import { Button } from '@/ui/Button';
import { colors, radius } from '@/ui/theme';
import { formatClock } from '@/features/home/format';
import {
  ATTENDANCE_PERMISSION,
  checkIn,
  checkOut,
  daysBefore,
  fetchMine,
  fetchToday,
  formatWorked,
  mineKey,
  setGeoConsent,
  todayKey,
  type AttendanceRecord,
  type PunchBody,
  type PunchResult,
  type TodayAttendance,
} from './api';
import { getFix } from './location';

type Kind = 'in' | 'out';
/** One user action: its idempotency key and the exact body. A retry sends both again, unchanged. */
type Pending = { kind: Kind; key: string; body: PunchBody };
type PendingConsent = { value: boolean; key: string };

const RECENT_DAYS = 30;
const retryable = (e: unknown) => e instanceof ApiError && (e.code === 'NETWORK' || e.status >= 500);
const isNetwork = (e: unknown) => e instanceof ApiError && e.code === 'NETWORK';
const isForbidden = (e: unknown) => e instanceof ApiError && e.status === 403;
const STATE_CODES = new Set(['ALREADY_CHECKED_IN', 'ALREADY_CHECKED_OUT', 'NOT_CHECKED_IN']);

function Row({ r }: { r: AttendanceRecord }) {
  const { t, i18n } = useTranslation();
  const inT = r.checkIn ? formatClock(r.checkIn, i18n.language) : '—';
  const outT = r.checkOut ? formatClock(r.checkOut, i18n.language) : '—';
  const worked = formatWorked(r.workedMinutes);
  return (
    <View style={s.row} accessible accessibilityLabel={`${r.date} ${t(`attendance.status.${r.status}`, { defaultValue: r.status })} ${inT} ${outT}`}>
      <View style={s.rowTop}>
        <Text style={s.date}>{r.date}</Text>
        <Text style={s.status}>{t(`attendance.status.${r.status}`, { defaultValue: r.status })}</Text>
      </View>
      <Text style={s.line}>
        {inT} → {outT}
        {worked ? `   ${t('attendance.workedShort', { worked })}` : ''}
      </Text>
      {r.outsideFence ? <Text style={s.warn}>{t('attendance.outsideFence')}</Text> : null}
      {r.autoClosed ? <Text style={s.warn}>{t('attendance.autoClosed')}</Text> : null}
    </View>
  );
}

export default function AttendanceScreen() {
  const { t, i18n } = useTranslation();
  const { me, client } = useAuth();
  const queryClient = useQueryClient();
  const userId = me?.userId ?? '';
  // Permissions only decide what is shown; the server decides on every call. Unknown permissions means: ask the server.
  const knownDenied = me?.permissions !== undefined && !me.permissions.includes(ATTENDANCE_PERMISSION);

  const pending = useRef<Pending | null>(null);
  const pendingConsent = useRef<PendingConsent | null>(null);
  const [later, setLater] = useState(false);
  const [notSaved, setNotSaved] = useState(false);

  const today = useQuery({
    queryKey: todayKey(userId),
    queryFn: ({ signal }) => fetchToday(client!, signal),
    enabled: client !== null && me !== null && !knownDenied,
    staleTime: 30_000,
    retry: (n, e) => isNetwork(e) && n < 1,
  });
  const day = today.data?.date;
  const from = day ? daysBefore(day, RECENT_DAYS) : '';
  const mine = useQuery({
    queryKey: mineKey(userId, from, day ?? ''),
    queryFn: ({ signal }) => fetchMine(client!, from, day!, signal),
    enabled: client !== null && me !== null && !knownDenied && day !== undefined,
    staleTime: 30_000,
    retry: (n, e) => isNetwork(e) && n < 1,
  });

  const punch = useMutation<PunchResult, unknown, Kind>({
    mutationFn: async (kind) => {
      // The key and the body are made once per user action. A retry after a network failure reuses both, location included.
      if (!pending.current || pending.current.kind !== kind) {
        const td = today.data;
        let body: PunchBody = { method: 'MOBILE' };
        // A location is asked for only when the franchise allows it AND the employee agreed; the server drops it otherwise.
        if (td?.geoCaptureAllowed && td.geoConsent) {
          const fix = await getFix();
          if (fix) body = { ...body, lat: fix.lat, lng: fix.lng };
        }
        pending.current = { kind, key: newId(), body };
      }
      const p = pending.current;
      return p.kind === 'in' ? checkIn(client!, p.body, p.key) : checkOut(client!, p.body, p.key);
    },
    onSuccess: (res) => {
      pending.current = null;
      setNotSaved(res.locationIgnored);
      queryClient.setQueryData<TodayAttendance>(todayKey(userId), (old) => (old ? { ...old, record: res } : old));
      void queryClient.invalidateQueries({ queryKey: ['attendance', 'mine', userId] });
    },
    onError: (e) => {
      if (!retryable(e)) pending.current = null;
      if (e instanceof ApiError && STATE_CODES.has(e.code)) void queryClient.invalidateQueries({ queryKey: todayKey(userId) });
    },
  });

  const consent = useMutation<unknown, unknown, boolean>({
    mutationFn: (value) => {
      if (!pendingConsent.current || pendingConsent.current.value !== value) pendingConsent.current = { value, key: newId() };
      return setGeoConsent(client!, value, pendingConsent.current.key);
    },
    onSuccess: () => {
      pendingConsent.current = null;
      void queryClient.invalidateQueries({ queryKey: todayKey(userId) });
    },
    onError: (e) => {
      if (!retryable(e)) pendingConsent.current = null;
    },
  });

  const refresh = () => {
    void today.refetch();
    void mine.refetch();
  };

  const td = today.data;
  const rec = td?.record ?? null;
  const denied = knownDenied || isForbidden(today.error) || isForbidden(punch.error) || isForbidden(consent.error);
  const offline = isNetwork(today.error) || isNetwork(punch.error) || isNetwork(consent.error);
  // Check in and out are online only: without a fresh answer from the server the buttons stay off.
  const canPunch = td !== undefined && !isNetwork(today.error) && !punch.isPending;
  const phase: 'in' | 'out' | 'done' = !rec || !rec.checkIn ? 'in' : rec.checkOut ? 'done' : 'out';
  // The last tap failed in a way that may be retried (network or server fault): the button then says "Try again" and re-sends the same key.
  const retryPending = punch.isError && retryable(punch.error) && punch.variables === phase;
  const punchError = punch.error && !isNetwork(punch.error) && !isForbidden(punch.error) ? errorMessage(punch.error) : null;
  const otherError =
    today.error && !isNetwork(today.error) && !isForbidden(today.error) ? errorMessage(today.error) : null;
  const clock = (iso: string) => formatClock(iso, i18n.language);

  let status: React.ReactNode;
  if (denied) {
    status = (
      <View style={s.card} accessibilityRole="alert">
        <Text style={s.line}>{t('attendance.denied')}</Text>
      </View>
    );
  } else if (today.isPending && today.fetchStatus !== 'idle') {
    status = (
      <View style={s.center} accessibilityLabel={t('common.loading')}>
        <ActivityIndicator color={colors.brand} />
        <Text style={s.sub}>{t('common.loading')}</Text>
      </View>
    );
  } else if (!td) {
    status = (
      <View style={s.card}>
        {otherError ? (
          <Text style={s.err} accessibilityRole="alert">
            {t(otherError.key, otherError.params)}
          </Text>
        ) : null}
        {offline ? <Text style={s.warn}>{t('attendance.offline')}</Text> : null}
        <Button label={t('common.retry')} onPress={refresh} />
      </View>
    );
  } else {
    status = (
      <View style={s.card}>
        <Text style={s.state}>
          {phase === 'in'
            ? t('attendance.notCheckedIn')
            : phase === 'out'
              ? t('attendance.working', { time: clock(rec!.checkIn!) })
              : t('attendance.done', { in: clock(rec!.checkIn!), out: clock(rec!.checkOut!), worked: formatWorked(rec!.workedMinutes) })}
        </Text>
        {rec?.outsideFence ? <Text style={s.warn}>{t('attendance.outsideFence')}</Text> : null}
        {notSaved ? <Text style={s.sub}>{t('attendance.locationNotSaved')}</Text> : null}
        {phase === 'done' ? (
          <Button label={t('attendance.finished')} disabled onPress={() => {}} />
        ) : (
          <View style={s.big}>
            <Button
              label={
                punch.isPending
                  ? t('attendance.sending')
                  : retryPending
                    ? t('attendance.retrySame')
                    : phase === 'in'
                      ? t('attendance.checkIn')
                      : t('attendance.checkOut')
              }
              disabled={!canPunch}
              onPress={() => punch.mutate(phase)}
            />
          </View>
        )}
        {punchError ? (
          <Text style={s.err} accessibilityRole="alert">
            {t(punchError.key, punchError.params)}
          </Text>
        ) : null}
        {offline ? (
          <Text style={s.warn} accessibilityRole="alert">
            {t('attendance.offline')}
          </Text>
        ) : null}
      </View>
    );
  }

  // Location choice. Shown only when the franchise allows location capture at all.
  let consentCard: React.ReactNode = null;
  if (td && !denied && td.geoCaptureAllowed) {
    if (!td.geoConsent && !later) {
      consentCard = (
        <View style={s.card}>
          <Text style={s.h}>{t('attendance.consentTitle')}</Text>
          <Text style={s.line}>{t('attendance.consentBody')}</Text>
          <Button label={consent.isPending ? t('attendance.consentSaving') : t('attendance.consentAllow')} disabled={consent.isPending} onPress={() => consent.mutate(true)} />
          <Button kind="ghost" label={t('attendance.consentLater')} onPress={() => setLater(true)} />
        </View>
      );
    } else if (td.geoConsent) {
      consentCard = (
        <View style={s.card}>
          <Text style={s.line}>{t('attendance.consentOn')}</Text>
          <Button kind="ghost" label={t('attendance.consentStop')} disabled={consent.isPending} onPress={() => consent.mutate(false)} />
        </View>
      );
    }
  }

  const items = mine.data?.items ?? [];
  const header = (
    <View style={s.head}>
      <Text style={s.title}>{t('attendance.title')}</Text>
      {today.dataUpdatedAt && td ? <Text style={s.sub}>{t('attendance.updated', { time: clock(new Date(today.dataUpdatedAt).toISOString()) })}</Text> : null}
      {offline && td ? <Text style={s.sub}>{t('attendance.offlineSaved', { time: clock(new Date(today.dataUpdatedAt).toISOString()) })}</Text> : null}
      {status}
      {consentCard}
      {td && !denied ? <Text style={s.h}>{t('attendance.recent')}</Text> : null}
    </View>
  );

  return (
    <FlatList
      testID="attendance-list"
      data={denied ? [] : items}
      keyExtractor={(r) => r.id}
      renderItem={({ item }) => <Row r={item} />}
      ListHeaderComponent={header}
      ListEmptyComponent={td && !denied && mine.isSuccess ? <Text style={s.sub}>{t('attendance.emptyRecent')}</Text> : undefined}
      refreshControl={<RefreshControl refreshing={today.isRefetching || mine.isRefetching} onRefresh={refresh} />}
      contentContainerStyle={s.wrap}
      style={s.list}
    />
  );
}

const s = StyleSheet.create({
  list: { backgroundColor: colors.bg },
  wrap: { padding: 20, gap: 10 },
  head: { gap: 12, marginBottom: 4 },
  title: { fontSize: 24, fontWeight: '700', color: colors.ink },
  sub: { color: colors.muted },
  center: { alignItems: 'center', gap: 8, padding: 24 },
  card: { backgroundColor: colors.card, borderRadius: radius, borderWidth: 1, borderColor: colors.line, padding: 16, gap: 12 },
  state: { fontSize: 18, fontWeight: '600', color: colors.ink },
  big: { minHeight: 72, justifyContent: 'center' },
  h: { fontWeight: '600', color: colors.ink, fontSize: 16 },
  line: { color: colors.ink },
  warn: { color: colors.warn },
  err: { color: colors.danger },
  row: { backgroundColor: colors.card, borderRadius: radius, borderWidth: 1, borderColor: colors.line, padding: 12, gap: 4 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between' },
  date: { fontWeight: '600', color: colors.ink },
  status: { color: colors.brand, fontWeight: '600' },
});

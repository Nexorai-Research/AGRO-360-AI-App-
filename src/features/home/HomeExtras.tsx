import { useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import * as SecureStore from 'expo-secure-store';
import { useAuth } from '@/auth/AuthProvider';
import { ApiError, errorMessage } from '@/api/errors';
import { dec, formatINR } from '@/money';
import { Button } from '@/ui/Button';
import { Field } from '@/ui/kit';
import { colors, radius } from '@/ui/theme';
import { todayIST } from '../collections/receipt';
import { shortDate } from '../hr/logic';
import { formatINRShort } from './format';
import {
  DEFAULT_GOAL,
  EXTRA_PERM,
  GOAL_KEY,
  expiryTone,
  fetchAlerts,
  fetchApprovals,
  fetchComplaints,
  fetchCreditBills,
  fetchExpiring,
  fetchLatestBills,
  fetchWeekly,
  insightsFrom,
  sharePct,
  validGoal,
} from './extras';

const keyOf = (userId: string, what: string) => ['home', 'extra', userId, what] as const;
const retry = (n: number, e: unknown) => e instanceof ApiError && e.code === 'NETWORK' && n < 1;

/** A card with a title that shows its own loading, error (with reference code) and retry, so one failing part never hides the rest. */
function Section<T>({
  title,
  q,
  children,
}: {
  title: string;
  q: { isPending: boolean; fetchStatus: string; error: unknown; data: T | undefined; refetch: () => unknown };
  children: (d: T) => ReactNode;
}) {
  const { t } = useTranslation();
  const err = q.error ? errorMessage(q.error) : null;
  return (
    <View style={s.card} testID={`extra-${title}`}>
      <Text style={s.h}>{title}</Text>
      {q.isPending && q.fetchStatus !== 'idle' ? <Text style={s.sub}>{t('common.loading')}</Text> : null}
      {err && q.data === undefined ? (
        <View accessibilityRole="alert">
          <Text style={s.error}>
            {t(err.key, { ...err.params, correlationId: err.params.correlationId ?? '-' })}
          </Text>
          <Button kind="ghost" label={t('common.retry')} onPress={() => void q.refetch()} />
        </View>
      ) : null}
      {q.data !== undefined ? children(q.data) : null}
    </View>
  );
}

const useCanLoose = () => {
  const { me } = useAuth();
  return (p: string) => me?.permissions === undefined || me.permissions.includes(p);
};

export default function HomeExtras() {
  const { t, i18n } = useTranslation();
  const { me, client } = useAuth();
  const can = useCanLoose();
  const userId = me?.userId ?? '';
  const today = todayIST();
  const on = client !== null && me !== null;

  const weekly = useQuery({
    queryKey: keyOf(userId, 'weekly'),
    queryFn: ({ signal }) => fetchWeekly(client!, today, signal),
    enabled: on && can(EXTRA_PERM.reports),
    staleTime: 60_000,
    retry,
  });
  const bills = useQuery({
    queryKey: keyOf(userId, 'bills'),
    queryFn: ({ signal }) => fetchLatestBills(client!, signal),
    enabled: on && can(EXTRA_PERM.sales),
    staleTime: 60_000,
    retry,
  });
  const expiring = useQuery({
    queryKey: keyOf(userId, 'expiring'),
    queryFn: ({ signal }) => fetchExpiring(client!, signal),
    enabled: on && can(EXTRA_PERM.stock),
    staleTime: 60_000,
    retry,
  });
  const po = useQuery({
    queryKey: keyOf(userId, 'po'),
    queryFn: ({ signal }) => fetchApprovals(client!, signal),
    enabled: on && can(EXTRA_PERM.po),
    staleTime: 60_000,
    retry,
  });
  const complaints = useQuery({
    queryKey: keyOf(userId, 'complaints'),
    queryFn: ({ signal }) => fetchComplaints(client!, signal),
    enabled: on && can(EXTRA_PERM.customer),
    staleTime: 60_000,
    retry,
  });
  const alerts = useQuery({
    queryKey: keyOf(userId, 'alerts'),
    queryFn: ({ signal }) => fetchAlerts(client!, signal),
    enabled: on && can(EXTRA_PERM.stock),
    staleTime: 60_000,
    retry,
  });
  const credit = useQuery({
    queryKey: keyOf(userId, 'credit'),
    queryFn: ({ signal }) => fetchCreditBills(client!, signal),
    enabled: on && can(EXTRA_PERM.sales),
    staleTime: 60_000,
    retry,
  });

  const dayName = (iso: string) => {
    try {
      return new Date(`${iso}T00:00:00Z`).toLocaleDateString(
        i18n.language === 'en' ? 'en-IN' : `${i18n.language}-IN-u-nu-latn`,
        { weekday: 'long', timeZone: 'UTC' },
      );
    } catch {
      return shortDate(iso);
    }
  };
  const insights = insightsFrom(weekly.data, expiring.data, po.data ?? null, dayName);

  const attention: { id: string; count: number | null; label: string }[] = [
    ...(can(EXTRA_PERM.po) ? [{ id: 'po', count: po.data ?? null, label: t('homex.attPo') }] : []),
    ...(can(EXTRA_PERM.customer)
      ? [{ id: 'complaints', count: complaints.data ?? null, label: t('homex.attComplaints') }]
      : []),
    ...(can(EXTRA_PERM.stock)
      ? [{ id: 'alerts', count: alerts.data ?? null, label: t('homex.attAlerts') }]
      : []),
    ...(can(EXTRA_PERM.sales)
      ? [{ id: 'credit', count: credit.data ?? null, label: t('homex.attCredit') }]
      : []),
  ];

  return (
    <View style={s.wrap}>
      {can(EXTRA_PERM.reports) ? (
        <Goal
          userId={userId}
          today={weekly.data?.days[6]?.total ?? null}
          state={weekly.isPending ? 'loading' : weekly.error ? 'error' : 'ok'}
        />
      ) : null}

      {can(EXTRA_PERM.reports) ? (
        <Section title={t('homex.mix')} q={weekly}>
          {(w) =>
            dec(w.total).isZero() ? (
              <Text style={s.sub}>{t('homex.mixEmpty')}</Text>
            ) : (
              <>
                {(['cash', 'digital', 'credit'] as const).map((k) => (
                  <View
                    key={k}
                    style={s.mixRow}
                    accessible
                    accessibilityLabel={`${t(`homex.mix_${k}`)} ${sharePct(w.mix[k], w.total)}%`}
                  >
                    <Text style={s.mixLabel}>{t(`homex.mix_${k}`)}</Text>
                    <View style={s.track}>
                      <View
                        style={[
                          s.fill,
                          k === 'credit' && s.fillWarn,
                          { width: `${Math.max(2, Number(sharePct(w.mix[k], w.total)))}%` },
                        ]}
                      />
                    </View>
                    <Text style={s.mixVal}>
                      {sharePct(w.mix[k], w.total)}% · {formatINRShort(w.mix[k])}
                    </Text>
                  </View>
                ))}
                <Text style={s.sub}>
                  {t('homex.mixNote', { total: formatINRShort(w.total), bills: w.bills })}
                </Text>
              </>
            )
          }
        </Section>
      ) : null}

      {can(EXTRA_PERM.sales) ? (
        <Section title={t('homex.bills')} q={bills}>
          {(rows) =>
            rows.length === 0 ? (
              <Text style={s.sub}>{t('homex.billsEmpty')}</Text>
            ) : (
              rows.map((b) => (
                <View key={b.id} style={s.billRow}>
                  <View style={s.flex}>
                    <Text style={s.line}>{b.number}</Text>
                    <Text style={s.sub}>
                      {shortDate(b.invoiceDate)} · {b.customerName ?? t('homex.walkIn')}
                      {dec(b.creditAmount ?? '0').gt(0) ? ` · ${t('homex.credit')}` : ''}
                    </Text>
                  </View>
                  <Text style={s.line}>{formatINR(b.total)}</Text>
                </View>
              ))
            )
          }
        </Section>
      ) : null}

      {can(EXTRA_PERM.stock) ? (
        <Section title={t('homex.expiring')} q={expiring}>
          {(rows) =>
            rows.length === 0 ? (
              <Text style={s.sub}>{t('homex.expiringEmpty')}</Text>
            ) : (
              rows.slice(0, 5).map((b, i) => (
                <View key={`${b.skuName}-${b.batchNo}-${i}`} style={s.billRow}>
                  <View style={s.flex}>
                    <Text style={s.line}>{b.skuName}</Text>
                    <Text style={s.sub}>
                      {t('homex.batchLine', { batch: b.batchNo ?? '-', qty: dec(b.onHand).toFixed(0) })}
                    </Text>
                  </View>
                  <Text
                    style={[
                      s.days,
                      expiryTone(b.daysToExpiry ?? 0) === 'hot'
                        ? s.hot
                        : expiryTone(b.daysToExpiry ?? 0) === 'warm'
                          ? s.warm
                          : null,
                    ]}
                  >
                    {t('homex.days', { count: b.daysToExpiry ?? 0 })}
                  </Text>
                </View>
              ))
            )
          }
        </Section>
      ) : null}

      {attention.length > 0 ? (
        <View style={s.card} testID="extra-attention">
          <Text style={s.h}>{t('homex.attention')}</Text>
          {attention.map((a) => (
            <View key={a.id} style={s.billRow}>
              <Text style={[s.line, s.flex]}>{a.label}</Text>
              <Text
                style={[s.badge, a.count ? s.badgeOn : null]}
                accessibilityLabel={`${a.label}: ${a.count ?? '-'}`}
              >
                {a.count === null ? '-' : String(a.count)}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {insights.length > 0 ? (
        <View style={s.card} testID="extra-insights">
          <Text style={s.h}>{t('homex.insights')}</Text>
          {insights.map((i) => (
            <Text key={i.id} style={[s.line, i.tone === 'bad' ? s.hot : i.tone === 'warn' ? s.warm : s.good]}>
              {t(`homex.in_${i.id}`, {
                ...i.params,
                amount: typeof i.params.amount === 'string' ? formatINRShort(i.params.amount) : undefined,
              })}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** Today's sales against a goal the owner sets. The goal is kept on this phone only. */
function Goal({
  userId,
  today,
  state,
}: {
  userId: string;
  today: string | null;
  state: 'loading' | 'error' | 'ok';
}) {
  const { t } = useTranslation();
  const [goal, setGoal] = useState(DEFAULT_GOAL);
  const [edit, setEdit] = useState(false);
  const [draft, setDraft] = useState('');
  const storeKey = `${GOAL_KEY}.${userId}`;
  useEffect(() => {
    let live = true;
    SecureStore.getItemAsync(storeKey)
      .then((v) => {
        if (live && v && validGoal(v)) setGoal(v);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [storeKey]);
  const save = () => {
    if (!validGoal(draft)) return;
    setGoal(draft.trim());
    setEdit(false);
    SecureStore.setItemAsync(storeKey, draft.trim()).catch(() => undefined);
  };
  const pct = today === null ? 0 : Math.min(100, Number(sharePct(today, goal)));
  return (
    <View style={s.card} testID="extra-goal">
      <Text style={s.h}>{t('homex.goal')}</Text>
      {today === null ? (
        <Text style={s.sub}>{state === 'error' ? t('homex.goalNoData') : t('common.loading')}</Text>
      ) : (
        <>
          <Text style={s.line}>
            {t('homex.goalLine', { today: formatINRShort(today), goal: formatINRShort(goal) })}
          </Text>
          <View style={s.track} accessible accessibilityLabel={`${pct}%`}>
            <View style={[s.fill, { width: `${Math.max(2, pct)}%` }]} />
          </View>
          <Text style={s.sub}>
            {dec(today).gte(goal)
              ? t('homex.goalReached')
              : t('homex.goalToGo', { amount: formatINRShort(dec(goal).minus(today).toFixed(2)) })}
          </Text>
        </>
      )}
      {edit ? (
        <>
          <Field
            label={t('homex.goalField')}
            value={draft}
            onChange={setDraft}
            keyboard="number-pad"
            error={draft !== '' && !validGoal(draft) ? t('homex.goalBad') : null}
          />
          <Button label={t('stf.save')} disabled={!validGoal(draft)} onPress={save} />
          <Button kind="ghost" label={t('stf.cancel')} onPress={() => setEdit(false)} />
        </>
      ) : (
        <Button kind="ghost" label={t('homex.goalChange')} onPress={() => (setDraft(goal), setEdit(true))} />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { gap: 12, marginTop: 4 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 16,
    gap: 8,
  },
  h: { fontWeight: '600', color: colors.ink, fontSize: 16 },
  line: { color: colors.ink },
  sub: { color: colors.muted, fontSize: 13 },
  error: { color: colors.danger },
  flex: { flex: 1 },
  billRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 36 },
  mixRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  mixLabel: { width: 72, color: colors.muted, fontSize: 13 },
  mixVal: { width: 110, textAlign: 'right', color: colors.ink, fontSize: 12 },
  track: { flex: 1, height: 10, backgroundColor: colors.brandSoft, borderRadius: 5, overflow: 'hidden' },
  fill: { height: 10, backgroundColor: colors.brand, borderRadius: 5 },
  fillWarn: { backgroundColor: colors.warn },
  days: { color: colors.ink, fontWeight: '600' },
  hot: { color: colors.danger },
  warm: { color: colors.warn },
  good: { color: colors.ok },
  badge: { minWidth: 32, textAlign: 'center', color: colors.muted, fontWeight: '700' },
  badgeOn: { color: colors.danger },
});

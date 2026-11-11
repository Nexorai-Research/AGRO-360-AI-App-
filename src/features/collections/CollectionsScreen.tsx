import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Linking, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { ApiError, errorMessage } from '@/api/errors';
import { dec, formatINR, sub, sum } from '@/money';
import { Button } from '@/ui/Button';
import { colors, radius } from '@/ui/theme';
import { formatClock } from '@/features/home/format';
import {
  PERM,
  agingKey,
  fetchAging,
  fetchOpenTasks,
  tasksKey,
  type AgingReport,
  type AgingRow,
  type CollectionTask,
} from './api';

type Tab = 'aging' | 'tasks';

const retryNetworkOnce = (n: number, e: unknown) => e instanceof ApiError && e.code === 'NETWORK' && n < 1;

/** Overdue part of one customer: everything that is not in the "not due yet" bucket. */
export const overdueOf = (r: AgingRow): string => sub(r.total, r.buckets.NOT_DUE ?? '0');

/** Biggest dues first: that is the order a collector works in. Compared as decimals, never as floats. */
export const byTotalDesc = (rows: AgingRow[]): AgingRow[] => [...rows].sort((a, b) => dec(b.total).comparedTo(dec(a.total)));

function Banner({ text }: { text: string }) {
  return (
    <View style={s.offline} accessibilityRole="alert">
      <Text style={s.offlineTxt}>{text}</Text>
    </View>
  );
}

function StateBlock({ q, empty, isEmpty }: { q: UseQueryResult<unknown, Error>; empty: string; isEmpty: boolean }) {
  const { t } = useTranslation();
  const err = q.error ? errorMessage(q.error) : null;
  if (q.isPending && q.fetchStatus !== 'idle') {
    return (
      <View style={s.center} accessibilityLabel={t('common.loading')}>
        <ActivityIndicator color={colors.brand} />
        <Text style={s.sub}>{t('common.loading')}</Text>
      </View>
    );
  }
  if (err && q.data === undefined) {
    return (
      <View style={s.card} accessibilityRole="alert">
        <Text style={s.error}>{t(err.key, { ...err.params, correlationId: err.params.correlationId ?? '-' })}</Text>
        <Button label={t('common.retry')} onPress={() => void q.refetch()} />
      </View>
    );
  }
  if (q.data !== undefined && isEmpty) {
    return (
      <View style={s.card}>
        <Text style={s.line}>{empty}</Text>
      </View>
    );
  }
  return null;
}

function AgingItem({ row }: { row: AgingRow }) {
  const { t } = useTranslation();
  const overdue = overdueOf(row);
  const hasAdvance = dec(row.onAccount).gt(0);
  return (
    <View style={s.row} accessible accessibilityLabel={`${row.customerName}: ${formatINR(row.total)}`}>
      <View style={s.rowMain}>
        <Text style={s.name}>{row.customerName}</Text>
        {dec(overdue).gt(0) ? <Text style={s.overdue}>{t('collections.overdueAmount', { amount: formatINR(overdue) })}</Text> : null}
        {hasAdvance ? <Text style={s.sub}>{t('collections.onAccount', { amount: formatINR(row.onAccount) })}</Text> : null}
      </View>
      <Text style={s.amount}>{formatINR(row.total)}</Text>
    </View>
  );
}

function TaskItem({ task }: { task: CollectionTask }) {
  const { t } = useTranslation();
  return (
    <View style={s.row}>
      <View style={s.rowMain}>
        <Text style={s.name}>{task.customerName}</Text>
        {task.village ? <Text style={s.sub}>{task.village}</Text> : null}
        <Text style={s.overdue}>{t('collections.taskOverdue', { amount: formatINR(task.overdueAmount), days: task.oldestDays })}</Text>
        {task.mobile ? (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={t('collections.call', { name: task.customerName })}
            onPress={() => void Linking.openURL(`tel:${task.mobile}`)}
            style={s.call}
          >
            <Text style={s.callTxt}>{t('collections.callButton')}</Text>
          </Pressable>
        ) : null}
      </View>
      <Text style={s.amount}>{formatINR(task.overdueAmount)}</Text>
    </View>
  );
}

export default function CollectionsScreen() {
  const { t, i18n } = useTranslation();
  const { me, client } = useAuth();
  const router = useRouter();
  const userId = me?.userId ?? '';
  // Permissions only hide things; the server decides on every call. Unknown permissions (older /me) means: ask the server.
  const known = me?.permissions;
  const can = (p: string) => known === undefined || known.includes(p);
  const canAging = can(PERM.aging);
  const canTasks = can(PERM.tasks);
  const canReceipt = can(PERM.receipt);
  const denied = !canAging && !canTasks && !canReceipt;
  const [chosen, setChosen] = useState<Tab>('aging');
  const tab: Tab = chosen === 'aging' && !canAging ? 'tasks' : chosen === 'tasks' && !canTasks ? 'aging' : chosen;

  const aging = useQuery({
    queryKey: agingKey(userId),
    queryFn: ({ signal }) => fetchAging(client!, signal),
    enabled: client !== null && me !== null && canAging && tab === 'aging',
    staleTime: 60_000,
    retry: retryNetworkOnce,
  });
  const tasks = useQuery({
    queryKey: tasksKey(userId),
    queryFn: ({ signal }) => fetchOpenTasks(client!, signal),
    enabled: client !== null && me !== null && canTasks && tab === 'tasks',
    staleTime: 60_000,
    retry: retryNetworkOnce,
  });

  const q = (tab === 'aging' ? aging : tasks) as UseQueryResult<AgingReport | CollectionTask[], Error>;
  const forbidden = q.error instanceof ApiError && q.error.status === 403;
  const offline = q.error instanceof ApiError && q.error.code === 'NETWORK' && q.data !== undefined;
  const asOf = q.dataUpdatedAt ? formatClock(new Date(q.dataUpdatedAt).toISOString(), i18n.language) : '';

  const rows = useMemo(() => (aging.data ? byTotalDesc(aging.data.rows) : []), [aging.data]);
  const totals = useMemo(() => {
    if (!aging.data) return null;
    const all = sum(aging.data.rows.map((r) => r.total));
    const overdue = sum(aging.data.rows.map((r) => overdueOf(r)));
    return { all, overdue };
  }, [aging.data]);

  const showDenied = denied || forbidden;

  const header = (
    <View style={s.head}>
      <Text style={s.title}>{t('collections.title')}</Text>
      {canReceipt ? <Button label={t('collections.newReceipt')} onPress={() => router.push('/collections/receipt-new')} /> : null}
      {canAging && canTasks ? (
        <View style={s.tabs} accessibilityRole="tablist">
          {(['aging', 'tasks'] as const).map((k) => (
            <Pressable
              key={k}
              accessibilityRole="tab"
              accessibilityLabel={t(k === 'aging' ? 'collections.tabOutstanding' : 'collections.tabFollowUps')}
              accessibilityState={{ selected: tab === k }}
              onPress={() => setChosen(k)}
              style={[s.tab, tab === k && s.tabOn]}
            >
              <Text style={[s.tabTxt, tab === k && s.tabTxtOn]}>{t(k === 'aging' ? 'collections.tabOutstanding' : 'collections.tabFollowUps')}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {offline ? <Banner text={t('collections.offline', { time: asOf })} /> : null}
      {!showDenied && tab === 'aging' && totals && rows.length > 0 ? (
        <View style={s.card}>
          <Text style={s.sub}>{t('collections.asOn', { date: aging.data?.asOn ?? '' })}</Text>
          <Text style={s.sub}>{t('collections.totalOutstanding')}</Text>
          <Text style={s.big}>{formatINR(totals.all)}</Text>
          <Text style={s.overdue}>{t('collections.overdueAmount', { amount: formatINR(totals.overdue) })}</Text>
        </View>
      ) : null}
      {showDenied ? (
        <View style={s.card} accessibilityRole="alert">
          <Text style={s.line}>{t('collections.denied')}</Text>
        </View>
      ) : (
        <StateBlock
          q={q}
          empty={t(tab === 'aging' ? 'collections.emptyAging' : 'collections.emptyTasks')}
          isEmpty={Array.isArray(q.data) ? q.data.length === 0 : (q.data?.rows.length ?? 0) === 0}
        />
      )}
    </View>
  );

  const refresh = <RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} colors={[colors.brand]} />;

  if (tab === 'tasks') {
    return (
      <FlatList
        testID="collections-list"
        style={s.list}
        contentContainerStyle={s.content}
        data={showDenied ? [] : (tasks.data ?? [])}
        keyExtractor={(x) => x.id}
        renderItem={({ item }) => <TaskItem task={item} />}
        refreshControl={refresh}
        ListHeaderComponent={header}
      />
    );
  }
  return (
    <FlatList
      testID="collections-list"
      style={s.list}
      contentContainerStyle={s.content}
      data={showDenied ? [] : rows}
      keyExtractor={(x) => x.customerId}
      renderItem={({ item }) => <AgingItem row={item} />}
      refreshControl={refresh}
      ListHeaderComponent={header}
    />
  );
}

const s = StyleSheet.create({
  list: { backgroundColor: colors.bg },
  content: { padding: 16, gap: 8 },
  head: { gap: 12, marginBottom: 8 },
  title: { fontSize: 24, fontWeight: '700', color: colors.ink },
  sub: { color: colors.muted, fontSize: 13 },
  center: { alignItems: 'center', gap: 8, padding: 24 },
  card: { backgroundColor: colors.card, borderRadius: radius, borderWidth: 1, borderColor: colors.line, padding: 16, gap: 6 },
  line: { color: colors.ink },
  error: { color: colors.danger },
  big: { fontSize: 28, fontWeight: '700', color: colors.ink },
  tabs: { flexDirection: 'row', gap: 8 },
  tab: { flex: 1, minHeight: 44, borderRadius: radius, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  tabOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  tabTxt: { color: colors.ink, fontSize: 15 },
  tabTxtOn: { color: colors.brandInk, fontWeight: '600' },
  row: { flexDirection: 'row', gap: 12, backgroundColor: colors.card, borderRadius: radius, borderWidth: 1, borderColor: colors.line, padding: 14, alignItems: 'flex-start' },
  rowMain: { flex: 1, gap: 2 },
  name: { color: colors.ink, fontWeight: '600', fontSize: 16 },
  amount: { color: colors.ink, fontWeight: '700', fontSize: 16 },
  overdue: { color: colors.danger, fontSize: 13 },
  call: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  callTxt: { color: colors.info, fontSize: 15, fontWeight: '600' },
  offline: { backgroundColor: '#fff4dd', borderRadius: radius, padding: 12 },
  offlineTxt: { color: colors.warn },
});

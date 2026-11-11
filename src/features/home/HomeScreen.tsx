import { useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { ApiError, errorMessage } from '@/api/errors';
import { dec } from '@/money';
import { Button } from '@/ui/Button';
import { LanguagePicker } from '@/ui/LanguagePicker';
import { colors, radius } from '@/ui/theme';
import {
  OWNER_DASHBOARD_PERMISSION,
  fetchOwnerDashboard,
  homeKey,
  pickHomeTiles,
  type OwnerDashboard,
  type Tile,
} from './api';
import { formatClock, formatCount, formatINRShort, formatPercent } from './format';

const PERIOD = 'today';

const TONE: Record<string, string> = {
  net_sales: colors.ok,
  bills: colors.info,
  receivables_outstanding: colors.warn,
  receivables_overdue: colors.danger,
  low_stock_count: colors.danger,
  expiry_exposure: colors.warn,
  stock_value: colors.brand2,
};

function tileValue(t: Tile): string {
  if (t.value === null) return '—';
  if (t.unit === 'money') return formatINRShort(t.value);
  if (t.unit === 'percent') return formatPercent(t.value);
  return formatCount(t.value);
}

function TileCard({ tile }: { tile: Tile }) {
  const { t } = useTranslation();
  const label = t(`home.tile.${tile.id}`, { defaultValue: tile.label });
  const change = tile.changePct !== null ? `${Number(tile.changePct) > 0 ? '+' : ''}${tile.changePct}%` : null;
  return (
    <View style={[s.tile, { borderLeftColor: TONE[tile.id] ?? colors.brand }]} accessible accessibilityLabel={`${label}: ${tileValue(tile)}`}>
      <Text style={s.tileLabel}>{label}</Text>
      <Text style={s.tileValue}>{tileValue(tile)}</Text>
      {tile.state === 'INSUFFICIENT_DATA' ? <Text style={s.note}>{t('home.noData')}</Text> : null}
      {change ? <Text style={s.note}>{t('home.change', { pct: change })}</Text> : null}
    </View>
  );
}

function Trend({ data }: { data: OwnerDashboard['trend'] }) {
  const { t } = useTranslation();
  if (data.length === 0) return null;
  const max = data.reduce((m, d) => (dec(d.netSales).gt(m) ? dec(d.netSales) : m), dec(0));
  return (
    <View style={s.card}>
      <Text style={s.h}>{t('home.trend')}</Text>
      {data.map((d) => {
        // the bar width is layout only; the money shown next to it stays a string through formatINRShort
        const pct = max.isZero() ? 0 : dec(d.netSales).div(max).times(100).toNumber();
        return (
          <View key={d.day} style={s.trendRow} accessible accessibilityLabel={`${d.day}: ${formatINRShort(d.netSales)}`}>
            <Text style={s.trendDay}>{d.day.slice(5)}</Text>
            <View style={s.trendTrack}>
              <View style={[s.trendBar, { width: `${Math.max(pct > 0 ? 2 : 0, pct)}%` }]} />
            </View>
            <Text style={s.trendVal}>{formatINRShort(d.netSales)}</Text>
          </View>
        );
      })}
    </View>
  );
}

function Profile() {
  const { t } = useTranslation();
  const { me, signOut } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  if (!me) return null;
  const perms = me.permissions ?? [];
  return (
    <View style={s.card}>
      <Text style={s.h}>{t('home.profile')}</Text>
      <Text style={s.line}>{t('home.hello', { name: me.userId })}</Text>
      <Text style={s.line}>
        {t('home.roles')}: {me.roles.join(', ') || '—'}
      </Text>
      <Text style={s.line}>
        {t('home.permissions')}: {perms.length}
      </Text>
      {perms.length > 0 ? <Button kind="ghost" label={open ? t('home.hidePermissions') : t('home.showPermissions')} onPress={() => setOpen(!open)} /> : null}
      {open ? <Text style={s.perms}>{perms.join('\n')}</Text> : null}
      <LanguagePicker />
      <Button
        kind="ghost"
        label={t('home.signOut')}
        onPress={() => {
          // another user on this phone must never see this user's cached numbers
          queryClient.clear();
          void signOut();
        }}
      />
    </View>
  );
}

export default function HomeScreen() {
  const { t, i18n } = useTranslation();
  const { me, client } = useAuth();
  const userId = me?.userId ?? '';
  // permissions are only used to hide the screen; the server decides on every call. Unknown permissions (older /me) means: ask the server.
  const knownDenied = me?.permissions !== undefined && !me.permissions.includes(OWNER_DASHBOARD_PERMISSION);

  const q = useQuery({
    queryKey: homeKey(userId, PERIOD),
    queryFn: ({ signal }) => fetchOwnerDashboard(client!, PERIOD, signal),
    enabled: client !== null && me !== null && !knownDenied,
    staleTime: 60_000,
    retry: (n, e) => e instanceof ApiError && e.code === 'NETWORK' && n < 1,
  });

  const header = (
    <View style={s.head}>
      <Text style={s.title}>{t('home.title')}</Text>
      {q.data ? <Text style={s.sub}>{t('home.updated', { time: formatClock(q.data.asOf, i18n.language) })}</Text> : null}
    </View>
  );

  const err = q.error ? errorMessage(q.error) : null;
  const denied = knownDenied || (q.error instanceof ApiError && q.error.status === 403);
  const offline = q.error instanceof ApiError && q.error.code === 'NETWORK' && q.data !== undefined;
  const tiles = q.data ? pickHomeTiles(q.data) : [];

  let top: React.ReactNode = null;
  if (denied) {
    top = (
      <View style={s.card} accessibilityRole="alert">
        <Text style={s.line}>{t('home.denied')}</Text>
      </View>
    );
  } else if (q.isPending && q.fetchStatus !== 'idle') {
    top = (
      <View style={s.center} accessibilityLabel={t('common.loading')}>
        <ActivityIndicator color={colors.brand} />
        <Text style={s.sub}>{t('common.loading')}</Text>
      </View>
    );
  } else if (err && !q.data) {
    top = (
      <View style={s.card} accessibilityRole="alert">
        <Text style={s.error}>{t(err.key, { ...err.params, correlationId: err.params.correlationId ?? '-' })}</Text>
        <Button label={t('common.retry')} onPress={() => void q.refetch()} />
      </View>
    );
  } else if (q.data && tiles.length === 0) {
    top = (
      <View style={s.card}>
        <Text style={s.line}>{t('home.empty')}</Text>
      </View>
    );
  }

  const banner =
    offline && q.data ? (
      <View style={s.offline} accessibilityRole="alert">
        <Text style={s.offlineTxt}>{t('home.offline', { time: formatClock(q.data.asOf, i18n.language) })}</Text>
      </View>
    ) : null;

  return (
    <FlatList
      testID="home-list"
      style={s.list}
      contentContainerStyle={s.content}
      data={denied ? [] : tiles}
      keyExtractor={(x) => x.id}
      numColumns={2}
      columnWrapperStyle={s.col}
      renderItem={({ item }) => <TileCard tile={item} />}
      refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} colors={[colors.brand]} />}
      ListHeaderComponent={
        <View>
          {header}
          {banner}
          {top}
        </View>
      }
      ListFooterComponent={
        <View style={s.footer}>
          {q.data && !denied ? <Trend data={q.data.trend} /> : null}
          <Profile />
        </View>
      }
    />
  );
}

const s = StyleSheet.create({
  list: { backgroundColor: colors.bg },
  content: { padding: 16, gap: 12 },
  col: { gap: 12 },
  head: { gap: 2, marginBottom: 8 },
  title: { fontSize: 24, fontWeight: '700', color: colors.ink },
  sub: { color: colors.muted },
  center: { alignItems: 'center', gap: 8, padding: 24 },
  tile: { flex: 1, backgroundColor: colors.card, borderRadius: radius, borderWidth: 1, borderColor: colors.line, borderLeftWidth: 4, padding: 12, gap: 4, minHeight: 92 },
  tileLabel: { color: colors.muted, fontSize: 13 },
  tileValue: { color: colors.ink, fontSize: 22, fontWeight: '700' },
  note: { color: colors.muted, fontSize: 12 },
  card: { backgroundColor: colors.card, borderRadius: radius, borderWidth: 1, borderColor: colors.line, padding: 16, gap: 8, marginTop: 4 },
  h: { fontWeight: '600', color: colors.ink, fontSize: 16 },
  line: { color: colors.ink },
  perms: { color: colors.muted, fontSize: 12 },
  error: { color: colors.danger },
  offline: { backgroundColor: '#fff4dd', borderRadius: radius, padding: 12, marginBottom: 8 },
  offlineTxt: { color: colors.warn },
  footer: { gap: 12, marginTop: 8 },
  trendRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 22 },
  trendDay: { width: 44, color: colors.muted, fontSize: 12 },
  trendTrack: { flex: 1, height: 10, backgroundColor: colors.brandSoft, borderRadius: 5, overflow: 'hidden' },
  trendBar: { height: 10, backgroundColor: colors.brand, borderRadius: 5 },
  trendVal: { width: 72, textAlign: 'right', color: colors.ink, fontSize: 12 },
});

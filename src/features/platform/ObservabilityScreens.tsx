import { useState, type ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/ui/Button';
import { StateView } from '../stock/StateView';
import {
  Bar,
  Card,
  Chips,
  Field,
  Gate,
  Line,
  Notice,
  isNetwork,
  kit,
  useCan,
  useFailureText,
} from '../hr/kit';
import { isPlatformUser } from './PlatformScreens';
import { todayIST } from '../collections/receipt';
import {
  defaultPeriod,
  earliestDay,
  isCustom,
  periodKey,
  periodQuery,
  rangeError,
  type Period,
} from './obs-period';

// Web parity phase 12: User Application Observability (apps/web/src/pages/observability.js). A franchise administrator
// (identity.security.manage) sees the own franchise; a platform operator sees every franchise. The API decides who may read what.

export const OBS_PERM = 'identity.security.manage';
export const DAY_CHOICES = ['7', '14', '30', '60', '90'] as const;
export const ADOPTIONS = ['ACTIVE', 'LIGHT', 'AT_RISK', 'DORMANT', 'NEVER', 'NEW'] as const;
const SURFACES = ['WEB', 'API', 'WORKER', 'MOBILE'] as const;
const retry = (n: number, e: unknown) => isNetwork(e) && n < 1;
const num = (v: number | null | undefined) => (v === null || v === undefined ? '-' : String(v));

interface Totals {
  activeUsers?: number;
  accounts?: number;
  events: number;
  errors: number;
  warnings?: number;
  slow: number;
  p95Ms: number | null;
  trainingNeeded?: number;
  franchises?: number;
  quietFranchises?: number;
}
interface Daily {
  day: string;
  events: number;
  users: number;
  errors: number;
  warnings: number;
}
interface Surface {
  surface: string;
  events: number;
  users: number;
  errors: number;
  warnings: number;
}
interface Issue {
  route: string;
  surface: string;
  errors: number;
  warnings: number;
  slow: number;
  users: number;
  lastAt: string | null;
  status: number | null;
  sample: string | null;
}
interface Profile {
  adoption: string;
  score: number;
  label?: string;
  signals: { severity: string; text: string }[];
  talkingPoints?: string[];
  trainingNeeded?: boolean;
}
interface UserRow {
  userId: string;
  userName: string | null;
  username?: string | null;
  profile: Profile;
  usage: {
    lastSeen: string | null;
    activeDays: number;
    pageViews: number;
    errors: number;
    slow: number;
    surfaces?: string[];
  } | null;
}
export interface Overview {
  days: number;
  from?: string | null;
  to?: string | null;
  retentionDays: number;
  totals: Totals;
  daily: Daily[];
  surfaces: Surface[];
  adoption: Record<string, number>;
  pages: { route: string; views: number; users: number }[];
  issues: Issue[];
  users: UserRow[];
}

/** "3 days ago", like the web's ago(). */
export function ago(t: TFunction, iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return t('wp12.ob.never');
  const d = Math.floor((now - Date.parse(iso)) / 86_400_000);
  if (d <= 0) {
    const h = Math.floor((now - Date.parse(iso)) / 3_600_000);
    return h <= 0 ? t('wp12.ob.justNow') : t('wp12.ob.hoursAgo', { count: h });
  }
  return d === 1 ? t('wp12.ob.yesterday') : t('wp12.ob.daysAgo', { count: d });
}
/** Users who are not doing well, the weakest first, at most six (the web's "who to talk to first"). */
export const needAttention = (users: UserRow[]) =>
  users.filter((u) => u.profile.adoption !== 'ACTIVE' && u.profile.adoption !== 'NEW').slice(0, 6);
/** The web's franchise health badge. */
export function franchiseHealth(f: { status: string; events: number; errors: number; p95Ms: number | null }) {
  if (f.status !== 'ACTIVE') return 'off';
  if (f.events === 0) return 'quiet';
  return f.errors > 20 || (f.p95Ms ?? 0) > 2500 ? 'struggling' : 'healthy';
}

const Page = ({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) => (
  <ScrollView contentContainerStyle={kit.page} keyboardShouldPersistTaps="handled">
    <Text style={kit.title} accessibilityRole="header">
      {title}
    </Text>
    {hint ? <Text style={kit.sub}>{hint}</Text> : null}
    {children}
  </ScrollView>
);
/** The period: the last N days, or (when `custom`) a range of two dates. One person's page only knows days. */
export function PeriodBar({
  value,
  onChange,
  custom = true,
}: {
  value: Period;
  onChange: (v: Period) => void;
  custom?: boolean;
}) {
  const { t } = useTranslation();
  const today = todayIST();
  const [open, setOpen] = useState(isCustom(value));
  const [from, setFrom] = useState(value.from || earliestDay(today));
  const [to, setTo] = useState(value.to || today);
  const err = rangeError(from, to, today);
  const showRange = custom && open;
  const options: { id: string; label: string }[] = DAY_CHOICES.map((d) => ({
    id: d,
    label: t('wp12.ob.lastDays', { count: Number(d) }),
  }));
  if (custom) options.push({ id: 'custom', label: t('wp27.custom') });
  return (
    <>
      <Chips
        label={t('wp12.ob.period')}
        options={options}
        value={showRange ? 'custom' : value.days}
        onChange={(id) => {
          if (id === 'custom') return setOpen(true);
          setOpen(false);
          onChange({ days: id, from: '', to: '' });
        }}
      />
      {showRange ? (
        <>
          <Field label={t('wp27.from')} value={from} onChange={setFrom} placeholder="YYYY-MM-DD" />
          <Field label={t('wp27.to')} value={to} onChange={setTo} placeholder="YYYY-MM-DD" />
          <Text style={kit.sub}>
            {err ? t(`wp27.err.${err}`) : t('wp27.hint', { from: earliestDay(today) })}
          </Text>
          <Button
            label={t('wp27.apply')}
            disabled={err !== null}
            onPress={() => onChange({ days: value.days, from: from.trim(), to: to.trim() })}
          />
        </>
      ) : null}
    </>
  );
}
function Bars({ rows, empty }: { rows: { label: string; value: number; note?: string }[]; empty: string }) {
  if (!rows.length) return <Text style={kit.sub}>{empty}</Text>;
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <>
      {rows.map((r) => (
        <View key={r.label} style={{ gap: 2 }}>
          <Line label={r.label} value={r.note ?? String(r.value)} />
          <Bar pct={(r.value / max) * 100} label={`${r.label}: ${r.value}`} />
        </View>
      ))}
    </>
  );
}
function Surfaces({ list }: { list: Surface[] }) {
  const { t } = useTranslation();
  const by = new Map(list.map((s) => [s.surface, s]));
  return (
    <Card>
      <Text style={kit.name}>{t('wp12.ob.sources')}</Text>
      {SURFACES.map((k) => {
        const s = by.get(k);
        return (
          <Line
            key={k}
            label={t(`wp12.ob.surface.${k}`)}
            value={
              s
                ? t('wp12.ob.surfaceLine', { events: s.events, users: s.users, errors: s.errors })
                : t('wp12.ob.noActivity')
            }
          />
        );
      })}
    </Card>
  );
}
function DailyCard({ daily }: { daily: Daily[] }) {
  const { t } = useTranslation();
  return (
    <Card>
      <Text style={kit.name}>{t('wp12.ob.daily')}</Text>
      <Bars
        rows={[...daily].reverse().map((d) => ({
          label: d.day,
          value: d.events,
          note: t('wp12.ob.dayLine', { events: d.events, users: d.users, errors: d.errors }),
        }))}
        empty={t('wp12.ob.noActivity')}
      />
    </Card>
  );
}
function Issues({ list }: { list: Issue[] }) {
  const { t } = useTranslation();
  return (
    <Card>
      <Text style={kit.name}>{t('wp12.ob.trouble')}</Text>
      {list.length === 0 ? <Text style={kit.sub}>{t('wp12.ob.noIssues')}</Text> : null}
      {list.map((i, n) => (
        <View key={`${i.route}-${n}`} style={{ gap: 2 }}>
          <Text style={kit.name}>
            {i.route} · {t(`wp12.ob.surface.${i.surface}`, { defaultValue: i.surface })}
          </Text>
          <Text style={kit.sub}>
            {t('wp12.ob.issueLine', { errors: i.errors, warnings: i.warnings, slow: i.slow, users: i.users })}
            {i.status ? ` · HTTP ${i.status}` : ''}
            {i.sample && !/^HTTP \d+$/.test(i.sample) ? ` · ${i.sample}` : ''}
          </Text>
        </View>
      ))}
    </Card>
  );
}
function Tiles({ rows }: { rows: [string, string, boolean?][] }) {
  return (
    <Card>
      {rows.map(([l, v, strong]) => (
        <Line key={l} label={l} value={v} strong={strong} />
      ))}
    </Card>
  );
}

// ---- one user ---------------------------------------------------------------------------------------------------------------------
interface UserView {
  user: { userName: string | null; username: string | null };
  profile: Profile & { label: string; talkingPoints: string[]; trainingNeeded: boolean };
  usage: {
    lastSeen: string | null;
    activeDays: number;
    sessions: number;
    pageViews: number;
    distinctAreas: number;
    errors: number;
    validation: number;
    denied: number;
    slow: number;
    p95Ms: number | null;
  } | null;
  journey: {
    start: string;
    minutes: number;
    events: number;
    surfaces: string[];
    errors: number;
    slow: number;
    warnings: number;
    steps: {
      at: string;
      type: string;
      route: string | null;
      status: number | null;
      durationMs: number | null;
      message: string | null;
    }[];
  }[];
  journeyTruncated?: boolean;
  pages: { route: string; views: number }[];
  issues: Issue[];
}
function UserDetail({ userId, days, onBack }: { userId: string; days: string; onBack: () => void }) {
  const { t } = useTranslation();
  const { me, client } = useAuth();
  const fail = useFailureText();
  const [brief, setBrief] = useState<{ text: string; ai: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const q = useQuery({
    queryKey: ['obs', me?.userId ?? '', 'user', userId, days],
    queryFn: ({ signal }) =>
      client!.get<UserView>(`/observability/users/${encodeURIComponent(userId)}`, {
        query: { days },
        signal,
      }),
    enabled: client !== null,
    retry,
  });
  const v = q.data;
  const u = v?.usage;
  return (
    <>
      <Button kind="ghost" label={t('wp12.ob.allUsers')} onPress={onBack} />
      <Gate query={q} denied={false} deniedText={t('wp12.denied')} offlineText={t('wp12.offline')}>
        {v ? (
          <>
            <Text style={kit.name}>{v.user.userName ?? v.user.username ?? t('wp12.ob.unknown')}</Text>
            <Text style={kit.sub}>
              {v.user.username ? `${v.user.username} · ` : ''}
              {v.profile.label} · {t('wp12.ob.lastDays', { count: Number(days) })}
            </Text>
            <Tiles
              rows={[
                [t('wp12.ob.doing'), `${v.profile.label} (${v.profile.score}/100)`, true],
                [t('wp12.ob.lastSeen'), ago(t, u?.lastSeen)],
                [t('wp12.ob.daysActive'), u ? `${u.activeDays} / ${days}` : '0'],
                [
                  t('wp12.ob.screens'),
                  u ? `${u.pageViews} · ${t('wp12.ob.areas', { count: u.distinctAreas })}` : '0',
                ],
                [t('wp12.ob.errors'), num(u?.errors ?? 0)],
                [
                  t('wp12.ob.refused'),
                  u ? t('wp12.ob.refusedLine', { bad: u.validation, denied: u.denied }) : '0',
                ],
                [t('wp12.ob.slow'), u ? `${u.slow}${u.p95Ms ? ` · p95 ${u.p95Ms} ms` : ''}` : '0'],
              ]}
            />
            <Card>
              <Text style={kit.name}>{t('wp12.ob.signals')}</Text>
              {v.profile.signals.length === 0 ? <Text style={kit.sub}>{t('wp12.ob.nothing')}</Text> : null}
              {v.profile.signals.map((s, i) => (
                <Text key={i} style={kit.sub}>
                  {t(`wp12.ob.sev.${s.severity}`, { defaultValue: s.severity })}: {s.text}
                </Text>
              ))}
              <Notice
                tone={v.profile.trainingNeeded ? 'warn' : 'ok'}
                text={t(v.profile.trainingNeeded ? 'wp12.ob.training' : 'wp12.ob.noTraining')}
              />
            </Card>
            <Card>
              <Text style={kit.name}>{t('wp12.ob.prepare')}</Text>
              <Text style={kit.sub}>{t('wp12.ob.prepareHint')}</Text>
              {v.profile.talkingPoints.map((p, i) => (
                <Text key={i} style={kit.sub}>
                  • {p}
                </Text>
              ))}
              <Button
                label={t('wp12.ob.brief')}
                disabled={busy}
                onPress={() => {
                  setBusy(true);
                  void client!
                    .get<{ summary: string | null; reason?: string }>(
                      `/observability/users/${encodeURIComponent(userId)}/coaching`,
                      { query: { days } },
                    )
                    .then((r) =>
                      setBrief(
                        r.summary
                          ? { text: r.summary, ai: true }
                          : { text: r.reason ?? t('wp12.ob.noBrief'), ai: false },
                      ),
                    )
                    .catch((e: unknown) => setBrief({ text: fail(e), ai: false }))
                    .finally(() => setBusy(false));
                }}
              />
              {brief ? (
                <>
                  {brief.ai ? <Text style={kit.sub}>{t('wp12.ob.aiNote')}</Text> : null}
                  <Text style={kit.sub}>{brief.text}</Text>
                </>
              ) : null}
            </Card>
            <Card>
              <Text style={kit.name}>{t('wp12.ob.path')}</Text>
              {v.journey.length === 0 ? <Text style={kit.sub}>{t('wp12.ob.noActivity')}</Text> : null}
              {v.journey.map((vis, i) => (
                <View key={i} style={{ gap: 2 }}>
                  <Text style={kit.name}>
                    {vis.start.slice(0, 16).replace('T', ' ')} ·{' '}
                    {t('wp12.ob.visitLine', {
                      minutes: vis.minutes,
                      events: vis.events,
                      errors: vis.errors,
                      slow: vis.slow,
                    })}
                  </Text>
                  {vis.steps.slice(0, 30).map((s, j) => (
                    <Text key={j} style={kit.sub}>
                      {s.at.slice(11, 16)} · {t(`wp12.ob.step.${s.type}`, { defaultValue: s.type })}{' '}
                      {s.route ?? ''}
                      {s.durationMs ? ` · ${s.durationMs} ms` : ''}
                      {s.message && !/^HTTP \d+$/.test(s.message) ? ` · ${s.message}` : ''}
                    </Text>
                  ))}
                </View>
              ))}
              {v.journeyTruncated ? <Text style={kit.sub}>{t('wp12.ob.older')}</Text> : null}
            </Card>
            <Card>
              <Text style={kit.name}>{t('wp12.ob.theirScreens')}</Text>
              <Bars
                rows={v.pages.map((p) => ({ label: p.route, value: p.views }))}
                empty={t('wp12.ob.noViews')}
              />
            </Card>
            <Issues list={v.issues} />
          </>
        ) : null}
      </Gate>
    </>
  );
}

// ---- the franchise's own view ---------------------------------------------------------------------------------------------------
export function ObservabilityScreen() {
  const { t } = useTranslation();
  const { me, client } = useAuth();
  const can = useCan();
  const [period, setPeriod] = useState<Period>(defaultPeriod());
  const days = period.days;
  const [tab, setTab] = useState<'overview' | 'users' | 'issues'>('overview');
  const [adoption, setAdoption] = useState('');
  const [search, setSearch] = useState('');
  const [user, setUser] = useState<string | null>(null);
  const allowed = can(OBS_PERM);
  const q = useQuery({
    queryKey: ['obs', me?.userId ?? '', 'overview', periodKey(period)],
    queryFn: ({ signal }) =>
      client!.get<Overview>('/observability/overview', { query: periodQuery(period), signal }),
    enabled: client !== null && me !== null && allowed && user === null,
    retry,
  });
  if (!allowed) return <StateView state="denied" message={t('wp12.denied')} />;
  const o = q.data;
  const users = (o?.users ?? []).filter(
    (u) =>
      (!adoption || u.profile.adoption === adoption) &&
      (!search.trim() ||
        `${u.userName ?? ''} ${u.username ?? ''}`.toLowerCase().includes(search.trim().toLowerCase())),
  );
  return (
    <Page title={t('wp12.ob.title')} hint={o ? t('wp12.ob.hint', { days: o.retentionDays }) : undefined}>
      <PeriodBar value={period} onChange={setPeriod} custom={user === null} />
      {user ? (
        <UserDetail userId={user} days={days} onBack={() => setUser(null)} />
      ) : (
        <>
          <Chips
            label={t('wp12.ob.show')}
            options={[
              { id: 'overview' as const, label: t('wp12.ob.tab.overview') },
              { id: 'users' as const, label: t('wp12.ob.tab.users', { count: o?.users.length ?? 0 }) },
              { id: 'issues' as const, label: t('wp12.ob.tab.issues', { count: o?.issues.length ?? 0 }) },
            ]}
            value={tab}
            onChange={setTab}
          />
          <Gate query={q} denied={false} deniedText={t('wp12.denied')} offlineText={t('wp12.offline')}>
            {o && tab === 'overview' ? (
              <>
                <Tiles
                  rows={[
                    [
                      t('wp12.ob.activeUsers'),
                      `${num(o.totals.activeUsers)} / ${num(o.totals.accounts)}`,
                      true,
                    ],
                    [t('wp12.ob.activity'), num(o.totals.events)],
                    [t('wp12.ob.errors'), num(o.totals.errors)],
                    [t('wp12.ob.warnings'), num(o.totals.warnings)],
                    [t('wp12.ob.slow'), num(o.totals.slow)],
                    [t('wp12.ob.speed'), o.totals.p95Ms === null ? '-' : `${o.totals.p95Ms} ms`],
                    [t('wp12.ob.needTraining'), num(o.totals.trainingNeeded)],
                  ]}
                />
                <DailyCard daily={o.daily} />
                <Surfaces list={o.surfaces} />
                <Card>
                  <Text style={kit.name}>{t('wp12.ob.howDoing')}</Text>
                  <Bars
                    rows={ADOPTIONS.filter((k) => o.adoption[k]).map((k) => ({
                      label: t(`wp12.ob.ad.${k}`),
                      value: o.adoption[k]!,
                    }))}
                    empty={t('wp12.ob.noAccounts')}
                  />
                </Card>
                <Card>
                  <Text style={kit.name}>{t('wp12.ob.busiest')}</Text>
                  <Bars
                    rows={o.pages.map((p) => ({
                      label: p.route,
                      value: p.views,
                      note: t('wp12.ob.pageLine', { views: p.views, users: p.users }),
                    }))}
                    empty={t('wp12.ob.noViews')}
                  />
                </Card>
                <Card>
                  <Text style={kit.name}>{t('wp12.ob.talkFirst')}</Text>
                  {needAttention(o.users).length === 0 ? (
                    <Text style={kit.sub}>{t('wp12.ob.allWell')}</Text>
                  ) : null}
                  {needAttention(o.users).map((u) => (
                    <View key={u.userId} style={{ gap: 2 }}>
                      <Text style={kit.name}>{u.userName ?? u.username ?? t('wp12.ob.unknown')}</Text>
                      <Text style={kit.sub}>
                        {t(`wp12.ob.ad.${u.profile.adoption}`, { defaultValue: u.profile.adoption })} ·{' '}
                        {ago(t, u.usage?.lastSeen)} · {u.profile.signals[0]?.text ?? '-'}
                      </Text>
                      <Button
                        kind="ghost"
                        label={t('wp12.ob.open', { name: u.userName ?? u.username ?? '' })}
                        onPress={() => setUser(u.userId)}
                      />
                    </View>
                  ))}
                </Card>
              </>
            ) : null}
            {o && tab === 'users' ? (
              <>
                <Field label={t('wp12.ob.searchUser')} value={search} onChange={setSearch} />
                <Chips
                  label={t('wp12.ob.filter')}
                  options={[
                    { id: '', label: t('wp12.ob.everyone') },
                    ...ADOPTIONS.map((k) => ({ id: k as string, label: t(`wp12.ob.ad.${k}`) })),
                  ]}
                  value={adoption}
                  onChange={setAdoption}
                />
                {users.length === 0 ? <StateView state="empty" message={t('wp12.ob.noUsers')} /> : null}
                {users.map((u) => (
                  <Card key={u.userId}>
                    <Text style={kit.name}>{u.userName ?? u.username ?? t('wp12.ob.unknown')}</Text>
                    <Text style={kit.sub}>
                      {t(`wp12.ob.ad.${u.profile.adoption}`, { defaultValue: u.profile.adoption })} ·{' '}
                      {u.profile.score}/100
                    </Text>
                    <Line label={t('wp12.ob.lastSeen')} value={ago(t, u.usage?.lastSeen)} />
                    <Line label={t('wp12.ob.daysActive')} value={num(u.usage?.activeDays ?? 0)} />
                    <Line label={t('wp12.ob.screens')} value={num(u.usage?.pageViews ?? 0)} />
                    <Line label={t('wp12.ob.errors')} value={num(u.usage?.errors ?? 0)} />
                    <Line label={t('wp12.ob.slow')} value={num(u.usage?.slow ?? 0)} />
                    <Button
                      kind="ghost"
                      label={t('wp12.ob.open', { name: u.userName ?? u.username ?? '' })}
                      onPress={() => setUser(u.userId)}
                    />
                  </Card>
                ))}
              </>
            ) : null}
            {o && tab === 'issues' ? <Issues list={o.issues} /> : null}
          </Gate>
        </>
      )}
    </Page>
  );
}

// ---- the platform operator's view -----------------------------------------------------------------------------------------------
interface PlatformOverview {
  days: number;
  from?: string | null;
  to?: string | null;
  retentionDays: number;
  totals: Totals;
  daily: Daily[];
  surfaces: Surface[];
  pages: { route: string; views: number; users: number }[];
  issues: Issue[];
  franchises: {
    tenantId: string;
    name: string;
    code: string;
    status: string;
    activeUsers: number;
    events: number;
    errors: number;
    slow: number;
    p95Ms: number | null;
    lastSeen: string | null;
    surfaces: Record<string, number>;
  }[];
}
interface FranchiseView {
  days: number;
  from?: string | null;
  to?: string | null;
  franchise: { name: string; code: string; status: string };
  totals: Totals;
  daily: Daily[];
  surfaces: Surface[];
  users: UserRow[];
  pages: { route: string; views: number }[];
  issues: Issue[];
}
function FranchiseUsage({ id, period, onBack }: { id: string; period: Period; onBack: () => void }) {
  const { t } = useTranslation();
  const { me, client } = useAuth();
  const q = useQuery({
    queryKey: ['obs', me?.userId ?? '', 'franchise', id, periodKey(period)],
    queryFn: ({ signal }) =>
      client!.get<FranchiseView>(`/platform/observability/franchises/${encodeURIComponent(id)}`, {
        query: periodQuery(period),
        signal,
      }),
    enabled: client !== null,
    retry,
  });
  const o = q.data;
  return (
    <>
      <Button kind="ghost" label={t('wp12.ob.allFranchises')} onPress={onBack} />
      <Gate query={q} denied={false} deniedText={t('wp12.denied')} offlineText={t('wp12.offline')}>
        {o ? (
          <>
            <Text style={kit.name}>{o.franchise.name}</Text>
            <Text style={kit.sub}>
              {o.franchise.code} · {o.franchise.status} ·{' '}
              {o.from && o.to
                ? t('wp27.range', { from: o.from, to: o.to })
                : t('wp12.ob.lastDays', { count: o.days })}
            </Text>
            <Tiles
              rows={[
                [t('wp12.ob.activeUsers'), num(o.totals.activeUsers), true],
                [t('wp12.ob.activity'), num(o.totals.events)],
                [t('wp12.ob.errors'), num(o.totals.errors)],
                [t('wp12.ob.warnings'), num(o.totals.warnings)],
                [t('wp12.ob.slow'), num(o.totals.slow)],
                [t('wp12.ob.speed'), o.totals.p95Ms === null ? '-' : `${o.totals.p95Ms} ms`],
              ]}
            />
            <DailyCard daily={o.daily} />
            <Surfaces list={o.surfaces} />
            <Card>
              <Text style={kit.name}>{t('wp12.ob.byUser')}</Text>
              {o.users.length === 0 ? <Text style={kit.sub}>{t('wp12.ob.nobody')}</Text> : null}
              {o.users.map((u) => (
                <Text key={u.userId} style={kit.sub}>
                  {u.userName ?? t('wp12.ob.unknown')} ·{' '}
                  {t(`wp12.ob.ad.${u.profile.adoption}`, { defaultValue: u.profile.adoption })} ·{' '}
                  {u.profile.score}/100 · {ago(t, u.usage?.lastSeen)} · {u.profile.signals[0]?.text ?? '-'}
                </Text>
              ))}
            </Card>
            <Card>
              <Text style={kit.name}>{t('wp12.ob.busiest')}</Text>
              <Bars
                rows={o.pages.map((p) => ({ label: p.route, value: p.views }))}
                empty={t('wp12.ob.noViews')}
              />
            </Card>
            <Issues list={o.issues} />
          </>
        ) : null}
      </Gate>
    </>
  );
}
export function PlatformObservabilityScreen() {
  const { t } = useTranslation();
  const { me, client } = useAuth();
  const [period, setPeriod] = useState<Period>(defaultPeriod());
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const allowed = isPlatformUser(me?.roles);
  const q = useQuery({
    queryKey: ['obs', me?.userId ?? '', 'platform', periodKey(period)],
    queryFn: ({ signal }) =>
      client!.get<PlatformOverview>('/platform/observability/overview', {
        query: periodQuery(period),
        signal,
      }),
    enabled: client !== null && me !== null && allowed && open === null,
    retry,
  });
  if (!allowed) return <StateView state="denied" message={t('wp12.denied')} />;
  const o = q.data;
  const list = (o?.franchises ?? []).filter(
    (f) => !search.trim() || `${f.name} ${f.code}`.toLowerCase().includes(search.trim().toLowerCase()),
  );
  return (
    <Page
      title={t('wp12.ob.title')}
      hint={o ? t('wp12.ob.platformHint', { days: o.retentionDays }) : undefined}
    >
      <PeriodBar value={period} onChange={setPeriod} />
      {open ? (
        <FranchiseUsage id={open} period={period} onBack={() => setOpen(null)} />
      ) : (
        <Gate query={q} denied={false} deniedText={t('wp12.denied')} offlineText={t('wp12.offline')}>
          {o ? (
            <>
              <Tiles
                rows={[
                  [t('wp12.ob.franchises'), num(o.totals.franchises), true],
                  [t('wp12.ob.quiet'), num(o.totals.quietFranchises)],
                  [t('wp12.ob.activeUsers'), num(o.totals.activeUsers)],
                  [t('wp12.ob.activity'), num(o.totals.events)],
                  [t('wp12.ob.errors'), num(o.totals.errors)],
                  [t('wp12.ob.slow'), num(o.totals.slow)],
                  [t('wp12.ob.speed'), o.totals.p95Ms === null ? '-' : `${o.totals.p95Ms} ms`],
                ]}
              />
              <DailyCard daily={o.daily} />
              <Surfaces list={o.surfaces} />
              <Field label={t('wp12.ob.searchFranchise')} value={search} onChange={setSearch} />
              {list.length === 0 ? <StateView state="empty" message={t('wp12.ob.noFranchises')} /> : null}
              {list.map((f) => (
                <Card key={f.tenantId}>
                  <Text style={kit.name}>
                    {f.name} ({f.code})
                  </Text>
                  <Text style={kit.sub}>{t(`wp12.ob.health.${franchiseHealth(f)}`)}</Text>
                  <Line label={t('wp12.ob.activeUsers')} value={num(f.activeUsers)} />
                  <Line label={t('wp12.ob.activity')} value={num(f.events)} />
                  <Line
                    label={t('wp12.ob.where')}
                    value={SURFACES.map((k) => `${t(`wp12.ob.surface.${k}`)} ${f.surfaces[k] ?? 0}`).join(
                      ' · ',
                    )}
                  />
                  <Line label={t('wp12.ob.errors')} value={num(f.errors)} />
                  <Line label={t('wp12.ob.slow')} value={num(f.slow)} />
                  <Line label={t('wp12.ob.lastSeen')} value={ago(t, f.lastSeen)} />
                  <Button
                    kind="ghost"
                    label={t('wp12.ob.open', { name: f.name })}
                    onPress={() => setOpen(f.tenantId)}
                  />
                </Card>
              ))}
              <Card>
                <Text style={kit.name}>{t('wp12.ob.busiest')}</Text>
                <Bars
                  rows={o.pages.map((p) => ({
                    label: p.route,
                    value: p.views,
                    note: t('wp12.ob.pageLine', { views: p.views, users: p.users }),
                  }))}
                  empty={t('wp12.ob.noViews')}
                />
              </Card>
              <Issues list={o.issues.slice(0, 10)} />
            </>
          ) : null}
        </Gate>
      )}
    </Page>
  );
}

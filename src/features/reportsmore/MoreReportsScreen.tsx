import { useState, type ReactNode } from 'react';
import { ScrollView, Text } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import type { ApiClient } from '@/api/client';
import { dec, formatINR } from '@/money';
import { Button } from '@/ui/Button';
import { newId } from '@/device';
import { todayIST } from '../collections/receipt';
import { isDate, shortDate } from '../hr/logic';
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
import { rangeOf } from '../reports/api';
import { StateView } from '../stock/StateView';
import { fetchBranches } from '../staff/api';
import { shareText } from '../staff/ui';
import {
  MORE_KINDS,
  MORE_NEEDS,
  NO_BRANCH,
  NO_RANGE,
  PURCHASE_GROUPS,
  SEASON_GROUPS,
  fetchReport,
  fetchReportCsv,
  fetchViews,
  runView,
  type BranchComparison,
  type CustomerAnalytics,
  type Filters,
  type MoreKind,
  type PurchaseAnalysis,
  type SavedRun,
  type Seasonal,
  type StaffProductivity,
} from './api';

const PRESETS = ['7', '30', '90', 'custom'] as const;
const pct = (p: string | null) => (p === null ? 0 : dec(p).toNumber());
const money = (v: string | null) => (v === null ? '-' : formatINR(v));
const signed = (p: string) => `${dec(p).isNegative() ? '' : '+'}${p}%`;

interface Ctx {
  client: ApiClient | null;
  userId: string;
  f: Filters;
  enabled: boolean;
}

function Box<T>({
  ctx,
  kind,
  check,
  children,
}: {
  ctx: Ctx;
  kind: Exclude<MoreKind, 'saved'>;
  /** A reply of the wrong shape is reported, never drawn. */
  check: (d: T) => boolean;
  children: (d: T) => ReactNode;
}) {
  const { t } = useTranslation();
  const q = useQuery({
    queryKey: ['stf', ctx.userId, 'more', kind, ctx.f.from, ctx.f.to, ctx.f.branchId, ctx.f.group],
    queryFn: ({ signal }) => fetchReport<T>(ctx.client!, kind, ctx.f, signal),
    enabled: ctx.enabled && ctx.client !== null,
    retry: (n, e) => isNetwork(e) && n < 1,
  });
  return (
    <Gate query={q} denied={!ctx.enabled} deniedText={t('reports.denied')} offlineText={t('reports.offline')}>
      {q.data ? (
        check(q.data) ? (
          children(q.data)
        ) : (
          <StateView state="error" message={t('stf.rep.badData')} />
        )
      ) : null}
    </Gate>
  );
}

function Purchases({ ctx }: { ctx: Ctx }) {
  const { t } = useTranslation();
  return (
    <Box<PurchaseAnalysis>
      ctx={ctx}
      kind="purchases"
      check={(d) => Boolean(d?.totals && Array.isArray(d.rows))}
    >
      {(d) => (
        <>
          <Card>
            <Line label={t('stf.rep.purchases')} value={money(d.totals.value)} strong />
            <Line label={t('reports.bills')} value={String(d.totals.bills)} />
            {d.previous.changePct ? (
              <Text style={kit.sub}>{t('reports.vsPrevious', { change: signed(d.previous.changePct) })}</Text>
            ) : null}
          </Card>
          {d.rows.length === 0 ? <StateView state="empty" message={t('stf.rep.noPurchases')} /> : null}
          {d.rows.map((r) => (
            <Card key={r.key}>
              <Text style={kit.name}>{r.label}</Text>
              <Line label={t('stf.rep.value')} value={money(r.value)} strong />
              <Line label={t('reports.quantity')} value={r.quantity} />
              <Line label={t('stf.rep.tax')} value={money(r.tax)} />
              {r.avgRate ? <Line label={t('stf.rep.avgRate')} value={money(r.avgRate)} /> : null}
              {r.sharePct ? <Bar pct={pct(r.sharePct)} label={`${r.sharePct}%`} /> : null}
            </Card>
          ))}
          {d.priceVariance.length > 0 ? <Text style={kit.name}>{t('stf.rep.priceMove')}</Text> : null}
          {d.priceVariance.map((r) => (
            <Card key={`pv-${r.key}`}>
              <Text style={kit.name}>{r.label}</Text>
              <Line label={t('stf.rep.lowest')} value={money(r.minRate)} />
              <Line label={t('stf.rep.highest')} value={money(r.maxRate)} />
              {r.spreadPct ? <Line label={t('stf.rep.spread')} value={`${r.spreadPct}%`} /> : null}
            </Card>
          ))}
        </>
      )}
    </Box>
  );
}

function Customers({ ctx }: { ctx: Ctx }) {
  const { t } = useTranslation();
  return (
    <Box<CustomerAnalytics>
      ctx={ctx}
      kind="customers"
      check={(d) => Boolean(d?.summary && d.concentration && Array.isArray(d.top))}
    >
      {(d) => (
        <>
          {d.masked ? <Text style={kit.sub}>{t('stf.rep.masked')}</Text> : null}
          <Card>
            <Line label={t('stf.rep.custBought')} value={String(d.summary.customers)} strong />
            <Line
              label={t('stf.rep.custNew')}
              value={`${d.summary.newCustomers}${d.summary.newSharePct ? ` (${d.summary.newSharePct}%)` : ''}`}
            />
            <Line label={t('stf.rep.custReturning')} value={String(d.summary.returningCustomers)} />
            <Line label={t('stf.rep.spendPer')} value={money(d.summary.avgSpendPerCustomer)} />
            <Line label={t('reports.avgBill')} value={money(d.summary.avgBillValue)} />
            <Line label={t('stf.rep.walkIn')} value={money(d.summary.walkInSales)} />
            <Line
              label={t('stf.rep.top5')}
              value={d.concentration.top5SharePct ? `${d.concentration.top5SharePct}%` : '-'}
            />
            <Line
              label={t('stf.rep.top10')}
              value={d.concentration.top10SharePct ? `${d.concentration.top10SharePct}%` : '-'}
            />
          </Card>
          {d.top.length === 0 ? <StateView state="empty" message={t('stf.rep.noCustomers')} /> : null}
          {d.top.map((r) => (
            <Card key={r.key}>
              <Text style={kit.name}>{r.label}</Text>
              {r.village ? <Text style={kit.sub}>{r.village}</Text> : null}
              <Line label={t('stf.rep.spend')} value={money(r.spend)} strong />
              <Line label={t('reports.bills')} value={String(r.bills)} />
              {r.lastPurchase ? <Line label={t('stf.rep.last')} value={shortDate(r.lastPurchase)} /> : null}
            </Card>
          ))}
          {d.villages.length > 0 ? <Text style={kit.name}>{t('stf.rep.byVillage')}</Text> : null}
          {d.villages.map((r) => (
            <Line key={r.key} label={`${r.label} (${r.customers})`} value={money(r.netSales)} />
          ))}
          {d.crops.length > 0 ? <Text style={kit.name}>{t('stf.rep.byCrop')}</Text> : null}
          {d.crops.map((r) => (
            <Line key={r.key} label={r.label} value={money(r.netSales)} />
          ))}
        </>
      )}
    </Box>
  );
}

function Staff({ ctx }: { ctx: Ctx }) {
  const { t } = useTranslation();
  return (
    <Box<StaffProductivity> ctx={ctx} kind="staff" check={(d) => Array.isArray(d?.rows)}>
      {(d) => (
        <>
          {d.rows.length === 0 ? <StateView state="empty" message={t('stf.rep.noStaff')} /> : null}
          {d.rows.map((r, i) => (
            <Card key={r.key ?? `${r.name}-${i}`}>
              <Text style={kit.name}>{r.name}</Text>
              <Line label={t('reports.netSales')} value={money(r.netSales)} strong />
              <Line label={t('reports.bills')} value={String(r.bills)} />
              <Line label={t('reports.avgBill')} value={money(r.avgBill)} />
              {r.discountPct ? <Line label={t('stf.rep.discountPct')} value={`${r.discountPct}%`} /> : null}
              <Line label={t('stf.rep.returns')} value={String(r.returns)} />
              <Line label={t('stf.rep.voids')} value={String(r.voids)} />
              {r.billsPerHour ? <Line label={t('stf.rep.perHour')} value={r.billsPerHour} /> : null}
            </Card>
          ))}
          {(d.notes ?? []).map((n) => (
            <Text key={n} style={kit.sub}>
              {n}
            </Text>
          ))}
        </>
      )}
    </Box>
  );
}

function Branches({ ctx }: { ctx: Ctx }) {
  const { t } = useTranslation();
  return (
    <Box<BranchComparison>
      ctx={ctx}
      kind="branches"
      check={(d) => Boolean(d?.totals && Array.isArray(d.rows))}
    >
      {(d) => (
        <>
          <Card>
            <Line label={t('stf.rep.netAll')} value={money(d.totals.netSales)} strong />
            <Line label={t('stf.rep.purchases')} value={money(d.totals.purchases)} />
            <Line label={t('stf.rep.receivables')} value={money(d.totals.receivables)} />
            <Line label={t('reports.collected')} value={money(d.totals.collections)} />
            <Line label={t('stf.rep.expenses')} value={money(d.totals.expenses)} />
          </Card>
          {d.rows.length === 0 ? <StateView state="empty" message={t('stf.rep.noBranches')} /> : null}
          {d.rows.map((r) => (
            <Card key={r.branch}>
              <Text style={kit.name}>
                {r.rank}. {r.branch}
              </Text>
              <Line label={t('reports.netSales')} value={money(r.netSales)} strong />
              <Line label={t('reports.bills')} value={String(r.bills)} />
              {r.marginPct ? <Line label={t('reports.marginPct')} value={`${r.marginPct}%`} /> : null}
              <Line label={t('stf.rep.purchases')} value={money(r.purchases)} />
              <Line label={t('stf.rep.receivables')} value={money(r.receivables)} />
              <Line label={t('stf.rep.overdue')} value={money(r.overdue)} />
              <Line label={t('reports.collected')} value={money(r.collections)} />
              <Line label={t('stf.rep.expenses')} value={money(r.expenses)} />
            </Card>
          ))}
          {(d.notes ?? []).map((n) => (
            <Text key={n} style={kit.sub}>
              {n}
            </Text>
          ))}
        </>
      )}
    </Box>
  );
}

function SeasonalView({ ctx }: { ctx: Ctx }) {
  const { t } = useTranslation();
  return (
    <Box<Seasonal> ctx={ctx} kind="seasonal" check={(d) => Array.isArray(d?.seasons)}>
      {(d) => (
        <>
          {d.seasonSettings.assumption ? <Text style={kit.sub}>{t('stf.rep.seasonDefault')}</Text> : null}
          {d.seasons.length === 0 ? <StateView state="empty" message={t('stf.rep.noSeasons')} /> : null}
          {d.seasons.map((s) => (
            <Card key={s.name}>
              <Text style={kit.name}>
                {s.name}
                {s.isCurrent ? ` (${t('stf.rep.now')})` : ''}
              </Text>
              {s.totals.map((x) => (
                <Line key={x.year} label={String(x.year)} value={money(x.value)} />
              ))}
              {s.changePct ? (
                <Text style={kit.sub}>{t('stf.rep.yearChange', { change: signed(s.changePct) })}</Text>
              ) : null}
              {s.rows.slice(0, 10).map((r) => (
                <Text key={r.key} style={kit.sub}>
                  {r.key}: {r.years.map((y) => `${y.year} ${money(y.value)}`).join(' · ')}
                </Text>
              ))}
            </Card>
          ))}
        </>
      )}
    </Box>
  );
}

function Saved({ ctx }: { ctx: Ctx }) {
  const { t } = useTranslation();
  const failText = useFailureText();
  const [run, setRun] = useState<{ id: string; data: SavedRun } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ['stf', ctx.userId, 'more', 'views'],
    queryFn: ({ signal }) => fetchViews(ctx.client!, signal),
    enabled: ctx.enabled && ctx.client !== null,
    retry: (n, e) => isNetwork(e) && n < 1,
  });
  const open = async (id: string) => {
    setBusy(id);
    setErr(null);
    try {
      setRun({ id, data: (await runView(ctx.client!, id, newId())) as SavedRun });
    } catch (e) {
      setErr(failText(e));
    } finally {
      setBusy(null);
    }
  };
  return (
    <Gate query={q} denied={!ctx.enabled} deniedText={t('reports.denied')} offlineText={t('reports.offline')}>
      <Text style={kit.sub}>{t('stf.rep.savedNote')}</Text>
      {err ? <Notice tone="error" text={err} /> : null}
      {(q.data?.items ?? []).length === 0 ? <StateView state="empty" message={t('stf.rep.noViews')} /> : null}
      {(q.data?.items ?? []).map((v) => (
        <Card key={v.id}>
          <Text style={kit.name}>{v.name}</Text>
          <Text style={kit.sub}>{v.dataset}</Text>
          <Button
            kind="ghost"
            label={t('stf.rep.run')}
            disabled={busy !== null}
            onPress={() => void open(v.id)}
          />
          {run?.id === v.id ? (
            <>
              {run.data.rows.length === 0 ? <Text style={kit.sub}>{t('stf.rep.noRows')}</Text> : null}
              {run.data.rows.slice(0, 50).map((row, i) => (
                <Card key={i}>
                  {run.data.columns.map((c) => (
                    <Line
                      key={c.key}
                      label={c.label}
                      value={row[c.key] === null || row[c.key] === undefined ? '-' : String(row[c.key])}
                    />
                  ))}
                </Card>
              ))}
              {run.data.rows.length > 50 ? (
                <Text style={kit.sub}>
                  {t('stf.rep.firstRows', { shown: 50, count: run.data.rows.length })}
                </Text>
              ) : null}
            </>
          ) : null}
        </Card>
      ))}
    </Gate>
  );
}

export default function MoreReportsScreen() {
  const { t } = useTranslation();
  const { me, client } = useAuth();
  const can = useCan();
  const failText = useFailureText();
  const allowed = MORE_KINDS.filter((k) => can(MORE_NEEDS[k]));
  const [pick, setPick] = useState<MoreKind>('purchases');
  const [preset, setPreset] = useState<(typeof PRESETS)[number]>('30');
  const [custom, setCustom] = useState({ from: rangeOf(todayIST(), 30).from, to: todayIST() });
  const [branchId, setBranchId] = useState('');
  const [groups, setGroups] = useState<Record<string, string>>({});
  const [shareMsg, setShareMsg] = useState<string | null>(null);
  const [shareErr, setShareErr] = useState<string | null>(null);

  const kind: MoreKind = allowed.includes(pick) ? pick : (allowed[0] ?? 'purchases');
  const groupOptions: readonly string[] =
    kind === 'purchases' ? PURCHASE_GROUPS : kind === 'seasonal' ? SEASON_GROUPS : [];
  const group = groups[kind] ?? groupOptions[0] ?? '';
  const customOk = isDate(custom.from) && isDate(custom.to) && custom.from <= custom.to;
  const range = preset === 'custom' ? custom : rangeOf(todayIST(), Number(preset));
  const f: Filters = { from: range.from, to: range.to, branchId, group };
  const userId = me?.userId ?? '';

  const branches = useQuery({
    queryKey: ['stf', userId, 'more', 'branches'],
    queryFn: ({ signal }) => fetchBranches(client!, signal),
    enabled: client !== null && allowed.length > 0 && !NO_BRANCH.includes(kind) && kind !== 'saved',
    staleTime: 10 * 60_000,
  });
  const ctx: Ctx = {
    client,
    userId,
    f,
    enabled:
      client !== null &&
      me !== null &&
      allowed.length > 0 &&
      (preset !== 'custom' || customOk || NO_RANGE.includes(kind)),
  };

  const exportCsv = async () => {
    setShareMsg(null);
    setShareErr(null);
    try {
      const text = await fetchReportCsv(client!, kind as Exclude<MoreKind, 'saved'>, f);
      setShareMsg((await shareText(`${kind}.csv`, text)) ? t('stf.shared') : t('stf.shareFailed'));
    } catch (e) {
      setShareErr(failText(e));
    }
  };

  return (
    <ScrollView contentContainerStyle={kit.page} keyboardShouldPersistTaps="handled">
      <Text style={kit.title} accessibilityRole="header">
        {t('stf.rep.title')}
      </Text>
      {allowed.length === 0 ? (
        <StateView state="denied" message={t('reports.denied')} />
      ) : (
        <>
          <Chips
            label={t('reports.which')}
            options={allowed.map((k) => ({ id: k, label: t(`stf.rep.kind_${k}`) }))}
            value={kind}
            onChange={setPick}
          />
          {NO_RANGE.includes(kind) ? null : (
            <>
              <Chips
                label={t('reports.period')}
                options={PRESETS.map((p) => ({
                  id: p,
                  label: p === 'custom' ? t('stf.rep.custom') : t('reports.lastDays', { count: Number(p) }),
                }))}
                value={preset}
                onChange={setPreset}
              />
              {preset === 'custom' ? (
                <>
                  <Field
                    label={t('stf.rep.from')}
                    value={custom.from}
                    onChange={(v) => setCustom({ ...custom, from: v })}
                    placeholder="YYYY-MM-DD"
                    error={!isDate(custom.from) ? t('stf.badDate') : null}
                  />
                  <Field
                    label={t('stf.rep.to')}
                    value={custom.to}
                    onChange={(v) => setCustom({ ...custom, to: v })}
                    placeholder="YYYY-MM-DD"
                    error={
                      !isDate(custom.to)
                        ? t('stf.badDate')
                        : isDate(custom.from) && custom.to < custom.from
                          ? t('stf.rep.rangeOrder')
                          : null
                    }
                  />
                </>
              ) : (
                <Text style={kit.sub}>
                  {shortDate(range.from)} - {shortDate(range.to)}
                </Text>
              )}
            </>
          )}
          {!NO_BRANCH.includes(kind) && kind !== 'saved' && (branches.data ?? []).length > 1 ? (
            <Chips
              label={t('stf.emp.branch')}
              options={[
                { id: '', label: t('stf.all') },
                ...(branches.data ?? []).map((b) => ({ id: b.id, label: b.name })),
              ]}
              value={branchId}
              onChange={setBranchId}
            />
          ) : null}
          {groupOptions.length > 0 ? (
            <Chips
              label={t('reports.groupBy')}
              options={groupOptions.map((o) => ({ id: o, label: t(`stf.rep.group_${o}`) }))}
              value={group}
              onChange={(g) => setGroups({ ...groups, [kind]: g })}
            />
          ) : null}
          {kind !== 'saved' ? (
            <Button
              kind="ghost"
              label={t('stf.rep.exportCsv')}
              disabled={!ctx.enabled}
              onPress={() => void exportCsv()}
            />
          ) : null}
          {shareMsg ? <Notice tone="ok" text={shareMsg} /> : null}
          {shareErr ? <Notice tone="error" text={shareErr} /> : null}
          {kind === 'purchases' ? <Purchases ctx={ctx} /> : null}
          {kind === 'customers' ? <Customers ctx={ctx} /> : null}
          {kind === 'staff' ? <Staff ctx={ctx} /> : null}
          {kind === 'branches' ? <Branches ctx={ctx} /> : null}
          {kind === 'seasonal' ? <SeasonalView ctx={ctx} /> : null}
          {kind === 'saved' ? <Saved ctx={ctx} /> : null}
        </>
      )}
    </ScrollView>
  );
}

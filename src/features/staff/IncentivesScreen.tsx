import { useState } from 'react';
import { Text } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { formatINR } from '@/money';
import { Button } from '@/ui/Button';
import { todayIST } from '../collections/receipt';
import { isDate, shortDate } from '../hr/logic';
import { StateView } from '../stock/StateView';
import {
  P,
  fetchIncentives,
  fetchPerformance,
  fetchRules,
  monthRange,
  stfKey,
  type IncentiveRow,
} from './api';
import {
  Banner,
  Card,
  Chips,
  Field,
  Gate,
  Line,
  MonthPicker,
  Screen,
  isNetwork,
  kit,
  useCan,
  useWrite,
} from './ui';

type Tab = 'rules' | 'month' | 'performance';
type Write = ReturnType<typeof useWrite>;
/** A percentage from 0 to 100 with at most 4 places, as the server accepts it. */
export const isRate = (v: string) =>
  /^\d{1,3}(\.\d{1,4})?$/.test(v.trim()) && Number(v) > 0 && Number(v) <= 100;

export default function IncentivesScreen() {
  const { t } = useTranslation();
  const can = useCan();
  const tabs: Tab[] = [
    ...(can(P.incentive) ? (['rules', 'month'] as Tab[]) : []),
    ...(can(P.performance) ? (['performance'] as Tab[]) : []),
  ];
  const [pick, setPick] = useState<Tab>('rules');
  const tab = tabs.includes(pick) ? pick : tabs[0];
  const w = useWrite();
  return (
    <Screen title={t('stf.inc.title')}>
      {tabs.length === 0 || !tab ? (
        <StateView state="denied" message={t('stf.denied')} />
      ) : (
        <>
          <Chips
            label={t('stf.sal.show')}
            options={tabs.map((x) => ({ id: x, label: t(`stf.inc.tab_${x}`) }))}
            value={tab}
            onChange={(x) => (w.clear(), setPick(x))}
          />
          <Banner w={w} />
          {tab === 'rules' ? <Rules w={w} /> : null}
          {tab === 'month' ? <Month w={w} /> : null}
          {tab === 'performance' ? <Performance /> : null}
        </>
      )}
    </Screen>
  );
}

function Rules({ w }: { w: Write }) {
  const { t } = useTranslation();
  const { me, client } = useAuth();
  const qc = useQueryClient();
  const userId = me?.userId ?? '';
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [basis, setBasis] = useState<'SALES' | 'COLLECTION'>('SALES');
  const [rate, setRate] = useState('');
  const [from, setFrom] = useState(todayIST());
  const q = useQuery({
    queryKey: stfKey(userId, 'inc', 'rules'),
    queryFn: ({ signal }) => fetchRules(client!, signal),
    enabled: client !== null,
    retry: (n, e) => isNetwork(e) && n < 1,
  });
  const refresh = () => void qc.invalidateQueries({ queryKey: ['stf', userId, 'inc', 'rules'] });
  const valid =
    /^[A-Z0-9_-]{2,30}$/.test(code.trim().toUpperCase()) &&
    name.trim().length >= 2 &&
    isRate(rate) &&
    isDate(from);
  return (
    <Gate query={q} denied={false} deniedText={t('stf.denied')} offlineText={t('stf.offline')}>
      <Text style={kit.sub}>{t('stf.inc.rulesNote')}</Text>
      {open ? (
        <Card>
          <Field label={t('stf.sal.code')} value={code} onChange={setCode} />
          <Field label={t('stf.sal.name')} value={name} onChange={setName} />
          <Chips
            label={t('stf.inc.basis')}
            options={(['SALES', 'COLLECTION'] as const).map((b) => ({
              id: b,
              label: t(`stf.inc.basis_${b}`),
            }))}
            value={basis}
            onChange={setBasis}
          />
          <Field
            label={t('stf.inc.rate')}
            value={rate}
            onChange={setRate}
            keyboard="decimal-pad"
            error={rate !== '' && !isRate(rate) ? t('stf.inc.badRate') : null}
          />
          <Field
            label={t('stf.inc.from')}
            value={from}
            onChange={setFrom}
            placeholder="YYYY-MM-DD"
            error={!isDate(from) ? t('stf.badDate') : null}
          />
          <Button
            label={t('stf.save')}
            disabled={w.busy || !valid}
            onPress={() =>
              void w.send(
                'POST',
                '/hr/incentive-rules',
                {
                  code: code.trim().toUpperCase(),
                  name: name.trim(),
                  basis,
                  ratePct: rate.trim(),
                  effectiveFrom: from.trim(),
                },
                t('stf.inc.ruleSaved'),
                () => {
                  setOpen(false);
                  refresh();
                },
              )
            }
          />
          <Button kind="ghost" label={t('stf.cancel')} onPress={() => setOpen(false)} />
        </Card>
      ) : (
        <Button label={t('stf.inc.newRule')} onPress={() => (w.clear(), w.newAction(), setOpen(true))} />
      )}
      {(q.data?.items ?? []).length === 0 ? <StateView state="empty" message={t('stf.inc.noRules')} /> : null}
      {(q.data?.items ?? []).map((r) => (
        <Card key={r.id}>
          <Text style={kit.name}>
            {r.code} · {r.name}
          </Text>
          <Text style={kit.sub}>
            {t(`stf.inc.basis_${r.basis}`)} · {r.ratePct ? `${r.ratePct}%` : t('stf.inc.slabs')} ·{' '}
            {shortDate(r.effectiveFrom)} · {t(`stf.inc.st_${r.status}`)}
          </Text>
          {r.status === 'ACTIVE' ? (
            <Button
              kind="ghost"
              label={t('stf.inc.retire')}
              disabled={w.busy}
              onPress={() =>
                void w.send(
                  'POST',
                  `/hr/incentive-rules/${r.id}/retire`,
                  undefined,
                  t('stf.inc.retired'),
                  refresh,
                )
              }
            />
          ) : null}
        </Card>
      ))}
    </Gate>
  );
}

function RowCard({ r }: { r: IncentiveRow }) {
  const { t } = useTranslation();
  return (
    <Card>
      <Text style={kit.name}>
        {r.employeeCode ? `${r.employeeCode} · ` : ''}
        {r.employeeName}
      </Text>
      <Line label={t('stf.inc.rule')} value={r.ruleCode} />
      {r.result.netBase ? <Line label={t('stf.inc.base')} value={formatINR(r.result.netBase)} /> : null}
      <Line label={t('stf.inc.amount')} value={formatINR(r.result.amount)} strong />
      {r.status ? (
        <Text style={kit.sub}>{t(`stf.inc.cs_${r.status}`, { defaultValue: r.status })}</Text>
      ) : null}
    </Card>
  );
}

function Month({ w }: { w: Write }) {
  const { t } = useTranslation();
  const { me, client } = useAuth();
  const can = useCan();
  const qc = useQueryClient();
  const userId = me?.userId ?? '';
  const [period, setPeriod] = useState(todayIST().slice(0, 7));
  const [preview, setPreview] = useState<IncentiveRow[] | null>(null);
  const q = useQuery({
    queryKey: stfKey(userId, 'inc', 'month', period),
    queryFn: ({ signal }) => fetchIncentives(client!, period, signal),
    enabled: client !== null,
    retry: (n, e) => isNetwork(e) && n < 1,
  });
  const refresh = () => void qc.invalidateQueries({ queryKey: ['stf', userId, 'inc', 'month'] });
  const items = q.data?.items ?? [];
  return (
    <>
      <MonthPicker
        value={period}
        onChange={(v) => {
          setPeriod(v);
          setPreview(null);
        }}
      />
      <Button
        kind="ghost"
        label={t('stf.inc.preview')}
        disabled={w.busy}
        onPress={() =>
          void w.send<{ rows?: IncentiveRow[] }>(
            'POST',
            '/hr/incentives/calculate',
            { period, save: false },
            t('stf.inc.previewed'),
            (r) => setPreview(r?.rows ?? []),
          )
        }
      />
      <Button
        label={t('stf.inc.calcSave')}
        disabled={w.busy}
        onPress={() =>
          void w.send(
            'POST',
            '/hr/incentives/calculate',
            { period, save: true },
            t('stf.inc.calculated'),
            () => (setPreview(null), refresh()),
          )
        }
      />
      {can(P.approve) && items.some((i) => i.status === 'DRAFT') ? (
        <Button
          kind="ghost"
          label={t('stf.inc.approveAll')}
          disabled={w.busy}
          onPress={() =>
            void w.send('POST', '/hr/incentives/approve', { period }, t('stf.inc.approved'), refresh)
          }
        />
      ) : null}
      {preview ? (
        <>
          <Text style={kit.name}>{t('stf.inc.previewTitle')}</Text>
          {preview.length === 0 ? <Text style={kit.sub}>{t('stf.inc.nothing')}</Text> : null}
          {preview.map((r, i) => (
            <RowCard key={`${r.ruleCode}-${i}`} r={r} />
          ))}
        </>
      ) : null}
      <Gate query={q} denied={false} deniedText={t('stf.denied')} offlineText={t('stf.offline')}>
        {items.length === 0 ? <StateView state="empty" message={t('stf.inc.noMonth')} /> : null}
        {items.map((r) => (
          <RowCard key={r.id ?? `${r.ruleCode}-${r.employeeName}`} r={r} />
        ))}
      </Gate>
    </>
  );
}

function Performance() {
  const { t } = useTranslation();
  const { me, client } = useAuth();
  const userId = me?.userId ?? '';
  const [period, setPeriod] = useState(todayIST().slice(0, 7));
  const q = useQuery({
    queryKey: stfKey(userId, 'inc', 'perf', period),
    queryFn: ({ signal }) => fetchPerformance(client!, monthRange(period), signal),
    enabled: client !== null,
    retry: (n, e) => isNetwork(e) && n < 1,
  });
  return (
    <>
      <MonthPicker value={period} onChange={setPeriod} />
      <Gate query={q} denied={false} deniedText={t('stf.denied')} offlineText={t('stf.offline')}>
        {q.data ? (
          <Card>
            <Line label={t('reports.netSales')} value={formatINR(q.data.totals.netSales)} strong />
            <Line label={t('reports.collected')} value={formatINR(q.data.totals.collections)} />
            <Line label={t('stf.inc.amount')} value={formatINR(q.data.totals.incentive)} />
          </Card>
        ) : null}
        {(q.data?.rows ?? []).length === 0 ? <StateView state="empty" message={t('stf.inc.noPerf')} /> : null}
        {(q.data?.rows ?? []).map((p) => (
          <Card key={p.employeeId}>
            <Text style={kit.name}>
              {p.code} · {p.name}
            </Text>
            <Line label={t('reports.netSales')} value={formatINR(p.netSales)} />
            <Line label={t('stf.inc.bills')} value={String(p.salesCount)} />
            <Line label={t('reports.collected')} value={formatINR(p.collections)} />
            <Line label={t('stf.inc.daysPresent')} value={p.presentDays} />
            <Line label={t('stf.inc.visits')} value={`${p.visitsDone} / ${p.visitsPlanned}`} />
            <Line label={t('stf.inc.amount')} value={formatINR(p.incentive)} strong />
          </Card>
        ))}
      </Gate>
    </>
  );
}

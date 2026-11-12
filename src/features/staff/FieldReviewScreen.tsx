import { useState } from 'react';
import { Text } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/ui/Button';
import { rangeOf } from '../reports/api';
import { todayIST } from '../collections/receipt';
import { isDate, shortDate } from '../hr/logic';
import { StateView } from '../stock/StateView';
import { P, fetchBeatsRange, fetchEmployees, fetchFieldSummary, fetchVisitsRange, stfKey } from './api';
import { Banner, Card, Chips, Field, Gate, Line, Screen, isNetwork, kit, useCan, useWrite } from './ui';

const DAYS = ['7', '30'] as const;

export default function FieldReviewScreen() {
  const { t } = useTranslation();
  const { me, client } = useAuth();
  const can = useCan();
  const qc = useQueryClient();
  const userId = me?.userId ?? '';
  const allowed = can(P.fieldManage);
  const ready = client !== null && me !== null && allowed;
  const [days, setDays] = useState<(typeof DAYS)[number]>('7');
  const [plan, setPlan] = useState(false);
  const w = useWrite();
  // the plan runs a week ahead as well: planning is for the days to come
  const past = rangeOf(todayIST(), Number(days));
  const retry = (n: number, e: unknown) => isNetwork(e) && n < 1;
  const refresh = () => void qc.invalidateQueries({ queryKey: ['stf', userId, 'field'] });

  const summary = useQuery({
    queryKey: stfKey(userId, 'field', 'summary', past.from, past.to),
    queryFn: ({ signal }) => fetchFieldSummary(client!, past, signal),
    enabled: ready,
    retry,
  });
  const beats = useQuery({
    queryKey: stfKey(userId, 'field', 'beats', past.from),
    queryFn: ({ signal }) => fetchBeatsRange(client!, { from: past.from, to: '2099-12-31' }, signal),
    enabled: ready,
    retry,
  });
  const visits = useQuery({
    queryKey: stfKey(userId, 'field', 'visits', past.from, past.to),
    queryFn: ({ signal }) => fetchVisitsRange(client!, past, signal),
    enabled: ready,
    retry,
  });

  return (
    <Screen title={t('stf.field.title')}>
      <Chips
        label={t('reports.period')}
        options={DAYS.map((d) => ({ id: d, label: t('reports.lastDays', { count: Number(d) }) }))}
        value={days}
        onChange={setDays}
      />
      <Gate query={summary} denied={!allowed} deniedText={t('stf.denied')} offlineText={t('stf.offline')}>
        <Banner w={w} />
        <Text style={kit.name}>{t('stf.field.summary')}</Text>
        {(summary.data?.rows ?? []).length === 0 ? (
          <StateView state="empty" message={t('stf.field.noSummary')} />
        ) : null}
        {(summary.data?.rows ?? []).map((r) => (
          <Card key={r.employeeId}>
            <Text style={kit.name}>{r.employeeName}</Text>
            <Line label={t('stf.field.planned')} value={String(r.planned)} />
            <Line label={t('stf.field.visitedBeats')} value={String(r.visited)} />
            <Line label={t('stf.field.missed')} value={String(r.missed)} />
            <Line label={t('stf.field.visitsMade')} value={String(r.visits)} />
            <Line label={t('stf.field.unplanned')} value={String(r.unplanned)} />
            <Line label={t('stf.field.adherence')} value={`${r.adherencePct}%`} strong />
          </Card>
        ))}

        {plan ? (
          <PlanForm w={w} onDone={() => (setPlan(false), refresh())} onCancel={() => setPlan(false)} />
        ) : (
          <Button label={t('stf.field.plan')} onPress={() => (w.clear(), w.newAction(), setPlan(true))} />
        )}
        <Button
          kind="ghost"
          label={t('stf.field.markMissed')}
          disabled={w.busy}
          onPress={() =>
            void w.send('POST', '/hr/beat-plans/mark-missed', undefined, t('stf.field.markedMissed'), refresh)
          }
        />

        <Text style={kit.name}>{t('stf.field.beats')}</Text>
        {beats.error ? <Text style={kit.sub}>{t('stf.field.beatsFailed')}</Text> : null}
        {(beats.data?.items ?? []).length === 0 && !beats.error ? (
          <Text style={kit.sub}>{t('stf.field.noBeats')}</Text>
        ) : null}
        {(beats.data?.items ?? []).map((b) => (
          <Card key={b.id}>
            <Text style={kit.name}>
              {shortDate(b.planDate)} · {b.employeeName}
            </Text>
            <Text style={kit.sub}>
              {[b.village, b.purpose, t(`visits.beat_${b.status}`, { defaultValue: b.status })]
                .filter(Boolean)
                .join(' · ')}
            </Text>
            {b.status === 'PLANNED' ? (
              <Button
                kind="ghost"
                label={t('stf.field.cancelBeat')}
                disabled={w.busy}
                onPress={() =>
                  void w.send(
                    'POST',
                    `/hr/beat-plans/${b.id}/cancel`,
                    undefined,
                    t('stf.field.cancelled'),
                    refresh,
                  )
                }
              />
            ) : null}
          </Card>
        ))}

        <Text style={kit.name}>{t('stf.field.visits')}</Text>
        {visits.error ? <Text style={kit.sub}>{t('stf.field.visitsFailed')}</Text> : null}
        {(visits.data?.items ?? []).length === 0 && !visits.error ? (
          <Text style={kit.sub}>{t('stf.field.noVisits')}</Text>
        ) : null}
        {(visits.data?.items ?? []).map((v) => (
          <Card key={v.id}>
            <Text style={kit.name}>
              {shortDate(v.visitedAt)} · {v.employeeName}
            </Text>
            <Text style={kit.sub}>
              {[v.village, t(`visits.outcome_${v.outcome}`, { defaultValue: v.outcome }), v.notes]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </Card>
        ))}
      </Gate>
    </Screen>
  );
}

function PlanForm({
  w,
  onDone,
  onCancel,
}: {
  w: ReturnType<typeof useWrite>;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const { me, client } = useAuth();
  const [q, setQ] = useState('');
  const [emp, setEmp] = useState('');
  const [date, setDate] = useState(todayIST());
  const [village, setVillage] = useState('');
  const [purpose, setPurpose] = useState('');
  const list = useQuery({
    queryKey: stfKey(me?.userId ?? '', 'plan-emps'),
    queryFn: ({ signal }) => fetchEmployees(client!, { status: 'ACTIVE' }, signal),
    enabled: client !== null,
    staleTime: 5 * 60_000,
  });
  const shown = (list.data?.items ?? [])
    .filter((e) => `${e.code} ${e.name}`.toLowerCase().includes(q.trim().toLowerCase()))
    .slice(0, 8);
  const valid = emp !== '' && isDate(date) && village.trim() !== '';
  return (
    <Card>
      <Field label={t('stf.emp.search')} value={q} onChange={setQ} />
      {list.error ? <Text style={kit.sub}>{t('stf.sal.noEmployees')}</Text> : null}
      <Chips
        label={t('stf.field.officer')}
        options={shown.map((e) => ({ id: e.id, label: `${e.code} ${e.name}` }))}
        value={emp}
        onChange={setEmp}
      />
      <Field
        label={t('stf.date')}
        value={date}
        onChange={setDate}
        placeholder="YYYY-MM-DD"
        error={!isDate(date) ? t('stf.badDate') : null}
      />
      <Field label={t('visits.village')} value={village} onChange={setVillage} />
      <Field label={t('stf.field.purpose')} value={purpose} onChange={setPurpose} />
      <Button
        label={t('stf.save')}
        disabled={w.busy || !valid}
        onPress={() =>
          void w.send(
            'POST',
            '/hr/beat-plans',
            {
              employeeId: emp,
              planDate: date.trim(),
              village: village.trim(),
              ...(purpose.trim() ? { purpose: purpose.trim() } : {}),
            },
            t('stf.field.planned_ok'),
            onDone,
          )
        }
      />
      <Button kind="ghost" label={t('stf.cancel')} onPress={onCancel} />
    </Card>
  );
}

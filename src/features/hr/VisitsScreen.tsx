import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/ui/Button';
import { daysBefore } from '../attendance/api';
import { todayIST } from '../collections/receipt';
import { StateView } from '../stock/StateView';
import {
  HR_PERM,
  VISIT_OUTCOMES,
  cancelBeat,
  createBeat,
  fetchBeats,
  fetchVisits,
  hrKey,
  recordVisit,
  type VisitOutcome,
} from './api';
import { Card, Chips, Field, Gate, Notice, isNetwork, kit, useAction, useActionKey, useCan } from './kit';
import { checkVisit, isDate, shortDate } from './logic';

/** The visit instant is stored in UTC; show the day in India. */
const istDay = (iso: string): string => {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? iso.slice(0, 10) : todayIST(t);
};

type Mode = 'list' | 'visit' | 'beat';

export default function VisitsScreen() {
  const { t } = useTranslation();
  const { me, client } = useAuth();
  const can = useCan();
  const qc = useQueryClient();
  const userId = me?.userId ?? '';
  const allowed = can(HR_PERM.fieldSelf);
  const ready = client !== null && me !== null && allowed;
  const today = todayIST();

  const [mode, setMode] = useState<Mode>('list');
  const [village, setVillage] = useState('');
  const [beatId, setBeatId] = useState('');
  const [outcome, setOutcome] = useState<VisitOutcome | ''>('');
  const [notes, setNotes] = useState('');
  const [planDate, setPlanDate] = useState(today);
  const [planVillage, setPlanVillage] = useState('');
  const [purpose, setPurpose] = useState('');

  const keys = useActionKey();
  const act = useAction(keys);
  const retry = (n: number, e: unknown) => isNetwork(e) && n < 1;

  const beats = useQuery({
    queryKey: hrKey(userId, 'beats', today),
    queryFn: ({ signal }) => fetchBeats(client!, today, signal),
    enabled: ready,
    retry,
  });
  const visits = useQuery({
    queryKey: hrKey(userId, 'visits', today),
    queryFn: ({ signal }) => fetchVisits(client!, daysBefore(today, 7), today, signal),
    enabled: ready,
    retry,
  });
  const refresh = () => void qc.invalidateQueries({ queryKey: ['hr', userId] });
  const planned = (beats.data?.items ?? []).filter((b) => b.status === 'PLANNED');

  const visitErr = checkVisit({ village, beatId, outcome });
  const visitBody = {
    ...(village.trim() ? { village: village.trim() } : {}),
    ...(beatId ? { beatPlanId: beatId } : {}),
    outcome: outcome as VisitOutcome,
    ...(notes.trim() ? { notes: notes.trim() } : {}),
  };
  const send = () => {
    // One key for this visit. The same value is the offlineRef, so even a lost answer cannot store the visit twice.
    const key = keys.keyFor(`visit:${JSON.stringify(visitBody)}`);
    return act.run(
      () => recordVisit(client!, { ...visitBody, offlineRef: key }, key),
      t('visits.recorded'),
      () => {
        setMode('list');
        setVillage('');
        setBeatId('');
        setOutcome('');
        setNotes('');
        refresh();
      },
    );
  };

  const beatBody = {
    planDate: planDate.trim(),
    ...(planVillage.trim() ? { village: planVillage.trim() } : {}),
    ...(purpose.trim() ? { purpose: purpose.trim() } : {}),
  };
  const beatOk = isDate(planDate) && planDate >= today && (planVillage.trim() !== '' || purpose.trim() !== '');
  const sendBeat = () =>
    act.run(
      () => createBeat(client!, beatBody, keys.keyFor(`beat:${JSON.stringify(beatBody)}`)),
      t('visits.beatSaved'),
      () => {
        setMode('list');
        setPlanVillage('');
        setPurpose('');
        refresh();
      },
    );

  const open = (m: Mode) => {
    act.clear();
    keys.reset();
    setMode(m);
  };

  return (
    <ScrollView contentContainerStyle={kit.page} keyboardShouldPersistTaps="handled">
      <Text style={kit.title} accessibilityRole="header">
        {t('visits.title')}
      </Text>
      <Gate query={beats} denied={!allowed} deniedText={t('visits.denied')} offlineText={t('visits.offline')}>
        {act.msg ? <Notice tone="ok" text={act.msg} /> : null}
        {act.failure ? <Notice tone="error" text={act.failure} /> : null}

        {mode === 'list' ? (
          <View style={kit.row}>
            <Button label={t('visits.record')} onPress={() => open('visit')} />
            <Button kind="ghost" label={t('visits.newBeat')} onPress={() => open('beat')} />
          </View>
        ) : null}

        {mode === 'visit' ? (
          <Card>
            <Text style={kit.name}>{t('visits.record')}</Text>
            {planned.length > 0 ? (
              <Chips
                label={t('visits.beat')}
                options={planned.map((b) => ({
                  id: b.id,
                  label: `${shortDate(b.planDate)} · ${b.village ?? b.purpose ?? ''}`,
                }))}
                value={beatId}
                onChange={(id) => setBeatId(beatId === id ? '' : id)}
              />
            ) : null}
            <Field label={t('visits.village')} value={village} onChange={setVillage} />
            <Chips
              label={t('visits.outcome')}
              options={VISIT_OUTCOMES.map((o) => ({ id: o, label: t(`visits.outcome_${o}`) }))}
              value={outcome}
              onChange={setOutcome}
            />
            <Field label={t('visits.notes')} value={notes} onChange={setNotes} />
            {visitErr === 'place' ? <Notice tone="warn" text={t('visits.needPlace')} /> : null}
            <Button label={t('visits.save')} disabled={act.busy || visitErr !== null} onPress={() => void send()} />
            <Button kind="ghost" label={t('visits.close')} onPress={() => setMode('list')} />
          </Card>
        ) : null}

        {mode === 'beat' ? (
          <Card>
            <Text style={kit.name}>{t('visits.newBeat')}</Text>
            <Field label={t('visits.planDate')} value={planDate} onChange={setPlanDate} placeholder="YYYY-MM-DD" />
            <Field label={t('visits.village')} value={planVillage} onChange={setPlanVillage} />
            <Field label={t('visits.purpose')} value={purpose} onChange={setPurpose} />
            {!isDate(planDate) || planDate < today ? <Notice tone="warn" text={t('visits.badPlanDate')} /> : null}
            <Button label={t('visits.saveBeat')} disabled={act.busy || !beatOk} onPress={() => void sendBeat()} />
            <Button kind="ghost" label={t('visits.close')} onPress={() => setMode('list')} />
          </Card>
        ) : null}

        <Text style={kit.name}>{t('visits.beatsTitle')}</Text>
        {(beats.data?.items ?? []).length === 0 ? <StateView state="empty" message={t('visits.noBeats')} /> : null}
        {(beats.data?.items ?? []).map((b) => (
          <Card key={b.id}>
            <Text style={kit.name}>{b.village ?? b.purpose ?? '-'}</Text>
            <Text style={kit.sub}>
              {shortDate(b.planDate)} · {t(`visits.beat_${b.status}`, { defaultValue: b.status })}
            </Text>
            {b.village && b.purpose ? <Text style={kit.sub}>{b.purpose}</Text> : null}
            {b.status === 'PLANNED' ? (
              <Button
                kind="ghost"
                label={t('visits.cancelBeat')}
                disabled={act.busy}
                onPress={() =>
                  void act.run(
                    () => cancelBeat(client!, b.id, keys.keyFor(`cancel-beat:${b.id}`)),
                    t('visits.beatCancelled'),
                    refresh,
                  )
                }
              />
            ) : null}
          </Card>
        ))}

        <Text style={kit.name}>{t('visits.visitsTitle')}</Text>
        {visits.data && visits.data.items.length === 0 ? <StateView state="empty" message={t('visits.noVisits')} /> : null}
        {(visits.data?.items ?? []).map((v) => (
          <Card key={v.id}>
            <Text style={kit.name}>{v.village ?? '-'}</Text>
            <Text style={kit.sub}>
              {shortDate(istDay(v.visitedAt))} · {t(`visits.outcome_${v.outcome}`, { defaultValue: v.outcome })}
            </Text>
            {v.notes ? <Text style={kit.sub}>{v.notes}</Text> : null}
          </Card>
        ))}
      </Gate>
    </ScrollView>
  );
}

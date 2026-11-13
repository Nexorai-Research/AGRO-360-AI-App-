import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@/ui/Button';
import { StateView } from '../stock/StateView';
import { Gate, retryNetworkOnce } from '../purchase/Gate';
import { Field, Notice, k, useActionKey } from '../purchase/ui';
import { useSal } from '../collections/sal-hook';
import {
  P,
  addRiskNote,
  akey,
  assignRisk,
  fetchRisk,
  fetchRiskEvidence,
  reopenRisk,
  setRiskStatus,
} from './api-g67';

export const validReason = (v: string) => v.trim().length >= 3 && v.trim().length <= 500;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
export const validDay = (v: string) => DAY.test(v) && !Number.isNaN(Date.parse(v));

export default function RiskCaseScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const s = useSal();
  const qc = useQueryClient();
  const kNote = useActionKey();
  const kSt = useActionKey();
  const kDue = useActionKey();
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');
  const [due, setDue] = useState('');
  const [tried, setTried] = useState(false);
  const allowed = s.can(P.view);
  const q = useQuery({
    queryKey: akey(s.userId, 'risk', id),
    queryFn: ({ signal }) => fetchRisk(s.client!, id!, signal),
    enabled: s.ready && allowed && !!id,
    retry: retryNetworkOnce,
  });
  const ev = useQuery({
    queryKey: akey(s.userId, 'risk-ev', id),
    queryFn: ({ signal }) => fetchRiskEvidence(s.client!, id!, signal),
    enabled: s.ready && allowed && !!id,
    retry: retryNetworkOnce,
  });
  if (!allowed) return <StateView state="denied" message={t('ai.denied')} />;
  const r = q.data;
  const refresh = () => void qc.invalidateQueries({ queryKey: ['ai'] });
  const closed = r?.status === 'RESOLVED' || r?.status === 'DISMISSED';
  const canWork = s.can(P.decide) && !closed;
  const addNote = () => {
    if (note.trim() === '') return;
    void s.act(
      t('ai.rk.noted'),
      () => addRiskNote(s.client!, id!, note.trim(), kNote.keyFor(note.trim())),
      () => (kNote.reset(), setNote(''), refresh()),
    );
  };
  const change = (status: 'ACKNOWLEDGED' | 'RESOLVED' | 'DISMISSED') => {
    setTried(true);
    if (status !== 'ACKNOWLEDGED' && !validReason(reason)) return;
    const body = status === 'ACKNOWLEDGED' ? { status } : { status, note: reason.trim() };
    void s.act(
      t('ai.rk.changed'),
      () => setRiskStatus(s.client!, id!, body, kSt.keyFor(JSON.stringify(body))),
      () => (kSt.reset(), setReason(''), setTried(false), refresh()),
    );
  };
  const reopen = () => {
    setTried(true);
    if (!validReason(reason)) return;
    void s.act(
      t('ai.rk.reopened'),
      () => reopenRisk(s.client!, id!, reason.trim(), kSt.keyFor(`reopen|${reason.trim()}`)),
      () => (kSt.reset(), setReason(''), setTried(false), refresh()),
    );
  };
  const setDueDay = () => {
    setTried(true);
    if (!validDay(due)) return;
    void s.act(
      t('ai.rk.dueSet'),
      () => assignRisk(s.client!, id!, { dueDate: due }, kDue.keyFor(due)),
      () => (kDue.reset(), refresh()),
    );
  };
  return (
    <ScrollView contentContainerStyle={k.page} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ headerShown: true, title: t('nav.aiRisks') }} />
      <Gate q={q} ns="ai" emptyKey="ai.rk.none" isEmpty={false}>
        {r ? (
          <>
            <Text style={k.title}>{r.title}</Text>
            <Text style={k.sub}>
              {t(`ai.rk.kind.${r.kind}`, { defaultValue: r.kind })} · {r.severity} ·{' '}
              {t(`ai.rk.st.${r.status}`)}
              {r.dueDate ? ` · ${t('ai.rk.due', { date: r.dueDate })}` : ''}
            </Text>
            {typeof r.detail.detail === 'string' ? <Text style={k.sub}>{r.detail.detail}</Text> : null}
            {r.resolutionNote ? (
              <Text style={k.sub}>{t('ai.rk.reason', { text: r.resolutionNote })}</Text>
            ) : null}
            {s.msg ? <Notice tone="ok" text={s.msg} /> : null}
            {s.failure ? <Notice tone="error" text={s.failure} /> : null}
            <View style={k.card}>
              <Text style={k.name}>{t('ai.rk.timeline')}</Text>
              {r.notes.length === 0 ? <Text style={k.sub}>{t('ai.rk.noNotes')}</Text> : null}
              {r.notes.map((n) => (
                <Text key={n.id} style={k.sub}>
                  {n.createdAt.slice(0, 16).replace('T', ' ')} · {n.note}
                </Text>
              ))}
              {(ev.data ?? []).length > 0 ? <Text style={k.name}>{t('ai.rk.evidence')}</Text> : null}
              {(ev.data ?? []).map((e, i) => (
                <Text key={e.id ?? i} style={k.sub}>
                  • {e.label ?? e.note ?? e.ref ?? '-'}
                </Text>
              ))}
            </View>
            {canWork ? (
              <View style={k.card}>
                <Field label={t('ai.rk.noteLabel')} value={note} onChange={setNote} multiline />
                <Button
                  kind="ghost"
                  label={t('ai.rk.addNote')}
                  disabled={s.busy || note.trim() === ''}
                  onPress={addNote}
                />
                <Field
                  label={t('ai.rk.dueLabel')}
                  value={due}
                  onChange={setDue}
                  placeholder="YYYY-MM-DD"
                  error={tried && due !== '' && !validDay(due) ? t('ai.rk.dueBad') : null}
                />
                <Button
                  kind="ghost"
                  label={t('ai.rk.setDue')}
                  disabled={s.busy || due === ''}
                  onPress={setDueDay}
                />
                <Field
                  label={t('ai.rk.reasonLabel')}
                  value={reason}
                  onChange={setReason}
                  multiline
                  error={tried && !validReason(reason) ? t('ai.rk.reasonBad') : null}
                />
                {r.status === 'OPEN' ? (
                  <Button
                    kind="ghost"
                    label={t('ai.rk.ack')}
                    disabled={s.busy}
                    onPress={() => change('ACKNOWLEDGED')}
                  />
                ) : null}
                <Button label={t('ai.rk.resolve')} disabled={s.busy} onPress={() => change('RESOLVED')} />
                <Button
                  kind="ghost"
                  label={t('ai.rk.dismiss')}
                  disabled={s.busy}
                  onPress={() => change('DISMISSED')}
                />
              </View>
            ) : null}
            {closed && s.can(P.govern) ? (
              <View style={k.card}>
                <Text style={k.sub}>{t('ai.rk.reopenNote')}</Text>
                <Field
                  label={t('ai.rk.reasonLabel')}
                  value={reason}
                  onChange={setReason}
                  multiline
                  error={tried && !validReason(reason) ? t('ai.rk.reasonBad') : null}
                />
                <Button label={t('ai.rk.reopen')} disabled={s.busy} onPress={reopen} />
              </View>
            ) : null}
          </>
        ) : null}
      </Gate>
    </ScrollView>
  );
}

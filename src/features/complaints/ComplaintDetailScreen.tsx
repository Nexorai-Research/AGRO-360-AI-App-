import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/ui/Button';
import { StateView } from '../stock/StateView';
import { Gate, retryNetworkOnce } from '../purchase/Gate';
import { Chips, Field, Notice, k, useActionKey, useErrorText } from '../purchase/ui';
import {
  CLAIMABLE,
  PERM,
  RESOLUTIONS,
  WORKABLE,
  assignComplaint,
  claimComplaint,
  commentComplaint,
  fetchAssignees,
  getComplaint,
  key,
  transitionComplaint,
  validClaimRef,
  type Status,
} from './api';
import { NEXT, buildTransition, needsText, transitionError } from './logic';

export default function ComplaintDetailScreen() {
  const { t } = useTranslation();
  const errText = useErrorText();
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const { me, client } = useAuth();
  const qc = useQueryClient();
  const userId = me?.userId ?? '';
  const can = (p: string) => me?.permissions === undefined || me.permissions.includes(p);
  const ready = client !== null && me !== null && can(PERM.view);
  const moveKey = useActionKey();
  const noteKey = useActionKey();

  const [to, setTo] = useState<Status | null>(null);
  const [text, setText] = useState('');
  const [resolution, setResolution] = useState('');
  const [comment, setComment] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const q = useQuery({
    queryKey: key(userId, 'one', id),
    queryFn: ({ signal }) => getComplaint(client!, id, signal),
    enabled: ready && id !== '',
    retry: retryNetworkOnce,
  });
  const assignKey = useActionKey();
  const claimKey = useActionKey();
  const [assignee, setAssignee] = useState<string | null>(null);
  const [claimRef, setClaimRef] = useState('');
  // like the web: the people list is read only for a handler of a ticket that can still be worked on
  const users = useQuery({
    queryKey: key(userId, 'assignees'),
    queryFn: ({ signal }) => fetchAssignees(client!, signal),
    enabled: ready && can(PERM.resolve) && q.data !== undefined && WORKABLE.includes(q.data.status),
    retry: retryNetworkOnce,
  });

  async function guarded(done: string, fn: () => Promise<unknown>, after: () => void) {
    if (busy) return;
    setBusy(true);
    setFailure(null);
    setMsg(null);
    try {
      await fn();
      after();
      setMsg(done);
      await qc.invalidateQueries({ queryKey: ['complaints'] });
    } catch (e) {
      setFailure(errText(e));
    } finally {
      setBusy(false);
    }
  }

  if (!can(PERM.view)) return <StateView state="denied" message={t('complaints.denied')} />;
  const c = q.data;
  const textErr = to ? transitionError(to, text) : null;

  return (
    <ScrollView contentContainerStyle={k.page} keyboardShouldPersistTaps="handled">
      <Gate q={q} ns="complaints" emptyKey="complaints.empty" isEmpty={false}>
        {c ? (
          <>
            <Text style={k.title}>{c.ticketNo}</Text>
            <Text style={k.name}>{c.customerName ?? '-'}</Text>
            <Text style={k.sub}>
              {[
                t(`complaints.category.${c.category}`, { defaultValue: c.category }),
                t(`complaints.severity.${c.severity}`, { defaultValue: c.severity }),
                t(`complaints.status.${c.status}`, { defaultValue: c.status }),
              ].join(' · ')}
            </Text>
            <Text style={k.sub}>{c.description}</Text>
            {c.batchNo ? <Text style={k.sub}>{t('complaints.batchShown', { batch: c.batchNo })}</Text> : null}
            {c.overdue ? <Text style={k.error}>{t('complaints.overdue')}</Text> : null}
            {c.resolutionText ? (
              <Text style={k.sub}>{t('complaints.resolutionShown', { text: c.resolutionText })}</Text>
            ) : null}

            {msg ? <Notice tone="ok" text={msg} /> : null}
            {failure ? <Notice tone="error" text={failure} /> : null}

            {can(PERM.resolve) ? (
              <View style={k.card}>
                <Text style={k.h2}>{t('complaints.moveTo')}</Text>
                <View style={k.row}>
                  {NEXT[c.status].map((s) => (
                    <Button
                      key={s}
                      kind={to === s ? 'primary' : 'ghost'}
                      label={t(`complaints.status.${s}`)}
                      onPress={() => setTo(s)}
                    />
                  ))}
                </View>
                {to ? (
                  <>
                    <Field
                      label={needsText(to) ? t('complaints.resolutionText') : t('complaints.noteOptional')}
                      value={text}
                      onChange={setText}
                      multiline
                    />
                    {textErr ? <Text style={k.error}>{t('complaints.v.text')}</Text> : null}
                    {to === 'RESOLVED' ? (
                      <Chips
                        options={RESOLUTIONS.map((r) => ({
                          value: r,
                          label: t(`complaints.resolution.${r}`),
                        }))}
                        value={resolution}
                        onChange={setResolution}
                      />
                    ) : null}
                    <Button
                      label={t('complaints.confirmMove')}
                      disabled={busy || textErr !== null}
                      onPress={() => {
                        const body = buildTransition(to, text, resolution);
                        void guarded(
                          t('complaints.moved'),
                          () =>
                            transitionComplaint(
                              client!,
                              c,
                              body,
                              moveKey.keyFor(`${c.id}|${c.version}|${JSON.stringify(body)}`),
                            ),
                          () => {
                            moveKey.reset();
                            setTo(null);
                            setText('');
                            setResolution('');
                          },
                        );
                      }}
                    />
                  </>
                ) : null}

                <Field label={t('complaints.comment')} value={comment} onChange={setComment} multiline />
                <Button
                  kind="ghost"
                  label={t('complaints.addComment')}
                  disabled={busy || comment.trim() === ''}
                  onPress={() =>
                    void guarded(
                      t('complaints.commented'),
                      () =>
                        commentComplaint(
                          client!,
                          c.id,
                          comment.trim(),
                          noteKey.keyFor(`${c.id}|${comment.trim()}`),
                        ),
                      () => {
                        noteKey.reset();
                        setComment('');
                      },
                    )
                  }
                />
              </View>
            ) : null}

            {can(PERM.resolve) && WORKABLE.includes(c.status) ? (
              <View style={k.card}>
                <Text style={k.h2}>{t('wp1.cmp.assignTitle')}</Text>
                {users.isError ? <Text style={k.sub}>{t('wp1.cmp.noUsers')}</Text> : null}
                {users.data ? (
                  <Chips
                    options={users.data.map((u) => ({
                      value: u.id,
                      label: u.fullName ?? u.username ?? u.id,
                    }))}
                    value={assignee ?? c.assigneeUserId ?? ''}
                    onChange={setAssignee}
                  />
                ) : null}
                <Button
                  kind="ghost"
                  label={t('wp1.cmp.assign')}
                  disabled={busy || !assignee || assignee === c.assigneeUserId}
                  onPress={() =>
                    void guarded(
                      t('wp1.cmp.assigned'),
                      () =>
                        assignComplaint(client!, c.id, assignee!, assignKey.keyFor(`${c.id}|${assignee}`)),
                      () => (assignKey.reset(), setAssignee(null)),
                    )
                  }
                />
                {CLAIMABLE.includes(c.status) ? (
                  <>
                    <Text style={k.h2}>{t('wp1.cmp.claimTitle')}</Text>
                    <Field
                      label={t('wp1.cmp.claimRef')}
                      value={claimRef}
                      onChange={setClaimRef}
                      error={claimRef !== '' && !validClaimRef(claimRef) ? t('wp1.cmp.claimBad') : null}
                    />
                    <Button
                      kind="ghost"
                      label={t('wp1.cmp.claim')}
                      disabled={busy || !validClaimRef(claimRef)}
                      onPress={() =>
                        void guarded(
                          t('wp1.cmp.claimed'),
                          () =>
                            claimComplaint(
                              client!,
                              c.id,
                              claimRef,
                              claimKey.keyFor(`${c.id}|${claimRef.trim()}`),
                            ),
                          () => (claimKey.reset(), setClaimRef('')),
                        )
                      }
                    />
                  </>
                ) : null}
              </View>
            ) : null}
          </>
        ) : null}
      </Gate>
    </ScrollView>
  );
}

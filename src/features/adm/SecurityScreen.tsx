import { useState } from 'react';
import { ScrollView, Text, TextInput } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '@/ui/Button';
import { Check, Field } from '@/ui/kit';
import { StateView } from '../stock/StateView';
import { fmtWhen, shortId } from '../admin/logic';
import { Chips } from '../admin/kit';
import {
  INCIDENT_STATUSES,
  MFA_ROLES,
  NEXT_STATUS,
  P,
  SEVERITIES,
  addIncidentNote,
  admKey,
  fetchIncident,
  fetchIncidents,
  fetchPolicy,
  fetchSecurityEvents,
  openIncident,
  savePolicy,
  transitionIncident,
  type IncidentStatus,
  type Severity,
} from './api';
import { Banner, Card, PartFailed, isNetwork, k, useAccess, useRun } from './kit';
import { validIncidentTitle, validNote, validPolicyNumbers } from './logic';

export default function SecurityScreen() {
  const { t } = useTranslation();
  const { client, can, userId } = useAccess();
  const ready = client !== null && userId !== '' && can(P.security);
  const r = useRun(userId);
  const opts = { retry: false as const, enabled: ready };

  const [filter, setFilter] = useState<'' | IncidentStatus>('');
  const [minLen, setMinLen] = useState<string | null>(null);
  const [hist, setHist] = useState<string | null>(null);
  const [roles, setRoles] = useState<string[] | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [newSev, setNewSev] = useState<Severity>('MEDIUM');
  const [selected, setSelected] = useState<string | null>(null);
  const [note, setNote] = useState('');

  const policy = useQuery({
    queryKey: admKey(userId, 'policy'),
    queryFn: ({ signal }) => fetchPolicy(client!, signal),
    ...opts,
  });
  const incidents = useQuery({
    queryKey: admKey(userId, 'incidents', filter),
    queryFn: ({ signal }) => fetchIncidents(client!, filter, signal),
    ...opts,
  });
  const events = useQuery({
    queryKey: admKey(userId, 'events'),
    queryFn: ({ signal }) => fetchSecurityEvents(client!, signal),
    ...opts,
  });
  const detail = useQuery({
    queryKey: admKey(userId, 'incident', selected),
    queryFn: ({ signal }) => fetchIncident(client!, selected!, signal),
    ...opts,
    enabled: ready && selected !== null,
  });

  if (!can(P.security)) return <StateView state="denied" message={t('sec.denied')} />;
  const all = [policy, incidents, events];
  if (all.every((q) => q.isPending && q.fetchStatus !== 'idle')) return <StateView state="loading" />;
  if (all.every((q) => q.error) && all.some((q) => isNetwork(q.error)))
    return (
      <StateView
        state="offline"
        message={t('sec.offline')}
        onRetry={() => all.forEach((q) => void q.refetch())}
      />
    );

  const refreshOffline = t('sec.offline');
  const p = policy.data;
  const shownMin = minLen ?? String(p?.minLength ?? '');
  const shownHist = hist ?? String(p?.historyCount ?? '');
  const shownRoles = roles ?? p?.mfaRequiredRoles ?? [];
  const valid = validPolicyNumbers(shownMin, shownHist);
  const policyChanged =
    p !== undefined &&
    (shownMin !== String(p.minLength) ||
      shownHist !== String(p.historyCount) ||
      JSON.stringify([...shownRoles].sort()) !== JSON.stringify([...p.mfaRequiredRoles].sort()));

  const policyBody = {
    minLength: Number(shownMin),
    historyCount: Number(shownHist),
    mfaRequiredRoles: [...shownRoles].sort(),
  };
  const doSavePolicy = () =>
    void r.run(
      async () => {
        await savePolicy(
          client!,
          p!,
          policyBody,
          r.idem.keyFor(`policy|${p!.version}|${JSON.stringify(policyBody)}`),
        );
        setMinLen(null);
        setHist(null);
        setRoles(null);
      },
      t('sec.policySaved'),
      ['policy'],
    );

  const doOpen = () =>
    void r.run(
      async () => {
        await openIncident(
          client!,
          { title: newTitle.trim(), severity: newSev },
          r.idem.keyFor(`open|${newTitle.trim()}|${newSev}`),
        );
        setNewTitle('');
      },
      t('sec.incidentOpened'),
      ['incidents'],
    );

  const inc = detail.data;
  const statusText = (s: string) => t(`sec.status.${s}`);

  return (
    <ScrollView contentContainerStyle={k.page} keyboardShouldPersistTaps="handled">
      <Text style={k.title}>{t('sec.title')}</Text>
      <Text style={k.sub}>{t('sec.hint')}</Text>
      <Banner msg={r.msg} failure={r.failure} />

      <Text style={k.h2}>{t('sec.policy')}</Text>
      {policy.error ? (
        <PartFailed error={policy.error} offline={refreshOffline} onRetry={() => void policy.refetch()} />
      ) : null}
      {p ? (
        <Card>
          <Text style={k.sub}>{t('sec.policyHint')}</Text>
          <Field
            label={t('sec.minLength')}
            value={shownMin}
            onChange={setMinLen}
            keyboard="number-pad"
            error={valid.minLength ? null : t('sec.badMin')}
          />
          <Field
            label={t('sec.history')}
            value={shownHist}
            onChange={setHist}
            keyboard="number-pad"
            error={valid.historyCount ? null : t('sec.badHistory')}
          />
          <Text style={k.sub}>{t('sec.mfaRoles')}</Text>
          {MFA_ROLES.map((role) => (
            <Check
              key={role}
              label={role}
              value={shownRoles.includes(role)}
              onChange={(on) => setRoles(on ? [...shownRoles, role] : shownRoles.filter((x) => x !== role))}
            />
          ))}
          <Button
            label={t('sec.savePolicy')}
            disabled={r.busy || !policyChanged || !valid.minLength || !valid.historyCount}
            onPress={doSavePolicy}
          />
        </Card>
      ) : null}

      <Text style={k.h2}>{t('sec.incidents')}</Text>
      <Chips
        label={t('sec.filter')}
        value={filter}
        onChange={(v) => {
          setFilter(v);
          setSelected(null);
        }}
        options={[
          ['', t('sec.all')],
          ...INCIDENT_STATUSES.map((s): [IncidentStatus, string] => [s, statusText(s)]),
        ]}
      />
      <Card>
        <Text style={k.name}>{t('sec.openIncident')}</Text>
        <Field
          label={t('sec.incTitle')}
          value={newTitle}
          onChange={setNewTitle}
          error={newTitle !== '' && !validIncidentTitle(newTitle) ? t('sec.badTitle') : null}
        />
        <Chips
          label={t('sec.severity')}
          value={newSev}
          onChange={setNewSev}
          options={SEVERITIES.map((s): [Severity, string] => [s, t(`sec.sev.${s}`)])}
        />
        <Button label={t('sec.create')} disabled={r.busy || !validIncidentTitle(newTitle)} onPress={doOpen} />
      </Card>
      {incidents.isPending && incidents.fetchStatus !== 'idle' ? (
        <Text style={k.sub}>{t('common.loading')}</Text>
      ) : null}
      {incidents.error ? (
        <PartFailed
          error={incidents.error}
          offline={refreshOffline}
          onRetry={() => void incidents.refetch()}
        />
      ) : null}
      {incidents.data && incidents.data.items.length === 0 ? (
        <Text style={k.sub}>{t('sec.noIncidents')}</Text>
      ) : null}
      {incidents.data?.items.map((i) => (
        <Card key={i.id}>
          <Text style={k.name}>{i.title}</Text>
          <Text style={k.sub}>
            {t(`sec.sev.${i.severity}`)} · {statusText(i.status)} · {fmtWhen(i.createdAt)}
          </Text>
          <Text style={k.sub}>
            {i.source === 'ANOMALY_RULE' ? t('sec.auto', { rule: i.rule ?? '' }) : t('sec.manual')}
          </Text>
          <Button
            kind="ghost"
            label={selected === i.id ? t('sec.hideIncident') : t('sec.viewIncident')}
            onPress={() => {
              setSelected(selected === i.id ? null : i.id);
              setNote('');
            }}
          />
          {selected === i.id ? (
            <>
              {detail.isPending && detail.fetchStatus !== 'idle' ? (
                <Text style={k.sub}>{t('common.loading')}</Text>
              ) : null}
              {detail.error ? (
                <PartFailed
                  error={detail.error}
                  offline={refreshOffline}
                  onRetry={() => void detail.refetch()}
                />
              ) : null}
              {inc ? (
                <>
                  <Text style={k.h2}>{t('sec.notes')}</Text>
                  {inc.notes.length === 0 ? <Text style={k.sub}>{t('sec.noNotes')}</Text> : null}
                  {inc.notes.map((n) => (
                    <Text key={n.id} style={k.sub}>
                      {fmtWhen(n.at)}: {n.note}
                    </Text>
                  ))}
                  {NEXT_STATUS[inc.status].map((to) => (
                    <Button
                      key={to}
                      kind="ghost"
                      label={t('sec.markAs', { status: statusText(to) })}
                      disabled={r.busy}
                      onPress={() =>
                        void r.run(
                          () =>
                            transitionIncident(
                              client!,
                              inc,
                              to,
                              r.idem.keyFor(`tr|${inc.id}|${inc.version}|${to}`),
                            ),
                          t('sec.statusChanged'),
                          ['incidents', 'incident'],
                        )
                      }
                    />
                  ))}
                  {inc.status !== 'CLOSED' ? (
                    <>
                      <TextInput
                        value={note}
                        onChangeText={setNote}
                        accessibilityLabel={t('sec.notePlaceholder')}
                        placeholder={t('sec.notePlaceholder')}
                        style={k.input}
                        multiline
                        maxLength={2000}
                      />
                      <Button
                        label={t('sec.addNote')}
                        disabled={r.busy || !validNote(note)}
                        onPress={() =>
                          void r
                            .run(
                              () =>
                                addIncidentNote(
                                  client!,
                                  inc.id,
                                  note.trim(),
                                  r.idem.keyFor(`note|${inc.id}|${note.trim()}`),
                                ),
                              t('sec.noteAdded'),
                              ['incident'],
                            )
                            .then((ok) => ok && setNote(''))
                        }
                      />
                    </>
                  ) : null}
                </>
              ) : null}
            </>
          ) : null}
        </Card>
      ))}

      <Text style={k.h2}>{t('sec.events')}</Text>
      {events.error ? (
        <PartFailed error={events.error} offline={refreshOffline} onRetry={() => void events.refetch()} />
      ) : null}
      {events.data && events.data.items.length === 0 ? <Text style={k.sub}>{t('sec.noEvents')}</Text> : null}
      {events.data?.items.map((e) => (
        <Text key={e.id} style={k.sub}>
          {fmtWhen(e.at)} · {e.type} · {e.userId ? shortId(e.userId) : '-'} · {e.ip ?? '-'}
        </Text>
      ))}
      <Text style={k.sub}>{t('sec.notBuilt')}</Text>
    </ScrollView>
  );
}

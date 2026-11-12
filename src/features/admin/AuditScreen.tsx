import { useState } from 'react';
import { ScrollView, Text, TextInput } from 'react-native';
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '@/ui/Button';
import { StateView } from '../stock/StateView';
import { PERM, adminKey, fetchAudit, type AuditFilter } from './api';
import { Card, isNetwork, k, queryState, useAccess } from './kit';
import { lastDays } from './usr-audit';
import { auditRange, fmtWhen, shortId, validAction, validActor, validDate, validEntity } from './logic';

const EMPTY = { action: '', entity: '', actor: '', from: '', to: '' };

/** Read only. The server returns this franchise's events only and leaves out the detail field. */
export default function AuditScreen() {
  const { t } = useTranslation();
  const { client, can, userId } = useAccess();
  const [draft, setDraft] = useState(EMPTY);
  const [applied, setApplied] = useState(EMPTY);
  const [openId, setOpenId] = useState<string | null>(null);

  const bad = {
    action: !validAction(draft.action.trim()),
    entity: !validEntity(draft.entity.trim()),
    actor: !validActor(draft.actor.trim()),
    from: draft.from !== '' && !validDate(draft.from.trim()),
    to: draft.to !== '' && !validDate(draft.to.trim()),
  };
  const anyBad = Object.values(bad).some(Boolean);

  const filter: AuditFilter = {
    action: applied.action.trim(),
    entity: applied.entity.trim(),
    actor: applied.actor.trim(),
    ...auditRange(applied.from.trim(), applied.to.trim()),
  };
  const events = useInfiniteQuery({
    queryKey: adminKey(userId, 'audit', filter),
    queryFn: ({ pageParam, signal }) => fetchAudit(client!, filter, pageParam, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    enabled: client !== null && userId !== '' && can(PERM.audit),
    placeholderData: keepPreviousData,
    retry: (n, e) => isNetwork(e) && n < 1,
  });

  if (!can(PERM.audit)) return <StateView state="denied" message={t('audit.denied')} />;
  const early = queryState(events, t, t('audit.offline'));
  if (early) return early;
  const rows = events.data?.pages.flatMap((p) => p.items) ?? [];

  const input = (name: keyof typeof EMPTY, label: string) => (
    <>
      <TextInput
        value={draft[name]}
        onChangeText={(v) => setDraft({ ...draft, [name]: v })}
        accessibilityLabel={label}
        placeholder={label}
        autoCapitalize="none"
        autoCorrect={false}
        style={k.input}
      />
      {bad[name] ? <Text style={k.error}>{t(`audit.bad.${name}`)}</Text> : null}
    </>
  );

  return (
    <ScrollView contentContainerStyle={k.page} keyboardShouldPersistTaps="handled">
      <Text style={k.title}>{t('audit.title')}</Text>
      <Text style={k.sub}>{t('audit.hint')}</Text>
      {input('action', t('audit.action'))}
      {input('entity', t('audit.entity'))}
      {input('actor', t('audit.actor'))}
      {input('from', t('audit.from'))}
      {input('to', t('audit.to'))}
      <Button kind="ghost" label={t('aud.today')} onPress={() => { const r = lastDays(1); setDraft({ ...draft, ...r }); setApplied({ ...draft, ...r }); }} />
      <Button kind="ghost" label={t('aud.week')} onPress={() => { const r = lastDays(7); setDraft({ ...draft, ...r }); setApplied({ ...draft, ...r }); }} />
      <Button label={t('audit.apply')} disabled={anyBad} onPress={() => setApplied(draft)} />
      <Button
        kind="ghost"
        label={t('audit.clear')}
        onPress={() => {
          setDraft(EMPTY);
          setApplied(EMPTY);
        }}
      />
      {rows.length === 0 ? <StateView state="empty" message={t('audit.empty')} /> : null}
      {rows.map((e) => (
        <Card key={e.id}>
          <Text style={k.name}>{e.action}</Text>
          <Text style={k.sub}>
            {fmtWhen(e.at)} · {e.outcome === 'SUCCESS' ? t('audit.success') : t('audit.failed', { outcome: e.outcome })}
          </Text>
          <Text style={k.sub}>
            {e.actorName
              ? t('audit.by', { name: e.actorName })
              : e.actorId
                ? t('audit.by', { name: shortId(e.actorId) })
                : t('audit.system')}
          </Text>
          <Text style={k.sub}>{e.targetType}{e.targetId ? ` ${shortId(e.targetId)}` : ''}</Text>
          {e.correlationId ? <Text style={k.sub}>{t('audit.ref', { id: e.correlationId })}</Text> : null}
          <Button kind="ghost" label={openId === e.id ? t('users.hide') : t('users.details')} onPress={() => setOpenId(openId === e.id ? null : e.id)} />
          {openId === e.id ? (
            <>
              <Text style={k.sub}>{t('aud.when', { value: e.at })}</Text>
              <Text style={k.sub}>{t('aud.eventId', { value: e.id })}</Text>
              <Text style={k.sub}>{t('aud.actorFull', { value: e.actorId ?? '-' })}</Text>
              {e.actorUsername ? <Text style={k.sub}>{t('aud.username', { value: e.actorUsername })}</Text> : null}
              <Text style={k.sub}>{t('aud.targetFull', { type: e.targetType, id: e.targetId ?? '-' })}</Text>
              <Text style={k.sub}>{t('aud.outcome', { value: e.outcome })}</Text>
              {e.actorId ? (
                <Button
                  kind="ghost"
                  label={t('aud.sameUser')}
                  onPress={() => { setDraft({ ...draft, actor: e.actorId! }); setApplied({ ...draft, actor: e.actorId! }); }}
                />
              ) : null}
              <Button
                kind="ghost"
                label={t('aud.sameAction')}
                onPress={() => { setDraft({ ...draft, action: e.action }); setApplied({ ...draft, action: e.action }); }}
              />
              <Text style={k.sub}>{t('aud.noDetail')}</Text>
            </>
          ) : null}
        </Card>
      ))}
      {events.hasNextPage ? (
        <Button kind="ghost" label={t('audit.more')} disabled={events.isFetchingNextPage} onPress={() => void events.fetchNextPage()} />
      ) : null}
    </ScrollView>
  );
}

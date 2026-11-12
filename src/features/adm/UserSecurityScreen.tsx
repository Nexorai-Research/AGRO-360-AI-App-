import { useState } from 'react';
import { ScrollView, Text, TextInput } from 'react-native';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '@/ui/Button';
import { Field } from '@/ui/kit';
import { StateView } from '../stock/StateView';
import { fmtWhen } from '../admin/logic';
import {
  P,
  admKey,
  endUserSession,
  fetchUserSessions,
  resetUser2fa,
  searchUsers,
  unlockUser,
  type UserRow,
} from './api';
import { Banner, Card, PartFailed, k, useAccess, useRun } from './kit';
import { validUserReason } from './logic';

function UserTools({ user, userId, run }: { user: UserRow; userId: string; run: ReturnType<typeof useRun> }) {
  const { t } = useTranslation();
  const { client } = useAccess();
  const [reason, setReason] = useState('');
  const sessions = useQuery({
    queryKey: admKey(userId, 'user-sessions', user.id),
    queryFn: ({ signal }) => fetchUserSessions(client!, user.id, signal),
    retry: false,
  });
  const good = validUserReason(reason);

  return (
    <>
      <Text style={k.h2}>{user.fullName}</Text>
      <Card>
        <Text style={k.sub}>{t('usec.reasonHint')}</Text>
        <TextInput
          value={reason}
          onChangeText={setReason}
          accessibilityLabel={t('usec.reason')}
          placeholder={t('usec.reason')}
          style={k.input}
          multiline
          maxLength={500}
        />
        {reason !== '' && !good ? <Text style={k.error}>{t('usec.badReason')}</Text> : null}
        <Button
          label={t('usec.unlock')}
          disabled={run.busy || !good}
          onPress={() =>
            void run.run(
              () =>
                unlockUser(
                  client!,
                  user.id,
                  reason.trim(),
                  run.idem.keyFor(`unlock|${user.id}|${reason.trim()}`),
                ),
              t('usec.unlocked'),
            )
          }
        />
        <Text style={k.sub}>{t('usec.resetWarn')}</Text>
        <Button
          label={t('usec.reset2fa')}
          disabled={run.busy || !good}
          onPress={() =>
            void run.run(
              () =>
                resetUser2fa(
                  client!,
                  user.id,
                  reason.trim(),
                  run.idem.keyFor(`2fa|${user.id}|${reason.trim()}`),
                ),
              t('usec.resetDone'),
              ['user-sessions'],
            )
          }
        />
      </Card>

      <Text style={k.h2}>{t('usec.sessions')}</Text>
      {sessions.isPending && sessions.fetchStatus !== 'idle' ? (
        <Text style={k.sub}>{t('common.loading')}</Text>
      ) : null}
      {sessions.error ? (
        <PartFailed
          error={sessions.error}
          offline={t('usec.offline')}
          onRetry={() => void sessions.refetch()}
        />
      ) : null}
      {sessions.data && sessions.data.items.length === 0 ? (
        <Text style={k.sub}>{t('usec.noSessions')}</Text>
      ) : null}
      {sessions.data?.items.map((s) => (
        <Card key={s.id}>
          <Text style={k.name}>{s.browser ?? t('usec.unknownBrowser')}</Text>
          <Text style={k.sub}>
            {t('usec.sessionLine', {
              started: fmtWhen(s.startedAt),
              last: fmtWhen(s.lastAccessAt),
              ip: s.ip ?? '-',
            })}
          </Text>
          <Button
            kind="ghost"
            label={t('usec.endSession')}
            disabled={run.busy}
            onPress={() =>
              void run.run(
                () => endUserSession(client!, user.id, s.id, run.idem.keyFor(`end|${user.id}|${s.id}`)),
                t('usec.sessionEnded'),
                ['user-sessions'],
              )
            }
          />
        </Card>
      ))}
    </>
  );
}

/** Unlock a user, reset their 2FA and see or end their sign-ins. Needs identity.user.manage; the server decides every call. */
export default function UserSecurityScreen() {
  const { t } = useTranslation();
  const { client, can, userId } = useAccess();
  const ready = client !== null && userId !== '' && can(P.users);
  const run = useRun(userId);
  const [text, setText] = useState('');
  const [picked, setPicked] = useState<UserRow | null>(null);

  const users = useQuery({
    queryKey: admKey(userId, 'sec-users', text.trim()),
    queryFn: ({ signal }) => searchUsers(client!, text, signal),
    enabled: ready,
    retry: false,
    placeholderData: keepPreviousData,
  });

  if (!can(P.users)) return <StateView state="denied" message={t('usec.denied')} />;
  const rows = users.data?.items ?? [];

  return (
    <ScrollView contentContainerStyle={k.page} keyboardShouldPersistTaps="handled">
      <Text style={k.title}>{t('usec.title')}</Text>
      <Text style={k.sub}>{t('usec.hint')}</Text>
      <Banner msg={run.msg} failure={run.failure} />
      <Field label={t('usec.search')} value={text} onChange={setText} />
      {users.isPending && users.fetchStatus !== 'idle' ? <StateView state="loading" /> : null}
      {users.error ? (
        <PartFailed error={users.error} offline={t('usec.offline')} onRetry={() => void users.refetch()} />
      ) : null}
      {users.data && rows.length === 0 ? <StateView state="empty" message={t('usec.empty')} /> : null}
      {rows.map((u) => (
        <Card key={u.id}>
          <Text style={k.name}>{u.fullName}</Text>
          <Text style={k.sub}>
            {u.username} · {u.status}
          </Text>
          <Button
            kind="ghost"
            label={picked?.id === u.id ? t('usec.hide') : t('usec.choose')}
            onPress={() => {
              setPicked(picked?.id === u.id ? null : u);
              run.idem.clear();
              run.clearMsg();
            }}
          />
          {picked?.id === u.id ? <UserTools key={u.id} user={u} userId={userId} run={run} /> : null}
        </Card>
      ))}
      <Text style={k.sub}>{t('usec.notBuilt')}</Text>
    </ScrollView>
  );
}

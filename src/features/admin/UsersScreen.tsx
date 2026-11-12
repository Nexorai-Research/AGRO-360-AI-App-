import { useState } from 'react';
import { ScrollView, Text, TextInput } from 'react-native';
import { keepPreviousData, useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { errorMessage, type ErrorMessage } from '@/api/errors';
import { Button } from '@/ui/Button';
import { StateView } from '../stock/StateView';
import { PERM, adminKey, deactivateUser, fetchRoles, fetchUsers, reactivateUser, type UserStatus, type UserView } from './api';
import { UserForm, UserSecurity } from './UserAdmin';
import { fetchBranchList } from './usr-api';
import { Card, Chips, failText, isNetwork, k, queryState, useAccess, useIdemKey } from './kit';
import { fmtWhen, validReason } from './logic';

type StatusFilter = '' | UserStatus;

export default function UsersScreen() {
  const { t } = useTranslation();
  const { client, can, userId } = useAccess();
  const qc = useQueryClient();
  const ready = client !== null && userId !== '' && can(PERM.users);

  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<StatusFilter>('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [failure, setFailure] = useState<ErrorMessage | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<'new' | string | null>(null);
  const idem = useIdemKey();

  const users = useInfiniteQuery({
    queryKey: adminKey(userId, 'users', q, status),
    queryFn: ({ pageParam, signal }) => fetchUsers(client!, { q, status, cursor: pageParam }, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    enabled: ready,
    placeholderData: keepPreviousData,
    retry: (n, e) => isNetwork(e) && n < 1,
  });
  // Role names need the role permission; without it the list shows only how many roles each person has.
  const canRoles = can(PERM.roles);
  const roles = useQuery({
    queryKey: adminKey(userId, 'roles'),
    queryFn: ({ signal }) => fetchRoles(client!, signal),
    enabled: ready && canRoles,
    staleTime: 5 * 60_000,
  });
  const branches = useQuery({
    queryKey: adminKey(userId, 'branches'),
    queryFn: ({ signal }) => fetchBranchList(client!, signal),
    enabled: ready,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const branchList = branches.data?.items.filter((b) => b.status === 'ACTIVE') ?? null;
  const roleName = new Map((roles.data?.items ?? []).map((r) => [r.id, r.name]));

  async function run(fn: () => Promise<unknown>, done: string) {
    if (busy) return;
    setBusy(true);
    setFailure(null);
    setMsg(null);
    try {
      await fn();
      idem.clear();
      setMsg(done);
      setReason('');
      void qc.invalidateQueries({ queryKey: adminKey(userId, 'users') });
    } catch (e) {
      setFailure(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (!can(PERM.users)) return <StateView state="denied" message={t('users.denied')} />;
  const early = queryState(users, t, t('users.offline'));
  if (early) return early;

  const rows: UserView[] = users.data?.pages.flatMap((p) => p.items) ?? [];
  const statusText = (s: UserStatus) => t(`users.status.${s}`);

  return (
    <ScrollView contentContainerStyle={k.page} keyboardShouldPersistTaps="handled">
      <Text style={k.title}>{t('users.title')}</Text>
      {msg ? <Text style={k.ok} accessibilityRole="alert">{msg}</Text> : null}
      {failure ? <Text style={k.error} accessibilityRole="alert">{failText(t, failure)}</Text> : null}
      {form === 'new' ? (
        <UserForm
          client={client!}
          roles={canRoles && roles.data ? roles.data.items : null}
          branches={branchList}
          onCancel={() => setForm(null)}
          onDone={(m) => {
            setForm(null);
            setMsg(m);
            void qc.invalidateQueries({ queryKey: adminKey(userId, 'users') });
          }}
        />
      ) : (
        <Button label={t('usr.addUser')} onPress={() => (setForm('new'), setMsg(null), setFailure(null))} />
      )}
      <TextInput
        value={text}
        onChangeText={setText}
        onSubmitEditing={() => setQ(text)}
        returnKeyType="search"
        accessibilityLabel={t('users.search')}
        placeholder={t('users.search')}
        style={k.input}
      />
      <Button kind="ghost" label={t('users.searchNow')} onPress={() => setQ(text)} />
      <Chips
        value={status}
        label={t('users.statusFilter')}
        onChange={setStatus}
        options={[
          ['', t('users.all')],
          ['ACTIVE', statusText('ACTIVE')],
          ['PENDING_INVITE', statusText('PENDING_INVITE')],
          ['DEACTIVATED', statusText('DEACTIVATED')],
        ]}
      />
      {rows.length === 0 ? <StateView state="empty" message={t('users.empty')} /> : null}
      {rows.map((u) => {
        const open = openId === u.id;
        return (
          <Card key={u.id}>
            <Text style={k.name}>{u.fullName}</Text>
            <Text style={k.sub}>{u.username} · {statusText(u.status)}</Text>
            <Button
              kind="ghost"
              label={open ? t('users.hide') : t('users.details')}
              onPress={() => {
                setOpenId(open ? null : u.id);
                setForm(null);
                setReason('');
                setFailure(null);
                setMsg(null);
                idem.clear();
              }}
            />
            {open ? (
              <>
                <Text style={k.sub}>{t('users.mobile', { value: u.mobile })}</Text>
                <Text style={k.sub}>{u.email ? t('users.email', { value: u.email }) : t('users.noEmail')}</Text>
                <Text style={k.sub}>
                  {canRoles && roles.data
                    ? t('users.roles', { value: u.roleIds.map((id) => roleName.get(id) ?? '?').join(', ') || '-' })
                    : t('users.rolesCount', { count: u.roleIds.length })}
                </Text>
                <Text style={k.sub}>
                  {u.allBranches ? t('users.allBranches') : t('users.branches', { count: u.branchIds.length })}
                </Text>
                <Text style={k.sub}>{t('users.created', { value: fmtWhen(u.createdAt) })}</Text>
                {form === u.id ? (
                  <UserForm
                    client={client!}
                    user={u}
                    roles={canRoles && roles.data ? roles.data.items : null}
                    branches={branchList}
                    onCancel={() => setForm(null)}
                    onDone={(m) => {
                      setForm(null);
                      setMsg(m);
                      void qc.invalidateQueries({ queryKey: adminKey(userId, 'users') });
                    }}
                  />
                ) : u.status !== 'DEACTIVATED' ? (
                  <Button kind="ghost" label={t('usr.edit')} onPress={() => (setForm(u.id), setMsg(null), setFailure(null))} />
                ) : null}
                {u.status !== 'DEACTIVATED' ? <UserSecurity client={client!} user={u} userId={userId} /> : null}
                {u.status === 'DEACTIVATED' ? (
                  <Button
                    label={t('users.reactivate')}
                    disabled={busy}
                    onPress={() => void run(() => reactivateUser(client!, u.id, idem.keyFor(`react|${u.id}`)), t('users.reactivated'))}
                  />
                ) : (
                  <>
                    <Text style={k.sub}>{t('users.deactivateWarn')}</Text>
                    <TextInput
                      value={reason}
                      onChangeText={setReason}
                      accessibilityLabel={t('users.reason')}
                      placeholder={t('users.reason')}
                      style={k.input}
                      multiline
                      maxLength={500}
                    />
                    {reason !== '' && !validReason(reason) ? <Text style={k.error}>{t('users.badReason')}</Text> : null}
                    <Button
                      label={t('users.deactivate')}
                      disabled={busy || !validReason(reason)}
                      onPress={() =>
                        void run(
                          () => deactivateUser(client!, u.id, reason, idem.keyFor(`deact|${u.id}|${reason.trim()}`)),
                          t('users.deactivated'),
                        )
                      }
                    />
                  </>
                )}
              </>
            ) : null}
          </Card>
        );
      })}
      {users.hasNextPage ? (
        <Button kind="ghost" label={t('users.more')} disabled={users.isFetchingNextPage} onPress={() => void users.fetchNextPage()} />
      ) : null}
    </ScrollView>
  );
}

import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { ApiClient } from '@/api/client';
import { Check, Field } from '@/ui/kit';
import { Button } from '@/ui/Button';
import type { BranchView, RoleView, UserView } from './api';
import { Card, isNetwork, k } from './kit';
import { fmtWhen, validReason } from './logic';
import { Result, useRunner } from './usr-run';
import {
  createUser,
  endUserSession,
  fetchUserSessions,
  resetUser2fa,
  unlockUser,
  updateUser,
  type UserInput,
} from './usr-api';
import {
  normalizeMobile,
  sameSet,
  toggleId,
  validEmail,
  validFullName,
  validMobile,
  validUsername,
} from './usr-logic';

/**
 * Add or edit a user. roles is null when the person may not read roles (identity.role.manage), branches is null when the list
 * is not available; in those cases that part cannot be changed here and is left out of the request.
 */
export function UserForm({
  client,
  user,
  roles,
  branches,
  onDone,
  onCancel,
}: {
  client: ApiClient;
  user?: UserView;
  roles: RoleView[] | null;
  branches: BranchView[] | null;
  onDone: (msg: string) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const edit = user !== undefined;
  const r = useRunner();
  const [fullName, setFullName] = useState(user?.fullName ?? '');
  const [username, setUsername] = useState('');
  const [mobile, setMobile] = useState(user?.mobile ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [roleIds, setRoleIds] = useState<string[]>(user?.roleIds ?? []);
  const [allBranches, setAllBranches] = useState(user?.allBranches ?? false);
  const [branchIds, setBranchIds] = useState<string[]>(user?.branchIds ?? []);
  const [touched, setTouched] = useState(false);

  const errs = {
    fullName: !validFullName(fullName),
    username: !edit && !validUsername(username),
    // an older number that no longer passes the rule must not block a role or branch change: only a changed number is checked
    mobile: (!edit || normalizeMobile(mobile) !== user.mobile) && !validMobile(mobile),
    email: !validEmail(email),
    roles: !edit && roleIds.length === 0,
    branches: branches !== null && !allBranches && branchIds.length === 0,
  };
  const bad = Object.values(errs).some(Boolean);

  function build(): UserInput {
    if (!edit) {
      return {
        fullName: fullName.trim(),
        username: username.trim(),
        mobile: normalizeMobile(mobile),
        email: email.trim() === '' ? null : email.trim(),
        roleIds,
        allBranches,
        branchIds: allBranches ? [] : branchIds,
      };
    }
    const b: UserInput = {};
    if (fullName.trim() !== user.fullName) b.fullName = fullName.trim();
    if (normalizeMobile(mobile) !== user.mobile) b.mobile = normalizeMobile(mobile);
    if (email.trim() !== (user.email ?? '')) b.email = email.trim() === '' ? null : email.trim();
    if (roles !== null && !sameSet(roleIds, user.roleIds)) b.roleIds = roleIds;
    if (branches !== null && (allBranches !== user.allBranches || !sameSet(branchIds, user.branchIds))) {
      b.allBranches = allBranches;
      b.branchIds = allBranches ? [] : branchIds;
    }
    return b;
  }
  const body = build();
  const nothing = edit && Object.keys(body).length === 0;

  const submit = () => {
    setTouched(true);
    if (bad || nothing) return;
    const key = r.idem.keyFor(
      `${edit ? `edit|${user.id}|${user.version}` : 'create'}|${JSON.stringify(body)}`,
    );
    void r
      .run(
        () => (edit ? updateUser(client, user.id, user.version, body, key) : createUser(client, body, key)),
        edit ? t('usr.updated') : email.trim() ? t('usr.created') : t('usr.createdNoEmail'),
      )
      .then(
        (ok) =>
          ok && onDone(edit ? t('usr.updated') : email.trim() ? t('usr.created') : t('usr.createdNoEmail')),
      );
  };

  return (
    <Card>
      <Text style={k.h2}>{edit ? t('usr.editTitle', { name: user.username }) : t('usr.addTitle')}</Text>
      {!edit ? <Text style={k.sub}>{t('usr.addHint')}</Text> : null}
      <Result msg={r.msg} failure={r.failure} />
      <Field
        label={t('usr.fullName')}
        value={fullName}
        onChange={setFullName}
        error={touched && errs.fullName ? t('usr.badFullName') : null}
      />
      {!edit ? (
        <Field
          label={t('usr.username')}
          value={username}
          onChange={setUsername}
          error={touched && errs.username ? t('usr.badUsername') : null}
        />
      ) : null}
      <Field
        label={t('usr.mobileLabel')}
        value={mobile}
        onChange={setMobile}
        keyboard="phone-pad"
        error={touched && errs.mobile ? t('usr.badMobile') : null}
      />
      <Field
        label={t('usr.emailLabel')}
        value={email}
        onChange={setEmail}
        keyboard="email-address"
        error={touched && errs.email ? t('usr.badEmail') : null}
      />
      {!edit && email.trim() === '' ? <Text style={k.sub}>{t('usr.emailNeeded')}</Text> : null}

      <Text style={k.name}>{t('usr.rolesLabel')}</Text>
      {roles === null ? (
        <Text style={k.sub}>{edit ? t('usr.rolesUnavailableEdit') : t('usr.rolesUnavailable')}</Text>
      ) : (
        roles.map((ro) => (
          <Check
            key={ro.id}
            label={ro.name}
            value={roleIds.includes(ro.id)}
            onChange={() => setRoleIds(toggleId(roleIds, ro.id))}
          />
        ))
      )}
      {touched && errs.roles ? <Text style={k.error}>{t('usr.badRoles')}</Text> : null}

      <Text style={k.name}>{t('usr.branchAccess')}</Text>
      <Check label={t('usr.allBranchesLabel')} value={allBranches} onChange={setAllBranches} />
      {!allBranches && branches === null ? <Text style={k.sub}>{t('usr.branchesUnavailable')}</Text> : null}
      {!allBranches && branches !== null
        ? branches.map((b) => (
            <Check
              key={b.id}
              label={b.name}
              value={branchIds.includes(b.id)}
              onChange={() => setBranchIds(toggleId(branchIds, b.id))}
            />
          ))
        : null}
      {touched && errs.branches ? <Text style={k.error}>{t('usr.badBranches')}</Text> : null}

      <Button
        label={edit ? t('usr.saveUser') : t('usr.createUser')}
        disabled={r.busy || nothing}
        onPress={submit}
      />
      <Button kind="ghost" label={t('usr.cancel')} onPress={onCancel} />
    </Card>
  );
}

type Mode = 'unlock' | 'reset' | null;

/** Unlock, reset two-factor and the sign-ins of another person (identity.user.manage). Reset two-factor needs a recent sign-in. */
export function UserSecurity({
  client,
  user,
  userId,
}: {
  client: ApiClient;
  user: UserView;
  userId: string;
}) {
  const { t } = useTranslation();
  const r = useRunner();
  const [mode, setMode] = useState<Mode>(null);
  const [reason, setReason] = useState('');
  const [showSessions, setShowSessions] = useState(false);
  const sessions = useQuery({
    queryKey: ['admin', userId, 'user-sessions', user.id],
    queryFn: ({ signal }) => fetchUserSessions(client, user.id, signal),
    enabled: showSessions,
    retry: false,
  });

  const go = () => {
    if (!mode || !validReason(reason)) return;
    const key = r.idem.keyFor(`${mode}|${user.id}|${reason.trim()}`);
    void r
      .run(
        () =>
          mode === 'unlock'
            ? unlockUser(client, user.id, reason, key)
            : resetUser2fa(client, user.id, reason, key),
        mode === 'unlock' ? t('usr.unlocked') : t('usr.reset2faDone'),
      )
      .then((ok) => {
        if (ok) {
          setMode(null);
          setReason('');
        }
      });
  };

  return (
    <View style={{ gap: 8 }}>
      <Result msg={r.msg} failure={r.failure} />
      {mode === null ? (
        <>
          <Button kind="ghost" label={t('usr.unlock')} onPress={() => (r.clear(), setMode('unlock'))} />
          <Button kind="ghost" label={t('usr.reset2fa')} onPress={() => (r.clear(), setMode('reset'))} />
        </>
      ) : (
        <>
          <Text style={k.sub}>{mode === 'unlock' ? t('usr.unlockHint') : t('usr.reset2faHint')}</Text>
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
            label={mode === 'unlock' ? t('usr.unlockNow') : t('usr.reset2faNow')}
            disabled={r.busy || !validReason(reason)}
            onPress={go}
          />
          <Button kind="ghost" label={t('usr.cancel')} onPress={() => (setMode(null), setReason(''))} />
        </>
      )}
      <Button
        kind="ghost"
        label={showSessions ? t('usr.hideSessions') : t('usr.sessions')}
        onPress={() => setShowSessions(!showSessions)}
      />
      {showSessions && sessions.isPending ? <Text style={k.sub}>{t('common.loading')}</Text> : null}
      {showSessions && sessions.error ? (
        <>
          <Text style={k.sub}>
            {isNetwork(sessions.error) ? t('users.offline') : t('usr.sessionsUnavailable')}
          </Text>
          <Button kind="ghost" label={t('common.retry')} onPress={() => void sessions.refetch()} />
        </>
      ) : null}
      {showSessions && sessions.data && sessions.data.items.length === 0 ? (
        <Text style={k.sub}>{t('usr.noSessions')}</Text>
      ) : null}
      {showSessions
        ? sessions.data?.items.map((s) => (
            <View key={s.id} style={{ gap: 4 }}>
              <Text style={k.name}>{s.browser ?? t('account.unknownBrowser')}</Text>
              <Text style={k.sub}>
                {t('account.sessionLine', {
                  started: fmtWhen(s.startedAt),
                  last: fmtWhen(s.lastAccessAt),
                  ip: s.ip ?? '-',
                })}
              </Text>
              <Button
                kind="ghost"
                label={t('account.endSession')}
                disabled={r.busy}
                onPress={() =>
                  void r
                    .run(
                      () => endUserSession(client, user.id, s.id, r.idem.keyFor(`end|${user.id}|${s.id}`)),
                      t('account.sessionEnded'),
                    )
                    .then((ok) => ok && void sessions.refetch())
                }
              />
            </View>
          ))
        : null}
    </View>
  );
}

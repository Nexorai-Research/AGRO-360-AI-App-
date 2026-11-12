import { useState } from 'react';
import { Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { ApiClient } from '@/api/client';
import { Check, Field } from '@/ui/kit';
import { Button } from '@/ui/Button';
import type { RoleView } from './api';
import { Card, Chips, isNetwork, k } from './kit';
import { Result, useRunner } from './usr-run';
import { createRole, deleteRole, fetchPermissions, renameRole, setRoleLimits, setRolePermissions } from './usr-api';
import { LIMIT_KEYS, canGrant, groupByArea, sameSet, toggleId, validLimit, validRoleName } from './usr-logic';

/** New role: empty, or a copy of an existing role. */
export function NewRole({ client, roles, onDone, onCancel }: { client: ApiClient; roles: RoleView[]; onDone: (m: string) => void; onCancel: () => void }) {
  const { t } = useTranslation();
  const r = useRunner();
  const [name, setName] = useState('');
  const [from, setFrom] = useState('');
  const [touched, setTouched] = useState(false);
  const bad = !validRoleName(name);
  const submit = () => {
    setTouched(true);
    if (bad) return;
    const body = from ? { name: name.trim(), cloneFromRoleId: from } : { name: name.trim() };
    void r
      .run(() => createRole(client, body, r.idem.keyFor(`role-new|${JSON.stringify(body)}`)), t('rol.created'))
      .then((ok) => ok && onDone(t('rol.created')));
  };
  return (
    <Card>
      <Text style={k.h2}>{t('rol.newTitle')}</Text>
      <Result msg={r.msg} failure={r.failure} />
      <Field label={t('rol.name')} value={name} onChange={setName} error={touched && bad ? t('rol.badName') : null} />
      <Chips
        value={from}
        label={t('rol.startFrom')}
        onChange={setFrom}
        options={[['', t('rol.empty')], ...roles.map((x): [string, string] => [x.id, x.name])]}
      />
      <Button label={t('rol.create')} disabled={r.busy} onPress={submit} />
      <Button kind="ghost" label={t('usr.cancel')} onPress={onCancel} />
    </Card>
  );
}

/**
 * Edit one custom role: name, permission matrix, approval limits, delete. System roles are fixed and never get this panel.
 * The version always comes from the freshest role the list loaded (role prop), so a save after another save does not use an old version.
 */
export function RoleEditor({
  client,
  role,
  userId,
  held,
  onChanged,
  onDeleted,
}: {
  client: ApiClient;
  role: RoleView;
  userId: string;
  held: (code: string) => boolean;
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const { t } = useTranslation();
  const r = useRunner();
  const perms = useQuery({
    queryKey: ['admin', userId, 'permissions'],
    queryFn: ({ signal }) => fetchPermissions(client, signal),
    staleTime: 5 * 60_000,
    retry: (n, e) => isNetwork(e) && n < 1,
  });
  const [name, setName] = useState(role.name);
  const [codes, setCodes] = useState<string[]>(role.permissions);
  const [limits, setLimits] = useState<Record<string, string>>({ ...role.limits });
  const [openArea, setOpenArea] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const limitBad = LIMIT_KEYS.filter((key) => !validLimit(key, limits[key] ?? ''));
  const limitBody = Object.fromEntries(LIMIT_KEYS.flatMap((key) => ((limits[key] ?? '').trim() === '' ? [] : [[key, (limits[key] ?? '').trim()]])));
  const limitsChanged = JSON.stringify(limitBody) !== JSON.stringify(role.limits);

  const finish = (ok: boolean) => ok && onChanged();

  return (
    <View style={{ gap: 8 }}>
      <Result msg={r.msg} failure={r.failure} />

      <Text style={k.name}>{t('rol.renameTitle')}</Text>
      <Field label={t('rol.name')} value={name} onChange={setName} error={name !== '' && !validRoleName(name) ? t('rol.badName') : null} />
      <Button
        kind="ghost"
        label={t('rol.rename')}
        disabled={r.busy || !validRoleName(name) || name.trim() === role.name}
        onPress={() =>
          void r
            .run(() => renameRole(client, role.id, role.version, name, r.idem.keyFor(`rename|${role.id}|${role.version}|${name.trim()}`)), t('rol.renamed'))
            .then(finish)
        }
      />

      <Text style={k.name}>{t('rol.permissions')}</Text>
      <Text style={k.sub}>{t('rol.permHint')}</Text>
      {perms.isPending ? <Text style={k.sub}>{t('common.loading')}</Text> : null}
      {perms.error ? (
        <>
          <Text style={k.sub}>{isNetwork(perms.error) ? t('roles.offline') : t('rol.permsUnavailable')}</Text>
          <Button kind="ghost" label={t('common.retry')} onPress={() => void perms.refetch()} />
        </>
      ) : null}
      {perms.data
        ? groupByArea(perms.data.items.filter((p) => typeof p.code === 'string')).map(([area, items]) => {
            const open = openArea === area;
            const on = items.filter((p) => codes.includes(p.code)).length;
            return (
              <View key={area} style={{ gap: 4 }}>
                <Button
                  kind="ghost"
                  label={`${area} (${on}/${items.length})`}
                  onPress={() => setOpenArea(open ? null : area)}
                />
                {open
                  ? items.map((p) => {
                      const has = codes.includes(p.code);
                      const locked = !has && !canGrant(p, held);
                      return locked ? (
                        <Text key={p.code} style={k.sub}>
                          {p.code} - {p.enabled ? t('rol.notHeld') : t('rol.notInPlan')}
                        </Text>
                      ) : (
                        <Check key={p.code} label={p.code} value={has} onChange={() => setCodes(toggleId(codes, p.code))} />
                      );
                    })
                  : null}
              </View>
            );
          })
        : null}
      <Button
        label={t('rol.savePerms')}
        disabled={r.busy || sameSet(codes, role.permissions)}
        onPress={() =>
          void r
            .run(
              () => setRolePermissions(client, role.id, role.version, codes, r.idem.keyFor(`perms|${role.id}|${role.version}|${[...codes].sort().join(',')}`)),
              t('rol.permsSaved'),
            )
            .then(finish)
        }
      />

      <Text style={k.name}>{t('rol.limitsTitle')}</Text>
      <Text style={k.sub}>{t('rol.limitsHint')}</Text>
      {LIMIT_KEYS.map((key) => (
        <Field
          key={key}
          label={t(`rol.limit.${key}`)}
          value={limits[key] ?? ''}
          onChange={(v) => setLimits({ ...limits, [key]: v })}
          keyboard="decimal-pad"
          placeholder={t('rol.notSet')}
          error={limitBad.includes(key) ? t(key.endsWith('_pct') ? 'rol.badPct' : 'rol.badAmount') : null}
        />
      ))}
      <Button
        label={t('rol.saveLimits')}
        disabled={r.busy || limitBad.length > 0 || !limitsChanged}
        onPress={() =>
          void r
            .run(
              () => setRoleLimits(client, role.id, role.version, limitBody, r.idem.keyFor(`limits|${role.id}|${role.version}|${JSON.stringify(limitBody)}`)),
              t('rol.limitsSaved'),
            )
            .then(finish)
        }
      />

      {role.assignedUsers > 0 ? <Text style={k.sub}>{t('rol.deleteBlocked', { count: role.assignedUsers })}</Text> : null}
      {confirmDelete ? (
        <>
          <Text style={k.error}>{t('rol.deleteWarn', { name: role.name })}</Text>
          <Button
            label={t('rol.deleteNow')}
            disabled={r.busy}
            onPress={() =>
              void r.run(() => deleteRole(client, role.id, r.idem.keyFor(`role-del|${role.id}`)), t('rol.deleted')).then((ok) => ok && onDeleted())
            }
          />
          <Button kind="ghost" label={t('usr.cancel')} onPress={() => setConfirmDelete(false)} />
        </>
      ) : (
        <Button kind="ghost" label={t('rol.delete')} disabled={role.assignedUsers > 0} onPress={() => setConfirmDelete(true)} />
      )}
    </View>
  );
}

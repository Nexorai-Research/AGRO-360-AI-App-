import { useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '@/ui/Button';
import { StateView } from '../stock/StateView';
import { PERM, adminKey, fetchRoles } from './api';
import { NewRole, RoleEditor } from './RoleAdmin';
import { Result } from './usr-run';
import { Card, isNetwork, k, queryState, useAccess } from './kit';

/** Roles: list, create, rename, delete, permission matrix and approval limits. System roles are read only. */
export default function RolesScreen() {
  const { t } = useTranslation();
  const { client, can, userId } = useAccess();
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const roles = useQuery({
    queryKey: adminKey(userId, 'roles'),
    queryFn: ({ signal }) => fetchRoles(client!, signal),
    enabled: client !== null && userId !== '' && can(PERM.roles),
    retry: (n, e) => isNetwork(e) && n < 1,
  });

  if (!can(PERM.roles)) return <StateView state="denied" message={t('roles.denied')} />;
  const early = queryState(roles, t, t('roles.offline'));
  if (early) return early;
  const items = roles.data?.items ?? [];

  return (
    <ScrollView contentContainerStyle={k.page}>
      <Text style={k.title}>{t('roles.title')}</Text>
      <Text style={k.sub}>{t('roles.hint')}</Text>
      <Result msg={done} failure={null} />
      {adding ? (
        <NewRole
          client={client!}
          roles={items}
          onCancel={() => setAdding(false)}
          onDone={(m) => {
            setAdding(false);
            setDone(m);
            void qc.invalidateQueries({ queryKey: adminKey(userId, 'roles') });
          }}
        />
      ) : (
        <Button label={t('rol.newRole')} onPress={() => (setAdding(true), setDone(null))} />
      )}
      {items.length === 0 ? <StateView state="empty" message={t('roles.empty')} /> : null}
      {items.map((r) => {
        const open = openId === r.id;
        const groups = new Map<string, string[]>();
        for (const code of r.permissions) {
          const area = code.split('.')[0] ?? code;
          groups.set(area, [...(groups.get(area) ?? []), code]);
        }
        const limits = Object.entries(r.limits);
        return (
          <Card key={r.id}>
            <Text style={k.name}>{r.name}</Text>
            <Text style={k.sub}>
              {t('roles.line', { users: r.assignedUsers, perms: r.permissions.length })}
              {r.isSystem ? ` · ${t('roles.system')}` : ''}
            </Text>
            <Button kind="ghost" label={open ? t('roles.hide') : t('roles.show')} onPress={() => setOpenId(open ? null : r.id)} />
            {open ? (
              <>
                {[...groups].map(([area, codes]) => (
                  <Text key={area} style={k.sub}>
                    {area}: {codes.map((c) => c.slice(area.length + 1)).join(', ')}
                  </Text>
                ))}
                {limits.length > 0 ? <Text style={k.name}>{t('roles.limits')}</Text> : null}
                {limits.map(([key, v]) => (
                  <Text key={key} style={k.sub}>{key}: {v}</Text>
                ))}
                {!r.isSystem ? (
                  <RoleEditor
                    client={client!}
                    role={r}
                    userId={userId}
                    held={(code) => can(code)}
                    onChanged={() => void qc.invalidateQueries({ queryKey: adminKey(userId, 'roles') })}
                    onDeleted={() => {
                      setOpenId(null);
                      setDone(t('rol.deleted'));
                      void qc.invalidateQueries({ queryKey: adminKey(userId, 'roles') });
                    }}
                  />
                ) : (
                  <Text style={k.sub}>{t('rol.systemFixed')}</Text>
                )}
              </>
            ) : null}
          </Card>
        );
      })}
    </ScrollView>
  );
}

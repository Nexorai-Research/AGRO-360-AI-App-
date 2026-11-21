import { useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/ui/Button';
import { StateView } from '../stock/StateView';
import { Card, Field, Gate, isNetwork, kit, useCan } from '../hr/kit';
import { AccessEditor } from '../access/AccessEditor';
import { originOf, userLockedWhy, type CatalogueItem, type UserAccess } from '../access/access-logic';
import { PERM, type UserView } from './api';
import { fetchPermissions } from './usr-api';

// Web parity phase 35: Access control for one person (the "access" tab of Settings, apps/web/src/pages/access.js accessSection). The role gives
// the starting point; what is changed here applies to this person only. Needs identity.user.manage; the server checks again, and refuses to give
// or take away a permission the person making the change does not hold.

const retry = (n: number, e: unknown) => isNetwork(e) && n < 1;

/** The web reads up to 5 pages of 200 people, newest first. */
async function fetchPeople(
  c: NonNullable<ReturnType<typeof useAuth>['client']>,
  signal?: AbortSignal,
): Promise<UserView[]> {
  const all: UserView[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < 5; i++) {
    const r = await c.get<{ items: UserView[]; next_cursor: string | null }>('/users', {
      query: { limit: 200, order: 'newest', cursor },
      signal,
    });
    all.push(...r.items);
    if (!r.next_cursor) break;
    cursor = r.next_cursor;
  }
  return all;
}

export default function UserAccessScreen() {
  const { t } = useTranslation();
  const { me, client } = useAuth();
  const can = useCan();
  const qc = useQueryClient();
  const [id, setId] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const userId = me?.userId ?? '';
  const allowed = can(PERM.users);
  const ready = client !== null && me !== null && allowed;
  const people = useQuery({
    queryKey: ['access', userId, 'people'],
    queryFn: ({ signal }) => fetchPeople(client!, signal),
    enabled: ready,
    retry,
  });
  const catalogue = useQuery({
    queryKey: ['access', userId, 'catalogue'],
    queryFn: ({ signal }) => fetchPermissions(client!, signal),
    enabled: ready,
    retry,
  });
  const one = useQuery({
    queryKey: ['access', userId, 'user', id],
    queryFn: ({ signal }) => client!.get<UserAccess>(`/users/${encodeURIComponent(id!)}/access`, { signal }),
    enabled: ready && id !== null,
    retry,
  });
  if (!allowed) return <StateView state="denied" message={t('wp35.denied')} />;
  const needle = q.trim().toLowerCase();
  const shown = (people.data ?? []).filter(
    (u) => !needle || `${u.fullName} ${u.username} ${u.mobile}`.toLowerCase().includes(needle),
  );
  const s = one.data;
  const cat: CatalogueItem[] = catalogue.data?.items ?? [];
  // the permissions of the person making the change; when they are not known yet the server decides
  const held = new Set(me?.permissions ?? cat.map((p) => p.code));
  return (
    <ScrollView contentContainerStyle={kit.page} keyboardShouldPersistTaps="handled">
      <Text style={kit.title} accessibilityRole="header">
        {t('wp35.title')}
      </Text>
      <Text style={kit.sub}>{t('wp35.hint')}</Text>
      <Field label={t('wp35.find')} value={q} onChange={setQ} />
      <Gate query={people} denied={false} deniedText={t('wp35.denied')} offlineText={t('wp35.offline')}>
        <Text style={kit.sub}>{t('wp35.people', { count: people.data?.length ?? 0 })}</Text>
        {shown.length === 0 ? <Text style={kit.sub}>{t('wp35.noMatch')}</Text> : null}
        {shown.map((u) => (
          <Card key={u.id}>
            <Text style={kit.name}>{u.fullName}</Text>
            <Text style={kit.sub}>
              {u.username}
              {u.status === 'ACTIVE' ? '' : ` · ${u.status.replace('_', ' ')}`}
            </Text>
            <Button
              kind={id === u.id ? undefined : 'ghost'}
              label={t('wp35.choose', { name: u.fullName })}
              onPress={() => setId(u.id)}
            />
          </Card>
        ))}
      </Gate>
      {id === null ? (
        <Card>
          <Text style={kit.name}>{t('wp35.pick')}</Text>
          <Text style={kit.sub}>{t('wp35.pickHint')}</Text>
        </Card>
      ) : (
        <Gate query={one} denied={false} deniedText={t('wp35.denied')} offlineText={t('wp35.offline')}>
          {s && catalogue.data ? (
            <AccessEditor
              key={`${s.userId}|${s.effective.length}|${s.granted.length}|${s.denied.length}`}
              catalogue={cat}
              effective={s.effective}
              title={s.fullName}
              subtitle={`${s.username} · ${s.roles.map((r) => r.name).join(', ') || t('wp35.noRole')}`}
              badge={
                s.fullAccess
                  ? { text: t('wp35.fullAccessBadge'), tone: 'ok' }
                  : s.status === 'DEACTIVATED'
                    ? { text: t('wp35.deactivated'), tone: 'off' }
                    : null
              }
              note={s.fullAccess ? t('wp35.fullAccessNote') : null}
              origin={(p) => {
                const o = originOf(s, p.code);
                return o ? t(`wp35.origin.${o}`) : '';
              }}
              lockedWhy={(p) => {
                const w = userLockedWhy(s, held, p.code);
                return w ? t(`wp35.locked.${w}`) : null;
              }}
              onSave={async (codes, key) => {
                await client!.put(`/users/${encodeURIComponent(s.userId)}/access`, {
                  body: { permissions: codes },
                  idempotencyKey: key,
                });
              }}
              onSaved={() => void qc.invalidateQueries({ queryKey: ['access', userId, 'user'] })}
            />
          ) : null}
        </Gate>
      )}
    </ScrollView>
  );
}

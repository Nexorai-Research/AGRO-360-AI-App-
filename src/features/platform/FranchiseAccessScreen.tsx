import { useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/ui/Button';
import { StateView } from '../stock/StateView';
import { Card, Field, Gate, isNetwork, kit } from '../hr/kit';
import { AccessEditor } from '../access/AccessEditor';
import type { CatalogueItem } from '../access/access-logic';
import { fetchFranchises, isPlatformUser } from './PlatformScreens';

// Web parity phase 34: Access control for a franchise (apps/web/src/pages/franchise-access.js). This replaces choosing a plan: the platform
// ticks the menus, pages and features a franchise may use, and its people only ever see and do what is ticked. Platform operators only; the
// server decides (view: platform.franchise.read, change: platform.franchise.update).

export interface FranchiseAccess {
  franchise: { id: string; displayName: string; code: string; status: string };
  /** false: nobody has restricted this franchise yet, so it can use everything. */
  restricted: boolean;
  allowed: string[];
  catalogue: CatalogueItem[];
}
const retry = (n: number, e: unknown) => isNetwork(e) && n < 1;

export default function FranchiseAccessScreen() {
  const { t } = useTranslation();
  const { me, client } = useAuth();
  const qc = useQueryClient();
  const params = useLocalSearchParams<{ id?: string }>();
  const [id, setId] = useState<string | null>(typeof params.id === 'string' ? params.id : null);
  const [q, setQ] = useState('');
  const userId = me?.userId ?? '';
  const allowed = isPlatformUser(me?.roles);
  const ready = client !== null && me !== null && allowed;
  const list = useQuery({
    queryKey: ['platform', userId, 'franchises', '', ''],
    queryFn: ({ signal }) => fetchFranchises(client!, '', '', signal),
    enabled: ready,
    retry,
  });
  const access = useQuery({
    queryKey: ['platform', userId, 'franchise-access', id],
    queryFn: ({ signal }) =>
      client!.get<FranchiseAccess>(`/platform/franchises/${encodeURIComponent(id!)}/access`, { signal }),
    enabled: ready && id !== null,
    retry,
  });
  if (!allowed) return <StateView state="denied" message={t('wp12.denied')} />;
  const needle = q.trim().toLowerCase();
  const items = (list.data?.items ?? []).filter(
    (f) => !needle || `${f.displayName} ${f.code} ${f.franchiseId}`.toLowerCase().includes(needle),
  );
  const a = access.data;
  return (
    <ScrollView contentContainerStyle={kit.page} keyboardShouldPersistTaps="handled">
      <Text style={kit.title} accessibilityRole="header">
        {t('wp34.fr.title')}
      </Text>
      <Text style={kit.sub}>{t('wp34.fr.hint')}</Text>
      <Field label={t('wp34.fr.find')} value={q} onChange={setQ} />
      <Gate query={list} denied={false} deniedText={t('wp12.denied')} offlineText={t('wp12.offline')}>
        {items.length === 0 ? <Text style={kit.sub}>{t('wp34.fr.noMatch')}</Text> : null}
        {items.map((f) => (
          <Card key={f.id}>
            <Text style={kit.name}>{f.displayName}</Text>
            <Text style={kit.sub}>
              {f.franchiseId} / {f.code}
              {f.status === 'ACTIVE' ? '' : ` · ${t(`wp12.st.${f.status}`, { defaultValue: f.status })}`}
            </Text>
            <Button
              kind={id === f.id ? undefined : 'ghost'}
              label={t('wp34.fr.choose', { name: f.displayName })}
              onPress={() => setId(f.id)}
            />
          </Card>
        ))}
      </Gate>
      {id === null ? (
        <Card>
          <Text style={kit.name}>{t('wp34.fr.pick')}</Text>
          <Text style={kit.sub}>{t('wp34.fr.pickHint')}</Text>
        </Card>
      ) : (
        <Gate query={access} denied={false} deniedText={t('wp12.denied')} offlineText={t('wp12.offline')}>
          {a ? (
            <AccessEditor
              key={`${a.franchise.id}|${a.restricted}|${a.allowed.length}`}
              catalogue={a.catalogue}
              effective={a.allowed}
              title={a.franchise.displayName}
              subtitle={`${a.franchise.code} · ${a.franchise.status}`}
              badge={a.restricted ? null : { text: t('wp34.fr.notRestricted'), tone: 'warn' }}
              note={t(a.restricted ? 'wp34.fr.noteRestricted' : 'wp34.fr.noteOpen')}
              onSave={async (codes, key) => {
                await client!.put(`/platform/franchises/${encodeURIComponent(a.franchise.id)}/access`, {
                  body: { permissions: codes },
                  idempotencyKey: key,
                });
              }}
              onSaved={() =>
                void qc.invalidateQueries({ queryKey: ['platform', userId, 'franchise-access'] })
              }
            />
          ) : null}
        </Gate>
      )}
    </ScrollView>
  );
}

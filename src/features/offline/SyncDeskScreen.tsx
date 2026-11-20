import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { ApiClient } from '@/api/client';
import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/ui/Button';
import { StateView } from '../stock/StateView';
import {
  Card,
  Chips,
  Field,
  Gate,
  Line,
  Notice,
  isNetwork,
  kit,
  useAction,
  useActionKey,
  useCan,
} from '../hr/kit';

// Web parity phase 21: the offline sync desk. The server has it (apps/api/src/sync.controller.ts, "for the people who look after
// devices", integration.sync.manage) but no web page uses it yet. Without it a bill saved offline that the server could not book
// (phase 14: a CONFLICT for a person) could never be settled. Retry books it again now, as the person who resolves it; Discard
// drops it with a reason. Nothing is decided on the phone that sent the bill.

export const SYNC_MANAGE = 'integration.sync.manage';
const enc = encodeURIComponent;
const retry = (n: number, e: unknown) => isNetwork(e) && n < 1;
const when = (iso: string | null | undefined) => (iso ? iso.slice(0, 16).replace('T', ' ') : '-');

export interface DeviceHealth {
  deviceId: string;
  platform: string | null;
  appVersion: string | null;
  lastSeenAt: string | null;
  lastPushAt: string | null;
  lastPullAt: string | null;
  pendingReported: number;
  oldestPendingHours: number | null;
  openConflicts: number;
  state: 'OK' | 'BEHIND' | 'SILENT' | 'CONFLICTS' | 'OUTDATED';
}
export interface Health {
  devices: DeviceHealth[];
  totals: {
    devices: number;
    attention: number;
    openConflicts: number;
    rejected7d: number;
    applied24h: number;
  };
}
export interface Conflict {
  id: string;
  deviceId: string;
  clientOpId: string;
  kind: string;
  code: string;
  policy: string;
  message: string | null;
  status: 'OPEN' | 'RESOLVED';
  resolution: string | null;
  note: string | null;
  createdAt: string | null;
  resolvedAt: string | null;
  payload?: unknown;
}
export interface FailedOp {
  id: string;
  deviceId: string;
  clientOpId: string;
  seq: number;
  kind: string;
  code: string | null;
  message: string | null;
  receivedAt: string | null;
}
export interface SyncSettings {
  minAppVersion: string;
  offlineGraceHours: number;
  maxBatch: number;
  version: number;
  isDefault: boolean;
}

export const fetchHealth = (c: ApiClient, signal?: AbortSignal) => c.get<Health>('/sync/health', { signal });
export const fetchConflicts = async (c: ApiClient, status: 'OPEN' | 'RESOLVED', signal?: AbortSignal) =>
  (await c.get<{ items: Conflict[] }>('/sync/conflicts', { query: { status, limit: 100 }, signal })).items;
export const fetchConflict = (c: ApiClient, id: string, signal?: AbortSignal) =>
  c.get<Conflict>(`/sync/conflicts/${enc(id)}`, { signal });
export const fetchFailedOps = async (c: ApiClient, signal?: AbortSignal) =>
  (await c.get<{ items: FailedOp[] }>('/sync/failed-ops', { query: { limit: 100 }, signal })).items;
export const fetchSyncSettings = (c: ApiClient, signal?: AbortSignal) =>
  c.get<SyncSettings>('/sync/settings', { signal });
export const resolveConflict = (
  c: ApiClient,
  id: string,
  action: 'retry' | 'discard',
  note: string,
  key: string,
) =>
  c.post<{ conflict: Conflict; applied: boolean }>(`/sync/conflicts/${enc(id)}/${action}`, {
    body: note.trim() ? { note: note.trim() } : {},
    idempotencyKey: key,
  });
export const saveSyncSettings = (
  c: ApiClient,
  version: number,
  body: { minAppVersion: string; offlineGraceHours: number; maxBatch: number },
  key: string,
) => c.put<SyncSettings>('/sync/settings', { body, version, idempotencyKey: key });

/** The server's checks: a version like 1.4.0, 1 to 720 hours, 1 to 500 operations; a discard needs a reason of 5 characters or more. */
export function settingsErrors(f: { minAppVersion: string; offlineGraceHours: string; maxBatch: string }) {
  const e: ('version' | 'grace' | 'batch')[] = [];
  if (!/^\d{1,4}\.\d{1,5}\.\d{1,6}$/.test(f.minAppVersion.trim())) e.push('version');
  const g = Number(f.offlineGraceHours);
  if (!/^\d+$/.test(f.offlineGraceHours.trim()) || g < 1 || g > 720) e.push('grace');
  const b = Number(f.maxBatch);
  if (!/^\d+$/.test(f.maxBatch.trim()) || b < 1 || b > 500) e.push('batch');
  return e;
}
export const discardOk = (note: string) => note.trim().length >= 5;
/** What a person needs to decide about a bill: branch, customer, number of items and what was paid, from the operation itself. */
export function payloadSummary(p: unknown): {
  branchId?: string;
  customerId?: string;
  lines: number;
  paid: string[];
} {
  const o = (p && typeof p === 'object' ? p : {}) as {
    branchId?: unknown;
    customerId?: unknown;
    lines?: unknown;
    tenders?: { mode?: unknown; amount?: unknown }[];
  };
  return {
    ...(typeof o.branchId === 'string' ? { branchId: o.branchId } : {}),
    ...(typeof o.customerId === 'string' ? { customerId: o.customerId } : {}),
    lines: Array.isArray(o.lines) ? o.lines.length : 0,
    paid: Array.isArray(o.tenders) ? o.tenders.map((x) => `${String(x.mode)} ${String(x.amount)}`) : [],
  };
}

type Tab = 'devices' | 'conflicts' | 'failed' | 'settings';

function ConflictCard({ c, onDone }: { c: Conflict; onDone: () => void }) {
  const { t } = useTranslation();
  const { client, me } = useAuth();
  const keys = useActionKey();
  const act = useAction(keys);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'retry' | 'discard' | null>(null);
  const [note, setNote] = useState('');
  const [outcome, setOutcome] = useState<'retry' | 'discard' | 'still' | null>(null);
  const detail = useQuery({
    queryKey: ['sync-desk', me?.userId ?? '', 'conflict', c.id],
    queryFn: ({ signal }) => fetchConflict(client!, c.id, signal),
    enabled: open && client !== null,
    retry,
  });
  const sum = detail.data ? payloadSummary(detail.data.payload) : null;
  return (
    <Card>
      <Text style={kit.name}>
        {t(`wp21.kind.${c.kind}`, { defaultValue: c.kind })} · {c.code}
      </Text>
      <Text style={kit.sub}>
        {when(c.createdAt)} · {t('wp21.device', { id: c.deviceId })}
      </Text>
      {c.message ? <Text style={kit.sub}>{c.message}</Text> : null}
      {c.status === 'RESOLVED' ? (
        <Text style={kit.sub}>
          {t(`wp21.resolution.${c.resolution ?? 'DONE'}`, { defaultValue: c.resolution ?? '' })} ·{' '}
          {when(c.resolvedAt)}
          {c.note ? ` · ${c.note}` : ''}
        </Text>
      ) : null}
      {!open ? <Button kind="ghost" label={t('wp21.seeBill')} onPress={() => setOpen(true)} /> : null}
      {open && detail.isPending ? <Text style={kit.sub}>{t('common.loading')}</Text> : null}
      {sum ? (
        <>
          <Line label={t('wp21.items')} value={String(sum.lines)} />
          {sum.paid.length ? <Line label={t('wp21.paid')} value={sum.paid.join(', ')} /> : null}
          {sum.customerId ? <Line label={t('wp21.customer')} value={sum.customerId.slice(0, 8)} /> : null}
        </>
      ) : null}
      {outcome ? (
        <Notice
          tone={outcome === 'still' ? 'warn' : 'ok'}
          text={t(outcome === 'still' ? 'wp21.stillRefused' : `wp21.done.${outcome}`)}
        />
      ) : null}
      {act.failure ? <Notice tone="error" text={act.failure} /> : null}
      {c.status === 'OPEN' && mode === null ? (
        <View style={kit.row}>
          <Button
            kind="ghost"
            label={t('wp21.retry')}
            onPress={() => (keys.reset(), setNote(''), setMode('retry'))}
          />
          <Button
            kind="ghost"
            label={t('wp21.discard')}
            onPress={() => (keys.reset(), setNote(''), setMode('discard'))}
          />
        </View>
      ) : null}
      {mode ? (
        <>
          <Text style={kit.sub}>{t(`wp21.ask.${mode}`)}</Text>
          <Field
            label={t(mode === 'discard' ? 'wp21.reason' : 'wp21.note')}
            value={note}
            onChange={setNote}
            error={mode === 'discard' && note !== '' && !discardOk(note) ? t('wp21.v.reason') : null}
          />
          <View style={kit.row}>
            <Button
              label={t(`wp21.go.${mode}`)}
              disabled={act.busy || (mode === 'discard' && !discardOk(note))}
              onPress={() =>
                void act.run(
                  async () => {
                    setOutcome(null);
                    const r = await resolveConflict(
                      client!,
                      c.id,
                      mode,
                      note,
                      keys.keyFor(`${c.id}|${mode}|${note.trim()}`),
                    );
                    // a retry the server still cannot book stays open: say so instead of "booked"
                    setOutcome(mode === 'retry' ? (r.applied ? 'retry' : 'still') : 'discard');
                  },
                  '',
                  () => (setMode(null), onDone()),
                )
              }
            />
            <Button kind="ghost" label={t('wp21.cancel')} onPress={() => setMode(null)} />
          </View>
        </>
      ) : null}
    </Card>
  );
}

function SettingsTab() {
  const { t } = useTranslation();
  const { client, me } = useAuth();
  const qc = useQueryClient();
  const keys = useActionKey();
  const act = useAction(keys);
  const [f, setF] = useState<{ minAppVersion: string; offlineGraceHours: string; maxBatch: string } | null>(
    null,
  );
  const q = useQuery({
    queryKey: ['sync-desk', me?.userId ?? '', 'settings'],
    queryFn: ({ signal }) => fetchSyncSettings(client!, signal),
    enabled: client !== null,
    retry,
  });
  const s = q.data;
  const form =
    f ??
    (s
      ? {
          minAppVersion: s.minAppVersion,
          offlineGraceHours: String(s.offlineGraceHours),
          maxBatch: String(s.maxBatch),
        }
      : null);
  const errs = form ? settingsErrors(form) : [];
  return (
    <Gate query={q} denied={false} deniedText={t('wp21.denied')} offlineText={t('wp21.offline')}>
      {s && form ? (
        <Card>
          <Text style={kit.sub}>{t(s.isDefault ? 'wp21.set.default' : 'wp21.set.hint')}</Text>
          <Field
            label={t('wp21.set.minVersion')}
            value={form.minAppVersion}
            onChange={(minAppVersion) => setF({ ...form, minAppVersion })}
            error={errs.includes('version') ? t('wp21.v.version') : null}
          />
          <Field
            label={t('wp21.set.grace')}
            value={form.offlineGraceHours}
            onChange={(offlineGraceHours) => setF({ ...form, offlineGraceHours })}
            error={errs.includes('grace') ? t('wp21.v.grace') : null}
          />
          <Field
            label={t('wp21.set.batch')}
            value={form.maxBatch}
            onChange={(maxBatch) => setF({ ...form, maxBatch })}
            error={errs.includes('batch') ? t('wp21.v.batch') : null}
          />
          {act.msg ? <Notice tone="ok" text={act.msg} /> : null}
          {act.failure ? <Notice tone="error" text={act.failure} /> : null}
          <Button
            label={t('wp21.set.save')}
            disabled={act.busy || errs.length > 0 || f === null}
            onPress={() => {
              const body = {
                minAppVersion: form.minAppVersion.trim(),
                offlineGraceHours: Number(form.offlineGraceHours),
                maxBatch: Number(form.maxBatch),
              };
              void act.run(
                () =>
                  saveSyncSettings(
                    client!,
                    s.version,
                    body,
                    keys.keyFor(`${s.version}|${JSON.stringify(body)}`),
                  ),
                t('wp21.set.saved'),
                () => (setF(null), void qc.invalidateQueries({ queryKey: ['sync-desk'] })),
              );
            }}
          />
        </Card>
      ) : null}
    </Gate>
  );
}

export function SyncDeskScreen() {
  const { t } = useTranslation();
  const { client, me } = useAuth();
  const can = useCan();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('conflicts');
  const [status, setStatus] = useState<'OPEN' | 'RESOLVED'>('OPEN');
  const ok = client !== null && can(SYNC_MANAGE);
  const k = (...p: string[]) => ['sync-desk', me?.userId ?? '', ...p];
  const health = useQuery({
    queryKey: k('health'),
    queryFn: ({ signal }) => fetchHealth(client!, signal),
    enabled: ok,
    retry,
  });
  const conflicts = useQuery({
    queryKey: k('conflicts', status),
    queryFn: ({ signal }) => fetchConflicts(client!, status, signal),
    enabled: ok && tab === 'conflicts',
    retry,
  });
  const failed = useQuery({
    queryKey: k('failed'),
    queryFn: ({ signal }) => fetchFailedOps(client!, signal),
    enabled: ok && tab === 'failed',
    retry,
  });
  if (!can(SYNC_MANAGE)) return <StateView state="denied" message={t('wp21.denied')} />;
  const reload = () => void qc.invalidateQueries({ queryKey: ['sync-desk'] });
  const tot = health.data?.totals;
  return (
    <ScrollView contentContainerStyle={kit.page} keyboardShouldPersistTaps="handled">
      <Text style={kit.title} accessibilityRole="header">
        {t('wp21.title')}
      </Text>
      <Text style={kit.sub}>{t('wp21.hint')}</Text>
      {tot ? (
        <Card>
          <Line label={t('wp21.t.devices')} value={String(tot.devices)} />
          <Line label={t('wp21.t.attention')} value={String(tot.attention)} strong={tot.attention > 0} />
          <Line
            label={t('wp21.t.conflicts')}
            value={String(tot.openConflicts)}
            strong={tot.openConflicts > 0}
          />
          <Line label={t('wp21.t.rejected')} value={String(tot.rejected7d)} />
          <Line label={t('wp21.t.applied')} value={String(tot.applied24h)} />
        </Card>
      ) : null}
      <Chips
        label={t('wp21.show')}
        options={(['conflicts', 'devices', 'failed', 'settings'] as const).map((id) => ({
          id,
          label: t(`wp21.tab.${id}`),
        }))}
        value={tab}
        onChange={setTab}
      />
      {tab === 'devices' ? (
        <Gate query={health} denied={false} deniedText={t('wp21.denied')} offlineText={t('wp21.offline')}>
          {health.data?.devices.length === 0 ? (
            <StateView state="empty" message={t('wp21.noDevices')} />
          ) : null}
          {(health.data?.devices ?? []).map((d) => (
            <Card key={d.deviceId}>
              <Text style={kit.name}>{d.deviceId}</Text>
              <Text style={kit.sub}>
                {t(`wp21.state.${d.state}`)} · {d.platform ?? '-'} {d.appVersion ?? ''}
              </Text>
              <Line label={t('wp21.d.lastSeen')} value={when(d.lastSeenAt)} />
              <Line label={t('wp21.d.lastPush')} value={when(d.lastPushAt)} />
              <Line label={t('wp21.d.waiting')} value={String(d.pendingReported)} />
              {d.oldestPendingHours !== null ? (
                <Line label={t('wp21.d.oldest')} value={t('wp21.d.hours', { count: d.oldestPendingHours })} />
              ) : null}
              <Line label={t('wp21.t.conflicts')} value={String(d.openConflicts)} />
            </Card>
          ))}
        </Gate>
      ) : null}
      {tab === 'conflicts' ? (
        <>
          <Chips
            label={t('wp21.status')}
            options={[
              { id: 'OPEN' as const, label: t('wp21.open') },
              { id: 'RESOLVED' as const, label: t('wp21.resolved') },
            ]}
            value={status}
            onChange={setStatus}
          />
          <Gate
            query={conflicts}
            denied={false}
            deniedText={t('wp21.denied')}
            offlineText={t('wp21.offline')}
          >
            {conflicts.data?.length === 0 ? (
              <StateView state="empty" message={t('wp21.noConflicts')} />
            ) : null}
            {(conflicts.data ?? []).map((c) => (
              <ConflictCard key={c.id} c={c} onDone={reload} />
            ))}
          </Gate>
        </>
      ) : null}
      {tab === 'failed' ? (
        <Gate query={failed} denied={false} deniedText={t('wp21.denied')} offlineText={t('wp21.offline')}>
          <Text style={kit.sub}>{t('wp21.failedHint')}</Text>
          {failed.data?.length === 0 ? <StateView state="empty" message={t('wp21.noFailed')} /> : null}
          {(failed.data ?? []).map((x) => (
            <Card key={x.id}>
              <Text style={kit.name}>
                {t(`wp21.kind.${x.kind}`, { defaultValue: x.kind })} · {x.code ?? '-'}
              </Text>
              <Text style={kit.sub}>
                {when(x.receivedAt)} · {t('wp21.device', { id: x.deviceId })}
              </Text>
              {x.message ? <Text style={kit.sub}>{x.message}</Text> : null}
            </Card>
          ))}
        </Gate>
      ) : null}
      {tab === 'settings' ? <SettingsTab /> : null}
    </ScrollView>
  );
}

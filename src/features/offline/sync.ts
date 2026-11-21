import type { ApiClient } from '@/api/client';
import { ApiError } from '@/api/errors';
import type { Journal, Op, OpError } from './journal';
import type { Store } from './store';

// Web parity phase 14: the sync loop, copied from apps/web/src/offline/sync.js (UC-274, UC-394, UC-409). It sends what is PENDING, in
// the order it was written, in batches; it believes only what the server answers; and after a crash it asks about operations left in
// SENDING instead of guessing. A transport that throws means "no answer": the operations stay and the next run tries again.

export interface PushResult {
  clientOpId: string;
  status: 'APPLIED' | 'CONFLICT' | 'REJECTED' | 'DISCARDED';
  result?: unknown;
  error?: OpError;
  conflictId?: string;
  replayed?: boolean;
}
export interface Transport {
  push(body: Record<string, unknown>): Promise<{ results: PushResult[] }>;
  status(body: { deviceId: string; clientOpIds: string[] }): Promise<{ items: PushResult[] }>;
  pull(q: {
    entity: string;
    deviceId: string;
    limit: number;
    cursor?: string;
  }): Promise<{ items: unknown[]; cursor: string | null; more: boolean }>;
}
export interface SyncOutcome {
  sent: number;
  applied: number;
  conflicts: number;
  rejected: number;
  offline: boolean;
  failures: number;
}

export function backoffMs(failures: number, base = 5_000, max = 15 * 60_000) {
  if (failures <= 0) return 0;
  return Math.min(max, base * 2 ** Math.min(failures - 1, 10));
}

const isUpgrade = (e: unknown) => e instanceof ApiError && e.code === 'UPGRADE_REQUIRED';

async function settle(journal: Journal, op: Op, r: PushResult) {
  if (r.status === 'APPLIED')
    return journal.update(op.clientOpId, {
      state: 'APPLIED',
      result: r.result ?? null,
      error: null,
      conflictId: null,
    });
  if (r.status === 'CONFLICT')
    return journal.update(op.clientOpId, {
      state: 'CONFLICT',
      error: r.error ?? null,
      conflictId: r.conflictId ?? null,
    });
  return journal.update(op.clientOpId, { state: 'REJECTED', error: r.error ?? null });
}

/** After a crash: asks the server about operations that were being sent. One it never saw is safe to send again. */
export async function reconcileSending(journal: Journal, transport: Transport) {
  const sending = await journal.byState('SENDING');
  if (sending.length === 0) return 0;
  const { items } = await transport.status({
    deviceId: journal.deviceId,
    clientOpIds: sending.map((o) => o.clientOpId),
  });
  const known = new Map(items.map((i) => [i.clientOpId, i]));
  let n = 0;
  for (const o of sending) {
    const s = known.get(o.clientOpId);
    if (!s) await journal.update(o.clientOpId, { state: 'PENDING' });
    else {
      await settle(journal, o, s);
      n++;
    }
  }
  return n;
}

/** One pass. An app the server finds too old is thrown as UPGRADE_REQUIRED and the journal is left as it was. */
export async function runSync({
  journal,
  transport,
  appVersion,
  batch = 50,
  failures = 0,
  platform = 'ANDROID',
}: {
  journal: Journal;
  transport: Transport;
  appVersion: string;
  batch?: number;
  failures?: number;
  platform?: string;
}): Promise<SyncOutcome> {
  const out: SyncOutcome = { sent: 0, applied: 0, conflicts: 0, rejected: 0, offline: false, failures };
  try {
    await reconcileSending(journal, transport);
    for (;;) {
      const pending = (await journal.byState('PENDING')).slice(0, batch);
      if (pending.length === 0) break;
      for (const o of pending)
        await journal.update(o.clientOpId, { state: 'SENDING', attempts: o.attempts + 1 });
      const info = await journal.pendingInfo();
      let res: { results: PushResult[] };
      try {
        res = await transport.push({
          deviceId: journal.deviceId,
          appVersion,
          platform,
          pending: info,
          ops: pending.map(({ clientOpId, seq, kind, payload, createdAt }) => ({
            clientOpId,
            seq,
            kind,
            payload,
            createdAt,
          })),
        });
      } catch (e) {
        if (isUpgrade(e)) for (const o of pending) await journal.update(o.clientOpId, { state: 'PENDING' });
        throw e; // any other failure is "no answer": the operations stay SENDING and are asked about next time
      }
      out.sent += pending.length;
      const by = new Map(res.results.map((r) => [r.clientOpId, r]));
      for (const o of pending) {
        const r = by.get(o.clientOpId);
        if (!r) {
          await journal.update(o.clientOpId, { state: 'PENDING' });
          continue;
        }
        await settle(journal, o, r);
        if (r.status === 'APPLIED') out.applied++;
        else if (r.status === 'CONFLICT') out.conflicts++;
        else out.rejected++;
      }
    }
    out.failures = 0;
  } catch (e) {
    if (isUpgrade(e)) throw e;
    out.offline = true;
    out.failures = failures + 1;
  }
  return out;
}

/** Fetches reference-data changes until the server says there is no more, keeping the cursor only after `apply` succeeded. */
export async function pullAll({
  store,
  transport,
  entity,
  deviceId,
  apply,
  limit = 200,
}: {
  store: Store;
  transport: Transport;
  entity: string;
  deviceId: string;
  apply: (items: unknown[]) => Promise<void>;
  limit?: number;
}) {
  const ckey = `cursor:${entity}`;
  let cursor = (await store.get<{ cursor: string }>(ckey))?.cursor ?? null;
  let total = 0;
  for (;;) {
    const page = await transport.pull({ entity, deviceId, limit, ...(cursor ? { cursor } : {}) });
    if (page.items.length) await apply(page.items);
    total += page.items.length;
    if (page.cursor) {
      cursor = page.cursor;
      await store.put(ckey, { cursor });
    }
    if (!page.more || page.items.length === 0) break;
  }
  return total;
}

/** The server's sync API. `push` carries its own operation ids; an Idempotency-Key is sent too, as on every write of this app. */
export function apiTransport(c: ApiClient, newId: () => string): Transport {
  return {
    push: (body) => c.post<{ results: PushResult[] }>('/sync/push', { body, idempotencyKey: newId() }),
    status: (body) => c.post<{ items: PushResult[] }>('/sync/status', { body, idempotencyKey: newId() }),
    pull: (q) =>
      c.get<{ items: unknown[]; cursor: string | null; more: boolean }>('/sync/pull', {
        query: { entity: q.entity, deviceId: q.deviceId, limit: q.limit, cursor: q.cursor },
      }),
  };
}

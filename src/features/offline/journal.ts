import type { Store } from './store';

// Web parity phase 14: the local-first transaction journal (UC-391) and the durable outbox (UC-394), copied from
// apps/web/src/offline/journal.js. Work is written here FIRST, on the phone, and only then shown as done; nothing is lost if the app
// closes, the battery dies or the network drops. Every entry has its own id, so sending it twice is harmless on the server (it
// answers with what it stored the first time; the id is also the invoice's idempotency key there).
//
// States: PENDING (not sent), SENDING (sent, answer not seen: after a crash it is asked about, never assumed), APPLIED, CONFLICT (a
// person must decide), REJECTED (can never succeed as sent). An entry is never edited after it is written, except for its state and
// the server's answer.

export type OpState = 'PENDING' | 'SENDING' | 'APPLIED' | 'CONFLICT' | 'REJECTED';
export type OpKind = 'SALE_INVOICE' | 'CUSTOMER_CREATE';
export interface OpError {
  code: string;
  message: string;
  superseded?: string;
}
export interface Op {
  clientOpId: string;
  seq: number;
  kind: OpKind;
  payload: Record<string, unknown>;
  createdAt: string;
  state: OpState;
  attempts: number;
  /** The provisional number shown on the receipt until the server gives the real one. */
  localNumber: string;
  result: unknown;
  error: OpError | null;
  conflictId: string | null;
  replaces: string | null;
  /** What the phone showed when the bill was saved (not sent; the server prices the bill itself). */
  note?: { estimate?: string; customerName?: string; lines?: number };
}
export interface Journal {
  deviceId: string;
  append(
    kind: OpKind,
    payload: Record<string, unknown>,
    opts?: { localNumber?: string; replaces?: string; note?: Op['note'] },
  ): Promise<Op>;
  all(): Promise<Op[]>;
  byState(...states: OpState[]): Promise<Op[]>;
  get(clientOpId: string): Promise<Op | undefined>;
  update(clientOpId: string, patch: Partial<Op>): Promise<Op>;
  pendingInfo(): Promise<{ count: number; oldestAt: string | null }>;
  prune(days?: number): Promise<number>;
}

const pad = (n: number, w: number) => String(n).padStart(w, '0');
const key = (seq: number) => `op:${pad(seq, 12)}`;

export function createJournal({
  store,
  deviceId,
  now = () => new Date(),
  newId,
}: {
  store: Store;
  deviceId: string;
  now?: () => Date;
  newId: () => string;
}): Journal {
  async function nextSeq() {
    const cur = (await store.get<{ n: number }>('meta:seq')) ?? { n: 0 };
    const n = cur.n + 1;
    await store.put('meta:seq', { n });
    return n;
  }
  const j: Journal = {
    deviceId,
    async append(kind, payload, opts = {}) {
      const seq = await nextSeq();
      const op: Op = {
        clientOpId: `${deviceId}-${newId()}`,
        seq,
        kind,
        payload,
        createdAt: now().toISOString(),
        state: 'PENDING',
        attempts: 0,
        localNumber:
          opts.localNumber ??
          `OFF-${deviceId
            .replace(/[^A-Za-z0-9]/g, '')
            .slice(0, 4)
            .toUpperCase()}-${pad(seq, 5)}`,
        result: null,
        error: null,
        conflictId: null,
        replaces: opts.replaces ?? null,
        ...(opts.note ? { note: opts.note } : {}),
      };
      await store.put(key(seq), op);
      return op;
    },
    async all() {
      return (await store.list<Op>('op:')).map(([, v]) => v);
    },
    async byState(...states) {
      return (await j.all()).filter((o) => states.includes(o.state));
    },
    async get(clientOpId) {
      return (await j.all()).find((o) => o.clientOpId === clientOpId);
    },
    async update(clientOpId, patch) {
      const o = await j.get(clientOpId);
      if (!o) throw new Error(`unknown operation ${clientOpId}`);
      const next = { ...o, ...patch };
      await store.put(key(o.seq), next);
      return next;
    },
    /** Told to the server on every push, so the people who look after devices can see a phone that is behind (UC-396). */
    async pendingInfo() {
      const open = await j.byState('PENDING', 'SENDING');
      return { count: open.length, oldestAt: open[0]?.createdAt ?? null };
    },
    /** Booked bills older than `days` can go; everything else stays until it is settled. */
    async prune(days = 30) {
      const cut = now().getTime() - days * 86_400_000;
      let n = 0;
      for (const o of await j.all())
        if (o.state === 'APPLIED' && Date.parse(o.createdAt) < cut) {
          await store.delete(key(o.seq));
          n++;
        }
      return n;
    },
  };
  return j;
}

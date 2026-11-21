import { File, Paths } from 'expo-file-system';
import type { ApiClient } from '@/api/client';
import { ApiError } from '@/api/errors';
import { getAppVersion, getDeviceId, newId } from '@/device';
import { dec } from '@/money';
import type { Branch, InvoiceBody, PaymentMode, ProductLite, Warehouse } from '../pos/api';
import { createJournal, type Journal, type Op } from './journal';
import { secureStore, type Store } from './store';
import { apiTransport, backoffMs, pullAll, runSync, type SyncOutcome } from './sync';

// Web parity phase 14: offline billing. The owner chose the web's design (journal + sync, 19 November 2026). On the web it is a
// library only (apps/web/src/offline); here it is wired to the counter: when the network is gone, a bill is written to a journal in
// the phone's secure storage and sent to `POST /sync/push` when the network is back. The server books it through exactly the checks
// of an online sale; a bill it cannot book becomes a conflict a person reviews. Nothing is merged or guessed on the phone.

export interface Grant {
  grant: string;
  signature: string;
  publicKey?: string | null;
  expiresAt: string;
  graceHours?: number;
}
export type Readiness =
  | { ok: true; hoursLeft: number; expiresAt: string }
  | { ok: false; reason: 'NOT_PREPARED' | 'EXPIRED' | 'WRONG_DEVICE' | 'MALFORMED' };

interface Ctx {
  journal: Journal;
  store: Store;
}
const ctx = new Map<string, Promise<Ctx>>();

/** The offline journal of one signed-in user. Another user on the same phone has a separate one. */
export function openOffline(userId: string, makeStore: (space: string) => Store = secureStore): Promise<Ctx> {
  let c = ctx.get(userId);
  if (!c) {
    c = (async () => {
      const store = makeStore(`u.${userId}`);
      const deviceId = await getDeviceId();
      return { store, journal: createJournal({ store, deviceId, newId }) };
    })();
    ctx.set(userId, c);
  }
  return c;
}
/** For tests: forget the opened journals. */
export const resetOffline = () => ctx.clear();

// ---- the grant: how long this person may sell offline on this phone (UC-392) ---------------------------------------------------------
/**
 * The server signs a grant ("this person may work offline on this phone until ..."). The phone checks that it is for this phone and not
 * expired. Limit: the Ed25519 signature is not checked on the phone (no Ed25519 in React Native here); the server checks everything
 * again when the bills arrive, so a forged grant only lets a bill wait in the journal, never book it.
 */
export function checkGrant(g: Grant | undefined, deviceId: string, now = Date.now()): Readiness {
  if (!g) return { ok: false, reason: 'NOT_PREPARED' };
  let claims: { v?: number; deviceId?: string; expiresAt?: string };
  try {
    claims = JSON.parse(g.grant) as typeof claims;
  } catch {
    return { ok: false, reason: 'MALFORMED' };
  }
  if (claims.v !== 1 || !claims.expiresAt) return { ok: false, reason: 'MALFORMED' };
  if (claims.deviceId !== deviceId) return { ok: false, reason: 'WRONG_DEVICE' };
  const left = Date.parse(claims.expiresAt) - now;
  if (!(left > 0)) return { ok: false, reason: 'EXPIRED' };
  return { ok: true, hoursLeft: Math.round((left / 3_600_000) * 10) / 10, expiresAt: claims.expiresAt };
}
export async function readiness(userId: string, now = Date.now()): Promise<Readiness> {
  const { store, journal } = await openOffline(userId);
  return checkGrant(await store.get<Grant>('meta:grant'), journal.deviceId, now);
}

// ---- reference data kept for the counter -------------------------------------------------------------------------------------------
// Branches, warehouses and payment modes are kept with the journal (small). The product list can be large, so it goes to a file in
// the app's own folder; it holds catalogue data only (names, codes, prices), nothing about a customer.
type RefKind = 'branches' | 'warehouses' | 'modes';
export async function saveRef(userId: string, kind: RefKind, items: Branch[] | Warehouse[] | PaymentMode[]) {
  const { store } = await openOffline(userId);
  await store.put(`ref:${kind}`, items);
}
export async function readRef<T>(userId: string, kind: RefKind): Promise<T[] | undefined> {
  const { store } = await openOffline(userId);
  return store.get<T[]>(`ref:${kind}`);
}
const isNetwork = (e: unknown) => e instanceof ApiError && e.code === 'NETWORK';
/** Online first; the answer is kept. Without a network the kept copy is used, if there is one. */
export async function orCached<T extends Branch | Warehouse | PaymentMode>(
  userId: string,
  kind: RefKind,
  fetch: () => Promise<T[]>,
): Promise<T[]> {
  try {
    const v = await fetch();
    void saveRef(userId, kind, v as Branch[]).catch(() => undefined);
    return v;
  } catch (e) {
    if (isNetwork(e)) {
      const kept = await readRef<T>(userId, kind).catch(() => undefined);
      if (kept) return kept;
    }
    throw e;
  }
}
/** The counter's product search: online, else the product list kept for offline selling. */
export async function searchOrCached(
  userId: string,
  q: string,
  fetch: () => Promise<ProductLite[]>,
): Promise<ProductLite[]> {
  try {
    return await fetch();
  } catch (e) {
    if (isNetwork(e)) return searchCachedProducts(userId, q);
    throw e;
  }
}

const productFile = (userId: string) =>
  new File(Paths.document, `offline-products-${userId.replace(/[^A-Za-z0-9-]/g, '_')}.json`);
interface ProductCache {
  at: string;
  cursor: string | null;
  items: Record<string, ProductLite>;
}
async function readProducts(userId: string): Promise<ProductCache> {
  try {
    const f = productFile(userId);
    if (!f.exists) return { at: '', cursor: null, items: {} };
    const v = JSON.parse(await f.text()) as ProductCache;
    return v && typeof v.items === 'object' ? v : { at: '', cursor: null, items: {} };
  } catch {
    return { at: '', cursor: null, items: {} };
  }
}
function writeProducts(userId: string, c: ProductCache) {
  const f = productFile(userId);
  if (!f.exists) f.create();
  f.write(JSON.stringify(c));
}
const sellable = (p: ProductLite) => p.status === 'ACTIVE' && p.sellable && !p.saleBlocked && !p.banned;
/** The counter's product search without a network: code, name or barcode, like the online search (sellable products only). */
export async function searchCachedProducts(userId: string, q: string, limit = 20): Promise<ProductLite[]> {
  const s = q.trim().toLowerCase();
  if (!s) return [];
  const all = Object.values((await readProducts(userId)).items).filter(sellable);
  return all
    .filter(
      (p) =>
        p.code.toLowerCase().includes(s) || p.name.toLowerCase().includes(s) || p.primaryBarcode === q.trim(),
    )
    .slice(0, limit);
}
export async function cachedProductCount(userId: string) {
  const c = await readProducts(userId);
  return { count: Object.keys(c.items).length, at: c.at || null };
}

/** Gets everything the counter needs to sell offline: the grant and the product list (only the changes after the first time). */
export async function prepareOffline(
  client: ApiClient,
  userId: string,
): Promise<{ grant: Readiness; products: number }> {
  const { store, journal } = await openOffline(userId);
  const g = await client.post<Grant>('/sync/offline-grant', {
    body: { deviceId: journal.deviceId },
    idempotencyKey: newId(),
  });
  await store.put('meta:grant', g);
  const cache = await readProducts(userId);
  // the cursor lives with the products, so a lost product file starts again from the beginning instead of skipping products
  const cursorStore: Store = {
    get: async <T>() => (cache.cursor ? ({ cursor: cache.cursor } as T) : undefined),
    put: async (_k, v) => {
      cache.cursor = (v as { cursor: string }).cursor;
    },
    delete: async () => undefined,
    list: async () => [],
  };
  await pullAll({
    store: cursorStore,
    transport: apiTransport(client, newId),
    entity: 'products',
    deviceId: journal.deviceId,
    apply: async (items) => {
      for (const p of items as ProductLite[]) cache.items[p.id] = p;
    },
  });
  cache.at = new Date().toISOString();
  writeProducts(userId, cache);
  return { grant: checkGrant(g, journal.deviceId), products: Object.keys(cache.items).length };
}

// ---- saving a bill and sending it ----------------------------------------------------------------------------------------------------
/**
 * What the phone can say about a bill it cannot price: quantity x price (typed, else the product's selling price), less the line and
 * bill discounts. Tax and round-off are the server's; null when a line has no price at all.
 */
export function estimateTotal(
  lines: { qty: string; unitPrice: string; listPrice?: string | null; discountPct: string }[],
  billDiscountPct: string,
): string | null {
  let sum = dec(0);
  for (const l of lines) {
    const price = l.unitPrice.trim() || l.listPrice || '';
    if (!price) return null;
    const pct = l.discountPct.trim() ? dec(l.discountPct.trim()) : dec(0);
    sum = sum.plus(
      dec(l.qty || '0')
        .times(price)
        .times(dec(100).minus(pct))
        .div(100),
    );
  }
  const bill = billDiscountPct.trim() ? dec(billDiscountPct.trim()) : dec(0);
  return sum.times(dec(100).minus(bill)).div(100).toFixed(2);
}

/** Writes the bill to the journal (first, before anything is shown as done). The bill body is the online one; the server adds the key. */
export async function saveOfflineSale(userId: string, body: InvoiceBody, note: Op['note']): Promise<Op> {
  const { journal } = await openOffline(userId);
  return journal.append('SALE_INVOICE', body as unknown as Record<string, unknown>, { note });
}

export async function offlineOps(userId: string): Promise<Op[]> {
  const { journal } = await openOffline(userId);
  return (await journal.all()).reverse();
}

let failures = 0;
let nextTry = 0;
let running: Promise<SyncOutcome | null> | null = null;
/** For tests. */
export const resetSyncBackoff = () => {
  failures = 0;
  nextTry = 0;
  running = null;
};
/**
 * Sends what is waiting. `force` (the "send now" button) ignores the backoff; the timer respects it (5 s, doubling, at most 15 min).
 * Only one run at a time. Returns null when nothing was due.
 */
export async function syncNow(client: ApiClient, userId: string, force = false): Promise<SyncOutcome | null> {
  if (running) return running;
  if (!force && Date.now() < nextTry) return null;
  running = (async () => {
    const { journal } = await openOffline(userId);
    if ((await journal.byState('PENDING', 'SENDING')).length === 0) return null;
    const out = await runSync({
      journal,
      transport: apiTransport(client, newId),
      appVersion: getAppVersion(),
      failures,
    });
    failures = out.failures;
    nextTry = Date.now() + backoffMs(failures);
    if (!out.offline) await journal.prune(30);
    return out;
  })();
  try {
    return await running;
  } finally {
    running = null;
  }
}

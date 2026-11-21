import * as SecureStore from 'expo-secure-store';

// Web parity phase 14: the storage port of the offline client, copied from apps/web/src/offline/store.js. The journal and the sync loop
// talk only to this small interface, so the same logic runs on the phone's secure storage and on a Map in tests.
// A value is any JSON value; keys are strings; `list` returns the entries whose key starts with a prefix, in key order.

export interface Store {
  get<T = unknown>(k: string): Promise<T | undefined>;
  put(k: string, v: unknown): Promise<void>;
  delete(k: string): Promise<void>;
  list<T = unknown>(prefix: string): Promise<[string, T][]>;
}

export function memoryStore(): Store {
  const m = new Map<string, string>();
  return {
    async get<T>(k: string) {
      const v = m.get(k);
      return v === undefined ? undefined : (JSON.parse(v) as T);
    },
    async put(k, v) {
      m.set(k, JSON.stringify(v));
    },
    async delete(k) {
      m.delete(k);
    },
    async list<T>(prefix: string) {
      return [...m.entries()]
        .filter(([k]) => k.startsWith(prefix))
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => [k, JSON.parse(v) as T] as [string, T]);
    },
  };
}

// ---- the phone's secure storage ------------------------------------------------------------------------------------------------------
// The web seals every value with AES-GCM under a key made from a PIN (crypto.js). On the phone the values go to the system's secure
// storage instead (Android Keystore, iOS Keychain), the same place as the sign-in tokens: a copied phone shows nothing without it.
// Secure storage keeps small values and has no "list", so a value is cut into parts and the store keeps its own index of keys.

const PART = 1800;
const safe = (s: string) => s.replace(/[^A-Za-z0-9._-]/g, '_');

/** Secure storage under one name space (one per signed-in user, so one person's bills are never sent as another's). */
export function secureStore(space: string): Store {
  const ns = `agro360.off.${safe(space)}.`;
  const at = (k: string) => `${ns}${safe(k)}`;
  let chain: Promise<unknown> = Promise.resolve();
  // writes one after the other: a sale saved while a sync is running must not lose an index entry
  const serial = <T>(f: () => Promise<T>): Promise<T> => {
    const p = chain.then(f, f);
    chain = p.catch(() => undefined);
    return p;
  };
  async function readRaw(name: string): Promise<string | undefined> {
    const n = Number(await SecureStore.getItemAsync(`${name}.n`));
    if (!Number.isInteger(n) || n <= 0) return undefined;
    const parts: string[] = [];
    for (let i = 0; i < n; i++) {
      const p = await SecureStore.getItemAsync(`${name}.${i}`);
      if (p === null) return undefined;
      parts.push(p);
    }
    return parts.join('');
  }
  async function writeRaw(name: string, text: string) {
    const old = Number(await SecureStore.getItemAsync(`${name}.n`)) || 0;
    const n = Math.max(1, Math.ceil(text.length / PART));
    for (let i = 0; i < n; i++)
      await SecureStore.setItemAsync(`${name}.${i}`, text.slice(i * PART, (i + 1) * PART));
    await SecureStore.setItemAsync(`${name}.n`, String(n));
    for (let i = n; i < old; i++) await SecureStore.deleteItemAsync(`${name}.${i}`);
  }
  async function removeRaw(name: string) {
    const n = Number(await SecureStore.getItemAsync(`${name}.n`)) || 0;
    await SecureStore.deleteItemAsync(`${name}.n`);
    for (let i = 0; i < n; i++) await SecureStore.deleteItemAsync(`${name}.${i}`);
  }
  async function index(): Promise<string[]> {
    const raw = await readRaw(`${ns}__index`);
    try {
      const v: unknown = raw ? JSON.parse(raw) : [];
      return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
    } catch {
      return [];
    }
  }
  return {
    async get<T>(k: string) {
      const raw = await readRaw(at(k));
      return raw === undefined ? undefined : (JSON.parse(raw) as T);
    },
    put: (k, v) =>
      serial(async () => {
        await writeRaw(at(k), JSON.stringify(v));
        const keys = await index();
        if (!keys.includes(k)) await writeRaw(`${ns}__index`, JSON.stringify([...keys, k]));
      }),
    delete: (k) =>
      serial(async () => {
        await removeRaw(at(k));
        const keys = await index();
        if (keys.includes(k)) await writeRaw(`${ns}__index`, JSON.stringify(keys.filter((x) => x !== k)));
      }),
    async list<T>(prefix: string) {
      const keys = (await index()).filter((k) => k.startsWith(prefix)).sort();
      const out: [string, T][] = [];
      for (const k of keys) {
        const raw = await readRaw(at(k));
        if (raw !== undefined) out.push([k, JSON.parse(raw) as T]);
      }
      return out;
    },
  };
}

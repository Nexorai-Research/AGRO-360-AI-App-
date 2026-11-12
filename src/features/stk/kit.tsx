import { createContext, useContext, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors } from '@/ui/theme';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import type { ApiClient } from '@/api/client';
import { Button } from '@/ui/Button';
import { ReadBox } from '@/ui/ReadBox';
import { Card, Check, Chips, Field, Notice, kit, useActionKey } from '@/ui/kit';
import { StateView } from '../stock/StateView';
import { ApiError } from '@/api/errors';
import { useCan, useFailureText } from '../hr/kit';

export { Card, Check, Chips, Field, Notice, kit, Button, Button as Btn, StateView };
export { Line } from '../hr/kit';

/** A date typed as YYYY-MM-DD that is a real calendar day. */
export const validDay = (v: string): boolean => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim());
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!));
  return d.getUTCFullYear() === +m[1]! && d.getUTCMonth() === +m[2]! - 1 && d.getUTCDate() === +m[3]!;
};
/** A quantity or amount as text: digits with up to `places` decimals. Never a float. */
export const validDec = (v: string, places = 6, allowZero = false): boolean => {
  const s = v.trim();
  if (!new RegExp(`^\\d{1,12}(\\.\\d{1,${places}})?$`).test(s)) return false;
  return allowZero || /[1-9]/.test(s);
};
export const today = (): string => new Date().toISOString().slice(0, 10);
export const blank = (v: string): string | undefined => (v.trim() === '' ? undefined : v.trim());

/** Everything a stk screen needs: client, permission check, user id, translated text. */
export function useStk() {
  const { t } = useTranslation();
  const { me, client } = useAuth();
  const can = useCan();
  return { t, client, can, userId: me?.userId ?? '', ready: client !== null && me !== null };
}

interface WriteOpt {
  version?: string | number;
  after?: () => void;
}

/**
 * Writes with one Idempotency-Key per user action: the same path and body reuse the key after a failure, a changed body is a new action.
 * The server stays the judge of permissions and stock; this only sends and reports. A success refreshes every stk query.
 */
/** Success text lives in the page, so it stays visible after a form closes itself. */
const Flash = createContext<((m: string | null) => void) | null>(null);

export function useWrite() {
  const { client } = useStk();
  const flash = useContext(Flash);
  const ak = useActionKey();
  const failText = useFailureText();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [warn, setWarn] = useState<string | null>(null);
  const send =
    (method: 'post' | 'put' | 'patch' | 'delete') =>
    async (path: string, body: unknown, done: string, o: WriteOpt = {}) => {
      if (busy) return;
      setBusy(true);
      setFailure(null);
      setMsg(null);
      flash?.(null);
      setWarn(null);
      try {
        await client![method](path, {
          body,
          version: o.version,
          idempotencyKey: ak.keyFor(`${method}|${path}|${JSON.stringify(body ?? null)}|${o.version ?? ''}`),
        });
        ak.reset();
        if (flash) flash(done);
        else setMsg(done);
        void qc.invalidateQueries({ queryKey: ['stk'] });
        o.after?.();
      } catch (e) {
        // A warning the person may accept (possible duplicate, stock on hand): ask, then the caller resends with the flag.
        if (e instanceof ApiError && e.status === 409 && WARN_CODES.has(e.code)) setWarn(e.code);
        else setFailure(failText(e));
      } finally {
        setBusy(false);
      }
    };
  return {
    busy,
    msg,
    failure,
    warn,
    clearWarn: () => setWarn(null),
    post: send('post'),
    put: send('put'),
    patch: send('patch'),
    del: send('delete'),
  };
}

const WARN_CODES = new Set(['DUPLICATE_WARNING', 'STOCK_ON_HAND_WARNING']);

export function Msgs({ w }: { w: { msg: string | null; failure: string | null } }) {
  return (
    <>
      {w.msg ? <Notice tone="ok" text={w.msg} /> : null}
      {w.failure ? <Notice tone="error" text={w.failure} /> : null}
    </>
  );
}

/** Page frame: title, optional hint, permission gate (screen hidden only; the server still decides). */
export function Page({
  title,
  hint,
  allowed = true,
  children,
}: {
  title: string;
  hint?: string;
  allowed?: boolean;
  children: ReactNode;
}) {
  const { t } = useStk();
  const [flash, setFlash] = useState<string | null>(null);
  return (
    <ScrollView contentContainerStyle={kit.page} keyboardShouldPersistTaps="handled">
      <Text style={kit.title} accessibilityRole="header">
        {title}
      </Text>
      {hint ? <Text style={kit.sub}>{hint}</Text> : null}
      {flash ? <Notice tone="ok" text={flash} /> : null}
      <Flash.Provider value={setFlash}>
        {allowed ? children : <StateView state="denied" message={t('stk.denied')} />}
      </Flash.Provider>
    </ScrollView>
  );
}

/** One list or record read with the shared states. Key is scoped to the user and refreshed after any stk write. */
export function Read<T>({
  path,
  query,
  enabled = true,
  children,
}: {
  path: string;
  query?: Record<string, string | number | undefined>;
  enabled?: boolean;
  children: (d: T) => ReactNode;
}) {
  const { t, client, userId, ready } = useStk();
  return (
    <ReadBox<T>
      queryKey={['stk', userId, path, JSON.stringify(query ?? {})]}
      client={client}
      enabled={ready && enabled}
      load={(c: ApiClient, signal) => c.get<T>(path, { query, signal })}
      deniedText={t('stk.denied')}
      offlineText={t('stk.offline')}
    >
      {children}
    </ReadBox>
  );
}

export const tone = StyleSheet.create({
  error: { fontSize: 15, color: colors.danger },
  warn: { fontSize: 15, color: colors.warn },
  ok: { fontSize: 16, color: colors.ok, fontWeight: '600' },
});

/** Several lines of text (CSV rows, price lines). */
export function Area({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={{ fontSize: 14, color: colors.muted, fontWeight: '600' }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        accessibilityLabel={label}
        multiline
        autoCorrect={false}
        autoCapitalize="none"
        style={{
          minHeight: 120,
          borderWidth: 1,
          borderColor: colors.line,
          borderRadius: 8,
          padding: 10,
          fontSize: 15,
          backgroundColor: '#fff',
          color: colors.ink,
          textAlignVertical: 'top',
        }}
      />
    </View>
  );
}

export function Empty({ text }: { text: string }) {
  return <StateView state="empty" message={text} />;
}

export interface PickedProduct {
  id: string;
  code: string;
  name: string;
}

/** Product search by name, code or barcode; picks one result. */
export function ProductPick({
  label,
  value,
  onPick,
}: {
  label: string;
  value: PickedProduct | null;
  onPick: (p: PickedProduct) => void;
}) {
  const { t, client, userId, ready } = useStk();
  const [q, setQ] = useState('');
  const search = useQuery({
    queryKey: ['stk', userId, 'productpick', q],
    queryFn: ({ signal }) =>
      client!.get<{ items: PickedProduct[] }>('/products', {
        query: { q, limit: 8, status: 'ACTIVE' },
        signal,
      }),
    enabled: ready && q.trim().length >= 2,
  });
  return (
    <View style={{ gap: 6 }}>
      <Field label={label} value={q} onChange={setQ} placeholder={t('stk.searchProduct')} />
      {value ? <Text style={kit.sub}>{t('stk.picked', { name: `${value.code} ${value.name}` })}</Text> : null}
      {search.data?.items.length === 0 ? <Text style={kit.sub}>{t('stk.noProducts')}</Text> : null}
      {(search.data?.items.length ?? 0) > 0 ? (
        <Chips
          label={t('stk.results')}
          options={(search.data?.items ?? []).map((p) => ({ id: p.id, label: `${p.code} ${p.name}` }))}
          value={value?.id ?? ''}
          onChange={(id) => {
            const p = search.data?.items.find((x) => x.id === id);
            if (p) onPick(p);
          }}
        />
      ) : null}
    </View>
  );
}

export function useBranches() {
  const { client, userId, ready } = useStk();
  return useQuery({
    queryKey: ['stk', userId, 'branches'],
    queryFn: async ({ signal }) =>
      (
        await client!.get<{ items: { id: string; name: string; status?: string }[] }>('/branches', { signal })
      ).items.filter((b) => b.status === undefined || b.status === 'ACTIVE'),
    enabled: ready,
    staleTime: 5 * 60_000,
  });
}

/** Warehouses (and their branch) for a picker. Needs org.config.view; without it the list is empty and the user is told. */
export function useWarehouses() {
  const { client, userId, ready } = useStk();
  return useQuery({
    queryKey: ['stk', userId, 'warehouses'],
    queryFn: async ({ signal }) =>
      (
        await client!.get<{
          items: { id: string; branchId: string; name: string; status?: string; sellable?: boolean }[];
        }>('/warehouses', { signal })
      ).items.filter((w) => w.status === undefined || w.status === 'ACTIVE'),
    enabled: ready,
    staleTime: 5 * 60_000,
  });
}

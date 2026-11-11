import { useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ApiError, errorMessage, type ErrorMessage } from '@/api/errors';
import { useAuth } from '@/auth/AuthProvider';
import { dec } from '@/money';
import { Button } from '@/ui/Button';
import { Card, Chips, Check, Field, Notice, kit, useActionKey } from '@/ui/kit';
import { colors } from '@/ui/theme';
import { StateView } from '../stock/StateView';

// ---- permissions (they only hide things; the server checks every call) ----
export function useCan() {
  const { me } = useAuth();
  return (p: string) => me?.permissions === undefined || me.permissions.includes(p);
}

// ---- decimal-string checks (never floats) ----
const QTY = /^\d+(\.\d{1,3})?$/;
const SQTY = /^-?\d+(\.\d{1,3})?$/;
const MONEY = /^\d+(\.\d{1,4})?$/;
const INT = /^\d{1,6}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
export type FieldKind = 'product' | 'text' | 'qty' | 'sqty' | 'money' | 'int' | 'date' | 'choice' | 'bool';
export type FieldErr = 'required' | 'qty' | 'sqty' | 'money' | 'int' | 'date' | 'zero';
export interface FieldDef {
  name: string;
  label: string;
  kind: FieldKind;
  required?: boolean;
  options?: { id: string; label: string }[];
  /** qty / money: the value must be above zero. */
  positive?: boolean;
}
export type Values = Record<string, string | boolean>;

export function checkValue(f: FieldDef, raw: string | boolean | undefined): FieldErr | null {
  if (f.kind === 'bool') return null;
  const v = String(raw ?? '').trim();
  if (!v) return f.required ? 'required' : null;
  if (f.kind === 'qty' && !QTY.test(v)) return 'qty';
  if (f.kind === 'sqty' && !SQTY.test(v)) return 'sqty';
  if (f.kind === 'money' && !MONEY.test(v)) return 'money';
  if (f.kind === 'int' && !INT.test(v)) return 'int';
  if (f.kind === 'date' && (!DATE.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`)))) return 'date';
  if (f.kind === 'sqty' && dec(v).isZero()) return 'zero';
  if (f.positive && (f.kind === 'qty' || f.kind === 'money') && !dec(v).gt(0)) return 'zero';
  return null;
}
export function checkAll(fields: FieldDef[], v: Values): Record<string, FieldErr> {
  const e: Record<string, FieldErr> = {};
  for (const f of fields) {
    const r = checkValue(f, v[f.name]);
    if (r) e[f.name] = r;
  }
  return e;
}

// ---- reading data ----
const isNetwork = (e: unknown) => e instanceof ApiError && e.code === 'NETWORK';
export const isOffline = isNetwork;

/** One GET. Runs only when enabled (permission and client present). A 4xx is not retried; a network fault is retried once. */
export function useGet<T>(path: string, query: Record<string, string | number | undefined> = {}, enabled = true) {
  const { me, client } = useAuth();
  const userId = me?.userId ?? '';
  const q = useQuery({
    queryKey: ['inv7', userId, path, JSON.stringify(query)],
    queryFn: ({ signal }) => client!.get<T>(path, { query, signal }),
    enabled: enabled && client !== null && me !== null,
    retry: (n, e) => isNetwork(e) && n < 1,
  });
  return q;
}
export const itemsOf = <T,>(d: { items: T[] } | T[] | undefined): T[] => (d === undefined ? [] : Array.isArray(d) ? d : d.items);

export function useRefresh() {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: ['inv7'] });
}

/** loading / offline / error / denied / empty for one query, otherwise the children. */
export function Loaded({
  q,
  empty,
  isEmpty,
  offlineKey,
  children,
}: {
  q: { isPending: boolean; fetchStatus: string; error: unknown; refetch: () => unknown };
  empty: string;
  isEmpty: boolean;
  offlineKey: string;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  if (q.isPending && q.fetchStatus !== 'idle') return <StateView state="loading" />;
  if (q.error) {
    const m = errorMessage(q.error);
    const off = isNetwork(q.error);
    return (
      <StateView
        state={off ? 'offline' : m.key === 'errors.FORBIDDEN' ? 'denied' : 'error'}
        message={off ? t(offlineKey) : t(m.key, { ...m.params, correlationId: m.params.correlationId ?? '-' })}
        onRetry={() => void q.refetch()}
      />
    );
  }
  if (isEmpty) return <StateView state="empty" message={empty} />;
  return <>{children}</>;
}

// ---- writing: one Idempotency-Key per user action, reused on retry ----
export function useFailureText() {
  const { t } = useTranslation();
  return (f: ErrorMessage) => t(f.key, { ...f.params, correlationId: f.params.correlationId ?? '-' });
}

/**
 * A small form. Texts are checked as decimal strings before anything is sent. The same key is used again if the user presses
 * the button again without changing anything (a lost answer); any change makes a new action with a new key.
 * `send(values, key, extra)` does the call. A DUPLICATE_WARNING answer offers "Create anyway" (confirmDuplicate).
 */
export function ActionForm({
  title,
  fields,
  initial,
  submitLabel,
  send,
  onDone,
  onCancel,
  hint,
  extraCheck,
}: {
  title: string;
  fields: FieldDef[];
  initial?: Values;
  submitLabel: string;
  send: (v: Values, key: string, extra: Record<string, boolean>) => Promise<unknown>;
  onDone: () => void;
  onCancel: () => void;
  hint?: string;
  /** A rule across several boxes. Returns a text key to show, or null when fine. Nothing is sent while it fails. */
  extraCheck?: (v: Values) => string | null;
}) {
  const { t } = useTranslation();
  const failText = useFailureText();
  const ak = useActionKey();
  const [v, setV] = useState<Values>(() => {
    const o: Values = {};
    for (const f of fields) o[f.name] = initial?.[f.name] ?? (f.kind === 'bool' ? false : '');
    return o;
  });
  const [errs, setErrs] = useState<Record<string, FieldErr>>({});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ErrorMessage | null>(null);
  const [dup, setDup] = useState(false);
  const [rule, setRule] = useState<string | null>(null);

  async function go(extra: Record<string, boolean> = {}) {
    if (busy) return;
    const e = checkAll(fields, v);
    setErrs(e);
    if (Object.keys(e).length) return;
    const bad = extraCheck?.(v) ?? null;
    setRule(bad);
    if (bad) return;
    setBusy(true);
    setFailure(null);
    try {
      await send(v, ak.keyFor(JSON.stringify([v, extra])), extra);
      ak.reset();
      onDone();
    } catch (x) {
      if (x instanceof ApiError && x.code === 'DUPLICATE_WARNING') setDup(true);
      else setFailure(errorMessage(x));
    } finally {
      setBusy(false);
    }
  }
  const set = (name: string, val: string | boolean) => {
    setDup(false);
    setV((p) => ({ ...p, [name]: val }));
  };

  return (
    <Card>
      <Text style={kit.name}>{title}</Text>
      {hint ? <Text style={kit.sub}>{hint}</Text> : null}
      {fields.map((f) => {
        const err = errs[f.name] ? t(`inv.err.${errs[f.name]}`) : null;
        if (f.kind === 'bool') return <Check key={f.name} label={f.label} value={v[f.name] === true} onChange={(x) => set(f.name, x)} />;
        if (f.kind === 'product')
          return (
            <View key={f.name}>
              <ProductPicker label={f.label} value={String(v[f.name] ?? '')} onChange={(id) => set(f.name, id)} />
              {err ? <Text style={s.err}>{err}</Text> : null}
            </View>
          );
        if (f.kind === 'choice')
          return (
            <View key={f.name}>
              <Chips label={f.label} options={f.options ?? []} value={String(v[f.name] ?? '')} onChange={(id) => set(f.name, id)} />
              {err ? <Text style={s.err}>{err}</Text> : null}
            </View>
          );
        return (
          <Field
            key={f.name}
            label={f.label}
            value={String(v[f.name] ?? '')}
            onChange={(x) => set(f.name, x)}
            keyboard={f.kind === 'text' || f.kind === 'date' ? undefined : 'decimal-pad'}
            placeholder={f.kind === 'date' ? 'YYYY-MM-DD' : undefined}
            error={err}
          />
        );
      })}
      {rule ? <Notice tone="error" text={t(rule)} /> : null}
      {failure ? <Notice tone="error" text={failText(failure)} /> : null}
      {dup ? (
        <View style={s.gap}>
          <Notice tone="warn" text={t('inv.duplicate')} />
          <Button kind="ghost" label={t('inv.createAnyway')} onPress={() => void go({ confirmDuplicate: true })} />
        </View>
      ) : null}
      <View style={kit.row}>
        <Button label={submitLabel} onPress={() => void go()} disabled={busy} />
        <Button kind="ghost" label={t('inv.close')} onPress={onCancel} />
      </View>
    </Card>
  );
}

/** Search by name or code, then tap one result. Shows at most 8 matches, so the screen stays short. */
export function ProductPicker({ label, value, onChange }: { label: string; value: string; onChange: (id: string) => void }) {
  const [text, setText] = useState('');
  const q = text.trim();
  const r = useGet<{ items: { id: string; code: string; name: string }[] }>('/products', { q, status: 'ACTIVE', limit: 8 }, q.length >= 2);
  const items = q.length >= 2 ? itemsOf(r.data) : [];
  return (
    <View style={s.gap}>
      <Field label={label} value={text} onChange={setText} />
      {items.length ? (
        <Chips
          label={label}
          options={items.map((p) => ({ id: p.id, label: `${p.name} (${p.code})` }))}
          value={value}
          onChange={onChange}
        />
      ) : null}
    </View>
  );
}

/** A one-tap action (submit, approve, activate) with its own key, kept until it succeeds. */
export function useOneShot(onDone: () => void) {
  const ak = useActionKey();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ErrorMessage | null>(null);
  return {
    busy,
    failure,
    async run(fp: string, call: (key: string) => Promise<unknown>) {
      if (busy) return;
      setBusy(true);
      setFailure(null);
      try {
        await call(ak.keyFor(fp));
        ak.reset();
        onDone();
      } catch (x) {
        setFailure(errorMessage(x));
      } finally {
        setBusy(false);
      }
    },
  };
}

export function Row({ title, lines, children }: { title: string; lines?: string[]; children?: ReactNode }) {
  return (
    <Card>
      <Text style={kit.name}>{title}</Text>
      {(lines ?? []).filter(Boolean).map((l, i) => (
        <Text key={i} style={kit.sub}>
          {l}
        </Text>
      ))}
      {children}
    </Card>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange, label }: { tabs: { id: T; label: string }[]; value: T; onChange: (t: T) => void; label: string }) {
  return <Chips label={label} options={tabs} value={value} onChange={onChange} />;
}

export function Denied({ text }: { text: string }) {
  return <StateView state="denied" message={text} />;
}

/** Branches and warehouses of this franchise. Need org.config.view; without it the pickers show a note instead. */
export interface WarehouseRef {
  id: string;
  name: string;
  code?: string;
  branchId?: string;
  status?: string;
  sellable?: boolean;
}
export interface BranchRef {
  id: string;
  name: string;
}
export function useBranchWarehouse(enabled: boolean) {
  const b = useGet<{ items: BranchRef[] }>('/branches', {}, enabled);
  const w = useGet<{ items: WarehouseRef[] }>('/warehouses', {}, enabled);
  return { branches: itemsOf(b.data), warehouses: itemsOf(w.data).filter((x) => !x.status || x.status === 'ACTIVE'), loading: b.isPending || w.isPending };
}

export const s = StyleSheet.create({
  err: { color: colors.danger, fontSize: 14 },
  gap: { gap: 8 },
  page: { padding: 16, gap: 10 },
});

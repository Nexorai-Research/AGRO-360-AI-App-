import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/ui/Button';
import { Check } from '@/ui/kit';
import { k } from '../purchase/ui';
import { ProductPicker } from '../ai/ProductPicker';
import type { ProductRef } from '../ai/api';
import { Card, Chips, Field, Line, Notice, isNetwork, kit, useAction, useActionKey, useCan } from '../hr/kit';
import {
  formErrors,
  humanise,
  initialValues,
  sendForm,
  type FormDef,
  type FormField,
  type Values,
} from './cmp-api';

// Web parity phase 8: the add / run forms and step forms of the compliance hubs, drawn from the definitions in cmp-forms.ts.

const vlabel = (t: TFunction, v: string) => t(`cmp.v.${v}`, { defaultValue: humanise(v) });

function useList(path: string, enabled: boolean, query?: Record<string, string | number>) {
  const { me, client } = useAuth();
  return useQuery({
    queryKey: ['cmp', me?.userId ?? '', 'pick', path],
    queryFn: async ({ signal }) =>
      (await client!.get<{ items: Record<string, unknown>[] }>(path, { query, signal })).items ?? [],
    enabled: enabled && client !== null,
    retry: (n, e) => isNetwork(e) && n < 1,
  });
}

interface BatchRow {
  id: string;
  skuId: string;
  skuCode?: string;
  batchNo?: string;
}
/** Type part of the product code or batch number, pick one batch. The value is "skuId|batchId", like the web. */
export function BatchPick({
  label,
  value,
  onPick,
}: {
  label: string;
  value: string;
  onPick: (v: string) => void;
}) {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const list = useList('/inventory/batches', true, { limit: 500 });
  const rows = (list.data ?? []) as unknown as BatchRow[];
  const picked = rows.find((b) => `${b.skuId}|${b.id}` === value);
  const name = (b: BatchRow) => `${b.skuCode ?? ''} / ${b.batchNo ?? ''}`;
  if (value)
    return (
      <View style={k.card}>
        <Text style={k.name}>{picked ? name(picked) : value}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('cmp.pick.change')}
          onPress={() => onPick('')}
        >
          <Text style={k.ok}>{t('cmp.pick.change')}</Text>
        </Pressable>
      </View>
    );
  const s = q.trim().toLowerCase();
  const shown = s.length >= 1 ? rows.filter((b) => name(b).toLowerCase().includes(s)).slice(0, 20) : [];
  return (
    <View style={k.field}>
      <Text style={k.label}>{label}</Text>
      <TextInput
        value={q}
        onChangeText={setQ}
        accessibilityLabel={label}
        autoCorrect={false}
        style={k.input}
      />
      {shown.map((b) => (
        <Pressable
          key={b.id}
          accessibilityRole="button"
          accessibilityLabel={name(b)}
          onPress={() => onPick(`${b.skuId}|${b.id}`)}
          style={k.card}
        >
          <Text style={k.name}>{name(b)}</Text>
        </Pressable>
      ))}
      {s.length >= 1 && list.data && shown.length === 0 ? (
        <Text style={k.sub}>{t('cmp.pick.none')}</Text>
      ) : null}
    </View>
  );
}

function RefChips({
  field,
  label,
  value,
  onChange,
}: {
  field: FormField;
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const path =
    field.kind === 'manufacturer' ? '/manufacturers' : field.kind === 'brand' ? '/brands' : '/warehouses';
  const list = useList(path, true);
  const opts = (list.data ?? []).map((x) => ({ id: String(x.id), label: String(x.name ?? x.code ?? x.id) }));
  return (
    <Chips label={label} options={opts} value={value} onChange={(v) => onChange(v === value ? '' : v)} />
  );
}

/** The inputs of one form. */
export function FormFields({
  fields,
  v,
  set,
  bad,
}: {
  fields: FormField[];
  v: Values;
  set: (k: string, x: string | boolean) => void;
  bad: string[];
}) {
  const { t } = useTranslation();
  const can = useCan();
  const [product, setProduct] = useState<ProductRef | null>(null);
  return (
    <>
      {fields
        .filter((f) => !f.perm || can(f.perm))
        .map((f) => {
          const label = t(`cmp.ff.${f.k}`) + (f.required ? ' *' : '');
          const err = bad.includes(f.k) ? t(`cmp.fe.${f.kind ?? 'text'}`) : null;
          const s = typeof v[f.k] === 'string' ? (v[f.k] as string) : '';
          switch (f.kind) {
            case 'select':
              return (
                <Chips
                  key={f.k}
                  label={label}
                  options={(f.options ?? [])
                    .filter((o) => !f.optionPerm?.[o] || can(f.optionPerm[o]!))
                    .map((o) => ({ id: o, label: vlabel(t, o) }))}
                  value={s}
                  onChange={(x) => set(f.k, x)}
                />
              );
            case 'check':
              return <Check key={f.k} label={label} value={v[f.k] === true} onChange={(x) => set(f.k, x)} />;
            case 'product':
              return (
                <View key={f.k}>
                  <Text style={kit.sub}>{label}</Text>
                  <ProductPicker value={product} onPick={(p) => (setProduct(p), set(f.k, p?.id ?? ''))} />
                  {err ? <Text style={kit.sub}>{err}</Text> : null}
                </View>
              );
            case 'batch':
              return (
                <View key={f.k}>
                  <BatchPick label={label} value={s} onPick={(x) => set(f.k, x)} />
                  {err ? <Text style={kit.sub}>{err}</Text> : null}
                </View>
              );
            case 'manufacturer':
            case 'brand':
            case 'warehouse':
              return (
                <View key={f.k}>
                  <RefChips field={f} label={label} value={s} onChange={(x) => set(f.k, x)} />
                  {err ? <Text style={kit.sub}>{err}</Text> : null}
                </View>
              );
            default:
              return (
                <Field
                  key={f.k}
                  label={label}
                  value={s}
                  onChange={(x) => set(f.k, x)}
                  keyboard={f.kind === 'num' ? 'decimal-pad' : undefined}
                  placeholder={f.kind === 'date' ? 'YYYY-MM-DD' : f.kind === 'month' ? 'YYYY-MM' : undefined}
                  error={err}
                />
              );
          }
        })}
    </>
  );
}

/** Writes a base64 file from the server (the audit pack ZIP) to the cache and hands it to the share sheet. */
async function shareBase64(name: string, b64: string, mime: string): Promise<boolean> {
  const safe = name.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 100) || 'file.zip';
  const file = new File(Paths.cache, safe);
  file.create({ overwrite: true });
  file.write(Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0)));
  if (!(await Sharing.isAvailableAsync())) return false;
  await Sharing.shareAsync(file.uri, { mimeType: mime });
  return true;
}

function CreateForm({ d, today }: { d: FormDef; today: string }) {
  const { t } = useTranslation();
  const { me, client } = useAuth();
  const can = useCan();
  const qc = useQueryClient();
  const keys = useActionKey();
  const act = useAction(keys);
  const [v, setV] = useState<Values | null>(null);
  const [tried, setTried] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const done = () => void qc.invalidateQueries({ queryKey: ['cmp', me?.userId ?? ''] });
  const submit = (vals: Values) => {
    setTried(true);
    setProblem(null);
    if (formErrors(d.fields, vals, can).length > 0) return;
    const p = d.check?.(vals) ?? null;
    if (p) return setProblem(p);
    void act.run(
      async () => {
        const r = await sendForm(client!, d, vals, keys.keyFor(`${d.id}|${JSON.stringify(d.body(vals))}`));
        if (d.file && typeof r?.contentBase64 === 'string') {
          const ok = await shareBase64(
            String(r.fileName ?? `${String(r.packNo ?? 'audit-pack')}.zip`),
            r.contentBase64,
            'application/zip',
          );
          if (!ok) setProblem('noSharing');
        }
      },
      t(`cmp.form.${d.id}_done`),
      () => (done(), d.fields.length > 0 ? (setV(null), setTried(false)) : undefined),
    );
  };
  // a form without fields is one button (check expiries now)
  if (d.fields.length === 0)
    return (
      <>
        {act.msg ? <Notice tone="ok" text={act.msg} /> : null}
        {act.failure ? <Notice tone="error" text={act.failure} /> : null}
        <Button kind="ghost" label={t(`cmp.form.${d.id}`)} disabled={act.busy} onPress={() => submit({})} />
      </>
    );
  if (!v)
    return (
      <>
        {act.msg ? <Notice tone="ok" text={act.msg} /> : null}
        <Button
          kind="ghost"
          label={t(`cmp.form.${d.id}`)}
          onPress={() => (act.clear(), keys.reset(), setV(initialValues(d.fields, today)), setTried(false))}
        />
      </>
    );
  const bad = tried ? formErrors(d.fields, v, can) : [];
  return (
    <Card>
      <Text style={kit.name}>{t(`cmp.form.${d.id}`)}</Text>
      {t(`cmp.form.${d.id}_hint`, { defaultValue: '' }) ? (
        <Text style={kit.sub}>{t(`cmp.form.${d.id}_hint`)}</Text>
      ) : null}
      <FormFields fields={d.fields} v={v} set={(key, x) => setV({ ...v, [key]: x })} bad={bad} />
      {problem ? <Notice tone="error" text={t(`cmp.fv.${problem}`)} /> : null}
      {act.failure ? <Notice tone="error" text={act.failure} /> : null}
      <Button label={t('cmp.form.save')} disabled={act.busy} onPress={() => submit(v)} />
      <Button kind="ghost" label={t('cmp.cancel')} onPress={() => (setV(null), setTried(false))} />
    </Card>
  );
}

/** The add / run forms of a tab that the signed-in person may use. */
export function CreateForms({ defs, today }: { defs: FormDef[]; today: string }) {
  const can = useCan();
  return (
    <>
      {defs
        .filter((d) => can(d.perm))
        .map((d) => (
          <CreateForm key={d.id} d={d} today={today} />
        ))}
    </>
  );
}

// ---- batch trace (UC-324) ----------------------------------------------------------------------------------------------------------
interface Trace {
  batch: { sku: string; batchNo: string; status: string; expiryDate: string | null };
  receipts: { grnNumber: string | null; supplierName: string; receiptDate: string; acceptedQty: string }[];
  sales: { invoiceNumber: string; date: string; status: string; customerName: string; qty: string }[];
  returns: { returnNumber: string; date: string; qty: string }[];
  totals: { received: string; sold: string; returned: string; onHand: string };
  reconciles: boolean;
  differences: string[];
}
export function TraceView() {
  const { t } = useTranslation();
  const { me, client } = useAuth();
  const [batch, setBatch] = useState('');
  const batchId = batch.split('|')[1] ?? '';
  const q = useQuery({
    queryKey: ['cmp', me?.userId ?? '', 'trace', batchId],
    queryFn: ({ signal }) =>
      client!.get<{ items: Trace[] }>('/compliance/trace', { query: { batch: batchId }, signal }),
    enabled: client !== null && batchId !== '',
    retry: (n, e) => isNetwork(e) && n < 1,
  });
  return (
    <>
      <Text style={kit.sub}>{t('cmp.trace.hint')}</Text>
      <BatchPick label={t('cmp.ff.batch')} value={batch} onPick={setBatch} />
      {q.error ? <Notice tone="error" text={t('cmp.trace.failed')} /> : null}
      {(q.data?.items ?? []).map((tr, i) => (
        <Card key={i}>
          <Text style={kit.name}>
            {tr.batch.sku} / {tr.batch.batchNo} · {vlabel(t, tr.batch.status)}
          </Text>
          <Notice
            tone={tr.reconciles ? 'ok' : 'warn'}
            text={
              tr.reconciles
                ? t('cmp.trace.agrees')
                : t('cmp.trace.differs', { what: tr.differences.join('; ') })
            }
          />
          <Line label={t('cmp.trace.received')} value={tr.totals.received} />
          <Line label={t('cmp.trace.sold')} value={tr.totals.sold} />
          <Line label={t('cmp.trace.returned')} value={tr.totals.returned} />
          <Line label={t('cmp.trace.onHand')} value={tr.totals.onHand} strong />
          {tr.receipts.map((r, j) => (
            <Text key={`r${j}`} style={kit.sub}>
              {t('cmp.trace.receipt', {
                date: r.receiptDate,
                no: r.grnNumber ?? '-',
                who: r.supplierName,
                qty: r.acceptedQty,
              })}
            </Text>
          ))}
          {tr.sales.map((s, j) => (
            <Text key={`s${j}`} style={kit.sub}>
              {t('cmp.trace.sale', { date: s.date, no: s.invoiceNumber, who: s.customerName, qty: s.qty })}
            </Text>
          ))}
          {tr.returns.map((r, j) => (
            <Text key={`b${j}`} style={kit.sub}>
              {t('cmp.trace.return', { date: r.date, no: r.returnNumber, qty: r.qty })}
            </Text>
          ))}
        </Card>
      ))}
    </>
  );
}

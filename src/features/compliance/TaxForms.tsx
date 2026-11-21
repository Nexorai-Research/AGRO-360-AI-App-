import { useState } from 'react';
import { Text } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/ui/Button';
import { realDay } from '../customers/extras-api';
import { fetchCategories } from '../products/api';
import { fetchSuppliers } from '../purchase/api';
import { ProductPicker } from '../ai/ProductPicker';
import type { ProductRef } from '../ai/api';
import { Card, Chips, Field, Notice, isNetwork, kit, useAction, useActionKey, useCan } from '../hr/kit';
import type { ComplianceSettings } from './SettingsCard';

// Web parity phase 6 (apps/web/src/pages/compliance.js itcTab, blocksTab, rcmTab, tdsTab). Field rules copied from
// modules/compliance/src/application/itc.ts, rcm.ts and tds.ts. The server decides; these checks only save a round trip.

const between = (s: string, min: number, max: number) => s.trim().length >= min && s.trim().length <= max;

// ---- 6.2 GSTR-2B import ------------------------------------------------------------------------------------------------------
export const GSTR2B_MAX = 5_000_000;
export type Gstr2bError = 'file' | 'size';
export function gstr2bErrors(file: { name: string; text: string } | null): Gstr2bError[] {
  if (!file || file.name.trim() === '') return ['file'];
  return file.text.length < 2 || file.text.length > GSTR2B_MAX || file.name.length > 200 ? ['size'] : [];
}
export const gstr2bBody = (period: string, file: { name: string; text: string }) => ({
  period,
  fileName: file.name,
  content: file.text,
});
/** The portal JSON or a CSV export; the text is read from the picked copy. Null when cancelled. */
export async function pickReturnFile(): Promise<{ name: string; text: string } | null> {
  const r = await DocumentPicker.getDocumentAsync({
    type: [
      'application/json',
      'text/csv',
      'text/comma-separated-values',
      'text/plain',
      'application/vnd.ms-excel',
    ],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (r.canceled || !r.assets[0]) return null;
  const a = r.assets[0];
  return { name: a.name, text: await new File(a.uri).text() };
}

// ---- 6.3 block input credit ----------------------------------------------------------------------------------------------------
export type BlockKind = 'SKU' | 'CATEGORY';
export interface BlockForm {
  kind: BlockKind;
  refId: string;
  reason: string;
}
export function blockErrors(f: BlockForm): ('ref' | 'reason')[] {
  const e: ('ref' | 'reason')[] = [];
  if (!f.refId) e.push('ref');
  if (!between(f.reason, 3, 300)) e.push('reason');
  return e;
}
export const blockBody = (f: BlockForm) => ({ kind: f.kind, refId: f.refId, reason: f.reason.trim() });

// ---- 6.4 reverse charge rule ---------------------------------------------------------------------------------------------------
export type RuleScope = 'UNREGISTERED_SUPPLIER' | 'SUPPLIER' | 'CATEGORY';
export interface RuleForm {
  name: string;
  appliesTo: RuleScope;
  refId: string;
}
export function ruleErrors(f: RuleForm): ('name' | 'ref')[] {
  const e: ('name' | 'ref')[] = [];
  if (!between(f.name, 2, 120)) e.push('name');
  if (f.appliesTo !== 'UNREGISTERED_SUPPLIER' && !f.refId) e.push('ref');
  return e;
}
export const ruleBody = (f: RuleForm) => ({
  name: f.name.trim(),
  appliesTo: f.appliesTo,
  refId: f.appliesTo === 'UNREGISTERED_SUPPLIER' ? null : f.refId,
});

// ---- 6.5 TDS / TCS section -----------------------------------------------------------------------------------------------------
export interface SectionForm {
  code: string;
  name: string;
  kind: 'TDS' | 'TCS';
  partyType: 'SUPPLIER' | 'CUSTOMER';
  ratePct: string;
  ratePctNoPan: string;
  annualThreshold: string;
  effectiveFrom: string;
}
export type SectionError = 'code' | 'name' | 'rate' | 'noPan' | 'threshold' | 'date';
const DEC4 = /^\d{1,12}(\.\d{1,4})?$/;
const pct = (v: string) => DEC4.test(v.trim()) && Number(v.trim()) <= 100;
export function sectionErrors(f: SectionForm): SectionError[] {
  const e: SectionError[] = [];
  if (!/^[A-Z0-9()_-]{1,20}$/.test(f.code.trim().toUpperCase())) e.push('code');
  if (!between(f.name, 2, 120)) e.push('name');
  if (!pct(f.ratePct)) e.push('rate');
  if (!pct(f.ratePctNoPan)) e.push('noPan');
  if (f.annualThreshold.trim() !== '' && !DEC4.test(f.annualThreshold.trim())) e.push('threshold');
  if (!realDay(f.effectiveFrom)) e.push('date');
  return e;
}
export const sectionBody = (f: SectionForm) => ({
  code: f.code.trim().toUpperCase(),
  name: f.name.trim(),
  kind: f.kind,
  partyType: f.partyType,
  ratePct: f.ratePct.trim(),
  ratePctNoPan: f.ratePctNoPan.trim(),
  annualThreshold: f.annualThreshold.trim() || '0',
  effectiveFrom: f.effectiveFrom.trim(),
});

// ---- the shared write ----------------------------------------------------------------------------------------------------------
function useTaxWrite() {
  const { me, client } = useAuth();
  const qc = useQueryClient();
  const keys = useActionKey();
  const act = useAction(keys);
  const go = (fp: string, done: string, fn: (key: string) => Promise<unknown>, after?: () => void) =>
    act.run(
      () => fn(keys.keyFor(fp)),
      done,
      () => (after?.(), void qc.invalidateQueries({ queryKey: ['cmp', me?.userId ?? ''] })),
    );
  return { client, act, keys, go };
}
function Messages({ act }: { act: ReturnType<typeof useAction> }) {
  return (
    <>
      {act.msg ? <Notice tone="ok" text={act.msg} /> : null}
      {act.failure ? <Notice tone="error" text={act.failure} /> : null}
    </>
  );
}

function Gstr2bImport({ period }: { period: string }) {
  const { t } = useTranslation();
  const w = useTaxWrite();
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [readErr, setReadErr] = useState(false);
  const [rejected, setRejected] = useState<number | null>(null);
  const errs = gstr2bErrors(file);
  return (
    <Card>
      <Text style={kit.name}>{t('wp6.g2b.title', { period })}</Text>
      <Text style={kit.sub}>{t('wp6.g2b.hint')}</Text>
      <Button
        kind="ghost"
        label={file ? file.name : t('wp6.g2b.pick')}
        onPress={() =>
          void pickReturnFile()
            .then((f) => (f ? (setFile(f), setReadErr(false), setRejected(null), w.keys.reset()) : undefined))
            .catch(() => setReadErr(true))
        }
      />
      {readErr ? <Notice tone="error" text={t('wp6.g2b.readFailed')} /> : null}
      {file && errs.includes('size') ? <Notice tone="error" text={t('wp6.g2b.size')} /> : null}
      <Messages act={w.act} />
      {rejected ? <Notice tone="warn" text={t('wp6.g2b.rejected', { count: rejected })} /> : null}
      <Button
        label={t('wp6.g2b.import')}
        disabled={w.act.busy || errs.length > 0}
        onPress={() => {
          if (!file) return;
          void w.go(`g2b|${period}|${file.name}|${file.text.length}`, t('wp6.g2b.done'), async (k) => {
            const r = await w.client!.post<{ rejected?: unknown[] }>('/gst/gstr2b/import', {
              body: gstr2bBody(period, file),
              idempotencyKey: k,
            });
            setRejected(Array.isArray(r?.rejected) ? r.rejected.length : 0);
          });
        }}
      />
    </Card>
  );
}

function useCategories(enabled: boolean) {
  const { me, client } = useAuth();
  return useQuery({
    queryKey: ['cmp', me?.userId ?? '', 'categories'],
    queryFn: ({ signal }) => fetchCategories(client!, signal),
    enabled: enabled && client !== null,
    retry: (n, e) => isNetwork(e) && n < 1,
  });
}

function BlockCredit() {
  const { t } = useTranslation();
  const w = useTaxWrite();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<BlockForm>({ kind: 'SKU', refId: '', reason: '' });
  const [product, setProduct] = useState<ProductRef | null>(null);
  const [tried, setTried] = useState(false);
  const cats = useCategories(open && f.kind === 'CATEGORY');
  if (!open)
    return <Button kind="ghost" label={t('wp6.block.open')} onPress={() => (setOpen(true), w.act.clear())} />;
  const errs = blockErrors(f);
  return (
    <Card>
      <Text style={kit.name}>{t('wp6.block.title')}</Text>
      <Text style={kit.sub}>{t('wp6.block.hint')}</Text>
      <Chips
        label={t('wp6.block.kind')}
        options={[
          { id: 'SKU' as const, label: t('wp6.block.sku') },
          { id: 'CATEGORY' as const, label: t('wp6.block.category') },
        ]}
        value={f.kind}
        onChange={(kind) => (setF({ ...f, kind, refId: '' }), setProduct(null))}
      />
      {f.kind === 'SKU' ? (
        <ProductPicker value={product} onPick={(p) => (setProduct(p), setF({ ...f, refId: p?.id ?? '' }))} />
      ) : (
        <Chips
          label={t('wp6.block.category')}
          options={(cats.data ?? []).map((c) => ({ id: c.id, label: c.name }))}
          value={f.refId}
          onChange={(refId) => setF({ ...f, refId })}
        />
      )}
      {tried && errs.includes('ref') ? <Text style={kit.sub}>{t('wp6.block.v.ref')}</Text> : null}
      <Field
        label={t('wp6.reason')}
        value={f.reason}
        onChange={(reason) => setF({ ...f, reason })}
        error={tried && errs.includes('reason') ? t('wp6.v.reason') : null}
      />
      <Messages act={w.act} />
      <Button
        label={t('wp6.block.save')}
        disabled={w.act.busy}
        onPress={() => {
          setTried(true);
          if (errs.length > 0) return;
          const body = blockBody(f);
          void w.go(
            `block|${JSON.stringify(body)}`,
            t('wp6.block.done'),
            (k) => w.client!.post('/gst/itc-blocks', { body, idempotencyKey: k }),
            () => (setF({ kind: 'SKU', refId: '', reason: '' }), setProduct(null), setTried(false)),
          );
        }}
      />
      <Button kind="ghost" label={t('cmp.cancel')} onPress={() => (setOpen(false), setTried(false))} />
    </Card>
  );
}

function RcmRule() {
  const { t } = useTranslation();
  const { me, client } = useAuth();
  const w = useTaxWrite();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<RuleForm>({ name: '', appliesTo: 'UNREGISTERED_SUPPLIER', refId: '' });
  const [tried, setTried] = useState(false);
  const cats = useCategories(open && f.appliesTo === 'CATEGORY');
  const sups = useQuery({
    queryKey: ['cmp', me?.userId ?? '', 'suppliers'],
    queryFn: ({ signal }) => fetchSuppliers(client!, '', signal),
    enabled: open && f.appliesTo === 'SUPPLIER' && client !== null,
    retry: (n, e) => isNetwork(e) && n < 1,
  });
  if (!open)
    return <Button kind="ghost" label={t('wp6.rule.open')} onPress={() => (setOpen(true), w.act.clear())} />;
  const errs = ruleErrors(f);
  const list =
    f.appliesTo === 'SUPPLIER'
      ? (sups.data ?? []).map((s) => ({ id: s.id, label: s.name }))
      : (cats.data ?? []).map((c) => ({ id: c.id, label: c.name }));
  return (
    <Card>
      <Text style={kit.name}>{t('wp6.rule.title')}</Text>
      <Text style={kit.sub}>{t('wp6.rule.hint')}</Text>
      <Field
        label={t('wp6.rule.name')}
        value={f.name}
        onChange={(name) => setF({ ...f, name })}
        error={tried && errs.includes('name') ? t('wp6.rule.v.name') : null}
      />
      <Chips
        label={t('wp6.rule.appliesTo')}
        options={(['UNREGISTERED_SUPPLIER', 'SUPPLIER', 'CATEGORY'] as const).map((id) => ({
          id,
          label: t(`wp6.rule.s.${id}`),
        }))}
        value={f.appliesTo}
        onChange={(appliesTo) => setF({ ...f, appliesTo, refId: '' })}
      />
      {f.appliesTo !== 'UNREGISTERED_SUPPLIER' ? (
        <Chips
          label={t(f.appliesTo === 'SUPPLIER' ? 'wp6.rule.supplier' : 'wp6.block.category')}
          options={list}
          value={f.refId}
          onChange={(refId) => setF({ ...f, refId })}
        />
      ) : null}
      {tried && errs.includes('ref') ? <Text style={kit.sub}>{t('wp6.rule.v.ref')}</Text> : null}
      <Messages act={w.act} />
      <Button
        label={t('wp6.rule.save')}
        disabled={w.act.busy}
        onPress={() => {
          setTried(true);
          if (errs.length > 0) return;
          const body = ruleBody(f);
          void w.go(
            `rule|${JSON.stringify(body)}`,
            t('wp6.rule.done'),
            (k) => w.client!.post('/rcm/rules', { body, idempotencyKey: k }),
            () => (setF({ name: '', appliesTo: 'UNREGISTERED_SUPPLIER', refId: '' }), setTried(false)),
          );
        }}
      />
      <Button kind="ghost" label={t('cmp.cancel')} onPress={() => (setOpen(false), setTried(false))} />
    </Card>
  );
}

const emptySection = (today: string): SectionForm => ({
  code: '',
  name: '',
  kind: 'TDS',
  partyType: 'SUPPLIER',
  ratePct: '',
  ratePctNoPan: '',
  annualThreshold: '0',
  effectiveFrom: today,
});
function TdsSection({ today }: { today: string }) {
  const { t } = useTranslation();
  const w = useTaxWrite();
  const [f, setF] = useState<SectionForm | null>(null);
  const [tried, setTried] = useState(false);
  if (!f)
    return (
      <Button
        kind="ghost"
        label={t('wp6.tds.open')}
        onPress={() => (setF(emptySection(today)), w.act.clear())}
      />
    );
  const errs = sectionErrors(f);
  const bad = (e: SectionError) => (tried && errs.includes(e) ? t(`wp6.tds.v.${e}`) : null);
  const set = (k: keyof SectionForm) => (v: string) => setF({ ...f, [k]: v });
  return (
    <Card>
      <Text style={kit.name}>{t('wp6.tds.title')}</Text>
      <Text style={kit.sub}>{t('wp6.tds.hint')}</Text>
      <Field label={t('wp6.tds.code')} value={f.code} onChange={set('code')} error={bad('code')} />
      <Field label={t('wp6.tds.name')} value={f.name} onChange={set('name')} error={bad('name')} />
      <Chips
        label={t('wp6.tds.kind')}
        options={[
          { id: 'TDS' as const, label: t('wp6.tds.k.TDS') },
          { id: 'TCS' as const, label: t('wp6.tds.k.TCS') },
        ]}
        value={f.kind}
        onChange={(kind) => setF({ ...f, kind })}
      />
      <Chips
        label={t('wp6.tds.party')}
        options={[
          { id: 'SUPPLIER' as const, label: t('wp6.tds.p.SUPPLIER') },
          { id: 'CUSTOMER' as const, label: t('wp6.tds.p.CUSTOMER') },
        ]}
        value={f.partyType}
        onChange={(partyType) => setF({ ...f, partyType })}
      />
      <Field
        label={t('wp6.tds.rate')}
        value={f.ratePct}
        onChange={set('ratePct')}
        keyboard="decimal-pad"
        error={bad('rate')}
      />
      <Field
        label={t('wp6.tds.noPan')}
        value={f.ratePctNoPan}
        onChange={set('ratePctNoPan')}
        keyboard="decimal-pad"
        error={bad('noPan')}
      />
      <Field
        label={t('wp6.tds.threshold')}
        value={f.annualThreshold}
        onChange={set('annualThreshold')}
        keyboard="decimal-pad"
        error={bad('threshold')}
      />
      <Field
        label={t('wp6.tds.from')}
        value={f.effectiveFrom}
        onChange={set('effectiveFrom')}
        placeholder="YYYY-MM-DD"
        error={bad('date')}
      />
      <Messages act={w.act} />
      <Button
        label={t('wp6.tds.save')}
        disabled={w.act.busy}
        onPress={() => {
          setTried(true);
          if (errs.length > 0) return;
          const body = sectionBody(f);
          void w.go(
            `tds|${JSON.stringify(body)}`,
            t('wp6.tds.done'),
            (k) => w.client!.put('/tax/tds-config', { body, idempotencyKey: k }),
            () => (setF(null), setTried(false)),
          );
        }}
      />
      <Button kind="ghost" label={t('cmp.cancel')} onPress={() => (setF(null), setTried(false))} />
    </Card>
  );
}

function TdsRun({ range }: { range: { from: string; to: string } }) {
  const { t } = useTranslation();
  const { me, client } = useAuth();
  const w = useTaxWrite();
  const s = useQuery({
    queryKey: ['cmp', me?.userId ?? '', 'settings'],
    queryFn: ({ signal }) => client!.get<ComplianceSettings>('/compliance/settings', { signal }),
    enabled: client !== null,
    retry: (n, e) => isNetwork(e) && n < 1,
  });
  // like the web: the run is offered only while TDS / TCS is switched on
  if (s.data?.tdsEnabled !== true) return null;
  return (
    <>
      <Messages act={w.act} />
      <Button
        kind="ghost"
        label={t('wp6.tds.run', { from: range.from, to: range.to })}
        disabled={w.act.busy}
        onPress={() =>
          void w.go(`tdsrun|${range.from}|${range.to}`, t('wp6.tds.ran'), (k) =>
            w.client!.post('/tax/tds/run', { body: { from: range.from, to: range.to }, idempotencyKey: k }),
          )
        }
      />
    </>
  );
}

/** The add / import / run form that belongs to the open tab of the tax records hub, when the person may use it. */
export function TaxTabForm({
  tab,
  period,
  range,
  today,
}: {
  tab: string;
  period: string;
  range: { from: string; to: string };
  today: string;
}) {
  const can = useCan();
  if (tab === 'itcRecon' && can('compliance.itc.manage'))
    return <Gstr2bImport key={period} period={period} />;
  if (tab === 'blocks' && can('compliance.itc.manage')) return <BlockCredit />;
  if (tab === 'rcmRules' && can('compliance.rcm.manage')) return <RcmRule />;
  if (tab === 'tdsSections' && can('compliance.tds.manage')) return <TdsSection today={today} />;
  if (tab === 'tdsReport' && can('compliance.tds.manage')) return <TdsRun range={range} />;
  return null;
}

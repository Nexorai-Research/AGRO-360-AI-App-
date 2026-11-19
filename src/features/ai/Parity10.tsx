import { useState } from 'react';
import { Text, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { ApiClient } from '@/api/client';
import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/ui/Button';
import { Card, Chips, Field, Notice, isNetwork, kit, useAction, useActionKey, useCan } from '../hr/kit';
import type { OcrDocument } from './api-g4';

// Web parity phase 10 (apps/web/src/pages/ai.js knowledge review, inbox "run the daily scan", messagesTab campaign message,
// risksTab evidence; ai-staff.js training items and shelf history; ai-ocr.js list and review; ai-analytics.js open scenario).

const GOV = 'ai.governance.manage';
const useCtx = () => {
  const { me, client } = useAuth();
  return { client, userId: me?.userId ?? '', ready: client !== null && me !== null };
};
const K = (userId: string, what: string, extra = '') => ['ai', 'wp10', userId, what, extra] as const;
const lines = (s: string) =>
  s
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean);

// ---- 10.2 run the daily AI scan now --------------------------------------------------------------------------------------------
export interface JobsRun {
  skipped?: string | null;
  ran?: { job?: string; outcome: string }[];
}
/** Like the web toast: what was skipped, or how many jobs ran OK. */
export function jobsRunSummary(r: JobsRun): { skipped: string } | { ran: number } {
  return r.skipped ? { skipped: r.skipped } : { ran: (r.ran ?? []).filter((x) => x.outcome === 'OK').length };
}
export function RunScanNow({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const can = useCan();
  const { client } = useCtx();
  const keys = useActionKey();
  const act = useAction(keys);
  const [msg, setMsg] = useState<string | null>(null);
  if (!can(GOV)) return null;
  return (
    <>
      {msg ? <Notice tone="ok" text={msg} /> : null}
      {act.failure ? <Notice tone="error" text={act.failure} /> : null}
      <Button
        kind="ghost"
        label={t('wp10.scan.run')}
        disabled={act.busy}
        onPress={() =>
          void act.run(
            async () => {
              const s = jobsRunSummary(
                await client!.post<JobsRun>('/ai/jobs/run', { idempotencyKey: keys.keyFor('run') }),
              );
              setMsg(
                'skipped' in s
                  ? t('wp10.scan.skipped', { why: s.skipped })
                  : t('wp10.scan.ran', { count: s.ran }),
              );
            },
            '',
            onDone,
          )
        }
      />
    </>
  );
}

// ---- 10.1 agro knowledge entries ------------------------------------------------------------------------------------------------
export const AGRO_KINDS = [
  'PEST',
  'DISEASE',
  'DEFICIENCY',
  'WEED',
  'SOWING',
  'NUTRIENT',
  'IRRIGATION',
] as const;
export const AGRO_SEASONS = ['KHARIF', 'RABI', 'ZAID'] as const;
export const AGRO_SOURCES = ['ICAR', 'SAU', 'KVK', 'CIBRC_LABEL'] as const;
export interface KnowledgeForm {
  kind: string;
  crop: string;
  nameEn: string;
  nameHi: string;
  nameMr: string;
  stage: string;
  season: string;
  symptoms: string;
  summary: string;
  cultural: string;
  biological: string;
  chemical: string;
  ingredients: string;
  doseText: string;
  source: string;
  sourceRef: string;
}
export const emptyKnowledge = (): KnowledgeForm => ({
  kind: 'PEST',
  crop: '',
  nameEn: '',
  nameHi: '',
  nameMr: '',
  stage: '',
  season: '',
  symptoms: '',
  summary: '',
  cultural: '',
  biological: '',
  chemical: '',
  ingredients: '',
  doseText: '',
  source: 'ICAR',
  sourceRef: '',
});
export function knowledgeErrors(f: KnowledgeForm): ('crop' | 'nameEn' | 'sourceRef')[] {
  const e: ('crop' | 'nameEn' | 'sourceRef')[] = [];
  if (!f.crop.trim()) e.push('crop');
  if (!f.nameEn.trim()) e.push('nameEn');
  if (!f.sourceRef.trim()) e.push('sourceRef');
  return e;
}
/** Like the web: symptoms and ingredients one per line become lists; empty fields are left out. */
export function knowledgeBody(f: KnowledgeForm): Record<string, unknown> {
  const raw: Record<string, unknown> = {
    ...Object.fromEntries(Object.entries(f).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v])),
    symptoms: lines(f.symptoms),
    ingredients: lines(f.ingredients),
  };
  return Object.fromEntries(
    Object.entries(raw).filter(([, x]) => x !== '' && !(Array.isArray(x) && x.length === 0)),
  );
}
export interface KnowledgeEntry {
  id: string;
  kind: string;
  crop: string;
  nameEn: string;
  source: string;
  sourceRef: string;
  status: string;
}
/** The steps the web offers for each status; reject and retire need a reason. */
export function knowledgeSteps(
  status: string,
): { step: 'submit' | 'approve' | 'reject' | 'retire'; note: boolean }[] {
  if (status === 'DRAFT' || status === 'REJECTED') return [{ step: 'submit', note: false }];
  if (status === 'SUBMITTED')
    return [
      { step: 'approve', note: false },
      { step: 'reject', note: true },
    ];
  if (status === 'APPROVED') return [{ step: 'retire', note: true }];
  return [];
}
const KFIELDS: (keyof KnowledgeForm)[] = [
  'crop',
  'nameEn',
  'nameHi',
  'nameMr',
  'stage',
  'symptoms',
  'summary',
  'cultural',
  'biological',
  'chemical',
  'ingredients',
  'doseText',
  'sourceRef',
];
export function KnowledgeEntries() {
  const { t } = useTranslation();
  const can = useCan();
  const { client, userId, ready } = useCtx();
  const qc = useQueryClient();
  const keys = useActionKey();
  const act = useAction(keys);
  const [f, setF] = useState<KnowledgeForm | null>(null);
  const [tried, setTried] = useState(false);
  const [noteFor, setNoteFor] = useState<{ id: string; step: string } | null>(null);
  const [note, setNote] = useState('');
  const q = useQuery({
    queryKey: K(userId, 'knowledge'),
    queryFn: async ({ signal }) =>
      (await client!.get<{ items: KnowledgeEntry[] }>('/ai/agro/knowledge', { signal })).items,
    enabled: ready && can(GOV),
    retry: (n, e) => isNetwork(e) && n < 1,
  });
  if (!can(GOV)) return null;
  const refresh = () => void qc.invalidateQueries({ queryKey: ['ai'] });
  const step = (e: KnowledgeEntry, s: string, withNote: string | null) =>
    void act.run(
      () =>
        client!.post(`/ai/agro/knowledge/${encodeURIComponent(e.id)}/${s}`, {
          body: withNote === null ? {} : { note: withNote },
          idempotencyKey: keys.keyFor(`${e.id}|${s}|${withNote ?? ''}`),
        }),
      t(`wp10.kn.done.${s}`),
      () => (setNoteFor(null), setNote(''), refresh()),
    );
  const errs = f ? knowledgeErrors(f) : [];
  return (
    <Card>
      <Text style={kit.name}>{t('wp10.kn.title')}</Text>
      <Text style={kit.sub}>{t('wp10.kn.hint')}</Text>
      {act.msg ? <Notice tone="ok" text={act.msg} /> : null}
      {act.failure ? <Notice tone="error" text={act.failure} /> : null}
      {!f ? (
        <Button
          kind="ghost"
          label={t('wp10.kn.new')}
          onPress={() => (act.clear(), keys.reset(), setTried(false), setF(emptyKnowledge()))}
        />
      ) : (
        <View style={{ gap: 8 }}>
          <Chips
            label={t('wp10.kn.kind')}
            options={AGRO_KINDS.map((x) => ({ id: x, label: t(`wp10.kn.k.${x}`) }))}
            value={f.kind}
            onChange={(kind) => setF({ ...f, kind })}
          />
          <Chips
            label={t('wp10.kn.season')}
            options={[
              { id: '', label: t('wp10.kn.anySeason') },
              ...AGRO_SEASONS.map((x) => ({ id: x, label: t(`wp10.kn.s.${x}`) })),
            ]}
            value={f.season}
            onChange={(season) => setF({ ...f, season })}
          />
          {KFIELDS.map((key) => (
            <Field
              key={key}
              label={t(`wp10.kn.f.${key}`)}
              value={f[key]}
              onChange={(v) => setF({ ...f, [key]: v })}
              error={tried && (errs as string[]).includes(key) ? t('wp10.kn.required') : null}
            />
          ))}
          <Chips
            label={t('wp10.kn.source')}
            options={AGRO_SOURCES.map((x) => ({ id: x, label: x }))}
            value={f.source}
            onChange={(source) => setF({ ...f, source })}
          />
          <Button
            label={t('wp10.kn.save')}
            disabled={act.busy}
            onPress={() => {
              setTried(true);
              if (errs.length > 0) return;
              const body = knowledgeBody(f);
              void act.run(
                () =>
                  client!.post('/ai/agro/knowledge', {
                    body,
                    idempotencyKey: keys.keyFor(JSON.stringify(body)),
                  }),
                t('wp10.kn.saved'),
                () => (setF(null), refresh()),
              );
            }}
          />
          <Button kind="ghost" label={t('wp10.cancel')} onPress={() => setF(null)} />
        </View>
      )}
      {q.data?.length === 0 ? <Text style={kit.sub}>{t('wp10.kn.none')}</Text> : null}
      {(q.data ?? []).map((e) => (
        <View key={e.id} style={{ gap: 4 }}>
          <Text style={kit.name}>
            {e.crop} · {e.nameEn} ({t(`wp10.kn.k.${e.kind}`, { defaultValue: e.kind })})
          </Text>
          <Text style={kit.sub}>
            {e.source}: {e.sourceRef} · {t(`wp10.kn.st.${e.status}`, { defaultValue: e.status })}
          </Text>
          <View style={kit.row}>
            {knowledgeSteps(e.status).map((s) => (
              <Button
                key={s.step}
                kind="ghost"
                label={t(`wp10.kn.step.${s.step}`)}
                disabled={act.busy}
                onPress={() =>
                  s.note ? (setNoteFor({ id: e.id, step: s.step }), setNote('')) : step(e, s.step, null)
                }
              />
            ))}
          </View>
          {noteFor?.id === e.id ? (
            <>
              <Field label={t('wp10.kn.reason')} value={note} onChange={setNote} />
              <Button
                label={t(`wp10.kn.step.${noteFor.step}`)}
                disabled={act.busy || note.trim() === ''}
                onPress={() => step(e, noteFor.step, note.trim())}
              />
            </>
          ) : null}
        </View>
      ))}
    </Card>
  );
}

// ---- 10.3 campaign message from an approved campaign draft --------------------------------------------------------------------
interface CampaignDraft {
  id: string;
  name: string;
  channel: string;
}
export const campaignMessageBody = (campaignDraft: string, branch: string, text: string) => ({
  campaignDraft,
  branch,
  body: text,
});
/** Shown under a prepared marketing text: picks an approved campaign and saves the text as a proposal. Nothing is sent. */
export function CampaignMessage({ text, branch }: { text: string; branch: string }) {
  const { t } = useTranslation();
  const can = useCan();
  const { client, userId, ready } = useCtx();
  const keys = useActionKey();
  const act = useAction(keys);
  const [pick, setPick] = useState('');
  const ok = can('customer.view') && can('crm.greeting.manage');
  const q = useQuery({
    queryKey: K(userId, 'campaigns'),
    queryFn: async ({ signal }) =>
      (
        await client!.get<{ items: CampaignDraft[] }>('/ai/campaigns/drafts', {
          query: { status: 'APPROVED' },
          signal,
        })
      ).items ?? [],
    enabled: ready && ok,
    retry: (n, e) => isNetwork(e) && n < 1,
  });
  if (!ok) return null;
  const list = q.data ?? [];
  const cur = pick || list[0]?.id || '';
  return (
    <Card>
      <Text style={kit.name}>{t('wp10.cm.title')}</Text>
      {list.length === 0 && q.data ? <Text style={kit.sub}>{t('wp10.cm.none')}</Text> : null}
      {list.length > 0 ? (
        <Chips
          label={t('wp10.cm.campaign')}
          options={list.map((c) => ({ id: c.id, label: `${c.name} (${c.channel})` }))}
          value={cur}
          onChange={setPick}
        />
      ) : null}
      {act.msg ? <Notice tone="ok" text={act.msg} /> : null}
      {act.failure ? <Notice tone="error" text={act.failure} /> : null}
      <Button
        kind="ghost"
        label={t('wp10.cm.save')}
        disabled={act.busy || !cur || !branch}
        onPress={() => {
          const body = campaignMessageBody(cur, branch, text);
          void act.run(
            () =>
              client!.post('/ai/recommendations/campaign-message', {
                body,
                idempotencyKey: keys.keyFor(JSON.stringify(body)),
              }),
            t('wp10.cm.saved'),
          );
        }}
      />
      <Text style={kit.sub}>{t('wp10.cm.note')}</Text>
    </Card>
  );
}

// ---- 10.7 evidence on a risk case -----------------------------------------------------------------------------------------------
export const EVIDENCE_KINDS = [
  'INVOICE',
  'PURCHASE_BILL',
  'STOCK_MOVEMENT',
  'RECEIPT',
  'CUSTOMER',
  'PRODUCT',
  'DOCUMENT',
  'OTHER',
] as const;
export const evidenceOk = (kind: string, ref: string) =>
  kind !== '' && ref.trim().length > 0 && ref.trim().length <= 200;
export function RiskEvidence({ riskId, onDone }: { riskId: string; onDone: () => void }) {
  const { t } = useTranslation();
  const { client } = useCtx();
  const keys = useActionKey();
  const act = useAction(keys);
  const [kind, setKind] = useState<string>('INVOICE');
  const [ref, setRef] = useState('');
  return (
    <View style={{ gap: 6 }}>
      <Chips
        label={t('wp10.ev.kind')}
        options={EVIDENCE_KINDS.map((x) => ({ id: x, label: t(`wp10.ev.k.${x}`) }))}
        value={kind}
        onChange={setKind}
      />
      <Field label={t('wp10.ev.ref')} value={ref} onChange={setRef} />
      {act.msg ? <Notice tone="ok" text={act.msg} /> : null}
      {act.failure ? <Notice tone="error" text={act.failure} /> : null}
      <Button
        kind="ghost"
        label={t('wp10.ev.add')}
        disabled={act.busy || !evidenceOk(kind, ref)}
        onPress={() => {
          const body = { kind, ref: ref.trim() };
          void act.run(
            () =>
              client!.post(`/ai/risks/${encodeURIComponent(riskId)}/evidence`, {
                body,
                idempotencyKey: keys.keyFor(JSON.stringify(body)),
              }),
            t('wp10.ev.added'),
            () => (setRef(''), onDone()),
          );
        }}
      />
    </View>
  );
}

// ---- 10.6 training items: add and change ---------------------------------------------------------------------------------------
export const TRAINING_CATEGORIES = ['SOP', 'PRODUCT', 'SAFETY', 'BILLING', 'COMPLIANCE', 'OTHER'] as const;
export interface TrainingForm {
  title: string;
  source: string;
  category: string;
  body: string;
}
export function trainingErrors(f: TrainingForm): ('title' | 'source' | 'body')[] {
  const e: ('title' | 'source' | 'body')[] = [];
  if (!f.title.trim()) e.push('title');
  if (!f.source.trim()) e.push('source');
  if (!f.body.trim() || f.body.length > 20000) e.push('body');
  return e;
}
export const trainingBody = (f: TrainingForm, version?: number) => ({
  title: f.title.trim(),
  source: f.source.trim(),
  category: f.category,
  body: f.body.trim(),
  ...(version === undefined ? {} : { expectedVersion: version }),
});
export function TrainingEditor({
  item,
  onDone,
}: {
  item: { id: string; title: string; source: string; category: string; body: string; version: number } | null;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const { client } = useCtx();
  const keys = useActionKey();
  const act = useAction(keys);
  const [f, setF] = useState<TrainingForm>(
    item
      ? { title: item.title, source: item.source, category: item.category, body: item.body }
      : { title: '', source: '', category: 'SOP', body: '' },
  );
  const [tried, setTried] = useState(false);
  const errs = trainingErrors(f);
  const bad = (k: 'title' | 'source' | 'body') => (tried && errs.includes(k) ? t('wp10.tr.required') : null);
  return (
    <Card>
      <Text style={kit.name}>
        {item ? t('wp10.tr.editTitle', { title: item.title }) : t('wp10.tr.addTitle')}
      </Text>
      <Text style={kit.sub}>{t('wp10.tr.hint')}</Text>
      <Field
        label={t('wp10.tr.title')}
        value={f.title}
        onChange={(title) => setF({ ...f, title })}
        error={bad('title')}
      />
      <Field
        label={t('wp10.tr.source')}
        value={f.source}
        onChange={(source) => setF({ ...f, source })}
        error={bad('source')}
      />
      <Chips
        label={t('wp10.tr.category')}
        options={TRAINING_CATEGORIES.map((x) => ({ id: x, label: x }))}
        value={f.category}
        onChange={(category) => setF({ ...f, category })}
      />
      <Field
        label={t('wp10.tr.body')}
        value={f.body}
        onChange={(body) => setF({ ...f, body })}
        error={bad('body')}
      />
      {act.failure ? <Notice tone="error" text={act.failure} /> : null}
      <Button
        label={t('wp10.tr.save')}
        disabled={act.busy}
        onPress={() => {
          setTried(true);
          if (errs.length > 0) return;
          const body = trainingBody(f, item?.version);
          void act.run(
            () =>
              item
                ? client!.put(`/ai/training/items/${encodeURIComponent(item.id)}`, {
                    body,
                    idempotencyKey: keys.keyFor(JSON.stringify(body)),
                  })
                : client!.post('/ai/training/items', {
                    body,
                    idempotencyKey: keys.keyFor(JSON.stringify(body)),
                  }),
            t('wp10.tr.saved'),
            onDone,
          );
        }}
      />
      <Button kind="ghost" label={t('wp10.cancel')} onPress={onDone} />
    </Card>
  );
}

// ---- 10.4 scanned documents: list, open, review, confirm a bill -----------------------------------------------------------------
export interface OcrListItem {
  id: string;
  kind: string;
  filename: string;
  status: string;
  createdAt: string;
  validation: { issues: unknown[] };
}
export interface GrnCandidate {
  grnLineId: string;
  grnNumber: string;
  productName: string;
  unbilledQty: string;
}
export interface OcrOpen {
  document: OcrDocument;
  purchase?: {
    supplier: { id: string; name: string } | null;
    duplicateBillId: string | null;
    candidates: GrnCandidate[];
    matches: { line: number; suggestion: { grnLineId: string } | null }[];
  };
}
export const fetchOcrList = async (c: ApiClient, kind: string, signal?: AbortSignal) =>
  (await c.get<{ items: OcrListItem[] }>('/ai/ocr/documents', { query: { kind }, signal })).items;
export const fetchOcrDocument = (c: ApiClient, id: string, supplierId?: string) =>
  c.get<OcrOpen>(`/ai/ocr/documents/${encodeURIComponent(id)}`, supplierId ? { query: { supplierId } } : {});
/** Like the web `collect()`: only the header fields and line cells that were changed are sent; a cleared value is null. */
export function ocrEdits(
  doc: OcrDocument,
  fields: Record<string, string>,
  lineCells: Record<string, string>[],
): {
  expectedVersion: number;
  fields: Record<string, string | null>;
  lines?: Record<string, string | null>[];
} {
  const out: {
    expectedVersion: number;
    fields: Record<string, string | null>;
    lines?: Record<string, string | null>[];
  } = {
    expectedVersion: doc.version,
    fields: {},
  };
  for (const [k, v] of Object.entries(fields))
    if (v.trim() !== (doc.extracted.fields[k]?.value ?? '')) out.fields[k] = v.trim() || null;
  if (doc.kind === 'PURCHASE_BILL')
    out.lines = lineCells.map((cells, i) =>
      Object.fromEntries(
        Object.entries(cells)
          .map(([k, v]) => [k, v.trim() || null] as const)
          .filter(([k, v]) => v !== (doc.extracted.lines[i]?.[k]?.value ?? null)),
      ),
    );
  return out;
}
export const hasEdits = (e: ReturnType<typeof ocrEdits>) =>
  Object.keys(e.fields).length > 0 || (e.lines ?? []).some((l) => Object.keys(l).length > 0);
export const confirmBillBody = (version: number, supplierId: string, picks: string[]) => ({
  expectedVersion: version,
  supplierId,
  lines: picks.map((grnLineId, line) => ({ line, grnLineId })),
});

/** The documents read before, for one kind; tapping one opens it in the scan screen. */
export function OcrDocumentList({ kind, onOpen }: { kind: string; onOpen: (id: string) => void }) {
  const { t } = useTranslation();
  const { client, userId, ready } = useCtx();
  const q = useQuery({
    queryKey: K(userId, 'ocr', kind),
    queryFn: ({ signal }) => fetchOcrList(client!, kind, signal),
    enabled: ready,
    retry: (n, e) => isNetwork(e) && n < 1,
  });
  return (
    <Card>
      <Text style={kit.name}>{t('wp10.ocr.recent')}</Text>
      {q.data?.length === 0 ? <Text style={kit.sub}>{t('wp10.ocr.none')}</Text> : null}
      {(q.data ?? []).map((d) => (
        <View key={d.id} style={{ gap: 2 }}>
          <Text style={kit.sub}>
            {d.createdAt.slice(0, 16).replace('T', ' ')} · {d.filename} ·{' '}
            {t(`ai.sc.status.${d.status}`, { defaultValue: d.status })} ·{' '}
            {d.validation.issues.length
              ? t('wp10.ocr.toCheck', { count: d.validation.issues.length })
              : t('wp10.ocr.clean')}
          </Text>
          <Button
            kind="ghost"
            label={
              d.status === 'REVIEW'
                ? t('wp10.ocr.review', { name: d.filename })
                : t('wp10.ocr.view', { name: d.filename })
            }
            onPress={() => onOpen(d.id)}
          />
        </View>
      ))}
    </Card>
  );
}

/** Edit what was read and save the corrections; for a supplier bill also choose the supplier and the receipt line of each line and create the DRAFT bill. */
export function OcrReview({
  open,
  onChanged,
  onSupplier,
}: {
  open: OcrOpen;
  onChanged: (o: OcrOpen) => void;
  onSupplier: (supplierId: string) => void;
}) {
  const { t } = useTranslation();
  const { client } = useCtx();
  const qc = useQueryClient();
  const keys = useActionKey();
  const act = useAction(keys);
  const d = open.document;
  const [fields, setFields] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(d.extracted.fields).map(([k, f]) => [k, f.value ?? ''])),
  );
  const [cells, setCells] = useState<Record<string, string>[]>(() =>
    d.extracted.lines.map((l) => Object.fromEntries(Object.entries(l).map(([k, f]) => [k, f.value ?? '']))),
  );
  const p = open.purchase;
  const [picks, setPicks] = useState<string[]>(() =>
    d.extracted.lines.map((_, i) => p?.matches.find((m) => m.line === i)?.suggestion?.grnLineId ?? ''),
  );
  const [supplier, setSupplier] = useState(p?.supplier?.id ?? '');
  const sups = useQuery({
    queryKey: ['ai', 'wp10', 'suppliers'],
    queryFn: async ({ signal }) =>
      (
        await client!.get<{ items: { id: string; name: string }[] }>('/procurement/suppliers', {
          query: { limit: 200 },
          signal,
        })
      ).items,
    enabled: client !== null && d.kind === 'PURCHASE_BILL' && d.status === 'REVIEW',
  });
  if (d.status !== 'REVIEW' || d.kind === 'CLASSIFY') return null;
  const reload = async () => {
    void qc.invalidateQueries({ queryKey: ['ai', 'wp10'] });
    onChanged(await fetchOcrDocument(client!, d.id, supplier || undefined));
  };
  const edits = ocrEdits(d, fields, cells);
  const save = () =>
    void act.run(async () => {
      await client!.put(`/ai/ocr/documents/${encodeURIComponent(d.id)}/review`, {
        body: { ...edits, ...(supplier ? { supplierId: supplier } : {}) },
        idempotencyKey: keys.keyFor(`rev|${d.version}|${JSON.stringify(edits)}|${supplier}`),
      });
      await reload();
    }, t('wp10.ocr.saved'));
  const createBill = () =>
    void act.run(async () => {
      let version = d.version;
      if (hasEdits(edits))
        version = (
          await client!.put<OcrDocument>(`/ai/ocr/documents/${encodeURIComponent(d.id)}/review`, {
            body: { ...edits, supplierId: supplier },
            idempotencyKey: keys.keyFor(`rev|${d.version}|${JSON.stringify(edits)}|${supplier}`),
          })
        ).version;
      const body = confirmBillBody(version, supplier, picks);
      await client!.post(`/ai/ocr/documents/${encodeURIComponent(d.id)}/confirm`, {
        body,
        idempotencyKey: keys.keyFor(`ok|${JSON.stringify(body)}`),
      });
      await reload();
    }, t('wp10.ocr.billMade'));
  return (
    <Card>
      <Text style={kit.name}>{t('wp10.ocr.correct')}</Text>
      {Object.keys(fields).map((k) => (
        <Field key={k} label={k} value={fields[k] ?? ''} onChange={(v) => setFields({ ...fields, [k]: v })} />
      ))}
      {cells.map((c, i) => (
        <View key={i} style={{ gap: 4 }}>
          <Text style={kit.name}>{t('ai.sc.line', { n: i + 1 })}</Text>
          {Object.keys(c).map((k) => (
            <Field
              key={k}
              label={`${t('ai.sc.line', { n: i + 1 })} ${k}`}
              value={c[k] ?? ''}
              onChange={(v) => setCells(cells.map((x, j) => (j === i ? { ...x, [k]: v } : x)))}
            />
          ))}
          {p ? (
            <Chips
              label={t('wp10.ocr.grnLine', { n: i + 1 })}
              options={p.candidates.map((g) => ({
                id: g.grnLineId,
                label: `${g.grnNumber} ${g.productName} (${t('wp10.ocr.left', { qty: g.unbilledQty })})`,
              }))}
              value={picks[i] ?? ''}
              onChange={(v) => setPicks(picks.map((x, j) => (j === i ? v : x)))}
            />
          ) : null}
        </View>
      ))}
      {d.kind === 'PURCHASE_BILL' ? (
        <>
          <Text style={kit.sub}>
            {p?.supplier ? t('wp10.ocr.matched', { name: p.supplier.name }) : t('wp10.ocr.noSupplier')}
          </Text>
          <Chips
            label={t('wp10.ocr.supplier')}
            options={(sups.data ?? []).map((s) => ({ id: s.id, label: s.name }))}
            value={supplier}
            onChange={(v) => (setSupplier(v), onSupplier(v))}
          />
          {p?.duplicateBillId ? <Notice tone="error" text={t('wp10.ocr.duplicateBill')} /> : null}
        </>
      ) : null}
      {act.msg ? <Notice tone="ok" text={act.msg} /> : null}
      {act.failure ? <Notice tone="error" text={act.failure} /> : null}
      <Button
        kind="ghost"
        label={t('wp10.ocr.save')}
        disabled={act.busy || !hasEdits(edits)}
        onPress={save}
      />
      {d.kind === 'PURCHASE_BILL' ? (
        <>
          <Button
            label={t('wp10.ocr.createBill')}
            disabled={act.busy || !supplier || picks.some((x) => !x)}
            onPress={createBill}
          />
          <Text style={kit.sub}>{t('wp10.ocr.billNote')}</Text>
        </>
      ) : null}
    </Card>
  );
}

// ---- 10.5 shelf check history ---------------------------------------------------------------------------------------------------
export interface ShelfHistoryItem {
  id: string;
  createdAt: string;
  countId: string | null;
  rows: { flag: string }[];
}
export const shelfDifferences = (c: { rows: { flag: string }[] }) =>
  c.rows.filter((r) => r.flag === 'SHORT' || r.flag === 'OVER').length;
export function ShelfHistory<T extends ShelfHistoryItem>({ onShow }: { onShow: (c: T) => void }) {
  const { t } = useTranslation();
  const { client, userId, ready } = useCtx();
  const q = useQuery({
    queryKey: K(userId, 'shelf'),
    queryFn: async ({ signal }) => (await client!.get<{ items: T[] }>('/ai/shelf-check', { signal })).items,
    enabled: ready,
    retry: (n, e) => isNetwork(e) && n < 1,
  });
  return (
    <Card>
      <Text style={kit.name}>{t('wp10.sh.recent')}</Text>
      {q.data?.length === 0 ? <Text style={kit.sub}>{t('wp10.sh.none')}</Text> : null}
      {(q.data ?? []).map((c) => (
        <View key={c.id} style={{ gap: 2 }}>
          <Text style={kit.sub}>
            {t('wp10.sh.line', {
              when: c.createdAt.slice(0, 16).replace('T', ' '),
              products: c.rows.length,
              diff: shelfDifferences(c),
            })}
            {c.countId ? ` · ${t('wp10.sh.countOpened')}` : ''}
          </Text>
          <Button
            kind="ghost"
            label={t('wp10.sh.show', { when: c.createdAt.slice(0, 16).replace('T', ' ') })}
            onPress={() => onShow(c)}
          />
        </View>
      ))}
    </Card>
  );
}

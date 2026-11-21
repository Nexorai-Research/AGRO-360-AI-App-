import { useState } from 'react';
import { Text, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { ApiClient } from '@/api/client';
import { Button } from '@/ui/Button';
import { Chips, Field, useActionKey } from '../purchase/ui';
import { useSal } from '../collections/sal-hook';
import { Msg, s } from './plans-ui';

// Web parity phase 17 (web commit 94a0617, pages/customers.js and customers-lib.js): correct or strike out what was recorded about a
// customer. A call or visit log and advice given to a farmer are never erased: they are corrected or marked as made in error, with
// the reason, and stay on record. The server checks every change; the app only offers it to roles that may make it.

const base = (id: string) => `/customers/${encodeURIComponent(id)}`;
const enc = encodeURIComponent;
export const P17 = {
  interaction: 'customer.interaction',
  service: 'crm.service.manage',
  kyc: 'customer.kyc',
  plan: 'crm.plan.manage',
  farm: 'customer.farm',
} as const;

// ---- API ---------------------------------------------------------------------------------------------------------------------------
export const correctInteraction = (
  c: ApiClient,
  id: string,
  iid: string,
  body: { notes: string; cropIssue: string; advice: string; reason: string },
  idempotencyKey: string,
) => c.patch<unknown>(`${base(id)}/interactions/${enc(iid)}`, { body, idempotencyKey });
export const voidInteraction = (
  c: ApiClient,
  id: string,
  iid: string,
  reason: string,
  idempotencyKey: string,
) => c.post<unknown>(`${base(id)}/interactions/${enc(iid)}/void`, { body: { reason }, idempotencyKey });
export const updateCase = (
  c: ApiClient,
  id: string,
  cid: string,
  version: number,
  body: Record<string, string>,
  idempotencyKey: string,
) => c.patch<unknown>(`${base(id)}/service-cases/${enc(cid)}`, { body, version, idempotencyKey });
export const voidCase = (
  c: ApiClient,
  id: string,
  cid: string,
  version: number,
  reason: string,
  idempotencyKey: string,
) =>
  c.post<unknown>(`${base(id)}/service-cases/${enc(cid)}/void`, {
    body: { reason },
    version,
    idempotencyKey,
  });
export const updateKycDoc = (
  c: ApiClient,
  id: string,
  docId: string,
  body: { docType: string; number?: string; expiresOn: string | null },
  idempotencyKey: string,
) => c.patch<unknown>(`${base(id)}/documents/${enc(docId)}`, { body, idempotencyKey });
export const updatePurchasePlan = (
  c: ApiClient,
  id: string,
  planId: string,
  version: number,
  body: { season: string; seasonYear: number; lines: PlanLine[] },
  idempotencyKey: string,
) => c.patch<unknown>(`${base(id)}/purchase-plans/${enc(planId)}`, { body, version, idempotencyKey });
export const deletePurchasePlan = (c: ApiClient, id: string, planId: string, idempotencyKey: string) =>
  c.delete<unknown>(`${base(id)}/purchase-plans/${enc(planId)}`, { idempotencyKey });
export const closePurchasePlan = (c: ApiClient, id: string, planId: string, idempotencyKey: string) =>
  c.post<unknown>(`${base(id)}/purchase-plans/${enc(planId)}/status`, {
    body: { status: 'CLOSED' },
    idempotencyKey,
  });

// ---- rules -------------------------------------------------------------------------------------------------------------------------
export const KYC_TYPES = [
  'AADHAAR',
  'PAN',
  'VOTER_ID',
  'DRIVING_LICENCE',
  'PASSPORT',
  'LAND_RECORD',
  'BANK_PASSBOOK',
  'OTHER',
] as const;
export const LAND_UNITS = ['ACRE', 'HECTARE', 'GUNTHA'] as const;
export interface PlanLine {
  description: string;
  qty: string;
  neededBy?: string;
}
/** One item per line, "item | quantity | needed by (optional)", like the web's purchase plan editor. */
export const planLinesText = (lines: { description: string; qty: string; neededBy: string | null }[]) =>
  lines.map((l) => [l.description, l.qty, l.neededBy].filter(Boolean).join(' | ')).join('\n');
export function parsePlanLines(
  text: string,
): { lines: PlanLine[] } | { error: 'item' | 'qty' | 'date' | 'none'; line: number } {
  const out: PlanLine[] = [];
  const rows = text.split('\n');
  for (let i = 0; i < rows.length; i++) {
    const line = rows[i]!.trim();
    if (!line) continue;
    const [description, qty, neededBy] = line.split('|').map((x) => x.trim());
    if (!description) return { error: 'item', line: i + 1 };
    if (!qty || !/^\d+(\.\d{1,3})?$/.test(qty) || Number(qty) <= 0) return { error: 'qty', line: i + 1 };
    if (neededBy && !/^\d{4}-\d{2}-\d{2}$/.test(neededBy)) return { error: 'date', line: i + 1 };
    out.push({ description, qty, ...(neededBy ? { neededBy } : {}) });
  }
  return out.length ? { lines: out } : { error: 'none', line: 0 };
}
/** The web's activity filter: words in the text, the kind, and a date range where either end may be open. */
export interface ActivityFilterValue {
  q: string;
  kind: string;
  from: string;
  to: string;
}
export const NO_FILTER: ActivityFilterValue = { q: '', kind: '', from: '', to: '' };
export function matchesActivity(
  f: ActivityFilterValue,
  x: { kind: string; date: string; text: (string | null | undefined)[] },
): boolean {
  if (f.kind && f.kind !== x.kind) return false;
  const d = x.date.slice(0, 10);
  if (f.from && d < f.from) return false;
  if (f.to && d > f.to) return false;
  const q = f.q.trim().toLowerCase();
  return !q || x.text.some((t) => (t ?? '').toLowerCase().includes(q));
}
const reasonOk = (r: string) => r.trim().length >= 3;

function useP17() {
  const sal = useSal();
  const qc = useQueryClient();
  const key = useActionKey();
  const reload = () => {
    void qc.invalidateQueries({ queryKey: ['customers'] });
    void qc.invalidateQueries({ queryKey: ['sal', 'cust'] });
  };
  return { sal, key, reload };
}

// ---- filter ------------------------------------------------------------------------------------------------------------------------
export function ActivityFilter({
  value,
  onChange,
  kinds,
}: {
  value: ActivityFilterValue;
  onChange: (v: ActivityFilterValue) => void;
  kinds?: string[];
}) {
  const { t } = useTranslation();
  return (
    <View style={{ gap: 6 }}>
      <Field label={t('wp17.f.search')} value={value.q} onChange={(q) => onChange({ ...value, q })} />
      {kinds ? (
        <Chips
          options={[
            { value: '', label: t('wp17.f.all') },
            ...kinds.map((k) => ({ value: k, label: t(`wp17.f.kind.${k}`, { defaultValue: k }) })),
          ]}
          value={value.kind}
          onChange={(kind) => onChange({ ...value, kind })}
        />
      ) : null}
      <View style={s.row}>
        <Field
          label={t('wp17.f.from')}
          value={value.from}
          onChange={(from) => onChange({ ...value, from })}
          placeholder="YYYY-MM-DD"
        />
        <Field
          label={t('wp17.f.to')}
          value={value.to}
          onChange={(to) => onChange({ ...value, to })}
          placeholder="YYYY-MM-DD"
        />
      </View>
      {value.from && value.to && value.to < value.from ? (
        <Text style={s.err}>{t('wp17.f.badRange')}</Text>
      ) : null}
    </View>
  );
}

// ---- calls and visits ---------------------------------------------------------------------------------------------------------------
export interface InteractionRow {
  id: string;
  notes: string | null;
  cropIssue: string | null;
  advice: string | null;
  corrected?: boolean;
  voided?: boolean;
  correctionReason?: string | null;
}
export function InteractionActions({ customerId, x }: { customerId: string; x: InteractionRow }) {
  const { t } = useTranslation();
  const { sal, key, reload } = useP17();
  const [mode, setMode] = useState<'fix' | 'void' | null>(null);
  const [f, setF] = useState({
    notes: x.notes ?? '',
    cropIssue: x.cropIssue ?? '',
    advice: x.advice ?? '',
    reason: '',
  });
  const [tried, setTried] = useState(false);
  if (x.voided) return <Text style={s.err}>{t('wp17.i.voided', { reason: x.correctionReason ?? '' })}</Text>;
  const status = x.corrected ? (
    <Text style={s.sub}>{t('wp17.i.corrected', { reason: x.correctionReason ?? '' })}</Text>
  ) : null;
  if (!sal.can(P17.interaction)) return status;
  const close = () => (setMode(null), setTried(false), key.reset());
  return (
    <View style={{ gap: 4 }}>
      {status}
      {sal.failure && mode ? <Msg ok={false} text={sal.failure} /> : null}
      {mode === null ? (
        <View style={s.row}>
          {x.notes !== null ? (
            <Button kind="ghost" label={t('wp17.i.correct')} onPress={() => (close(), setMode('fix'))} />
          ) : null}
          <Button kind="ghost" label={t('wp17.i.void')} onPress={() => (close(), setMode('void'))} />
        </View>
      ) : null}
      {mode === 'fix' ? (
        <View style={s.card}>
          <Text style={s.sub}>{t('wp17.i.fixHint')}</Text>
          <Field
            label={t('wp17.i.notes')}
            value={f.notes}
            onChange={(notes) => setF({ ...f, notes })}
            multiline
            error={tried && !f.notes.trim() ? t('wp17.v.required') : null}
          />
          <Field
            label={t('wp17.i.cropIssue')}
            value={f.cropIssue}
            onChange={(cropIssue) => setF({ ...f, cropIssue })}
          />
          <Field label={t('wp17.i.advice')} value={f.advice} onChange={(advice) => setF({ ...f, advice })} />
          <Field
            label={t('wp17.i.why')}
            value={f.reason}
            onChange={(reason) => setF({ ...f, reason })}
            error={tried && !reasonOk(f.reason) ? t('wp17.v.reason') : null}
          />
          <View style={s.row}>
            <Button
              label={t('wp17.save')}
              disabled={sal.busy}
              onPress={() => {
                setTried(true);
                if (!f.notes.trim() || !reasonOk(f.reason)) return;
                const body = {
                  notes: f.notes.trim(),
                  cropIssue: f.cropIssue.trim(),
                  advice: f.advice.trim(),
                  reason: f.reason.trim(),
                };
                void sal.act(
                  t('wp17.i.fixed'),
                  () =>
                    correctInteraction(sal.client!, customerId, x.id, body, key.keyFor(JSON.stringify(body))),
                  () => (close(), reload()),
                );
              }}
            />
            <Button kind="ghost" label={t('wp17.cancel')} onPress={close} />
          </View>
        </View>
      ) : null}
      {mode === 'void' ? (
        <VoidForm
          what={t('wp17.i.voidWhat')}
          busy={sal.busy}
          onCancel={close}
          onConfirm={(reason) =>
            void sal.act(
              t('wp17.i.voidedDone'),
              () =>
                voidInteraction(sal.client!, customerId, x.id, reason, key.keyFor(`void|${x.id}|${reason}`)),
              () => (close(), reload()),
            )
          }
        />
      ) : null}
    </View>
  );
}

function VoidForm({
  what,
  busy,
  onCancel,
  onConfirm,
}: {
  what: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  const [tried, setTried] = useState(false);
  return (
    <View style={s.card}>
      <Text style={s.sub}>{what}</Text>
      <Field
        label={t('wp17.reason')}
        value={reason}
        onChange={setReason}
        error={tried && !reasonOk(reason) ? t('wp17.v.reason') : null}
      />
      <View style={s.row}>
        <Button
          label={t('wp17.confirmVoid')}
          disabled={busy}
          onPress={() => {
            setTried(true);
            if (reasonOk(reason)) onConfirm(reason.trim());
          }}
        />
        <Button kind="ghost" label={t('wp17.cancel')} onPress={onCancel} />
      </View>
    </View>
  );
}

// ---- service cases ------------------------------------------------------------------------------------------------------------------
export interface CaseRow {
  id: string;
  caseNo: string;
  adviceText: string | null;
  adviceSource: string | null;
  adviceReference: string | null;
  outcome?: string | null;
  version?: number;
  voided?: boolean;
  voidReason?: string | null;
}
export function CaseActions({ customerId, x }: { customerId: string; x: CaseRow }) {
  const { t } = useTranslation();
  const { sal, key, reload } = useP17();
  const [mode, setMode] = useState<'edit' | 'void' | null>(null);
  const [f, setF] = useState({
    adviceText: x.adviceText ?? '',
    adviceSource: x.adviceSource ?? '',
    adviceReference: x.adviceReference ?? '',
    outcome: x.outcome ?? '',
  });
  if (x.voided) return <Text style={s.err}>{t('wp17.c.voided', { reason: x.voidReason ?? '' })}</Text>;
  if (!sal.can(P17.service) || x.version === undefined) return null;
  const version = x.version;
  const close = () => (setMode(null), key.reset());
  return (
    <View style={{ gap: 4 }}>
      {sal.failure && mode ? <Msg ok={false} text={sal.failure} /> : null}
      {mode === null ? (
        <View style={s.row}>
          <Button
            kind="ghost"
            label={t('wp17.c.update', { no: x.caseNo })}
            onPress={() => (close(), setMode('edit'))}
          />
          <Button
            kind="ghost"
            label={t('wp17.c.delete', { no: x.caseNo })}
            onPress={() => (close(), setMode('void'))}
          />
        </View>
      ) : null}
      {mode === 'edit' ? (
        <View style={s.card}>
          <Field
            label={t('wp17.c.advice')}
            value={f.adviceText}
            onChange={(adviceText) => setF({ ...f, adviceText })}
            multiline
          />
          <Chips
            options={[
              { value: '', label: '-' },
              { value: 'EXPERT_PROVIDED', label: t('wp17.c.src.EXPERT_PROVIDED') },
              { value: 'APPROVED_SOURCE', label: t('wp17.c.src.APPROVED_SOURCE') },
            ]}
            value={f.adviceSource}
            onChange={(adviceSource) => setF({ ...f, adviceSource })}
          />
          <Field
            label={t('wp17.c.reference')}
            value={f.adviceReference}
            onChange={(adviceReference) => setF({ ...f, adviceReference })}
          />
          <Field
            label={t('wp17.c.outcome')}
            value={f.outcome}
            onChange={(outcome) => setF({ ...f, outcome })}
          />
          <View style={s.row}>
            <Button
              label={t('wp17.save')}
              disabled={sal.busy}
              onPress={() => {
                // like the web: only the boxes that hold something are sent
                const body = Object.fromEntries(
                  Object.entries(f)
                    .filter(([, v]) => v.trim() !== '')
                    .map(([k, v]) => [k, v.trim()]),
                );
                void sal.act(
                  t('wp17.c.updated'),
                  () =>
                    updateCase(
                      sal.client!,
                      customerId,
                      x.id,
                      version,
                      body,
                      key.keyFor(`case|${x.id}|${version}|${JSON.stringify(body)}`),
                    ),
                  () => (close(), reload()),
                );
              }}
            />
            <Button kind="ghost" label={t('wp17.cancel')} onPress={close} />
          </View>
        </View>
      ) : null}
      {mode === 'void' ? (
        <VoidForm
          what={t('wp17.c.voidWhat', { no: x.caseNo })}
          busy={sal.busy}
          onCancel={close}
          onConfirm={(reason) =>
            void sal.act(
              t('wp17.c.deleted'),
              () =>
                voidCase(
                  sal.client!,
                  customerId,
                  x.id,
                  version,
                  reason,
                  key.keyFor(`vcase|${x.id}|${reason}`),
                ),
              () => (close(), reload()),
            )
          }
        />
      ) : null}
    </View>
  );
}

// ---- KYC document details -----------------------------------------------------------------------------------------------------------
export function KycDocEdit({
  customerId,
  d,
}: {
  customerId: string;
  d: { id: string; docType: string; expiresOn: string | null };
}) {
  const { t } = useTranslation();
  const { sal, key, reload } = useP17();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ docType: d.docType, number: '', expiresOn: d.expiresOn ?? '' });
  if (!sal.can(P17.kyc)) return null;
  const badDate = f.expiresOn.trim() !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(f.expiresOn.trim());
  if (!open)
    return <Button kind="ghost" label={t('wp17.k.edit')} onPress={() => (key.reset(), setOpen(true))} />;
  return (
    <View style={s.card}>
      <Text style={s.sub}>{t('wp17.k.hint')}</Text>
      {sal.failure ? <Msg ok={false} text={sal.failure} /> : null}
      <Chips
        options={KYC_TYPES.map((x) => ({ value: x, label: t(`wp17.k.type.${x}`) }))}
        value={f.docType}
        onChange={(docType) => setF({ ...f, docType })}
      />
      <Field label={t('wp17.k.number')} value={f.number} onChange={(number) => setF({ ...f, number })} />
      <Field
        label={t('wp17.k.expires')}
        value={f.expiresOn}
        onChange={(expiresOn) => setF({ ...f, expiresOn })}
        placeholder="YYYY-MM-DD"
        error={badDate ? t('wp17.v.date') : null}
      />
      <View style={s.row}>
        <Button
          label={t('wp17.save')}
          disabled={sal.busy || badDate}
          onPress={() => {
            const body = {
              docType: f.docType,
              ...(f.number.trim() ? { number: f.number.trim() } : {}),
              expiresOn: f.expiresOn.trim() || null,
            };
            void sal.act(
              t('wp17.k.updated'),
              () => updateKycDoc(sal.client!, customerId, d.id, body, key.keyFor(JSON.stringify(body))),
              () => (setOpen(false), reload()),
            );
          }}
        />
        <Button kind="ghost" label={t('wp17.cancel')} onPress={() => setOpen(false)} />
      </View>
    </View>
  );
}

// ---- purchase plans -----------------------------------------------------------------------------------------------------------------
export interface PlanRow {
  id: string;
  season: string;
  seasonYear: number;
  status: string;
  version: number;
  lines: { description: string; qty: string; neededBy: string | null }[];
}
export function PlanActions({
  customerId,
  x,
  seasons,
}: {
  customerId: string;
  x: PlanRow;
  seasons: readonly string[];
}) {
  const { t } = useTranslation();
  const { sal, key, reload } = useP17();
  const [mode, setMode] = useState<'edit' | 'remove' | null>(null);
  const [f, setF] = useState({
    season: x.season,
    seasonYear: String(x.seasonYear),
    lines: planLinesText(x.lines),
  });
  const [tried, setTried] = useState(false);
  if (!sal.can(P17.plan) || (x.status !== 'DRAFT' && x.status !== 'CONFIRMED')) return null;
  const draft = x.status === 'DRAFT';
  const close = () => (setMode(null), setTried(false), key.reset());
  const parsed = parsePlanLines(f.lines);
  const yearBad =
    !/^\d{4}$/.test(f.seasonYear.trim()) || Number(f.seasonYear) < 2000 || Number(f.seasonYear) > 2100;
  return (
    <View style={{ gap: 4 }}>
      {sal.failure && mode ? <Msg ok={false} text={sal.failure} /> : null}
      {mode === null ? (
        <View style={s.row}>
          {draft ? (
            <Button kind="ghost" label={t('wp17.p.edit')} onPress={() => (close(), setMode('edit'))} />
          ) : null}
          <Button
            kind="ghost"
            label={t(draft ? 'wp17.p.delete' : 'wp17.p.close')}
            onPress={() => (close(), setMode('remove'))}
          />
        </View>
      ) : null}
      {mode === 'edit' ? (
        <View style={s.card}>
          <Text style={s.sub}>{t('wp17.p.hint')}</Text>
          <Chips
            options={seasons.map((v) => ({
              value: v,
              label: t(`customers.plans.season.${v}`, { defaultValue: v }),
            }))}
            value={f.season}
            onChange={(season) => setF({ ...f, season })}
          />
          <Field
            label={t('wp17.p.year')}
            value={f.seasonYear}
            onChange={(seasonYear) => setF({ ...f, seasonYear })}
            keyboard="numeric"
            error={tried && yearBad ? t('wp17.v.year') : null}
          />
          <Field
            label={t('wp17.p.lines')}
            value={f.lines}
            onChange={(lines) => setF({ ...f, lines })}
            multiline
            error={
              tried && 'error' in parsed ? t(`wp17.v.line.${parsed.error}`, { line: parsed.line }) : null
            }
          />
          <View style={s.row}>
            <Button
              label={t('wp17.save')}
              disabled={sal.busy}
              onPress={() => {
                setTried(true);
                if (yearBad || 'error' in parsed) return;
                const body = { season: f.season, seasonYear: Number(f.seasonYear), lines: parsed.lines };
                void sal.act(
                  t('wp17.p.updated'),
                  () =>
                    updatePurchasePlan(
                      sal.client!,
                      customerId,
                      x.id,
                      x.version,
                      body,
                      key.keyFor(`plan|${x.id}|${x.version}|${JSON.stringify(body)}`),
                    ),
                  () => (close(), reload()),
                );
              }}
            />
            <Button kind="ghost" label={t('wp17.cancel')} onPress={close} />
          </View>
        </View>
      ) : null}
      {mode === 'remove' ? (
        <View style={s.card}>
          <Text style={s.sub}>{t(draft ? 'wp17.p.deleteWhat' : 'wp17.p.closeWhat')}</Text>
          <View style={s.row}>
            <Button
              label={t(draft ? 'wp17.p.confirmDelete' : 'wp17.p.confirmClose')}
              disabled={sal.busy}
              onPress={() =>
                void sal.act(
                  t(draft ? 'wp17.p.deleted' : 'wp17.p.closed'),
                  () =>
                    draft
                      ? deletePurchasePlan(sal.client!, customerId, x.id, key.keyFor(`dplan|${x.id}`))
                      : closePurchasePlan(sal.client!, customerId, x.id, key.keyFor(`cplan|${x.id}`)),
                  () => (close(), reload()),
                )
              }
            />
            <Button kind="ghost" label={t('wp17.cancel')} onPress={close} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

// ---- total landholding --------------------------------------------------------------------------------------------------------------
export interface LandPlot {
  id: string;
  name: string;
  status: string;
  areaValue?: string;
  areaUnit?: string;
  version?: number;
}
/** Quick entry for the total land, like the web: the first plot ("Main plot"), or the area of the only plot. Several plots: one by one. */
export function TotalLand({
  customerId,
  farms,
}: {
  customerId: string;
  farms: { status: string; plots: LandPlot[] }[];
}) {
  const { t } = useTranslation();
  const { sal, key, reload } = useP17();
  const plots = farms
    .filter((f) => f.status === 'ACTIVE')
    .flatMap((f) => f.plots.filter((p) => p.status === 'ACTIVE'));
  const one = plots.length === 1 ? plots[0] : undefined;
  const [open, setOpen] = useState(false);
  const [area, setArea] = useState(one?.areaValue ? String(Number(one.areaValue)) : '');
  const [unit, setUnit] = useState(one?.areaUnit ?? 'ACRE');
  if (!sal.can(P17.farm)) return null;
  if (plots.length > 1) return <Text style={s.sub}>{t('wp17.l.several')}</Text>;
  const bad = !/^\d+(\.\d{1,2})?$/.test(area.trim()) || Number(area) <= 0;
  if (!open)
    return (
      <Button
        kind="ghost"
        label={t(one ? 'wp17.l.edit' : 'wp17.l.add')}
        onPress={() => (key.reset(), setOpen(true))}
      />
    );
  return (
    <View style={s.card}>
      <Text style={s.sub}>{one ? t('wp17.l.hintOne', { name: one.name }) : t('wp17.l.hintNew')}</Text>
      {sal.failure ? <Msg ok={false} text={sal.failure} /> : null}
      <Field
        label={t('wp17.l.area')}
        value={area}
        onChange={setArea}
        keyboard="decimal-pad"
        error={area && bad ? t('wp17.v.area') : null}
      />
      <Chips
        options={LAND_UNITS.map((u) => ({ value: u, label: t(`wp17.l.unit.${u}`) }))}
        value={unit}
        onChange={setUnit}
      />
      <View style={s.row}>
        <Button
          label={t('wp17.save')}
          disabled={sal.busy || bad || (one !== undefined && one.version === undefined)}
          onPress={() => {
            const areaValue = area.trim();
            void sal.act(
              t('wp17.l.saved'),
              () =>
                one
                  ? sal.client!.patch(`${base(customerId)}/plots/${enc(one.id)}`, {
                      body: { areaValue, areaUnit: unit },
                      version: one.version,
                      idempotencyKey: key.keyFor(`land|${one.id}|${one.version}|${areaValue}|${unit}`),
                    })
                  : sal.client!.post(`${base(customerId)}/plots`, {
                      body: { name: 'Main plot', areaValue, areaUnit: unit },
                      idempotencyKey: key.keyFor(`land|new|${areaValue}|${unit}`),
                    }),
              () => (setOpen(false), reload()),
            );
          }}
        />
        <Button kind="ghost" label={t('wp17.cancel')} onPress={() => setOpen(false)} />
      </View>
    </View>
  );
}

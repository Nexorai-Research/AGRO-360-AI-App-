import { useState } from 'react';
import { Text, View } from 'react-native';
import { useActionKey } from '@/ui/kit';
import { formatINR } from '@/money';
import { shortDate } from '../hr/logic';
import { Line, useFailureText } from '../hr/kit';
import {
  Area,
  Btn,
  Card,
  Check,
  Chips,
  Empty,
  Field,
  Msgs,
  Page,
  ProductPick,
  Read,
  blank,
  kit,
  today,
  tone,
  useBranches,
  useStk,
  useWarehouses,
  useWrite,
  validDay,
  validDec,
  type PickedProduct,
} from './kit';
import { checkRule, parseOpeningCsv } from './logic';

const money = (v: string | null | undefined) => (v === null || v === undefined ? null : formatINR(v));

// ---- Stock ledger: GET /inventory/ledger (inventory.view). Value is null without inventory.value.view and is then not shown.
interface Movement {
  businessDate: string;
  movementType: string;
  skuCode: string;
  batchNo: string | null;
  warehouseCode: string;
  qty: string;
  value: string | null;
  sourceType: string | null;
  reasonCode: string | null;
  runningBalance: string | null;
}
const MOVES = [
  'OPENING',
  'GRN_RECEIPT',
  'SALE_ISSUE',
  'TRANSFER_OUT',
  'TRANSFER_IN',
  'ADJUST_PLUS',
  'ADJUST_MINUS',
  'DAMAGE_WRITEOFF',
] as const;

export function LedgerScreen() {
  const { t, can } = useStk();
  const [type, setType] = useState('');
  const [product, setProduct] = useState<PickedProduct | null>(null);
  return (
    <Page title={t('stkLedger.title')} hint={t('stkLedger.hint')} allowed={can('inventory.view')}>
      <Chips
        label={t('stkLedger.type')}
        options={[
          { id: '', label: t('stkLedger.allTypes') },
          ...MOVES.map((m) => ({ id: m as string, label: m })),
        ]}
        value={type}
        onChange={setType}
      />
      <ProductPick label={t('stkLedger.product')} value={product} onPick={setProduct} />
      {product ? (
        <Btn kind="ghost" label={t('stkLedger.clearProduct')} onPress={() => setProduct(null)} />
      ) : null}
      <Read<{ items: Movement[]; currentBalance: string | null }>
        path="/inventory/ledger"
        query={{ limit: 100, type: type || undefined, product: product?.id }}
      >
        {(d) => (
          <>
            {d.items.length === 0 ? <Empty text={t('stkLedger.empty')} /> : null}
            {d.items.map((m, i) => (
              <Card key={i}>
                <Text style={kit.name}>
                  {m.movementType} · {m.qty}
                </Text>
                <Text style={kit.sub}>
                  {[
                    shortDate(m.businessDate),
                    m.skuCode + (m.batchNo ? ` / ${m.batchNo}` : ''),
                    m.warehouseCode,
                  ].join(' · ')}
                </Text>
                <Text style={kit.sub}>
                  {[
                    m.sourceType ? m.sourceType + (m.reasonCode ? ` (${m.reasonCode})` : '') : null,
                    m.runningBalance !== null ? t('stkLedger.balance', { qty: m.runningBalance }) : null,
                    money(m.value),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </Card>
            ))}
            {d.items.length >= 100 ? <Text style={kit.sub}>{t('stkLedger.more')}</Text> : null}
            <Text style={kit.sub}>
              {d.currentBalance !== null
                ? t('stkLedger.current', { qty: d.currentBalance })
                : t('stkLedger.pickOne')}
            </Text>
          </>
        )}
      </Read>
    </Page>
  );
}

// ---- Opening stock: GET/POST /inventory/opening, POST /inventory/opening/import (dryRun first). Needs inventory.opening.
interface Opening {
  id: string;
  asOnDate: string;
  warehouseId: string;
  lineCount: number;
  totalValue: string | null;
  late: boolean;
}

function OpeningForm() {
  const { t } = useStk();
  const w = useWrite();
  const whs = useWarehouses();
  const [wh, setWh] = useState('');
  const [asOn, setAsOn] = useState(today());
  const [product, setProduct] = useState<PickedProduct | null>(null);
  const [batchNo, setBatchNo] = useState('');
  const [expiry, setExpiry] = useState('');
  const [qty, setQty] = useState('');
  const [cost, setCost] = useState('');
  const [reason, setReason] = useState('');
  const ok =
    !!wh &&
    validDay(asOn) &&
    !!product &&
    validDec(qty) &&
    validDec(cost, 4, true) &&
    (expiry === '' || validDay(expiry));
  return (
    <Card>
      <Chips
        label={t('stkOpening.warehouse')}
        options={(whs.data ?? []).map((x) => ({ id: x.id, label: x.name }))}
        value={wh}
        onChange={setWh}
      />
      <Field
        label={t('stkOpening.asOn')}
        value={asOn}
        onChange={setAsOn}
        placeholder="YYYY-MM-DD"
        error={asOn && !validDay(asOn) ? t('stk.badDate') : null}
      />
      <ProductPick label={t('stkOpening.product')} value={product} onPick={setProduct} />
      <Field label={t('stkOpening.batch')} value={batchNo} onChange={setBatchNo} />
      <Field
        label={t('stkOpening.expiry')}
        value={expiry}
        onChange={setExpiry}
        placeholder="YYYY-MM-DD"
        error={expiry && !validDay(expiry) ? t('stk.badDate') : null}
      />
      <Field
        label={t('stkOpening.qty')}
        value={qty}
        onChange={setQty}
        keyboard="decimal-pad"
        error={qty && !validDec(qty) ? t('stk.badQty') : null}
      />
      <Field
        label={t('stkOpening.cost')}
        value={cost}
        onChange={setCost}
        keyboard="decimal-pad"
        error={cost && !validDec(cost, 4, true) ? t('stk.badAmount') : null}
      />
      <Field label={t('stkOpening.reason')} value={reason} onChange={setReason} />
      <Msgs w={w} />
      <Btn
        label={t('stkOpening.post')}
        disabled={w.busy || !ok}
        onPress={() =>
          void w.post(
            '/inventory/opening',
            {
              warehouseId: wh,
              asOnDate: asOn.trim(),
              lines: [
                {
                  skuId: product!.id,
                  qty: qty.trim(),
                  unitCost: cost.trim(),
                  ...(blank(batchNo) ? { batchNo: batchNo.trim() } : {}),
                  ...(blank(expiry) ? { expiryDate: expiry.trim() } : {}),
                },
              ],
              ...(blank(reason) ? { reason: reason.trim() } : {}),
            },
            t('stkOpening.posted'),
          )
        }
      />
    </Card>
  );
}

function OpeningImport() {
  const { t, client } = useStk();
  const w = useWrite();
  const failText = useFailureText();
  const dryKey = useActionKey();
  const whs = useWarehouses();
  const [wh, setWh] = useState('');
  const [asOn, setAsOn] = useState(today());
  const [csv, setCsv] = useState('');
  const [reason, setReason] = useState('');
  const [checked, setChecked] = useState<{ fp: string; lineCount: number; totalValue: string | null } | null>(
    null,
  );
  const [problem, setProblem] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const parsed = csv.trim() ? parseOpeningCsv(csv) : null;
  const body =
    parsed && 'lines' in parsed && wh && validDay(asOn)
      ? {
          warehouseId: wh,
          asOnDate: asOn.trim(),
          lines: parsed.lines,
          ...(blank(reason) ? { reason: reason.trim() } : {}),
        }
      : null;
  const fp = body ? JSON.stringify(body) : '';
  async function check() {
    if (!body || checking) return;
    setChecking(true);
    setProblem(null);
    try {
      const r = await client!.post<{ lineCount: number; totalValue: string | null }>(
        '/inventory/opening/import',
        { body: { ...body, dryRun: true }, idempotencyKey: dryKey.keyFor(fp) },
      );
      dryKey.reset();
      setChecked({ fp, lineCount: r.lineCount, totalValue: r.totalValue });
    } catch (e) {
      setChecked(null);
      setProblem(failText(e));
    } finally {
      setChecking(false);
    }
  }
  return (
    <Card>
      <Text style={kit.sub}>{t('stkOpening.csvHint')}</Text>
      <Chips
        label={t('stkOpening.warehouse')}
        options={(whs.data ?? []).map((x) => ({ id: x.id, label: x.name }))}
        value={wh}
        onChange={setWh}
      />
      <Field
        label={t('stkOpening.asOn')}
        value={asOn}
        onChange={setAsOn}
        placeholder="YYYY-MM-DD"
        error={asOn && !validDay(asOn) ? t('stk.badDate') : null}
      />
      <Area
        label={t('stkOpening.csv')}
        value={csv}
        onChange={(v) => {
          setCsv(v);
          setChecked(null);
        }}
      />
      <Field label={t('stkOpening.reason')} value={reason} onChange={setReason} />
      {parsed && 'error' in parsed ? (
        <Text style={tone.error}>{t(`stkOpening.csv_${parsed.error}`, { row: parsed.row ?? 0 })}</Text>
      ) : null}
      {problem ? <Text style={tone.error}>{problem}</Text> : null}
      <Btn label={t('stkOpening.check')} disabled={!body || checking} onPress={() => void check()} />
      {checked && checked.fp === fp ? (
        <Text style={tone.ok}>
          {t('stkOpening.checkedOk', { count: checked.lineCount, value: money(checked.totalValue) ?? '-' })}
        </Text>
      ) : null}
      <Msgs w={w} />
      <Btn
        label={t('stkOpening.postAll')}
        disabled={w.busy || !checked || checked.fp !== fp}
        onPress={() =>
          void w.post('/inventory/opening/import', body, t('stkOpening.posted'), { after: () => setCsv('') })
        }
      />
    </Card>
  );
}

export function OpeningScreen() {
  const { t, can } = useStk();
  const [mode, setMode] = useState<'one' | 'csv'>('one');
  const allowed = can('inventory.opening');
  return (
    <Page title={t('stkOpening.title')} hint={t('stkOpening.hint')} allowed={allowed}>
      <Chips
        label={t('stkOpening.how')}
        options={[
          { id: 'one' as const, label: t('stkOpening.oneLine') },
          { id: 'csv' as const, label: t('stkOpening.import') },
        ]}
        value={mode}
        onChange={setMode}
      />
      {mode === 'one' ? <OpeningForm /> : <OpeningImport />}
      <Read<{ items: Opening[] }> path="/inventory/opening" enabled={allowed}>
        {(d) => (
          <>
            {d.items.length === 0 ? <Empty text={t('stkOpening.empty')} /> : null}
            {d.items.map((o) => (
              <Card key={o.id}>
                <Text style={kit.name}>{t('stkOpening.asOnLine', { date: shortDate(o.asOnDate) })}</Text>
                <Line label={t('stkOpening.lines')} value={String(o.lineCount)} />
                {money(o.totalValue) ? (
                  <Line label={t('stkOpening.value')} value={money(o.totalValue)!} />
                ) : null}
                {o.late ? <Text style={tone.warn}>{t('stkOpening.late')}</Text> : null}
              </Card>
            ))}
          </>
        )}
      </Read>
    </Page>
  );
}

// ---- Expiry and extensions: GET /inventory/batches (expiringWithinDays, expired), /inventory/batch-extensions, POST .../extend, .../approve, .../reject, /inventory/jobs/run.
interface ExpBatch {
  id: string;
  skuCode: string;
  skuName: string;
  batchNo: string;
  expiryDate: string | null;
  daysToExpiry: number | null;
  onHand: string;
  valueAtRisk: string | null;
  status: string;
}
interface Ext {
  id: string;
  skuCode: string;
  batchNo: string;
  newExpiry: string;
  reason: string;
  documentRef: string;
}

function ExtendForm({ b, onDone }: { b: ExpBatch; onDone: () => void }) {
  const { t } = useStk();
  const w = useWrite();
  const [d, setD] = useState('');
  const [reason, setReason] = useState('');
  const [doc, setDoc] = useState('');
  const ok = validDay(d) && reason.trim().length >= 3 && doc.trim().length > 0;
  return (
    <Card>
      <Text style={kit.sub}>{t('stkExpiry.extendHint')}</Text>
      <Field
        label={t('stkExpiry.newExpiry')}
        value={d}
        onChange={setD}
        placeholder="YYYY-MM-DD"
        error={d && !validDay(d) ? t('stk.badDate') : null}
      />
      <Field label={t('stkExpiry.reason')} value={reason} onChange={setReason} />
      <Field label={t('stkExpiry.doc')} value={doc} onChange={setDoc} />
      <Msgs w={w} />
      <Btn
        label={t('stkExpiry.send')}
        disabled={w.busy || !ok}
        onPress={() =>
          void w.post(
            `/inventory/batches/${b.id}/extend`,
            { newExpiry: d.trim(), reason: reason.trim(), documentRef: doc.trim() },
            t('stkExpiry.sent'),
            { after: onDone },
          )
        }
      />
    </Card>
  );
}

function BatchList({ items }: { items: ExpBatch[] }) {
  const { t, can } = useStk();
  const [ext, setExt] = useState<string | null>(null);
  if (items.length === 0) return <Empty text={t('stkExpiry.none')} />;
  return (
    <>
      {items.map((b) => (
        <Card key={b.id}>
          <Text style={kit.name}>
            {b.skuCode} {b.skuName}
          </Text>
          <Text style={kit.sub}>
            {[
              t('stkExpiry.batch', { no: b.batchNo }),
              b.expiryDate ? shortDate(b.expiryDate) : '-',
              b.daysToExpiry !== null ? t('stkExpiry.days', { count: b.daysToExpiry }) : null,
              b.status,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
          <Line label={t('stkExpiry.onHand')} value={b.onHand} />
          {money(b.valueAtRisk) ? <Line label={t('stkExpiry.atRisk')} value={money(b.valueAtRisk)!} /> : null}
          {can('inventory.batch.manage') && ['EXPIRED', 'ACTIVE', 'QUARANTINED'].includes(b.status) ? (
            <Btn
              kind="ghost"
              label={t('stkExpiry.request', { no: b.batchNo })}
              onPress={() => setExt(ext === b.id ? null : b.id)}
            />
          ) : null}
          {ext === b.id ? <ExtendForm b={b} onDone={() => setExt(null)} /> : null}
        </Card>
      ))}
    </>
  );
}

function Pending({ x }: { x: Ext }) {
  const { t, can } = useStk();
  const w = useWrite();
  const [note, setNote] = useState('');
  const [deciding, setDeciding] = useState<'approve' | 'reject' | null>(null);
  return (
    <Card>
      <Text style={kit.name}>
        {x.skuCode} / {x.batchNo}
      </Text>
      <Text style={kit.sub}>
        {t('stkExpiry.newLine', { date: shortDate(x.newExpiry) })} · {x.reason} · {x.documentRef}
      </Text>
      {can('inventory.batch.extend.approve') ? (
        <View style={kit.row}>
          <Btn label={t('stkExpiry.approve')} onPress={() => setDeciding('approve')} />
          <Btn kind="ghost" label={t('stkExpiry.reject')} onPress={() => setDeciding('reject')} />
        </View>
      ) : null}
      {deciding ? (
        <>
          <Field label={t('stkExpiry.note')} value={note} onChange={setNote} />
          <Msgs w={w} />
          <Btn
            label={t(deciding === 'approve' ? 'stkExpiry.approveNow' : 'stkExpiry.rejectNow')}
            disabled={w.busy || note.trim().length < 3}
            onPress={() =>
              void w.post(
                `/inventory/batch-extensions/${x.id}/${deciding}`,
                { note: note.trim() },
                t(deciding === 'approve' ? 'stkExpiry.approved' : 'stkExpiry.rejected'),
              )
            }
          />
        </>
      ) : null}
    </Card>
  );
}

export function ExpiryScreen() {
  const { t, can } = useStk();
  const w = useWrite();
  const [tab, setTab] = useState<'soon' | 'expired' | 'pending'>('soon');
  return (
    <Page title={t('stkExpiry.title')} hint={t('stkExpiry.hint')} allowed={can('inventory.view')}>
      <Chips
        label={t('stkExpiry.show')}
        options={(['soon', 'expired', 'pending'] as const).map((k) => ({
          id: k,
          label: t(`stkExpiry.tab_${k}`),
        }))}
        value={tab}
        onChange={setTab}
      />
      {can('inventory.jobs.run') ? (
        <Btn
          kind="ghost"
          label={t('stkExpiry.runJobs')}
          disabled={w.busy}
          onPress={() => void w.post('/inventory/jobs/run', undefined, t('stkExpiry.jobsDone'))}
        />
      ) : null}
      <Msgs w={w} />
      {tab === 'soon' ? (
        <Read<{ items: ExpBatch[] }> path="/inventory/batches" query={{ expiringWithinDays: 60, limit: 200 }}>
          {(d) => <BatchList items={d.items} />}
        </Read>
      ) : null}
      {tab === 'expired' ? (
        <Read<{ items: ExpBatch[] }> path="/inventory/batches" query={{ expired: 'true', limit: 200 }}>
          {(d) => <BatchList items={d.items} />}
        </Read>
      ) : null}
      {tab === 'pending' ? (
        <Read<{ items: Ext[] }> path="/inventory/batch-extensions" query={{ status: 'PENDING' }}>
          {(d) =>
            d.items.length === 0 ? (
              <Empty text={t('stkExpiry.noPending')} />
            ) : (
              <>
                {d.items.map((x) => (
                  <Pending key={x.id} x={x} />
                ))}
              </>
            )
          }
        </Read>
      ) : null}
    </Page>
  );
}

// ---- Reorder levels and low-stock alerts: GET /alerts, GET/PUT/DELETE /inventory/reorder-rules, GET /inventory/reorder-suggestion.
interface Rule {
  skuId: string;
  branchId: string | null;
  skuCode: string;
  skuName: string;
  branchName: string | null;
  minQty: string;
  reorderLevel: string;
  maxQty: string;
  reorderQty: string;
}
interface Alert {
  id?: string;
  skuCode: string;
  skuName: string;
  branchName: string;
  qty: string;
  threshold: string;
  openedAt: string;
}
interface Suggestion {
  suggestedMinQty: string;
  suggestedReorderLevel: string;
  suggestedMaxQty: string;
  suggestedReorderQty: string;
}

function RuleForm({ preset, onDone }: { preset?: Rule; onDone: () => void }) {
  const { t, client } = useStk();
  const w = useWrite();
  const failText = useFailureText();
  const branches = useBranches();
  const [product, setProduct] = useState<PickedProduct | null>(
    preset ? { id: preset.skuId, code: preset.skuCode, name: preset.skuName } : null,
  );
  const [branch, setBranch] = useState(preset?.branchId ?? '');
  const [f, setF] = useState({
    minQty: preset?.minQty ?? '',
    reorderLevel: preset?.reorderLevel ?? '',
    maxQty: preset?.maxQty ?? '',
    reorderQty: preset?.reorderQty ?? '',
  });
  const [lead, setLead] = useState('7');
  const [safety, setSafety] = useState('3');
  const [problem, setProblem] = useState<string | null>(null);
  const err = checkRule(f);
  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });
  async function suggest() {
    setProblem(null);
    try {
      const s = await client!.get<Suggestion>('/inventory/reorder-suggestion', {
        query: { product: product!.id, branch, leadTimeDays: lead, safetyDays: safety },
      });
      setF({
        minQty: s.suggestedMinQty,
        reorderLevel: s.suggestedReorderLevel,
        maxQty: s.suggestedMaxQty,
        reorderQty: s.suggestedReorderQty,
      });
    } catch (e) {
      setProblem(failText(e));
    }
  }
  return (
    <Card>
      <ProductPick label={t('stkReorder.product')} value={product} onPick={setProduct} />
      <Chips
        label={t('stkReorder.branch')}
        options={[
          { id: '', label: t('stkReorder.allBranches') },
          ...(branches.data ?? []).map((b) => ({ id: b.id, label: b.name })),
        ]}
        value={branch}
        onChange={setBranch}
      />
      <Field label={t('stkReorder.min')} value={f.minQty} onChange={set('minQty')} keyboard="decimal-pad" />
      <Field
        label={t('stkReorder.level')}
        value={f.reorderLevel}
        onChange={set('reorderLevel')}
        keyboard="decimal-pad"
      />
      <Field label={t('stkReorder.max')} value={f.maxQty} onChange={set('maxQty')} keyboard="decimal-pad" />
      <Field
        label={t('stkReorder.qty')}
        value={f.reorderQty}
        onChange={set('reorderQty')}
        keyboard="decimal-pad"
      />
      {f.minQty && f.reorderLevel && f.maxQty && f.reorderQty && err ? (
        <Text style={tone.error}>{t(`stkReorder.err_${err}`)}</Text>
      ) : null}
      <Text style={kit.sub}>{t('stkReorder.suggestHint')}</Text>
      <Field label={t('stkReorder.lead')} value={lead} onChange={setLead} keyboard="numeric" />
      <Field label={t('stkReorder.safety')} value={safety} onChange={setSafety} keyboard="numeric" />
      <Btn
        kind="ghost"
        label={t('stkReorder.suggest')}
        disabled={!product || !branch || !/^\d+$/.test(lead) || !/^\d+$/.test(safety)}
        onPress={() => void suggest()}
      />
      {problem ? <Text style={tone.error}>{problem}</Text> : null}
      <Msgs w={w} />
      <Btn
        label={t('stkReorder.save')}
        disabled={w.busy || !product || err !== null}
        onPress={() =>
          void w.put(
            '/inventory/reorder-rules',
            {
              rules: [
                {
                  skuId: product!.id,
                  ...(branch ? { branchId: branch } : {}),
                  minQty: f.minQty.trim(),
                  reorderLevel: f.reorderLevel.trim(),
                  maxQty: f.maxQty.trim(),
                  reorderQty: f.reorderQty.trim(),
                },
              ],
            },
            t('stkReorder.saved'),
            { after: onDone },
          )
        }
      />
    </Card>
  );
}

export function ReorderScreen() {
  const { t, can } = useStk();
  const w = useWrite();
  const [form, setForm] = useState<Rule | 'new' | null>(null);
  const manage = can('inventory.reorder.manage');
  return (
    <Page title={t('stkReorder.title')} hint={t('stkReorder.hint')} allowed={can('inventory.view')}>
      <Text style={kit.name}>{t('stkReorder.alerts')}</Text>
      <Read<{ items: Alert[] }> path="/alerts" query={{ type: 'LOW_STOCK' }}>
        {(d) => (
          <>
            {d.items.length === 0 ? <Empty text={t('stkReorder.noAlerts')} /> : null}
            {d.items.map((a, i) => (
              <Card key={i}>
                <Text style={kit.name}>
                  {a.skuCode} {a.skuName}
                </Text>
                <Text style={kit.sub}>
                  {[
                    a.branchName,
                    t('stkReorder.avail', { qty: a.qty }),
                    t('stkReorder.levelIs', { qty: a.threshold }),
                    shortDate(a.openedAt),
                  ].join(' · ')}
                </Text>
              </Card>
            ))}
          </>
        )}
      </Read>
      <Text style={kit.name}>{t('stkReorder.rules')}</Text>
      {manage ? <Btn label={t('stkReorder.set')} onPress={() => setForm(form ? null : 'new')} /> : null}
      <Msgs w={w} />
      {form ? (
        <RuleForm
          key={form === 'new' ? 'new' : `${form.skuId}|${form.branchId}`}
          preset={form === 'new' ? undefined : form}
          onDone={() => setForm(null)}
        />
      ) : null}
      <Read<{ items: Rule[] }> path="/inventory/reorder-rules" query={{ limit: 200 }}>
        {(d) => (
          <>
            {d.items.length === 0 ? <Empty text={t('stkReorder.noRules')} /> : null}
            {d.items.map((r) => (
              <Card key={`${r.skuId}|${r.branchId}`}>
                <Text style={kit.name}>
                  {r.skuCode} {r.skuName}
                </Text>
                <Text style={kit.sub}>{r.branchName ?? t('stkReorder.allBranches')}</Text>
                <Line label={t('stkReorder.min')} value={r.minQty} />
                <Line label={t('stkReorder.level')} value={r.reorderLevel} />
                <Line label={t('stkReorder.max')} value={r.maxQty} />
                <Line label={t('stkReorder.qty')} value={r.reorderQty} />
                {manage ? (
                  <View style={kit.row}>
                    <Btn kind="ghost" label={t('stkReorder.edit')} onPress={() => setForm(r)} />
                    {r.branchId ? (
                      <Btn
                        kind="ghost"
                        label={t('stkReorder.remove')}
                        disabled={w.busy}
                        onPress={() =>
                          void w.del(
                            `/inventory/reorder-rules/${r.skuId}/${r.branchId}`,
                            undefined,
                            t('stkReorder.removed'),
                          )
                        }
                      />
                    ) : null}
                  </View>
                ) : null}
              </Card>
            ))}
          </>
        )}
      </Read>
    </Page>
  );
}

// ---- Valuation: GET /inventory/valuation (inventory.value.view).
interface ValRow {
  skuCode: string;
  skuName: string;
  branchName: string;
  warehouseCode?: string;
  qty: string;
  avgCost: string | null;
  value: string;
}
interface Valuation {
  asOn: string;
  totalValue: string;
  totalQty: string;
  valuedBy: string;
  warning?: string | null;
  rows: ValRow[];
}

export function ValuationScreen() {
  const { t, can } = useStk();
  const [asOn, setAsOn] = useState('');
  const [groupBy, setGroupBy] = useState<'sku' | 'warehouse'>('sku');
  const dateOk = asOn === '' || validDay(asOn);
  return (
    <Page title={t('stkValuation.title')} hint={t('stkValuation.hint')} allowed={can('inventory.value.view')}>
      <Field
        label={t('stkValuation.asOn')}
        value={asOn}
        onChange={setAsOn}
        placeholder="YYYY-MM-DD"
        error={dateOk ? null : t('stk.badDate')}
      />
      <Chips
        label={t('stkValuation.group')}
        options={[
          { id: 'sku' as const, label: t('stkValuation.bySku') },
          { id: 'warehouse' as const, label: t('stkValuation.byWarehouse') },
        ]}
        value={groupBy}
        onChange={setGroupBy}
      />
      <Read<Valuation>
        path="/inventory/valuation"
        query={{ asOn: asOn.trim() || undefined, groupBy }}
        enabled={dateOk}
      >
        {(d) => (
          <>
            {d.warning ? <Text style={tone.warn}>{d.warning}</Text> : null}
            <Card>
              <Line
                label={t('stkValuation.total', { date: shortDate(d.asOn) })}
                value={formatINR(d.totalValue)}
                strong
              />
              <Line label={t('stkValuation.qty')} value={d.totalQty} />
              <Text style={kit.sub}>
                {t('stkValuation.valuedBy', { method: d.valuedBy.replace('_', ' ').toLowerCase() })}
              </Text>
            </Card>
            {d.rows.length === 0 ? <Empty text={t('stkValuation.empty')} /> : null}
            {d.rows.map((r, i) => (
              <Card key={i}>
                <Text style={kit.name}>
                  {r.skuCode} {r.skuName}
                </Text>
                <Text style={kit.sub}>{r.branchName + (r.warehouseCode ? ` / ${r.warehouseCode}` : '')}</Text>
                <Line label={t('stkValuation.qty')} value={r.qty} />
                {r.avgCost !== null ? (
                  <Line label={t('stkValuation.avg')} value={formatINR(r.avgCost, 4)} />
                ) : null}
                <Line label={t('stkValuation.value')} value={formatINR(r.value)} strong />
              </Card>
            ))}
          </>
        )}
      </Read>
    </Page>
  );
}

// ---- Write off: POST /inventory/damage/write-off from a damaged or quarantine warehouse (inventory.damage). The server applies the approval limit.
const WRITE_OFF_REASONS = ['DAMAGED', 'LEAKAGE', 'PEST', 'MOISTURE', 'EXPIRED', 'OTHER'] as const;
export function WriteOffScreen() {
  const { t, can } = useStk();
  const w = useWrite();
  const whs = useWarehouses();
  const [wh, setWh] = useState('');
  const [product, setProduct] = useState<PickedProduct | null>(null);
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState('');
  const [sure, setSure] = useState(false);
  const list = (whs.data ?? []).filter((x) => x.sellable === false || x.sellable === undefined);
  const ok = !!wh && !!product && validDec(qty) && !!reason && sure;
  return (
    <Page title={t('stkWriteOff.title')} hint={t('stkWriteOff.hint')} allowed={can('inventory.damage')}>
      <Card>
        <Chips
          label={t('stkWriteOff.warehouse')}
          options={list.map((x) => ({ id: x.id, label: x.name }))}
          value={wh}
          onChange={setWh}
        />
        <ProductPick label={t('stkWriteOff.product')} value={product} onPick={setProduct} />
        <Field
          label={t('stkWriteOff.qty')}
          value={qty}
          onChange={setQty}
          keyboard="decimal-pad"
          error={qty && !validDec(qty) ? t('stk.badQty') : null}
        />
        <Chips
          label={t('stkWriteOff.reason')}
          options={WRITE_OFF_REASONS.map((r) => ({ id: r as string, label: r }))}
          value={reason}
          onChange={setReason}
        />
        <Check label={t('stkWriteOff.sure')} value={sure} onChange={setSure} />
        <Msgs w={w} />
        <Btn
          label={t('stkWriteOff.go')}
          disabled={w.busy || !ok}
          onPress={() =>
            void w.post(
              '/inventory/damage/write-off',
              { warehouseId: wh, reasonCode: reason, lines: [{ skuId: product!.id, qty: qty.trim() }] },
              t('stkWriteOff.done'),
              {
                after: () => {
                  setSure(false);
                  setQty('');
                },
              },
            )
          }
        />
      </Card>
    </Page>
  );
}

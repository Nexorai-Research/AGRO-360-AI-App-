import { useState } from 'react';
import { Text, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { dec, formatINR } from '@/money';
import { useActionKey } from '@/ui/kit';
import { colors } from '@/ui/theme';
import { useFailureText } from '../hr/kit';
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
  Read,
  kit,
  today,
  tone,
  useBranches,
  useStk,
  useWrite,
  validDay,
} from './kit';
import { BillsScreen, SupplierPick, type Supplier } from './PurchaseScreens';

// Web parity, phase 2. apps/web/src/pages/{products,purchase}.js; modules/catalogue/src/domain/catalogue.ts (parseAssignments,
// parseBulkTax) and modules/procurement/src/application/adjustments.ts (parseSupplierAdjustment).

// ---- 2.4 price list assignments --------------------------------------------------------------------------------------------
export const SCOPES = ['CUSTOMER', 'CUSTOMER_CATEGORY'] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** One per line "SCOPE:id" like the web; refuses an unknown scope, a bad id or a line given twice. */
export function parseAssignmentLines(
  text: string,
): { rows: { scope: string; refId: string }[] } | { badLine: number } {
  const rows: { scope: string; refId: string }[] = [];
  const seen = new Set<string>();
  const lines = text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  for (const [i, ln] of lines.entries()) {
    const at = ln.indexOf(':');
    const scope = at < 0 ? '' : ln.slice(0, at).trim().toUpperCase();
    const refId = at < 0 ? '' : ln.slice(at + 1).trim();
    if (!(SCOPES as readonly string[]).includes(scope) || !UUID.test(refId) || seen.has(`${scope}:${refId}`))
      return { badLine: i + 1 };
    seen.add(`${scope}:${refId}`);
    rows.push({ scope, refId });
  }
  if (rows.length > 500) return { badLine: 501 };
  return { rows };
}

export function AssignmentsCard({
  x,
  onDone,
}: {
  x: { id: string; version: number; assignments: unknown[] };
  onDone: () => void;
}) {
  const { t } = useStk();
  const w = useWrite();
  const current = (x.assignments as { scope?: string; refId?: string }[])
    .filter((a) => a.scope && a.refId)
    .map((a) => `${a.scope}:${a.refId}`)
    .join('\n');
  const [text, setText] = useState(current);
  const parsed = parseAssignmentLines(text);
  return (
    <Card>
      <Text style={kit.sub}>{t('wp2.assign.hint')}</Text>
      <Area label={t('wp2.assign.lines')} value={text} onChange={setText} />
      {'badLine' in parsed ? (
        <Text style={tone.error}>{t('wp2.assign.badLine', { n: parsed.badLine })}</Text>
      ) : null}
      <Msgs w={w} />
      <Btn
        label={t('wp2.assign.save')}
        disabled={w.busy || !('rows' in parsed)}
        onPress={() =>
          'rows' in parsed
            ? void w.put(
                `/price-lists/${x.id}/assignments`,
                { assignments: parsed.rows },
                t('wp2.assign.saved'),
                {
                  version: x.version,
                  after: onDone,
                },
              )
            : undefined
        }
      />
    </Card>
  );
}

// ---- 2.5 bulk tax update ---------------------------------------------------------------------------------------------------
const HSN = /^[0-9]{4}([0-9]{2}([0-9]{2})?)?$/;
const TAX = /^[A-Z0-9_]{2,20}$/;
export interface BulkTaxForm {
  effectiveFrom: string;
  categoryId: string;
  fromHsn: string;
  hsnCode: string;
  taxCode: string;
  hsnConfirmed: boolean;
  dryRun: boolean;
}
export type BulkTaxError = 'date' | 'today' | 'pick' | 'fromHsn' | 'set' | 'hsn' | 'tax';
/** The web: a tax change cannot be dated in the past or the future, it applies from today. */
export function bulkTaxErrors(f: BulkTaxForm, todayDay: string = today()): BulkTaxError[] {
  const e: BulkTaxError[] = [];
  if (!validDay(f.effectiveFrom)) e.push('date');
  else if (f.effectiveFrom.trim() !== todayDay) e.push('today');
  if (!f.categoryId && !f.fromHsn.trim()) e.push('pick');
  if (f.fromHsn.trim() && !/^[0-9]{4,8}$/.test(f.fromHsn.trim())) e.push('fromHsn');
  if (!f.hsnCode.trim() && !f.taxCode.trim()) e.push('set');
  if (f.hsnCode.trim() && !HSN.test(f.hsnCode.trim())) e.push('hsn');
  if (f.taxCode.trim() && !TAX.test(f.taxCode.trim().toUpperCase())) e.push('tax');
  return e;
}
export const bulkTaxBody = (f: BulkTaxForm) => ({
  effectiveFrom: f.effectiveFrom.trim(),
  ...(f.categoryId ? { categoryId: f.categoryId } : {}),
  ...(f.fromHsn.trim() ? { fromHsn: f.fromHsn.trim() } : {}),
  set: {
    ...(f.hsnCode.trim() ? { hsnCode: f.hsnCode.trim() } : {}),
    ...(f.taxCode.trim() ? { taxCode: f.taxCode.trim().toUpperCase() } : {}),
  },
  ...(f.hsnConfirmed ? { hsnConfirmed: true } : {}),
  dryRun: f.dryRun,
});
interface BulkResult {
  dryRun: boolean;
  matched: number;
  changed: number;
  unchanged: number;
  sample?: { code: string; name: string }[];
}

export function BulkTaxCard() {
  const { t, client, userId, ready } = useStk();
  const qc = useQueryClient();
  const key = useActionKey();
  const failText = useFailureText();
  const [f, setF] = useState<BulkTaxForm>({
    effectiveFrom: today(),
    categoryId: '',
    fromHsn: '',
    hsnCode: '',
    taxCode: '',
    hsnConfirmed: false,
    dryRun: true,
  });
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [res, setRes] = useState<BulkResult | null>(null);
  const cats = useQuery({
    queryKey: ['stk', userId, 'bulk-cats'],
    queryFn: async ({ signal }) =>
      (await client!.get<{ items: { id: string; name: string }[] }>('/product-categories', { signal })).items,
    enabled: ready,
    staleTime: 5 * 60_000,
  });
  const errs = bulkTaxErrors(f);
  const bad = (e: BulkTaxError) => (tried && errs.includes(e) ? t(`wp2.tax.v.${e}`) : null);
  async function run() {
    setTried(true);
    if (bulkTaxErrors(f).length > 0 || busy) return;
    const body = bulkTaxBody(f);
    setBusy(true);
    setFailure(null);
    try {
      const r = await client!.post<BulkResult>('/products/bulk-tax-update', {
        body,
        idempotencyKey: key.keyFor(JSON.stringify(body)),
      });
      key.reset();
      setRes(r);
      if (!r.dryRun) void qc.invalidateQueries({ queryKey: ['stk'] });
    } catch (e) {
      setFailure(failText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      <Text style={kit.name}>{t('wp2.tax.title')}</Text>
      <Text style={kit.sub}>{t('wp2.tax.hint')}</Text>
      <Field
        label={t('wp2.tax.from')}
        value={f.effectiveFrom}
        onChange={(v) => setF({ ...f, effectiveFrom: v })}
        placeholder="YYYY-MM-DD"
        error={bad('date') ?? bad('today')}
      />
      {cats.data ? (
        <Chips
          label={t('wp2.tax.category')}
          options={[
            { id: '', label: t('wp2.tax.anyCategory') },
            ...cats.data.map((c) => ({ id: c.id, label: c.name })),
          ]}
          value={f.categoryId}
          onChange={(v) => setF({ ...f, categoryId: v })}
        />
      ) : null}
      <Field
        label={t('wp2.tax.fromHsn')}
        value={f.fromHsn}
        onChange={(v) => setF({ ...f, fromHsn: v })}
        keyboard="numeric"
        error={bad('fromHsn') ?? bad('pick')}
      />
      <Field
        label={t('wp2.tax.newHsn')}
        value={f.hsnCode}
        onChange={(v) => setF({ ...f, hsnCode: v })}
        keyboard="numeric"
        error={bad('hsn') ?? bad('set')}
      />
      <Field
        label={t('wp2.tax.newTax')}
        value={f.taxCode}
        onChange={(v) => setF({ ...f, taxCode: v })}
        error={bad('tax')}
      />
      <Check
        label={t('wp2.tax.confirmHsn')}
        value={f.hsnConfirmed}
        onChange={(v) => setF({ ...f, hsnConfirmed: v })}
      />
      <Check label={t('wp2.tax.preview')} value={f.dryRun} onChange={(v) => setF({ ...f, dryRun: v })} />
      {failure ? <Text style={tone.error}>{failure}</Text> : null}
      <Btn
        label={f.dryRun ? t('wp2.tax.runPreview') : t('wp2.tax.runNow')}
        disabled={busy}
        onPress={() => void run()}
      />
      {res ? (
        <View style={{ gap: 4 }}>
          <Text style={tone.ok}>
            {t(res.dryRun ? 'wp2.tax.previewDone' : 'wp2.tax.done', {
              matched: res.matched,
              changed: res.changed,
              unchanged: res.unchanged,
            })}
          </Text>
          {(res.sample ?? []).map((s) => (
            <Text key={s.code} style={kit.sub}>
              {s.code} {s.name}
            </Text>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

// ---- 2.1 supplier credit / debit notes ---------------------------------------------------------------------------------------
export type NoteKind = 'REDUCTION' | 'INCREASE';
/** A credit note (we owe less) may only use 5040; a debit note (we owe more) 5040 or 6030. Blank = the server default. */
export const NOTE_ACCOUNTS: Record<NoteKind, readonly string[]> = {
  REDUCTION: ['5040'],
  INCREASE: ['5040', '6030'],
};
export interface NoteForm {
  supplierId: string;
  branchId: string;
  kind: NoteKind;
  billId: string;
  taxable: string;
  accountCode: string;
  gstDocument: boolean;
  supplierDocNo: string;
  supplierDocDate: string;
  cgst: string;
  sgst: string;
  igst: string;
  adjustmentDate: string;
  reason: string;
}
export type NoteError =
  | 'supplier'
  | 'branch'
  | 'bill'
  | 'noBill'
  | 'taxable'
  | 'account'
  | 'tax'
  | 'taxNeedsDoc'
  | 'doc'
  | 'both'
  | 'date'
  | 'reason';
const money2 = (v: string) => /^\d{1,12}(\.\d{1,2})?$/.test(v.trim());
export function noteErrors(f: NoteForm): NoteError[] {
  const e: NoteError[] = [];
  if (!f.supplierId) e.push('supplier');
  if (!f.branchId) e.push('branch');
  if (f.kind === 'REDUCTION' && !f.billId) e.push('bill');
  if (f.kind === 'INCREASE' && f.billId) e.push('noBill');
  if (!money2(f.taxable) || dec(f.taxable).lte(0)) e.push('taxable');
  if (f.accountCode && !NOTE_ACCOUNTS[f.kind].includes(f.accountCode)) e.push('account');
  const taxes = [f.cgst, f.sgst, f.igst].map((x) => x.trim());
  if (taxes.some((x) => x !== '' && !money2(x))) e.push('tax');
  const pos = (x: string) => x.trim() !== '' && money2(x) && dec(x).gt(0);
  const anyTax = pos(f.cgst) || pos(f.sgst) || pos(f.igst);
  if (anyTax && !f.gstDocument) e.push('taxNeedsDoc');
  if (
    f.gstDocument &&
    (!f.supplierDocNo.trim() || f.supplierDocNo.trim().length > 60 || !validDay(f.supplierDocDate))
  )
    e.push('doc');
  if (pos(f.igst) && (pos(f.cgst) || pos(f.sgst))) e.push('both');
  if (f.adjustmentDate.trim() && !validDay(f.adjustmentDate)) e.push('date');
  const r = f.reason.trim();
  if (r.length < 3 || r.length > 500) e.push('reason');
  return e;
}
/** Same body as the web: tax only when some tax was keyed; document fields only with the GST document. */
export function noteBody(f: NoteForm) {
  const pos = (x: string) => x.trim() !== '' && dec(x).gt(0);
  const tax = pos(f.cgst) || pos(f.sgst) || pos(f.igst);
  return {
    supplierId: f.supplierId,
    branchId: f.branchId,
    kind: f.kind,
    ...(f.billId ? { billId: f.billId } : {}),
    taxable: f.taxable.trim(),
    ...(f.accountCode ? { accountCode: f.accountCode } : {}),
    gstDocument: f.gstDocument,
    ...(f.gstDocument
      ? { supplierDocNo: f.supplierDocNo.trim(), supplierDocDate: f.supplierDocDate.trim() }
      : {}),
    ...(tax ? { cgst: f.cgst.trim() || '0', sgst: f.sgst.trim() || '0', igst: f.igst.trim() || '0' } : {}),
    ...(f.adjustmentDate.trim() ? { adjustmentDate: f.adjustmentDate.trim() } : {}),
    reason: f.reason.trim(),
  };
}
interface NoteRow {
  id: string;
  number: string;
  supplierId: string;
  supplierName?: string | null;
  kind: NoteKind;
  billNumber?: string | null;
  taxable: string;
  taxTotal?: string;
  total: string;
  adjustmentDate: string;
  reason: string;
}
interface OpenBill {
  id: string;
  number: string | null;
  supplierId?: string;
  supplierName: string;
  outstanding: string;
  status: string;
  kind?: string;
}
const emptyNote = (): NoteForm => ({
  supplierId: '',
  branchId: '',
  kind: 'REDUCTION',
  billId: '',
  taxable: '',
  accountCode: '',
  gstDocument: false,
  supplierDocNo: '',
  supplierDocDate: '',
  cgst: '',
  sgst: '',
  igst: '',
  adjustmentDate: today(),
  reason: '',
});

function NoteFormCard({ onPosted, onClose }: { onPosted: () => void; onClose: () => void }) {
  const { t, client, userId, ready } = useStk();
  const qc = useQueryClient();
  const key = useActionKey();
  const failText = useFailureText();
  const branches = useBranches();
  const [f, setF] = useState<NoteForm>(emptyNote());
  const [sup, setSup] = useState<Pick<Supplier, 'id' | 'name'> | null>(null);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const bills = useQuery({
    queryKey: ['stk', userId, 'open-bills'],
    queryFn: async ({ signal }) =>
      (
        await client!.get<{ items: OpenBill[] }>('/procurement/purchase-bills', {
          query: { open: 'true', limit: 200 },
          signal,
        })
      ).items.filter((b) => b.status === 'POSTED' && b.kind !== 'ADJUSTMENT'),
    enabled: ready && f.kind === 'REDUCTION',
  });
  const errs = noteErrors(f);
  const bad = (e: NoteError) => (tried && errs.includes(e) ? t(`wp2.note.v.${e}`) : null);
  const set = (k: keyof NoteForm) => (v: string) => setF({ ...f, [k]: v });
  const shownBills = (bills.data ?? []).filter(
    (b) => !f.supplierId || !b.supplierId || b.supplierId === f.supplierId,
  );
  async function save() {
    setTried(true);
    if (noteErrors(f).length > 0 || busy) return;
    const body = noteBody(f);
    setBusy(true);
    setFailure(null);
    try {
      await client!.post<NoteRow>('/procurement/supplier-adjustments', {
        body,
        idempotencyKey: key.keyFor(JSON.stringify(body)),
      });
      key.reset();
      void qc.invalidateQueries({ queryKey: ['stk'] });
      onPosted();
    } catch (e) {
      setFailure(failText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      <Text style={kit.sub}>{t('wp2.note.intro')}</Text>
      <SupplierPick value={sup} onPick={(s) => (setSup(s), setF({ ...f, supplierId: s.id, billId: '' }))} />
      {bad('supplier') ? <Text style={tone.error}>{bad('supplier')}</Text> : null}
      {branches.data ? (
        <Chips
          label={t('wp2.note.branch')}
          options={branches.data.map((b) => ({ id: b.id, label: b.name }))}
          value={f.branchId}
          onChange={set('branchId')}
        />
      ) : null}
      {bad('branch') ? <Text style={tone.error}>{bad('branch')}</Text> : null}
      <Chips
        label={t('wp2.note.kind')}
        options={[
          { id: 'REDUCTION', label: t('wp2.note.reduction') },
          { id: 'INCREASE', label: t('wp2.note.increase') },
        ]}
        value={f.kind}
        onChange={(v) => setF({ ...f, kind: v as NoteKind, billId: '', accountCode: '' })}
      />
      {f.kind === 'REDUCTION' ? (
        <>
          <Chips
            label={t('wp2.note.bill')}
            options={shownBills.map((b) => ({
              id: b.id,
              label: `${b.number ?? '-'} · ${b.supplierName} · ${t('wp2.note.due', { amount: formatINR(b.outstanding) })}`,
            }))}
            value={f.billId}
            onChange={set('billId')}
          />
          {bills.data && shownBills.length === 0 ? (
            <Text style={kit.sub}>{t('wp2.note.noBills')}</Text>
          ) : null}
          {bad('bill') ? <Text style={tone.error}>{bad('bill')}</Text> : null}
        </>
      ) : null}
      <Field
        label={t('wp2.note.taxable')}
        value={f.taxable}
        onChange={set('taxable')}
        keyboard="decimal-pad"
        error={bad('taxable')}
      />
      <Chips
        label={t('wp2.note.account')}
        options={[
          { id: '', label: t('wp2.note.defaultAccount') },
          ...NOTE_ACCOUNTS[f.kind].map((a) => ({ id: a, label: `${a} - ${t(`wp2.note.acc.${a}`)}` })),
        ]}
        value={f.accountCode}
        onChange={set('accountCode')}
      />
      <Check
        label={t('wp2.note.gstDoc')}
        value={f.gstDocument}
        onChange={(v) => setF({ ...f, gstDocument: v })}
      />
      {f.gstDocument ? (
        <>
          <Field label={t('wp2.note.docNo')} value={f.supplierDocNo} onChange={set('supplierDocNo')} />
          <Field
            label={t('wp2.note.docDate')}
            value={f.supplierDocDate}
            onChange={set('supplierDocDate')}
            placeholder="YYYY-MM-DD"
          />
          {bad('doc') ? <Text style={tone.error}>{bad('doc')}</Text> : null}
        </>
      ) : null}
      <Field label={t('wp2.note.cgst')} value={f.cgst} onChange={set('cgst')} keyboard="decimal-pad" />
      <Field label={t('wp2.note.sgst')} value={f.sgst} onChange={set('sgst')} keyboard="decimal-pad" />
      <Field label={t('wp2.note.igst')} value={f.igst} onChange={set('igst')} keyboard="decimal-pad" />
      {(bad('tax') ?? bad('taxNeedsDoc') ?? bad('both')) ? (
        <Text style={tone.error}>{bad('tax') ?? bad('taxNeedsDoc') ?? bad('both')}</Text>
      ) : null}
      <Field
        label={t('wp2.note.date')}
        value={f.adjustmentDate}
        onChange={set('adjustmentDate')}
        placeholder="YYYY-MM-DD"
        error={bad('date')}
      />
      <Field label={t('wp2.note.reason')} value={f.reason} onChange={set('reason')} error={bad('reason')} />
      {failure ? <Text style={tone.error}>{failure}</Text> : null}
      <View style={kit.row}>
        <Btn label={t('wp2.note.post')} disabled={busy} onPress={() => void save()} />
        <Btn kind="ghost" label={t('wp2.note.close')} onPress={onClose} />
      </View>
    </Card>
  );
}

export function SupplierNotes() {
  const { t, can } = useStk();
  const [adding, setAdding] = useState(false);
  const [posted, setPosted] = useState(false);
  if (!can('purchase.supplier.ledger.view')) return <Empty text={t('stk.denied')} />;
  return (
    <>
      {can('purchase.supplier.adjustment') && !adding ? (
        <Btn label={t('wp2.note.new')} onPress={() => (setPosted(false), setAdding(true))} />
      ) : null}
      {posted ? <Text style={tone.ok}>{t('wp2.note.posted')}</Text> : null}
      {adding ? (
        <NoteFormCard onPosted={() => (setAdding(false), setPosted(true))} onClose={() => setAdding(false)} />
      ) : null}
      <Read<{ items: NoteRow[] } | NoteRow[]> path="/procurement/supplier-adjustments">
        {(d) => {
          const rows = Array.isArray(d) ? d : (d.items ?? []);
          return (
            <>
              {rows.length === 0 ? <Empty text={t('wp2.note.empty')} /> : null}
              {rows.map((x) => (
                <Card key={x.id}>
                  <Text style={kit.name}>
                    {x.number} · {t(x.kind === 'REDUCTION' ? 'wp2.note.reduction' : 'wp2.note.increase')}
                  </Text>
                  <Text style={kit.sub}>
                    {[x.supplierName, x.adjustmentDate, x.billNumber, formatINR(x.total)]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                  <Text style={kit.sub}>{x.reason}</Text>
                </Card>
              ))}
            </>
          );
        }}
      </Read>
    </>
  );
}

/** Purchase bills with the supplier notes next to them, like the web purchase page tabs. */
export function BillsAndNotesScreen() {
  const { t, can } = useStk();
  const [view, setView] = useState<'bills' | 'notes'>('bills');
  const toggle = can('purchase.supplier.ledger.view') ? (
    <Chips
      label={t('wp2.note.show')}
      options={[
        { id: 'bills', label: t('wp2.note.tabBills') },
        { id: 'notes', label: t('wp2.note.title') },
      ]}
      value={view}
      onChange={(v) => setView(v as 'bills' | 'notes')}
    />
  ) : null;
  if (view === 'notes')
    return (
      <Page title={t('wp2.note.title')} allowed={can('purchase.view')}>
        {toggle}
        <SupplierNotes />
      </Page>
    );
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {toggle ? <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>{toggle}</View> : null}
      <BillsScreen />
    </View>
  );
}

import { useState } from 'react';
import { Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { dec, formatINR } from '@/money';
import { shortDate } from '../hr/logic';
import { Line } from '../hr/kit';
import {
  Btn,
  Card,
  Chips,
  Empty,
  Field,
  Msgs,
  Notice,
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

// Procurement screens the web "Purchase" page has and the first purchase screens did not. Paths and permissions come from
// apps/api/src/procurement.controller.ts and apps/web/src/pages/purchase.js. Money and quantities are text; the server matches and posts.
export interface Supplier {
  id: string;
  code: string;
  name: string;
  type: string;
  gstin: string | null;
  stateCode: string;
  creditDays: number;
  creditLimit: string;
  status: string;
  version: number;
}
const STATUS_TYPES = ['COMPANY', 'DISTRIBUTOR', 'WHOLESALER', 'LOCAL', 'OTHER'] as const;
const GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
export const validGstin = (g: string) => g.trim() === '' || GSTIN.test(g.trim().toUpperCase());
export const validState = (s: string, gstin: string) =>
  /^\d{2}$/.test(s.trim()) && (gstin.trim() === '' || gstin.trim().startsWith(s.trim()));

/** Supplier search and pick. */
export function SupplierPick({
  value,
  onPick,
}: {
  value: Pick<Supplier, 'id' | 'name'> | null;
  onPick: (s: Supplier) => void;
}) {
  const { t, client, userId, ready } = useStk();
  const [q, setQ] = useState('');
  const r = useQuery({
    queryKey: ['stk', userId, 'supplierpick', q],
    queryFn: ({ signal }) =>
      client!.get<{ items: Supplier[] }>('/procurement/suppliers', { query: { q, limit: 8 }, signal }),
    enabled: ready,
  });
  return (
    <View style={{ gap: 6 }}>
      <Field label={t('stkSup.search')} value={q} onChange={setQ} />
      {value ? <Text style={kit.sub}>{t('stk.picked', { name: value.name })}</Text> : null}
      <Chips
        label={t('stkSup.supplier')}
        options={(r.data?.items ?? [])
          .filter((s) => s.status === 'ACTIVE')
          .map((s) => ({ id: s.id, label: s.name }))}
        value={value?.id ?? ''}
        onChange={(id) => {
          const s = r.data?.items.find((x) => x.id === id);
          if (s) onPick(s);
        }}
      />
    </View>
  );
}

// ---- Suppliers: GET/POST /procurement/suppliers, PATCH /:id (If-Match), POST /:id/status, GET /:id/ledger, GET/POST /:id/banks, POST /:id/banks/:bid/verify.
function SupplierForm({ s, onDone }: { s?: Supplier; onDone: () => void }) {
  const { t } = useStk();
  const w = useWrite();
  const branches = useBranches();
  const [name, setName] = useState(s?.name ?? '');
  const [type, setType] = useState(s?.type ?? 'COMPANY');
  const [gstin, setGstin] = useState(s?.gstin ?? '');
  const [state, setState] = useState(s?.stateCode ?? '');
  const [days, setDays] = useState(String(s?.creditDays ?? 0));
  const [limit, setLimit] = useState(s?.creditLimit ? dec(s.creditLimit).toFixed(2) : '0');
  const [open, setOpen] = useState('');
  const [openBranch, setOpenBranch] = useState('');
  const [openDate, setOpenDate] = useState(today());
  const ok =
    name.trim().length >= 2 &&
    validGstin(gstin) &&
    validState(state, gstin) &&
    /^\d{1,3}$/.test(days) &&
    validDec(limit, 2, true) &&
    (open === '' || (validDec(open, 2) && !!openBranch && validDay(openDate)));
  const save = (confirm: boolean) => {
    const body = {
      name: name.trim(),
      type,
      ...(gstin.trim() ? { gstin: gstin.trim().toUpperCase() } : s ? { gstin: null } : {}),
      stateCode: state.trim(),
      creditDays: Number(days),
      creditLimit: limit.trim(),
      ...(!s && open
        ? { openingBalance: open.trim(), openingBranchId: openBranch, openingBalanceDate: openDate.trim() }
        : {}),
      ...(confirm ? { confirmDuplicate: true } : {}),
    };
    return s
      ? w.patch(`/procurement/suppliers/${s.id}`, body, t('stkSup.saved'), {
          version: s.version,
          after: onDone,
        })
      : w.post('/procurement/suppliers', body, t('stkSup.saved'), { after: onDone });
  };
  return (
    <Card>
      <Field label={t('stkSup.name')} value={name} onChange={setName} />
      <Chips
        label={t('stkSup.type')}
        options={STATUS_TYPES.map((x) => ({ id: x as string, label: x }))}
        value={type}
        onChange={setType}
      />
      <Field
        label={t('stkSup.gstin')}
        value={gstin}
        onChange={setGstin}
        error={validGstin(gstin) ? null : t('stkSup.badGstin')}
      />
      <Field
        label={t('stkSup.state')}
        value={state}
        onChange={setState}
        keyboard="numeric"
        error={state && !validState(state, gstin) ? t('stkSup.badState') : null}
      />
      <Field
        label={t('stkSup.days')}
        value={days}
        onChange={setDays}
        keyboard="numeric"
        error={/^\d{1,3}$/.test(days) ? null : t('stk.badQty')}
      />
      <Field
        label={t('stkSup.limit')}
        value={limit}
        onChange={setLimit}
        keyboard="decimal-pad"
        error={validDec(limit, 2, true) ? null : t('stk.badAmount')}
      />
      {!s ? (
        <>
          <Field
            label={t('stkSup.opening')}
            value={open}
            onChange={setOpen}
            keyboard="decimal-pad"
            error={open && !validDec(open, 2) ? t('stk.badAmount') : null}
          />
          {open ? (
            <>
              <Chips
                label={t('stkSup.openBranch')}
                options={(branches.data ?? []).map((b) => ({ id: b.id, label: b.name }))}
                value={openBranch}
                onChange={setOpenBranch}
              />
              <Field
                label={t('stkSup.openDate')}
                value={openDate}
                onChange={setOpenDate}
                placeholder="YYYY-MM-DD"
                error={validDay(openDate) ? null : t('stk.badDate')}
              />
            </>
          ) : null}
        </>
      ) : null}
      <Msgs w={w} />
      {w.warn ? (
        <>
          <Notice tone="warn" text={t('stkSup.duplicate')} />
          <Btn label={t('stkSup.saveAnyway')} disabled={w.busy} onPress={() => void save(true)} />
        </>
      ) : null}
      <Btn label={t('stkSup.save')} disabled={w.busy || !ok} onPress={() => void save(false)} />
    </Card>
  );
}

function Banks({ s }: { s: Supplier }) {
  const { t, can } = useStk();
  const w = useWrite();
  const [acc, setAcc] = useState({ accountName: '', accountNo: '', ifsc: '' });
  return (
    <Read<{ items: { id: string; accountName: string; accountNo: string; ifsc: string; status: string }[] }>
      path={`/procurement/suppliers/${s.id}/banks`}
    >
      {(d) => (
        <Card>
          <Text style={kit.name}>{t('stkSup.banks')}</Text>
          {d.items.length === 0 ? <Text style={kit.sub}>{t('stkSup.noBanks')}</Text> : null}
          {d.items.map((b) => (
            <View key={b.id}>
              <Text style={kit.sub}>
                {b.accountName} · {b.accountNo} · {b.ifsc} · {b.status}
              </Text>
              {b.status === 'PENDING' && can('purchase.supplier.bank.verify') ? (
                <Btn
                  kind="ghost"
                  label={t('stkSup.verify', { no: b.accountNo })}
                  disabled={w.busy}
                  onPress={() =>
                    void w.post(
                      `/procurement/suppliers/${s.id}/banks/${b.id}/verify`,
                      undefined,
                      t('stkSup.verified'),
                    )
                  }
                />
              ) : null}
            </View>
          ))}
          {can('purchase.supplier.bank.manage') ? (
            <>
              <Field
                label={t('stkSup.holder')}
                value={acc.accountName}
                onChange={(v) => setAcc({ ...acc, accountName: v })}
              />
              <Field
                label={t('stkSup.accNo')}
                value={acc.accountNo}
                onChange={(v) => setAcc({ ...acc, accountNo: v })}
                keyboard="numeric"
              />
              <Field
                label={t('stkSup.ifsc')}
                value={acc.ifsc}
                onChange={(v) => setAcc({ ...acc, ifsc: v })}
              />
              <Msgs w={w} />
              <Btn
                label={t('stkSup.addBank')}
                disabled={
                  w.busy ||
                  !/^[A-Za-z ]{2,}/.test(acc.accountName) ||
                  !/^\d{6,20}$/.test(acc.accountNo) ||
                  !/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/.test(acc.ifsc.trim())
                }
                onPress={() =>
                  void w.post(
                    `/procurement/suppliers/${s.id}/banks`,
                    {
                      accountName: acc.accountName.trim(),
                      accountNo: acc.accountNo.trim(),
                      ifsc: acc.ifsc.trim().toUpperCase(),
                    },
                    t('stkSup.bankAdded'),
                    { after: () => setAcc({ accountName: '', accountNo: '', ifsc: '' }) },
                  )
                }
              />
            </>
          ) : null}
        </Card>
      )}
    </Read>
  );
}

function SupplierCard({ s, onEdit }: { s: Supplier; onEdit: () => void }) {
  const { t, can } = useStk();
  const w = useWrite();
  const [panel, setPanel] = useState<'ledger' | 'bank' | 'block' | null>(null);
  const [reason, setReason] = useState('');
  const manage = can('purchase.supplier.manage');
  return (
    <Card>
      <Text style={kit.name}>{s.name}</Text>
      <Text style={kit.sub}>
        {[
          s.code,
          s.gstin ?? t('stkSup.unregistered'),
          t('stkSup.creditDays', { count: s.creditDays }),
          s.status,
        ].join(' · ')}
      </Text>
      <View style={kit.row}>
        {can('purchase.supplier.ledger.view') ? (
          <Btn
            kind="ghost"
            label={t('stkSup.ledger')}
            onPress={() => setPanel(panel === 'ledger' ? null : 'ledger')}
          />
        ) : null}
        <Btn
          kind="ghost"
          label={t('stkSup.bank')}
          onPress={() => setPanel(panel === 'bank' ? null : 'bank')}
        />
        {manage ? <Btn kind="ghost" label={t('stkSup.edit')} onPress={onEdit} /> : null}
        {manage && s.status !== 'BLOCKED' ? (
          <Btn kind="ghost" label={t('stkSup.block')} onPress={() => setPanel('block')} />
        ) : null}
        {manage && s.status !== 'ACTIVE' ? (
          <Btn
            kind="ghost"
            label={t('stkSup.activate')}
            disabled={w.busy}
            onPress={() =>
              void w.post(
                `/procurement/suppliers/${s.id}/status`,
                { status: 'ACTIVE' },
                t('stkSup.activated'),
              )
            }
          />
        ) : null}
      </View>
      <Msgs w={w} />
      {panel === 'block' ? (
        <>
          <Field label={t('stkSup.reason')} value={reason} onChange={setReason} />
          <Btn
            label={t('stkSup.blockNow')}
            disabled={w.busy || reason.trim().length < 3}
            onPress={() =>
              void w.post(
                `/procurement/suppliers/${s.id}/status`,
                { status: 'BLOCKED', reason: reason.trim() },
                t('stkSup.blocked'),
                { after: () => setPanel(null) },
              )
            }
          />
        </>
      ) : null}
      {panel === 'ledger' ? (
        <Read<{ closing: string; outstandingBills: string; unallocatedAdvance: string }>
          path={`/procurement/suppliers/${s.id}/ledger`}
        >
          {(l) => (
            <>
              <Line label={t('stkSup.closing')} value={formatINR(l.closing)} strong />
              <Line label={t('stkSup.openBills')} value={formatINR(l.outstandingBills)} />
              <Line label={t('stkSup.advance')} value={formatINR(l.unallocatedAdvance)} />
              <Text style={kit.sub}>{t('stkSup.ledgerHint')}</Text>
            </>
          )}
        </Read>
      ) : null}
      {panel === 'bank' ? <Banks s={s} /> : null}
    </Card>
  );
}

export function SuppliersScreen() {
  const { t, can } = useStk();
  const [q, setQ] = useState('');
  const [form, setForm] = useState<Supplier | 'new' | null>(null);
  return (
    <Page title={t('stkSup.title')} allowed={can('purchase.view')}>
      <Field label={t('stkSup.search')} value={q} onChange={setQ} />
      {can('purchase.supplier.manage') ? (
        <Btn label={t('stkSup.add')} onPress={() => setForm(form ? null : 'new')} />
      ) : null}
      {form ? (
        <SupplierForm
          key={form === 'new' ? 'new' : form.id}
          s={form === 'new' ? undefined : form}
          onDone={() => setForm(null)}
        />
      ) : null}
      <Read<{ items: Supplier[] }>
        path="/procurement/suppliers"
        query={{ q: q.trim() || undefined, limit: 100 }}
      >
        {(d) => (
          <>
            {d.items.length === 0 ? <Empty text={t('stkSup.empty')} /> : null}
            {d.items.map((s) => (
              <SupplierCard key={s.id} s={s} onEdit={() => setForm(s)} />
            ))}
          </>
        )}
      </Read>
    </Page>
  );
}

// ---- Goods receipts: GET /procurement/goods-receipts, POST /:id/receive (post), /cancel (discard), /approve-exception, /reverse.
interface Grn {
  id: string;
  number: string | null;
  poNumber: string | null;
  supplierName: string;
  receiptDate: string;
  status: string;
  value: string;
}
function GrnCard({ g }: { g: Grn }) {
  const { t, can } = useStk();
  const w = useWrite();
  const [ask, setAsk] = useState<'approve-exception' | 'reverse' | null>(null);
  const [reason, setReason] = useState('');
  return (
    <Card>
      <Text style={kit.name}>
        {g.number ?? t('stkGrn.draft')} · {g.supplierName}
      </Text>
      <Text style={kit.sub}>
        {[shortDate(g.receiptDate), g.poNumber ?? t('stkGrn.noOrder'), g.status].join(' · ')}
      </Text>
      <Line label={t('stkGrn.value')} value={formatINR(g.value)} />
      <Msgs w={w} />
      <View style={kit.row}>
        {g.status === 'DRAFT' && can('purchase.grn.create') ? (
          <Btn
            label={t('stkGrn.post')}
            disabled={w.busy}
            onPress={() =>
              void w.post(`/procurement/goods-receipts/${g.id}/receive`, undefined, t('stkGrn.posted'))
            }
          />
        ) : null}
        {g.status === 'DRAFT' && can('purchase.grn.create') ? (
          <Btn
            kind="ghost"
            label={t('stkGrn.discard')}
            disabled={w.busy}
            onPress={() =>
              void w.post(`/procurement/goods-receipts/${g.id}/cancel`, undefined, t('stkGrn.discarded'))
            }
          />
        ) : null}
        {g.status === 'DRAFT' && can('purchase.grn.approve_exception') ? (
          <Btn kind="ghost" label={t('stkGrn.approveOver')} onPress={() => setAsk('approve-exception')} />
        ) : null}
        {g.status === 'RECEIVED' && can('purchase.grn.reverse') ? (
          <Btn kind="ghost" label={t('stkGrn.reverse')} onPress={() => setAsk('reverse')} />
        ) : null}
      </View>
      {ask ? (
        <>
          <Field label={t('stkGrn.reason')} value={reason} onChange={setReason} />
          <Btn
            label={t(ask === 'reverse' ? 'stkGrn.reverseNow' : 'stkGrn.approveNow')}
            disabled={w.busy || reason.trim().length < 5}
            onPress={() =>
              void w.post(
                `/procurement/goods-receipts/${g.id}/${ask}`,
                { reason: reason.trim() },
                t(ask === 'reverse' ? 'stkGrn.reversed' : 'stkGrn.approved'),
                { after: () => setAsk(null) },
              )
            }
          />
        </>
      ) : null}
    </Card>
  );
}

export function ReceiptsScreen() {
  const { t, can } = useStk();
  return (
    <Page title={t('stkGrn.title')} hint={t('stkGrn.hint')} allowed={can('purchase.view')}>
      <Read<{ items: Grn[] }> path="/procurement/goods-receipts" query={{ limit: 100 }}>
        {(d) => (
          <>
            {d.items.length === 0 ? <Empty text={t('stkGrn.empty')} /> : null}
            {d.items.map((g) => (
              <GrnCard key={g.id} g={g} />
            ))}
          </>
        )}
      </Read>
    </Page>
  );
}

// ---- Bills: POST /procurement/purchase-bills (from receipt lines), /direct, /:id/post, DELETE /:id, /:id/override; returns: POST /procurement/purchase-returns.
interface GrnFull {
  id: string;
  number: string | null;
  supplierId: string;
  branchId: string;
  lines: { id: string; skuCode: string; acceptedQty: string; billedQty: string; unitCost: string }[];
}
interface BillRow {
  id: string;
  number: string | null;
  supplierInvoiceNo: string;
  invoiceDate: string;
  supplierName: string;
  total: string;
  outstanding: string;
  status: string;
  matchStatus: string;
  paymentStatus: string;
  kind?: string;
  overrideBy?: string | null;
}
/** Quantity still to bill on a receipt line: accepted minus billed, as text. */
export const openToBill = (l: { acceptedQty: string; billedQty: string }): string =>
  dec(l.acceptedQty).minus(l.billedQty).toString();

function BillFromReceipt({ onDone }: { onDone: () => void }) {
  const { t } = useStk();
  const w = useWrite();
  const [grn, setGrn] = useState('');
  const [inv, setInv] = useState('');
  const [date, setDate] = useState(today());
  const [qty, setQty] = useState<Record<string, string>>({});
  const [rate, setRate] = useState<Record<string, string>>({});
  return (
    <Card>
      <Text style={kit.sub}>{t('stkBill.fromHint')}</Text>
      <Read<{ items: { id: string; number: string | null; supplierName: string }[] }>
        path="/procurement/goods-receipts"
        query={{ status: 'RECEIVED', limit: 40 }}
      >
        {(r) => (
          <>
            {r.items.length === 0 ? <Text style={kit.sub}>{t('stkBill.noReceipts')}</Text> : null}
            <Chips
              label={t('stkBill.receipt')}
              options={r.items.map((g) => ({ id: g.id, label: `${g.number ?? ''} ${g.supplierName}` }))}
              value={grn}
              onChange={(v) => {
                setGrn(v);
                setQty({});
                setRate({});
              }}
            />
          </>
        )}
      </Read>
      {grn ? (
        <Read<GrnFull> path={`/procurement/goods-receipts/${grn}`}>
          {(g) => {
            const rows = g.lines.filter((l) => dec(openToBill(l)).gt(0));
            const picked = rows.filter((l) => (qty[l.id] ?? '').trim() !== '');
            const bad = picked.some(
              (l) =>
                !validDec(qty[l.id]!) ||
                dec(qty[l.id]!).gt(openToBill(l)) ||
                (rate[l.id] !== undefined && rate[l.id] !== '' && !validDec(rate[l.id]!, 4, true)),
            );
            return (
              <>
                {rows.length === 0 ? <Text style={kit.sub}>{t('stkBill.allBilled')}</Text> : null}
                {rows.map((l) => (
                  <Card key={l.id}>
                    <Text style={kit.name}>{l.skuCode}</Text>
                    <Text style={kit.sub}>{t('stkBill.toBill', { qty: openToBill(l) })}</Text>
                    <Field
                      label={t('stkBill.qtyFor', { code: l.skuCode })}
                      value={qty[l.id] ?? ''}
                      onChange={(v) => setQty({ ...qty, [l.id]: v })}
                      keyboard="decimal-pad"
                      error={
                        qty[l.id] && (!validDec(qty[l.id]!) || dec(qty[l.id]!).gt(openToBill(l)))
                          ? t('stkBill.badQty')
                          : null
                      }
                    />
                    <Field
                      label={t('stkBill.rateFor', { code: l.skuCode })}
                      value={rate[l.id] ?? ''}
                      onChange={(v) => setRate({ ...rate, [l.id]: v })}
                      keyboard="decimal-pad"
                      placeholder={l.unitCost}
                    />
                  </Card>
                ))}
                <Field label={t('stkBill.invoiceNo')} value={inv} onChange={setInv} />
                <Field
                  label={t('stkBill.invoiceDate')}
                  value={date}
                  onChange={setDate}
                  placeholder="YYYY-MM-DD"
                  error={validDay(date) ? null : t('stk.badDate')}
                />
                <Msgs w={w} />
                <Btn
                  label={t('stkBill.save')}
                  disabled={w.busy || picked.length === 0 || bad || !inv.trim() || !validDay(date)}
                  onPress={() =>
                    void w.post(
                      '/procurement/purchase-bills',
                      {
                        supplierId: g.supplierId,
                        branchId: g.branchId,
                        supplierInvoiceNo: inv.trim(),
                        invoiceDate: date.trim(),
                        lines: picked.map((l) => ({
                          grnLineId: l.id,
                          qty: qty[l.id]!.trim(),
                          ...(blank(rate[l.id] ?? '') ? { rate: rate[l.id]!.trim() } : {}),
                        })),
                      },
                      t('stkBill.saved'),
                      { after: onDone },
                    )
                  }
                />
              </>
            );
          }}
        </Read>
      ) : null}
    </Card>
  );
}

interface DirectLine {
  product: PickedProduct;
  qty: string;
  rate: string;
  batchNo?: string;
  mfgDate?: string;
  expiryDate?: string;
}

function DirectBill({ onDone }: { onDone: () => void }) {
  const { t } = useStk();
  const w = useWrite();
  const branches = useBranches();
  const whs = useWarehouses();
  const [sup, setSup] = useState<Supplier | null>(null);
  const [branch, setBranch] = useState('');
  const [wh, setWh] = useState('');
  const [inv, setInv] = useState('');
  const [date, setDate] = useState(today());
  const [lines, setLines] = useState<DirectLine[]>([]);
  const [p, setP] = useState<PickedProduct | null>(null);
  const [qty, setQty] = useState('');
  const [rate, setRate] = useState('');
  const [batch, setBatch] = useState('');
  const [mfg, setMfg] = useState('');
  const [exp, setExp] = useState('');
  const lineOk =
    !!p &&
    validDec(qty) &&
    validDec(rate, 4, true) &&
    (mfg === '' || validDay(mfg)) &&
    (exp === '' || validDay(exp));
  return (
    <Card>
      <Text style={kit.sub}>{t('stkBill.directHint')}</Text>
      <SupplierPick value={sup} onPick={setSup} />
      <Chips
        label={t('stkBill.branch')}
        options={(branches.data ?? []).map((b) => ({ id: b.id, label: b.name }))}
        value={branch}
        onChange={(v) => {
          setBranch(v);
          setWh('');
        }}
      />
      <Chips
        label={t('stkBill.warehouse')}
        options={(whs.data ?? [])
          .filter((x) => x.branchId === branch && x.sellable !== false)
          .map((x) => ({ id: x.id, label: x.name }))}
        value={wh}
        onChange={setWh}
      />
      <Field label={t('stkBill.invoiceNo')} value={inv} onChange={setInv} />
      <Field
        label={t('stkBill.invoiceDate')}
        value={date}
        onChange={setDate}
        placeholder="YYYY-MM-DD"
        error={validDay(date) ? null : t('stk.badDate')}
      />
      <Text style={kit.name}>{t('stkBill.lines', { count: lines.length })}</Text>
      {lines.map((l, i) => (
        <View key={i} style={kit.row}>
          <Text style={kit.sub}>
            {l.product.code} · {l.qty} x {l.rate}
            {l.batchNo ? ` · ${l.batchNo}` : ''}
          </Text>
          <Btn
            kind="ghost"
            label={t('stkBill.removeLine', { code: l.product.code })}
            onPress={() => setLines(lines.filter((_, j) => j !== i))}
          />
        </View>
      ))}
      <Card>
        <ProductPick label={t('stkBill.product')} value={p} onPick={setP} />
        <Field
          label={t('stkBill.qty')}
          value={qty}
          onChange={setQty}
          keyboard="decimal-pad"
          error={qty && !validDec(qty) ? t('stk.badQty') : null}
        />
        <Field
          label={t('stkBill.rateDirect')}
          value={rate}
          onChange={setRate}
          keyboard="decimal-pad"
          error={rate && !validDec(rate, 4, true) ? t('stk.badAmount') : null}
        />
        <Field label={t('stkBill.batch')} value={batch} onChange={setBatch} />
        <Field
          label={t('stkBill.mfg')}
          value={mfg}
          onChange={setMfg}
          placeholder="YYYY-MM-DD"
          error={mfg && !validDay(mfg) ? t('stk.badDate') : null}
        />
        <Field
          label={t('stkBill.expiry')}
          value={exp}
          onChange={setExp}
          placeholder="YYYY-MM-DD"
          error={exp && !validDay(exp) ? t('stk.badDate') : null}
        />
        <Btn
          kind="ghost"
          label={t('stkBill.addLine')}
          disabled={!lineOk}
          onPress={() => {
            setLines([
              ...lines,
              {
                product: p!,
                qty: qty.trim(),
                rate: rate.trim(),
                ...(blank(batch) ? { batchNo: batch.trim() } : {}),
                ...(blank(mfg) ? { mfgDate: mfg.trim() } : {}),
                ...(blank(exp) ? { expiryDate: exp.trim() } : {}),
              },
            ]);
            setP(null);
            setQty('');
            setRate('');
            setBatch('');
            setMfg('');
            setExp('');
          }}
        />
      </Card>
      <Msgs w={w} />
      <Btn
        label={t('stkBill.saveDirect')}
        disabled={w.busy || !sup || !branch || !wh || !inv.trim() || !validDay(date) || lines.length === 0}
        onPress={() =>
          void w.post(
            '/procurement/purchase-bills/direct',
            {
              supplierId: sup!.id,
              branchId: branch,
              warehouseId: wh,
              supplierInvoiceNo: inv.trim(),
              invoiceDate: date.trim(),
              lines: lines.map((l) => ({
                skuId: l.product.id,
                qty: l.qty,
                rate: l.rate,
                ...(l.batchNo ? { batchNo: l.batchNo } : {}),
                ...(l.mfgDate ? { mfgDate: l.mfgDate } : {}),
                ...(l.expiryDate ? { expiryDate: l.expiryDate } : {}),
              })),
            },
            t('stkBill.saved'),
            { after: onDone },
          )
        }
      />
    </Card>
  );
}

const RETURN_REASONS = [
  'DEFECTIVE',
  'EXPIRED',
  'NEAR_EXPIRY_AGREEMENT',
  'WRONG_ITEM',
  'EXCESS',
  'RECALL',
  'PRICE_DISPUTE',
] as const;

function ReturnForm({ b, onDone }: { b: BillRow; onDone: () => void }) {
  const { t } = useStk();
  const w = useWrite();
  const [reason, setReason] = useState('');
  const [date, setDate] = useState(today());
  const [qty, setQty] = useState<Record<string, string>>({});
  return (
    <Read<{ lines: { id: string; skuCode: string; qty: string; returnedQty: string }[] }>
      path={`/procurement/purchase-bills/${b.id}`}
    >
      {(full) => {
        const left = (l: { qty: string; returnedQty: string }) => dec(l.qty).minus(l.returnedQty);
        const picked = full.lines.filter((l) => (qty[l.id] ?? '').trim() !== '');
        const bad = picked.some((l) => !validDec(qty[l.id]!) || dec(qty[l.id]!).gt(left(l)));
        return (
          <Card>
            <Text style={kit.sub}>{t('stkBill.returnHint')}</Text>
            <Chips
              label={t('stkBill.reason')}
              options={RETURN_REASONS.map((r) => ({ id: r as string, label: r }))}
              value={reason}
              onChange={setReason}
            />
            <Field
              label={t('stkBill.returnDate')}
              value={date}
              onChange={setDate}
              placeholder="YYYY-MM-DD"
              error={validDay(date) ? null : t('stk.badDate')}
            />
            {full.lines.map((l) => (
              <View key={l.id}>
                <Text style={kit.sub}>
                  {l.skuCode} · {t('stkBill.billedReturned', { billed: l.qty, returned: l.returnedQty })}
                </Text>
                <Field
                  label={t('stkBill.returnQty', { code: l.skuCode })}
                  value={qty[l.id] ?? ''}
                  onChange={(v) => setQty({ ...qty, [l.id]: v })}
                  keyboard="decimal-pad"
                  error={
                    qty[l.id] && (!validDec(qty[l.id]!) || dec(qty[l.id]!).gt(left(l)))
                      ? t('stkBill.badQty')
                      : null
                  }
                />
              </View>
            ))}
            <Msgs w={w} />
            <Btn
              label={t('stkBill.postReturn')}
              disabled={w.busy || !reason || !validDay(date) || picked.length === 0 || bad}
              onPress={() =>
                void w.post(
                  '/procurement/purchase-returns',
                  {
                    billId: b.id,
                    returnDate: date.trim(),
                    reason,
                    lines: picked.map((l) => ({ billLineId: l.id, qty: qty[l.id]!.trim() })),
                  },
                  t('stkBill.returned'),
                  { after: onDone },
                )
              }
            />
          </Card>
        );
      }}
    </Read>
  );
}

function BillCard({ b }: { b: BillRow }) {
  const { t, can } = useStk();
  const w = useWrite();
  const [panel, setPanel] = useState<'return' | 'override' | null>(null);
  const [reason, setReason] = useState('');
  return (
    <Card>
      <Text style={kit.name}>
        {b.number ?? t('stkBill.draft')} · {b.supplierName}
      </Text>
      <Text style={kit.sub}>
        {[
          b.supplierInvoiceNo,
          shortDate(b.invoiceDate),
          t('stkBill.match', { status: b.matchStatus }),
          b.status === 'POSTED' ? b.paymentStatus : b.status,
        ].join(' · ')}
      </Text>
      <Line label={t('stkBill.total')} value={formatINR(b.total)} />
      {b.status === 'POSTED' ? (
        <Line label={t('stkBill.outstanding')} value={formatINR(b.outstanding)} strong />
      ) : null}
      <Msgs w={w} />
      <View style={kit.row}>
        {b.status === 'DRAFT' && can('purchase.bill.create') ? (
          <Btn
            label={t('stkBill.post')}
            disabled={w.busy}
            onPress={() =>
              void w.post(`/procurement/purchase-bills/${b.id}/post`, undefined, t('stkBill.posted'))
            }
          />
        ) : null}
        {b.status === 'DRAFT' && can('purchase.bill.create') ? (
          <Btn
            kind="ghost"
            label={t('stkBill.discard')}
            disabled={w.busy}
            onPress={() =>
              void w.del(`/procurement/purchase-bills/${b.id}`, undefined, t('stkBill.discarded'))
            }
          />
        ) : null}
        {b.status === 'DRAFT' &&
        b.matchStatus === 'VARIANCE' &&
        !b.overrideBy &&
        can('purchase.bill.override') ? (
          <Btn kind="ghost" label={t('stkBill.acceptVariance')} onPress={() => setPanel('override')} />
        ) : null}
        {b.status === 'POSTED' && b.kind !== 'OPENING' && can('purchase.return.create') ? (
          <Btn
            kind="ghost"
            label={t('stkBill.return')}
            onPress={() => setPanel(panel === 'return' ? null : 'return')}
          />
        ) : null}
      </View>
      {panel === 'override' ? (
        <>
          <Text style={kit.sub}>{t('stkBill.varianceHint')}</Text>
          <Field label={t('stkBill.reason')} value={reason} onChange={setReason} />
          <Btn
            label={t('stkBill.acceptNow')}
            disabled={w.busy || reason.trim().length < 5}
            onPress={() =>
              void w.post(
                `/procurement/purchase-bills/${b.id}/override`,
                { reason: reason.trim() },
                t('stkBill.accepted'),
                { after: () => setPanel(null) },
              )
            }
          />
        </>
      ) : null}
      {panel === 'return' ? <ReturnForm b={b} onDone={() => setPanel(null)} /> : null}
    </Card>
  );
}

export function BillsScreen() {
  const { t, can } = useStk();
  const [form, setForm] = useState<'receipt' | 'direct' | null>(null);
  return (
    <Page title={t('stkBill.title')} allowed={can('purchase.view')}>
      <View style={kit.row}>
        {can('purchase.bill.create') ? (
          <Btn label={t('stkBill.enter')} onPress={() => setForm(form === 'receipt' ? null : 'receipt')} />
        ) : null}
        {can('purchase.bill.direct') ? (
          <Btn
            kind="ghost"
            label={t('stkBill.direct')}
            onPress={() => setForm(form === 'direct' ? null : 'direct')}
          />
        ) : null}
      </View>
      {form === 'receipt' ? <BillFromReceipt onDone={() => setForm(null)} /> : null}
      {form === 'direct' ? <DirectBill onDone={() => setForm(null)} /> : null}
      <Read<{ items: BillRow[] }> path="/procurement/purchase-bills" query={{ limit: 100 }}>
        {(d) => (
          <>
            {d.items.length === 0 ? <Empty text={t('stkBill.empty')} /> : null}
            {d.items.map((b) => (
              <BillCard key={b.id} b={b} />
            ))}
          </>
        )}
      </Read>
    </Page>
  );
}

// ---- Pay a supplier: POST /procurement/supplier-payments. Without allocations the server settles the oldest due bills first; the rest is an advance.
export function PaySupplierScreen() {
  const { t, can } = useStk();
  const w = useWrite();
  const branches = useBranches();
  const [sup, setSup] = useState<Supplier | null>(null);
  const [branch, setBranch] = useState('');
  const [date, setDate] = useState(today());
  const [mode, setMode] = useState('');
  const [amount, setAmount] = useState('');
  const [ref, setRef] = useState('');
  const { client, userId, ready } = useStk();
  const modes = useQuery({
    queryKey: ['stk', userId, 'modes'],
    queryFn: async ({ signal }) =>
      (await client!.get<{ items: { code: string }[] }>('/settings/payment-modes', { signal })).items,
    enabled: ready,
    staleTime: 5 * 60_000,
  });
  const ledger = useQuery({
    queryKey: ['stk', userId, 'supplierledger', sup?.id],
    queryFn: ({ signal }) =>
      client!.get<{ outstandingBills: string }>(`/procurement/suppliers/${sup!.id}/ledger`, { signal }),
    enabled: ready && !!sup && can('purchase.supplier.ledger.view'),
    retry: false,
  });
  const extra = validDec(amount, 2) && ledger.data ? dec(amount).minus(ledger.data.outstandingBills) : null;
  const ok = !!sup && !!branch && !!mode && validDay(date) && validDec(amount, 2);
  return (
    <Page title={t('stkPay.title')} hint={t('stkPay.hint')} allowed={can('purchase.payment.create')}>
      <Card>
        <SupplierPick value={sup} onPick={setSup} />
        <Chips
          label={t('stkPay.branch')}
          options={(branches.data ?? []).map((b) => ({ id: b.id, label: b.name }))}
          value={branch}
          onChange={setBranch}
        />
        <Field
          label={t('stkPay.date')}
          value={date}
          onChange={setDate}
          placeholder="YYYY-MM-DD"
          error={validDay(date) ? null : t('stk.badDate')}
        />
        <Chips
          label={t('stkPay.mode')}
          options={(modes.data ?? []).map((m) => ({ id: m.code, label: m.code }))}
          value={mode}
          onChange={setMode}
        />
        <Field
          label={t('stkPay.amount')}
          value={amount}
          onChange={setAmount}
          keyboard="decimal-pad"
          error={amount && !validDec(amount, 2) ? t('stk.badAmount') : null}
        />
        {ledger.data ? (
          <Text style={kit.sub}>{t('stkPay.due', { amount: formatINR(ledger.data.outstandingBills) })}</Text>
        ) : null}
        {extra && extra.gt(0) ? (
          <Text style={tone.warn}>{t('stkPay.advanceWarn', { extra: formatINR(extra.toFixed(2)) })}</Text>
        ) : null}
        <Field label={t('stkPay.reference')} value={ref} onChange={setRef} />
        <Msgs w={w} />
        <Btn
          label={t('stkPay.pay')}
          disabled={w.busy || !ok}
          onPress={() =>
            void w.post(
              '/procurement/supplier-payments',
              {
                supplierId: sup!.id,
                branchId: branch,
                paymentDate: date.trim(),
                modeCode: mode,
                amount: amount.trim(),
                ...(blank(ref) ? { reference: ref.trim() } : {}),
              },
              t('stkPay.paid'),
              { after: () => setAmount('') },
            )
          }
        />
      </Card>
    </Page>
  );
}

// ---- Purchase reports: GET /procurement/reports/pending-orders (purchase.view), /purchase-register (reports.purchase), /grni.
interface Pending {
  number: string;
  supplierName: string;
  skuCode: string;
  ordered: string;
  received: string;
  pending: string;
  overdue: boolean;
  expectedDate: string | null;
}
interface RegRow {
  date: string;
  type: string;
  number: string | null;
  supplierName: string;
  gstin: string | null;
  taxable: string;
  cgst: string;
  sgst: string;
  igst: string;
  total: string;
}
export function PurchaseReportsScreen() {
  const { t, can } = useStk();
  const [tab, setTab] = useState<'pending' | 'register'>('pending');
  return (
    <Page title={t('stkRep.title')} allowed={can('purchase.view')}>
      <Chips
        label={t('stkRep.which')}
        options={[
          { id: 'pending' as const, label: t('stkRep.pending') },
          ...(can('reports.purchase') ? [{ id: 'register' as const, label: t('stkRep.register') }] : []),
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'pending' ? (
        <Read<{ items: Pending[] }> path="/procurement/reports/pending-orders">
          {(d) => (
            <>
              {d.items.length === 0 ? <Empty text={t('stkRep.noPending')} /> : null}
              {d.items.map((x, i) => (
                <Card key={i}>
                  <Text style={kit.name}>
                    {x.number} · {x.supplierName}
                  </Text>
                  <Text style={kit.sub}>
                    {x.skuCode} · {t('stkRep.ordered', { qty: x.ordered })} ·{' '}
                    {t('stkRep.received', { qty: x.received })}
                  </Text>
                  <Line label={t('stkRep.pendingQty')} value={x.pending} strong />
                  {x.overdue ? (
                    <Text style={tone.warn}>
                      {t('stkRep.overdue', { date: x.expectedDate ? shortDate(x.expectedDate) : '-' })}
                    </Text>
                  ) : x.expectedDate ? (
                    <Text style={kit.sub}>{t('stkRep.due', { date: shortDate(x.expectedDate) })}</Text>
                  ) : null}
                </Card>
              ))}
            </>
          )}
        </Read>
      ) : (
        <Read<{
          rows: RegRow[];
          totals: { taxable: string; cgst: string; sgst: string; igst: string; total: string };
        }> path="/procurement/reports/purchase-register">
          {(d) => (
            <>
              {d.rows.length === 0 ? <Empty text={t('stkRep.noRegister')} /> : null}
              {d.rows.length > 0 ? (
                <Card>
                  <Line label={t('stkRep.taxable')} value={formatINR(d.totals.taxable)} />
                  <Line
                    label={t('stkRep.gst')}
                    value={formatINR(dec(d.totals.cgst).plus(d.totals.sgst).plus(d.totals.igst).toFixed(2))}
                  />
                  <Line label={t('stkRep.total')} value={formatINR(d.totals.total)} strong />
                </Card>
              ) : null}
              {d.rows.map((x, i) => (
                <Card key={i}>
                  <Text style={kit.name}>
                    {x.type.replace('_', ' ')} {x.number ?? ''} · {x.supplierName}
                  </Text>
                  <Text style={kit.sub}>
                    {shortDate(x.date)} · {x.gstin ?? t('stkSup.unregistered')}
                  </Text>
                  <Line label={t('stkRep.taxable')} value={formatINR(x.taxable)} />
                  <Line
                    label={t('stkRep.gst')}
                    value={formatINR(dec(x.cgst).plus(x.sgst).plus(x.igst).toFixed(2))}
                  />
                  <Line label={t('stkRep.total')} value={formatINR(x.total)} strong />
                </Card>
              ))}
            </>
          )}
        </Read>
      )}
    </Page>
  );
}

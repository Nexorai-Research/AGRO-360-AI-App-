import { useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { dec, formatINR } from '@/money';
import { Button } from '@/ui/Button';
import { Chips, Field, Notice, kit } from '@/ui/kit';
import { ActionForm, Denied, Loaded, ProductPicker, Row, itemsOf, s, useBranchWarehouse, useCan, useGet, useRefresh, type FieldDef } from './kit';

/** minimum <= reorder level <= maximum, compared as decimals. */
export function ruleOrderOk(min: string, level: string, max: string): boolean {
  return dec(min.trim()).lte(level.trim()) && dec(level.trim()).lte(max.trim());
}

// ---------------------------------------------------------------- ledger
const MOVES = ['OPENING', 'GRN_RECEIPT', 'SALE_ISSUE', 'TRANSFER_OUT', 'TRANSFER_IN', 'ADJUST_PLUS', 'ADJUST_MINUS', 'QUARANTINE_OUT', 'QUARANTINE_IN', 'DAMAGE_WRITEOFF'];
interface Move {
  id?: string;
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
export function LedgerScreen() {
  const { t } = useTranslation();
  const can = useCan();
  const [product, setProduct] = useState('');
  const [type, setType] = useState('');
  const ok = can('inventory.view');
  const r = useGet<{ items: Move[]; currentBalance: string | null }>('/inventory/ledger', { product: product || undefined, type: type || undefined, limit: 100 }, ok);
  if (!ok) return <Denied text={t('ledger.denied')} />;
  const rows = itemsOf(r.data);
  return (
    <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
      <Text accessibilityRole="header" style={kit.title}>
        {t('ledger.title')}
      </Text>
      <ProductPicker label={t('ledger.product')} value={product} onChange={setProduct} />
      {product ? <Button kind="ghost" label={t('ledger.allProducts')} onPress={() => setProduct('')} /> : null}
      <Chips label={t('ledger.type')} value={type} onChange={(x) => setType(x === type ? '' : x)} options={MOVES.map((m) => ({ id: m, label: t(`ledger.moves.${m}`) }))} />
      <Loaded q={r} empty={t('ledger.empty')} isEmpty={rows.length === 0} offlineKey="ledger.offline">
        {product && r.data?.currentBalance != null ? <Text style={kit.name}>{t('ledger.balance', { qty: r.data.currentBalance })}</Text> : <Text style={kit.sub}>{t('ledger.pickOne')}</Text>}
        {rows.map((m, i) => (
          <Row
            key={m.id ?? i}
            title={`${m.businessDate} · ${t(`ledger.moves.${m.movementType}`, { defaultValue: m.movementType })}`}
            lines={[
              `${m.skuCode}${m.batchNo ? ` / ${m.batchNo}` : ''} · ${m.warehouseCode}`,
              t('ledger.qty', { qty: m.qty }),
              m.value === null ? t('ledger.valueHidden') : formatINR(m.value),
              m.runningBalance === null ? '' : t('ledger.running', { qty: m.runningBalance }),
              m.sourceType ? `${m.sourceType}${m.reasonCode ? ` (${m.reasonCode})` : ''}` : '',
            ]}
          />
        ))}
      </Loaded>
    </ScrollView>
  );
}

// ---------------------------------------------------------------- reorder rules and low-stock alerts
interface Alert {
  id: string;
  skuCode: string;
  skuName: string;
  branchName: string;
  qty: string;
  threshold: string;
  openedAt: string;
}
interface Rule {
  skuCode: string;
  skuName: string;
  branchName: string | null;
  minQty: string;
  reorderLevel: string;
  maxQty: string;
  reorderQty: string;
}
export function ReorderScreen() {
  const { t } = useTranslation();
  const { client } = useAuth();
  const can = useCan();
  const refresh = useRefresh();
  const [form, setForm] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const ok = can('inventory.view');
  const manage = can('inventory.reorder.manage');
  const alerts = useGet<{ items: Alert[] }>('/alerts', { type: 'LOW_STOCK' }, ok);
  const rules = useGet<{ items: Rule[] }>('/inventory/reorder-rules', { limit: 100 }, ok);
  const { branches } = useBranchWarehouse(ok && form);
  if (!ok) return <Denied text={t('reorder.denied')} />;
  const fields: FieldDef[] = [
    { name: 'skuId', label: t('reorder.product'), kind: 'product', required: true },
    { name: 'branchId', label: t('reorder.branch'), kind: 'choice', options: branches.map((b) => ({ id: b.id, label: b.name })) },
    { name: 'minQty', label: t('reorder.min'), kind: 'qty', required: true },
    { name: 'reorderLevel', label: t('reorder.level'), kind: 'qty', required: true },
    { name: 'maxQty', label: t('reorder.max'), kind: 'qty', required: true },
    { name: 'reorderQty', label: t('reorder.orderQty'), kind: 'qty', required: true },
  ];
  return (
    <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
      <Text accessibilityRole="header" style={kit.title}>
        {t('reorder.title')}
      </Text>
      {msg ? <Notice tone="ok" text={msg} /> : null}
      <Text style={kit.name}>{t('reorder.alerts')}</Text>
      <Loaded q={alerts} empty={t('reorder.noAlerts')} isEmpty={itemsOf(alerts.data).length === 0} offlineKey="reorder.offline">
        {itemsOf(alerts.data).map((a) => (
          <Row key={a.id} title={`${a.skuName} (${a.skuCode})`} lines={[a.branchName, t('reorder.alertLine', { qty: a.qty, level: a.threshold }), a.openedAt.slice(0, 10)]} />
        ))}
      </Loaded>
      <Text style={kit.name}>{t('reorder.rules')}</Text>
      {manage && !form ? <Button label={t('reorder.set')} onPress={() => setForm(true)} /> : null}
      {form ? (
        <ActionForm
            title={t('reorder.set')}
            hint={t('reorder.hint')}
            fields={fields}
            submitLabel={t('reorder.save')}
            onCancel={() => setForm(false)}
            onDone={() => {
              setForm(false);
              setMsg(t('reorder.saved'));
              refresh();
            }}
            extraCheck={(v) => (ruleOrderOk(String(v.minQty), String(v.reorderLevel), String(v.maxQty)) ? null : 'reorder.order')}
            send={(v, key) => {
              const g = (k: string) => String(v[k]).trim();
              const rule: Record<string, string> = { skuId: g('skuId'), minQty: g('minQty'), reorderLevel: g('reorderLevel'), maxQty: g('maxQty'), reorderQty: g('reorderQty') };
              if (g('branchId')) rule.branchId = g('branchId');
              return client!.put('/inventory/reorder-rules', { body: { rules: [rule] }, idempotencyKey: key });
            }}
        />
      ) : null}
      <Loaded q={rules} empty={t('reorder.noRules')} isEmpty={itemsOf(rules.data).length === 0} offlineKey="reorder.offline">
        {itemsOf(rules.data).map((x, i) => (
          <Row
            key={i}
            title={`${x.skuName} (${x.skuCode})`}
            lines={[x.branchName ?? t('reorder.allBranches'), t('reorder.ruleLine', { min: x.minQty, level: x.reorderLevel, max: x.maxQty, qty: x.reorderQty })]}
          />
        ))}
      </Loaded>
    </ScrollView>
  );
}

// ---------------------------------------------------------------- valuation
interface Valuation {
  asOn: string;
  totalValue: string;
  totalQty: string;
  valuedBy: string;
  warning?: string | null;
  rows: { skuCode: string; skuName: string; branchName: string; warehouseCode?: string; qty: string; avgCost: string | null; value: string }[];
}
export function ValuationScreen() {
  const { t } = useTranslation();
  const can = useCan();
  const [asOn, setAsOn] = useState('');
  const [groupBy, setGroupBy] = useState<'sku' | 'warehouse'>('sku');
  const ok = can('inventory.value.view');
  const dateOk = asOn === '' || /^\d{4}-\d{2}-\d{2}$/.test(asOn);
  const r = useGet<Valuation>('/inventory/valuation', { asOn: dateOk ? asOn || undefined : undefined, groupBy }, ok);
  if (!ok) return <Denied text={t('valuation.denied')} />;
  const d = r.data;
  return (
    <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
      <Text accessibilityRole="header" style={kit.title}>
        {t('valuation.title')}
      </Text>
      <Field label={t('valuation.asOn')} value={asOn} onChange={setAsOn} placeholder="YYYY-MM-DD" error={dateOk ? null : t('inv.err.date')} />
      <Chips label={t('valuation.groupBy')} value={groupBy} onChange={setGroupBy} options={[{ id: 'sku', label: t('valuation.bySku') }, { id: 'warehouse', label: t('valuation.byWarehouse') }]} />
      <Loaded q={r} empty={t('valuation.empty')} isEmpty={!d || d.rows.length === 0} offlineKey="valuation.offline">
        {d?.warning ? <Notice tone="warn" text={d.warning} /> : null}
        {d ? <Text style={kit.name}>{t('valuation.total', { date: d.asOn, amount: formatINR(d.totalValue), qty: d.totalQty })}</Text> : null}
        {d?.rows.map((x, i) => (
          <Row
            key={i}
            title={`${x.skuName} (${x.skuCode})`}
            lines={[`${x.branchName}${x.warehouseCode ? ` / ${x.warehouseCode}` : ''}`, t('valuation.line', { qty: x.qty, cost: x.avgCost === null ? '-' : formatINR(x.avgCost), value: formatINR(x.value) })]}
          />
        ))}
      </Loaded>
    </ScrollView>
  );
}

// ---------------------------------------------------------------- opening stock (single line)
interface Opening {
  id: string;
  asOnDate: string;
  warehouseId: string;
  lineCount: number;
  totalValue: string;
  late: boolean;
}
export function OpeningScreen() {
  const { t } = useTranslation();
  const { client } = useAuth();
  const can = useCan();
  const refresh = useRefresh();
  const [form, setForm] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const ok = can('inventory.opening');
  const list = useGet<{ items: Opening[] }>('/inventory/opening', {}, ok);
  const { warehouses } = useBranchWarehouse(ok);
  if (!ok) return <Denied text={t('opening.denied')} />;
  const wname = (id: string) => warehouses.find((w) => w.id === id)?.name ?? id.slice(0, 8);
  const fields: FieldDef[] = [
    { name: 'warehouseId', label: t('opening.warehouse'), kind: 'choice', required: true, options: warehouses.map((w) => ({ id: w.id, label: w.name })) },
    { name: 'asOnDate', label: t('opening.asOn'), kind: 'date', required: true },
    { name: 'skuId', label: t('opening.product'), kind: 'product', required: true },
    { name: 'batchNo', label: t('opening.batchNo'), kind: 'text' },
    { name: 'expiryDate', label: t('opening.expiry'), kind: 'date' },
    { name: 'qty', label: t('opening.qty'), kind: 'qty', required: true, positive: true },
    { name: 'unitCost', label: t('opening.cost'), kind: 'money', required: true },
    { name: 'reason', label: t('opening.reason'), kind: 'text' },
  ];
  return (
    <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
      <Text accessibilityRole="header" style={kit.title}>
        {t('opening.title')}
      </Text>
      <Text style={kit.sub}>{t('opening.intro')}</Text>
      {msg ? <Notice tone="ok" text={msg} /> : null}
      {!form ? <Button label={t('opening.enter')} onPress={() => setForm(true)} /> : null}
      {form ? (
        <ActionForm
          title={t('opening.enter')}
          fields={fields}
          submitLabel={t('opening.post')}
          onCancel={() => setForm(false)}
          onDone={() => {
            setForm(false);
            setMsg(t('opening.posted'));
            refresh();
          }}
          send={(v, key) => {
            const g = (k: string) => String(v[k]).trim();
            const line: Record<string, string> = { skuId: g('skuId'), qty: g('qty'), unitCost: g('unitCost') };
            if (g('batchNo')) line.batchNo = g('batchNo');
            if (g('expiryDate')) line.expiryDate = g('expiryDate');
            const body: Record<string, unknown> = { warehouseId: g('warehouseId'), asOnDate: g('asOnDate'), lines: [line] };
            if (g('reason')) body.reason = g('reason');
            return client!.post('/inventory/opening', { body, idempotencyKey: key });
          }}
        />
      ) : null}
      <Loaded q={list} empty={t('opening.empty')} isEmpty={itemsOf(list.data).length === 0} offlineKey="opening.offline">
        {itemsOf(list.data).map((o) => (
          <Row key={o.id} title={`${o.asOnDate} · ${wname(o.warehouseId)}`} lines={[t('opening.line', { count: o.lineCount, amount: formatINR(o.totalValue) }), o.late ? t('opening.late') : '']} />
        ))}
      </Loaded>
    </ScrollView>
  );
}

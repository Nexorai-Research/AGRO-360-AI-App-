import { useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ApiError } from '@/api/errors';
import { useAuth } from '@/auth/AuthProvider';
import { formatINR } from '@/money';
import { Button } from '@/ui/Button';
import { Notice, kit } from '@/ui/kit';
import { ActionForm, Denied, Loaded, Row, Tabs, itemsOf, s, useCan, useFailureText, useGet, useOneShot, useRefresh, type FieldDef } from '../inventory/kit';
import { PERM, addBarcode, removeBarcode, setPrice, setProductStatus, type Barcode, type PriceRow, type Product, type Ref } from './api';
import ProductForm from './ProductForm';
import { priceBody } from './logic';

interface UnitRow {
  uomId: string;
  code: string;
  isBase: boolean;
  factor: string;
  precision: number;
}
interface TaxInfo {
  current?: { hsnCode: string | null; taxCode: string | null } | null;
  resolved?: { code?: string; ratePct?: string | number | null; problem?: string | null } | null;
  history?: { effectiveFrom: string; hsnCode: string | null; taxCode: string | null; reason: string | null }[];
}
interface HistoryRow {
  at: string;
  action: string;
  field: string | null;
  oldValue: string | null;
  newValue: string | null;
  reason: string | null;
}
type Tab = 'info' | 'units' | 'tax' | 'prices' | 'barcodes' | 'history';
const P = { units: 'product.uom.manage', tax: 'product.tax.manage', status: 'product.deactivate' } as const;

export default function ProductDetail({ id }: { id: string }) {
  const { t } = useTranslation();
  const { client } = useAuth();
  const can = useCan();
  const refresh = useRefresh();
  const failText = useFailureText();
  const [tab, setTab] = useState<Tab>('info');
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [stockWarn, setStockWarn] = useState<null | 'deactivate' | 'archive'>(null);
  const ok = can(PERM.view);
  const p = useGet<Product>(`/products/${id}`, {}, ok);
  const units = useGet<{ items: UnitRow[] }>(`/products/${id}/units`, {}, ok && tab === 'units');
  const uoms = useGet<{ items: Ref[] }>('/uoms', {}, ok && tab === 'units' && form !== null);
  const tax = useGet<TaxInfo>(`/products/${id}/tax`, {}, ok && tab === 'tax');
  const prices = useGet<{ items: PriceRow[] }>(`/products/${id}/prices`, {}, ok && tab === 'prices');
  const codes = useGet<{ items: Barcode[] }>(`/products/${id}/barcodes`, {}, ok && tab === 'barcodes');
  const hist = useGet<{ items: HistoryRow[] }>(`/products/${id}/history`, { limit: 50 }, ok && tab === 'history');
  const done = () => {
    setMsg(t('products.saved'));
    setForm(null);
    setStockWarn(null);
    refresh();
  };
  const one = useOneShot(done);
  if (!ok) return <Denied text={t('products.denied')} />;
  const prod = p.data;

  const close = () => setForm(null);

  const unitFields: FieldDef[] = [
    { name: 'uomId', label: t('products.unit'), kind: 'choice', required: true, options: itemsOf(uoms.data).map((u) => ({ id: u.id, label: u.code ?? u.name })) },
    { name: 'factor', label: t('products.factor'), kind: 'money', required: true, positive: true },
  ];
  const sendUnits = (list: { uomId: string; factor: string }[], key: string) => client!.put(`/products/${id}/units`, { body: { units: list }, idempotencyKey: key });
  const alt = itemsOf(units.data).filter((u) => !u.isBase);

  async function changeStatus(action: 'activate' | 'deactivate' | 'archive', confirmStock = false) {
    await one.run(`${action}:${confirmStock}`, async (key): Promise<false | void> => {
      try {
        await setProductStatus(client!, id, action, confirmStock ? { confirmStock: true } : {}, key);
      } catch (e) {
        if (e instanceof ApiError && e.code === 'STOCK_ON_HAND_WARNING' && action !== 'activate') {
          setStockWarn(action);
          return false;
        }
        throw e;
      }
    });
  }

  return (
    <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
      <Loaded q={p} empty={t('products.notFound')} isEmpty={!prod} offlineKey="products.offline">
        {prod ? (
          <>
            <Text accessibilityRole="header" style={kit.title}>
              {prod.name}
            </Text>
            <Text style={kit.sub}>
              {prod.code} · {t(`products.status.${prod.status}`)}
            </Text>
            {msg ? <Notice tone="ok" text={msg} /> : null}
            {one.failure ? <Notice tone="error" text={failText(one.failure)} /> : null}
            {stockWarn ? (
              <>
                <Notice tone="warn" text={t('products.stockWarn')} />
                <Button label={t('products.continue')} onPress={() => void changeStatus(stockWarn, true)} disabled={one.busy} />
              </>
            ) : null}
            <Tabs
              label={t('products.title')}
              value={tab}
              onChange={(x) => {
                setTab(x);
                setForm(null);
                setEditing(false);
              }}
              tabs={(['info', 'units', 'tax', 'prices', 'barcodes', 'history'] as const).map((x) => ({ id: x, label: t(`products.tabs.${x}`) }))}
            />

            {tab === 'info' ? (
              editing ? (
                <ProductForm
                  product={prod}
                  onCancel={() => setEditing(false)}
                  onSaved={() => {
                    setEditing(false);
                    done();
                  }}
                />
              ) : (
                <>
                  <Row
                    title={t('products.tabs.info')}
                    lines={[
                      `${t('products.category')}: ${prod.categoryName ?? '-'} · ${t('products.brand')}: ${prod.brandName ?? '-'}`,
                      `${t('products.baseUnit')}: ${prod.baseUomCode}${prod.packSize ? ` · ${t('products.packSize')}: ${prod.packSize} ${prod.packUomCode ?? ''}` : ''}`,
                      `${t('products.hsn')}: ${prod.hsnCode ?? '-'} · ${t('products.taxCode')}: ${prod.taxCode ?? '-'}`,
                      `${t('products.mrp')}: ${prod.mrp === null ? '-' : formatINR(prod.mrp)} · ${t('products.sellingPrice')}: ${prod.sellingPrice === null ? '-' : formatINR(prod.sellingPrice)}`,
                      [prod.grade && `${t('products.grade')}: ${prod.grade}`, prod.crop && `${t('products.crop')}: ${prod.crop}`, prod.variety && `${t('products.variety')}: ${prod.variety}`].filter(Boolean).join(' · '),
                      prod.regulatedType && prod.regulatedType !== 'NONE' ? `${t('products.regulated')}: ${prod.regulatedType}` : '',
                    ]}
                  />
                  {can(PERM.update) ? <Button label={t('products.editBtn')} onPress={() => setEditing(true)} /> : null}
                  {can(P.status) && prod.status === 'ACTIVE' ? <Button kind="ghost" label={t('products.deactivate')} onPress={() => void changeStatus('deactivate')} disabled={one.busy} /> : null}
                  {can(P.status) && prod.status === 'ACTIVE' ? <Button kind="ghost" label={t('products.archive')} onPress={() => void changeStatus('archive')} disabled={one.busy} /> : null}
                  {can(P.status) && prod.status !== 'ACTIVE' ? <Button label={t('products.activate')} onPress={() => void changeStatus('activate')} disabled={one.busy} /> : null}
                </>
              )
            ) : null}

            {tab === 'units' ? (
              <>
                {can(P.units) && form === null ? <Button label={t('products.addUnit')} onPress={() => setForm('unit')} /> : null}
                {form === 'unit' ? (
                  <ActionForm
                    title={t('products.addUnit')}
                    hint={t('products.unitHint')}
                    fields={unitFields}
                    submitLabel={t('products.save')}
                    onCancel={close}
                    onDone={done}
                    send={(v, key) =>
                      sendUnits([...alt.filter((u) => u.uomId !== v.uomId).map((u) => ({ uomId: u.uomId, factor: u.factor })), { uomId: String(v.uomId), factor: String(v.factor).trim() }], key)
                    }
                  />
                ) : null}
                <Loaded q={units} empty={t('products.noUnits')} isEmpty={itemsOf(units.data).length === 0} offlineKey="products.offline">
                  {itemsOf(units.data).map((u) => (
                    <Row key={u.uomId} title={`${u.code}${u.isBase ? ` (${t('products.base')})` : ''}`} lines={[t('products.unitLine', { factor: u.factor, precision: u.precision })]}>
                      {can(P.units) && !u.isBase ? (
                        <Button
                          kind="ghost"
                          label={t('products.removeUnit', { code: u.code })}
                          disabled={one.busy}
                          onPress={() => void one.run(`rm:${u.uomId}`, (key) => sendUnits(alt.filter((x) => x.uomId !== u.uomId).map((x) => ({ uomId: x.uomId, factor: x.factor })), key))}
                        />
                      ) : null}
                    </Row>
                  ))}
                </Loaded>
              </>
            ) : null}

            {tab === 'tax' ? (
              <>
                {can(P.tax) && form === null ? <Button label={t('products.changeTax')} onPress={() => setForm('tax')} /> : null}
                {form === 'tax' ? (
                  <ActionForm
                    title={t('products.changeTax')}
                    hint={t('products.taxHint')}
                    fields={[
                      { name: 'effectiveFrom', label: t('products.effectiveFrom'), kind: 'date', required: true },
                      { name: 'hsnCode', label: t('products.hsn'), kind: 'text' },
                      { name: 'taxCode', label: t('products.taxCode'), kind: 'text' },
                      { name: 'hsnConfirmed', label: t('products.hsnConfirm'), kind: 'bool' },
                      { name: 'reason', label: t('products.reason'), kind: 'text' },
                    ]}
                    submitLabel={t('products.save')}
                    onCancel={close}
                    onDone={done}
                    send={(v, key) => {
                      const g = (k: string) => String(v[k]).trim();
                      const body: Record<string, unknown> = { effectiveFrom: g('effectiveFrom') };
                      for (const k of ['hsnCode', 'taxCode', 'reason']) if (g(k)) body[k] = g(k);
                      if (v.hsnConfirmed === true) body.hsnConfirmed = true;
                      return client!.post(`/products/${id}/tax`, { body, idempotencyKey: key });
                    }}
                  />
                ) : null}
                <Loaded q={tax} empty={t('products.noTax')} isEmpty={!tax.data} offlineKey="products.offline">
                  <Row
                    title={t('products.today')}
                    lines={[
                      `${t('products.hsn')}: ${tax.data?.current?.hsnCode ?? '-'} · ${t('products.taxCode')}: ${tax.data?.current?.taxCode ?? '-'}`,
                      tax.data?.resolved?.ratePct != null ? `${tax.data.resolved.code ?? ''} ${tax.data.resolved.ratePct}%` : (tax.data?.resolved?.problem ?? ''),
                    ]}
                  />
                  {(tax.data?.history ?? []).map((x, i) => (
                    <Row key={i} title={x.effectiveFrom} lines={[`${x.hsnCode ?? '-'} · ${x.taxCode ?? '-'}`, x.reason ?? '']} />
                  ))}
                </Loaded>
              </>
            ) : null}

            {tab === 'prices' ? (
              <>
                {can(PERM.price) && form === null ? <Button label={t('products.newPrice')} onPress={() => setForm('price')} /> : null}
                {form === 'price' ? (
                  <ActionForm
                    title={t('products.newPrice')}
                    fields={[
                      { name: 'effectiveFrom', label: t('products.effectiveFrom'), kind: 'date' },
                      { name: 'mrp', label: t('products.mrp'), kind: 'money' },
                      { name: 'sellingPrice', label: t('products.sellingPrice'), kind: 'money' },
                      ...(can(PERM.cost) ? [{ name: 'purchasePrice', label: t('products.purchasePrice'), kind: 'money' as const }] : []),
                      { name: 'reason', label: t('products.reason'), kind: 'text' },
                    ]}
                    submitLabel={t('products.save')}
                    onCancel={close}
                    onDone={done}
                    extraCheck={(v) => (['mrp', 'sellingPrice', 'purchasePrice'].some((k) => String(v[k] ?? '').trim()) ? null : 'products.err.priceAny')}
                    send={(v, key) =>
                      setPrice(client!, id, priceBody({ effectiveFrom: String(v.effectiveFrom), mrp: String(v.mrp), sellingPrice: String(v.sellingPrice), purchasePrice: String(v.purchasePrice ?? ''), reason: String(v.reason) }), key)
                    }
                  />
                ) : null}
                <Loaded q={prices} empty={t('products.noPrices')} isEmpty={itemsOf(prices.data).length === 0} offlineKey="products.offline">
                  {itemsOf(prices.data).map((r, i) => (
                    <Row
                      key={i}
                      title={r.effectiveFrom}
                      lines={[
                        `${t('products.mrp')}: ${r.mrp === null ? '-' : formatINR(r.mrp)} · ${t('products.sellingPrice')}: ${r.sellingPrice === null ? '-' : formatINR(r.sellingPrice)}`,
                        r.purchasePrice ? `${t('products.purchasePrice')}: ${formatINR(r.purchasePrice)}` : '',
                        r.reason ?? '',
                      ]}
                    />
                  ))}
                </Loaded>
              </>
            ) : null}

            {tab === 'barcodes' ? (
              <>
                {can(PERM.barcode) && form === null ? (
                  <>
                    <Button label={t('products.addBarcode')} onPress={() => setForm('barcode')} />
                    <Button kind="ghost" label={t('products.genBarcode')} disabled={one.busy} onPress={() => void one.run('gen', (key) => addBarcode(client!, id, { generate: true }, key))} />
                  </>
                ) : null}
                {form === 'barcode' ? (
                  <ActionForm
                    title={t('products.addBarcode')}
                    fields={[{ name: 'barcode', label: t('products.barcode'), kind: 'text', required: true }]}
                    submitLabel={t('products.save')}
                    onCancel={close}
                    onDone={done}
                    send={(v, key) => addBarcode(client!, id, { barcode: String(v.barcode).trim() }, key)}
                  />
                ) : null}
                <Loaded q={codes} empty={t('products.noBarcodes')} isEmpty={itemsOf(codes.data).length === 0} offlineKey="products.offline">
                  {itemsOf(codes.data).map((b) => (
                    <Row key={b.id} title={b.barcode} lines={[b.isPrimary ? t('products.primary') : b.kind]}>
                      {can(PERM.barcode) ? <Button kind="ghost" label={t('products.removeBarcode', { code: b.barcode })} disabled={one.busy} onPress={() => void one.run(`rmb:${b.id}`, (key) => removeBarcode(client!, id, b.id, key))} /> : null}
                    </Row>
                  ))}
                </Loaded>
              </>
            ) : null}

            {tab === 'history' ? (
              <Loaded q={hist} empty={t('products.noHistory')} isEmpty={itemsOf(hist.data).length === 0} offlineKey="products.offline">
                {itemsOf(hist.data).map((h, i) => (
                  <Row key={i} title={`${h.at.slice(0, 10)} · ${h.action}`} lines={[h.field ? `${h.field}: ${h.oldValue ?? '-'} → ${h.newValue ?? '-'}` : '', h.reason ?? '']} />
                ))}
              </Loaded>
            ) : null}
          </>
        ) : null}
      </Loaded>
    </ScrollView>
  );
}

import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { ApiError, errorMessage, type ErrorMessage } from '@/api/errors';
import { formatINR } from '@/money';
import { Button } from '@/ui/Button';
import { Card, Field, Notice, kit, useActionKey } from '@/ui/kit';
import { StateView } from '../stock/StateView';
import { todayIST } from '../collections/receipt';
import {
  PERM,
  addBarcode,
  fetchBarcodes,
  fetchPrices,
  fetchProduct,
  pkey,
  removeBarcode,
  setPrice,
  setProductStatus,
} from './api';
import { costAboveSelling, priceBody, priceFieldsOk } from './logic';

const isNetwork = (e: unknown) => e instanceof ApiError && e.code === 'NETWORK';

export default function ProductDetailScreen() {
  const { t } = useTranslation();
  const { me, client } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const userId = me?.userId ?? '';
  const can = (p: string) => me?.permissions === undefined || me.permissions.includes(p);
  const ready = client !== null && me !== null && can(PERM.view) && id !== '';
  const ak = useActionKey();
  const [msg, setMsg] = useState<string | null>(null);
  const [failure, setFailure] = useState<ErrorMessage | null>(null);
  const [warn, setWarn] = useState<{ flag: 'confirmStock'; action: 'deactivate' | 'archive' } | null>(null);
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState<string | null>(null);
  const [pricing, setPricing] = useState<null | {
    effectiveFrom: string;
    mrp: string;
    sellingPrice: string;
    purchasePrice: string;
    reason: string;
  }>(null);

  const p = useQuery({
    queryKey: pkey(userId, 'one', id),
    queryFn: ({ signal }) => fetchProduct(client!, id, signal),
    enabled: ready,
    retry: (n, e) => isNetwork(e) && n < 1,
  });
  const codes = useQuery({
    queryKey: pkey(userId, 'codes', id),
    queryFn: ({ signal }) => fetchBarcodes(client!, id, signal),
    enabled: ready,
  });
  const prices = useQuery({
    queryKey: pkey(userId, 'prices', id),
    queryFn: ({ signal }) => fetchPrices(client!, id, signal),
    enabled: ready,
  });

  async function run(fn: () => Promise<unknown>, done: string, onWarn?: (e: ApiError) => boolean) {
    if (busy) return;
    setBusy(true);
    setFailure(null);
    setMsg(null);
    try {
      await fn();
      ak.reset();
      setMsg(done);
      setWarn(null);
      setPricing(null);
      setManual(null);
      void qc.invalidateQueries({ queryKey: ['products'] });
    } catch (e) {
      if (!(e instanceof ApiError && onWarn?.(e))) setFailure(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const changeStatus = (
    action: 'activate' | 'deactivate' | 'archive',
    extra: Record<string, unknown> = {},
  ) => {
    const body = action === 'activate' ? {} : extra;
    return run(
      () => setProductStatus(client!, id, action, body, ak.keyFor(`${action}|${JSON.stringify(body)}`)),
      t(`products.done.${action}`),
      (e) => {
        // the server warns when stock is on hand and wants a second, deliberate confirmation
        if (e.code === 'STOCK_ON_HAND_WARNING' && action !== 'activate') {
          setWarn({ flag: 'confirmStock', action });
          return true;
        }
        return false;
      },
    );
  };

  if (!can(PERM.view)) return <StateView state="denied" message={t('products.denied')} />;
  if (p.isPending && p.fetchStatus !== 'idle') return <StateView state="loading" />;
  if (p.error) {
    const m = errorMessage(p.error);
    return (
      <StateView
        state={isNetwork(p.error) ? 'offline' : 'error'}
        message={
          isNetwork(p.error)
            ? t('products.offline')
            : t(m.key, { ...m.params, correlationId: m.params.correlationId ?? '-' })
        }
        onRetry={() => void p.refetch()}
      />
    );
  }
  const x = p.data;
  if (!x) return <StateView state="loading" />;
  const canBar = can(PERM.barcode);

  return (
    <ScrollView contentContainerStyle={kit.page} keyboardShouldPersistTaps="handled">
      <Text style={kit.title}>{x.name}</Text>
      {msg ? <Notice tone="ok" text={msg} /> : null}
      {failure ? (
        <Notice
          tone="error"
          text={t(failure.key, { ...failure.params, correlationId: failure.params.correlationId ?? '-' })}
        />
      ) : null}
      <Card>
        <Text style={kit.sub}>
          {[x.code, x.status, x.categoryName, x.brandName, x.baseUomCode].filter(Boolean).join(' · ')}
        </Text>
        {x.localName ? <Text style={kit.sub}>{x.localName}</Text> : null}
        <Text style={kit.name}>
          {t('products.prices.line', {
            mrp: x.mrp ? formatINR(x.mrp) : '-',
            selling: x.sellingPrice ? formatINR(x.sellingPrice) : '-',
          })}
        </Text>
        {can(PERM.cost) && x.purchasePrice ? (
          <Text style={kit.sub}>{t('products.prices.cost', { amount: formatINR(x.purchasePrice) })}</Text>
        ) : null}
        <Text style={kit.sub}>
          {[
            x.hsnCode && `HSN ${x.hsnCode}`,
            x.taxCode,
            x.batchTracked ? t('products.batch') : null,
            x.expiryTracked ? t('products.expiry') : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      </Card>

      <View style={kit.row}>
        <Button
          kind="ghost"
          label={t('stkProd.more')}
          onPress={() => router.push(`/products/more?id=${x.id}` as never)}
        />
        {can(PERM.update) ? (
          <Button
            kind="ghost"
            label={t('products.edit')}
            onPress={() => router.push(`/products/form?id=${x.id}` as never)}
          />
        ) : null}
        {can(PERM.update) && x.status !== 'ACTIVE' ? (
          <Button
            label={t('products.activate')}
            disabled={busy}
            onPress={() => void changeStatus('activate')}
          />
        ) : null}
        {can(PERM.update) && x.status === 'ACTIVE' ? (
          <Button
            kind="ghost"
            label={t('products.deactivate')}
            disabled={busy}
            onPress={() => void changeStatus('deactivate')}
          />
        ) : null}
        {can(PERM.update) && x.status !== 'ARCHIVED' ? (
          <Button
            kind="ghost"
            label={t('products.archive')}
            disabled={busy}
            onPress={() => void changeStatus('archive')}
          />
        ) : null}
      </View>
      {warn ? (
        <Card>
          <Notice tone="warn" text={t('products.stockWarning')} />
          <Button
            label={t('products.continue')}
            disabled={busy}
            onPress={() => void changeStatus(warn.action, { confirmStock: true })}
          />
          <Button kind="ghost" label={t('pos.back')} onPress={() => setWarn(null)} />
        </Card>
      ) : null}

      <Text style={kit.name}>{t('products.barcodes')}</Text>
      {(codes.data ?? []).length === 0 ? <Text style={kit.sub}>{t('products.noBarcode')}</Text> : null}
      {(codes.data ?? []).map((b) => (
        <Card key={b.id}>
          <Text style={kit.name}>{b.barcode}</Text>
          <Text style={kit.sub}>
            {b.kind}
            {b.isPrimary ? ` (${t('products.primary')})` : ''}
          </Text>
          {canBar ? (
            <Button
              kind="ghost"
              label={t('products.removeBarcode', { code: b.barcode })}
              disabled={busy}
              onPress={() =>
                void run(
                  () => removeBarcode(client!, id, b.id, ak.keyFor(`rm|${b.id}`)),
                  t('products.done.barcodeRemoved'),
                )
              }
            />
          ) : null}
        </Card>
      ))}
      {canBar ? (
        <View style={kit.row}>
          <Button
            kind="ghost"
            label={t('products.generateBarcode')}
            disabled={busy}
            onPress={() =>
              void run(
                () => addBarcode(client!, id, { generate: true }, ak.keyFor('gen')),
                t('products.done.barcodeAdded'),
              )
            }
          />
          <Button kind="ghost" label={t('products.addBarcode')} onPress={() => setManual('')} />
        </View>
      ) : null}
      {manual !== null ? (
        <Card>
          <Field label={t('products.barcode')} value={manual} onChange={setManual} />
          <Button
            label={t('products.saveBarcode')}
            disabled={busy || !manual.trim()}
            onPress={() =>
              void run(
                () => addBarcode(client!, id, { barcode: manual.trim() }, ak.keyFor(`add|${manual.trim()}`)),
                t('products.done.barcodeAdded'),
              )
            }
          />
        </Card>
      ) : null}

      <Text style={kit.name}>{t('products.priceHistory')}</Text>
      {(prices.data ?? []).map((r, i) => (
        <Text key={i} style={kit.sub}>
          {r.effectiveFrom} · MRP {r.mrp ? formatINR(r.mrp) : '-'} · {t('products.selling')}{' '}
          {r.sellingPrice ? formatINR(r.sellingPrice) : '-'}
          {can(PERM.cost) && r.purchasePrice
            ? ` · ${t('products.costShort')} ${formatINR(r.purchasePrice)}`
            : ''}
          {r.reason ? ` · ${r.reason}` : ''}
        </Text>
      ))}
      {can(PERM.price) || can(PERM.update) ? (
        <Button
          kind="ghost"
          label={t('products.setPrice')}
          onPress={() =>
            setPricing({
              effectiveFrom: todayIST(),
              mrp: '',
              sellingPrice: '',
              purchasePrice: '',
              reason: '',
            })
          }
        />
      ) : null}
      {pricing ? (
        <Card>
          <Text style={kit.sub}>{t('products.priceHint')}</Text>
          <Field
            label={t('products.effectiveFrom')}
            value={pricing.effectiveFrom}
            onChange={(v) => setPricing({ ...pricing, effectiveFrom: v })}
            placeholder="YYYY-MM-DD"
          />
          <Field
            label="MRP"
            value={pricing.mrp}
            onChange={(v) => setPricing({ ...pricing, mrp: v })}
            keyboard="decimal-pad"
          />
          <Field
            label={t('products.selling')}
            value={pricing.sellingPrice}
            onChange={(v) => setPricing({ ...pricing, sellingPrice: v })}
            keyboard="decimal-pad"
          />
          {can(PERM.cost) ? (
            <Field
              label={t('products.cost')}
              value={pricing.purchasePrice}
              onChange={(v) => setPricing({ ...pricing, purchasePrice: v })}
              keyboard="decimal-pad"
            />
          ) : null}
          <Field
            label={t('products.reason')}
            value={pricing.reason}
            onChange={(v) => setPricing({ ...pricing, reason: v })}
          />
          {costAboveSelling(pricing.purchasePrice, pricing.sellingPrice) ? (
            <Notice tone="warn" text={t('products.lossWarning')} />
          ) : null}
          <Button
            label={t('products.savePrice')}
            disabled={busy || !priceFieldsOk(pricing)}
            onPress={() => {
              const b = priceBody(pricing);
              void run(
                () => setPrice(client!, id, b, ak.keyFor(`price|${JSON.stringify(b)}`)),
                t('products.done.price'),
              );
            }}
          />
        </Card>
      ) : null}
    </ScrollView>
  );
}

import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Stack, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { ApiError } from '@/api/errors';
import { formatINR } from '@/money';
import { Button } from '@/ui/Button';
import { BarcodeScanner } from '../stock/BarcodeScanner';
import { StateView } from '../stock/StateView';
import {
  PERM,
  createOrder,
  fetchBranches,
  fetchSuppliers,
  fetchWarehouses,
  key,
  productByBarcode,
  searchProducts,
  type ProductLite,
} from './api';
import { Gate, retryNetworkOnce } from './Gate';
import { buildOrderBody, lineEstimate, orderErrors, orderEstimate, todayIST, type OrderDraft } from './logic';
import { Chips, Field, Notice, k, useActionKey, useErrorText } from './ui';

export default function OrderFormScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const errText = useErrorText();
  const { me, client } = useAuth();
  const userId = me?.userId ?? '';
  const can = (p: string) => me?.permissions === undefined || me.permissions.includes(p);
  const ready = client !== null && me !== null && can(PERM.create);
  const actionKey = useActionKey();

  const [d, setD] = useState<OrderDraft>({
    supplierId: '',
    branchId: '',
    warehouseId: '',
    orderDate: todayIST(),
    expectedDate: '',
    notes: '',
    lines: [],
  });
  const [term, setTerm] = useState('');
  const [searched, setSearched] = useState('');
  const [scan, setScan] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);

  const suppliers = useQuery({
    queryKey: key(userId, 'suppliers-active'),
    queryFn: ({ signal }) => fetchSuppliers(client!, '', signal),
    enabled: ready,
    retry: retryNetworkOnce,
  });
  const branches = useQuery({ queryKey: key(userId, 'branches'), queryFn: ({ signal }) => fetchBranches(client!, signal), enabled: ready, staleTime: 5 * 60_000 });
  const warehouses = useQuery({ queryKey: key(userId, 'warehouses'), queryFn: ({ signal }) => fetchWarehouses(client!, signal), enabled: ready, staleTime: 5 * 60_000 });
  const found = useQuery({
    queryKey: key(userId, 'products', searched),
    queryFn: ({ signal }) => searchProducts(client!, searched, signal),
    enabled: ready && can(PERM.product) && searched.length >= 2,
  });

  function addProduct(p: ProductLite) {
    setNote(null);
    if (d.lines.some((l) => l.skuId === p.id)) {
      setNote(t('purchase.alreadyAdded', { name: p.name }));
      return;
    }
    setD((x) => ({ ...x, lines: [...x.lines, { skuId: p.id, label: `${p.code} ${p.name}`, qty: '', rate: '', discountPct: '' }] }));
  }
  async function onScanned(code: string) {
    setScan(false);
    try {
      addProduct(await productByBarcode(client!, code));
    } catch (e) {
      setNote(e instanceof ApiError && e.status === 404 ? t('purchase.barcodeNotFound', { code }) : errText(e));
    }
  }
  const setLine = (i: number, patch: Partial<OrderDraft['lines'][number]>) =>
    setD((x) => ({ ...x, lines: x.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) }));

  if (!can(PERM.create)) return <StateView state="denied" message={t('purchase.deniedCreate')} />;

  const errors = orderErrors(d);
  const has = (e: (typeof errors)[number]) => tried && errors.includes(e);
  const activeSuppliers = (suppliers.data ?? []).filter((s) => s.status === 'ACTIVE');
  const wh = (warehouses.data ?? []).filter((w) => w.sellable !== false && (!d.branchId || !w.branchId || w.branchId === d.branchId));

  async function save() {
    setTried(true);
    if (errors.length > 0 || busy) return;
    setBusy(true);
    setFailure(null);
    try {
      const body = buildOrderBody(d);
      // same body: same key (a retry after a lost answer cannot make a second order); changed body: new key
      const r = await createOrder(client!, body, actionKey.keyFor(JSON.stringify(body)));
      actionKey.reset();
      router.replace({ pathname: '/purchase/[id]', params: { id: r.id } });
    } catch (e) {
      setFailure(errText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={k.page} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ headerShown: true, title: t('purchase.newOrder') }} />
      <Gate q={suppliers} ns="purchase" emptyKey="purchase.emptySuppliers" isEmpty={false}>
        <Text style={k.label}>{t('purchase.supplier')}</Text>
        <Chips options={activeSuppliers.map((s) => ({ value: s.id, label: s.name }))} value={d.supplierId} onChange={(v) => setD({ ...d, supplierId: v })} />
        {has('supplier') ? <Text style={k.error}>{t('purchase.v.supplier')}</Text> : null}

        <Text style={k.label}>{t('purchase.branch')}</Text>
        <Chips options={(branches.data ?? []).map((b) => ({ value: b.id, label: b.name }))} value={d.branchId} onChange={(v) => setD({ ...d, branchId: v, warehouseId: '' })} />
        {has('branch') ? <Text style={k.error}>{t('purchase.v.branch')}</Text> : null}

        <Text style={k.label}>{t('purchase.warehouse')}</Text>
        <Chips options={wh.map((w) => ({ value: w.id, label: w.name }))} value={d.warehouseId} onChange={(v) => setD({ ...d, warehouseId: v })} />
        {has('warehouse') ? <Text style={k.error}>{t('purchase.v.warehouse')}</Text> : null}

        <Field label={t('purchase.orderDate')} value={d.orderDate} onChange={(v) => setD({ ...d, orderDate: v })} placeholder="YYYY-MM-DD" error={has('date') ? t('purchase.v.date') : null} />
        <Field label={t('purchase.expectedDate')} value={d.expectedDate} onChange={(v) => setD({ ...d, expectedDate: v })} placeholder="YYYY-MM-DD" error={has('expected') ? t('purchase.v.expected') : null} />
        <Field label={t('purchase.notes')} value={d.notes} onChange={(v) => setD({ ...d, notes: v })} />

        <Text style={k.h2}>{t('purchase.lines')}</Text>
        {can(PERM.product) ? (
          <>
            <Field label={t('purchase.searchProduct')} value={term} onChange={setTerm} />
            <View style={k.row}>
              <Button kind="ghost" label={t('purchase.search')} onPress={() => setSearched(term.trim())} />
              <Button kind="ghost" label={t('purchase.scan')} onPress={() => setScan(true)} />
            </View>
            {(found.data ?? []).map((p) => (
              <Button key={p.id} kind="ghost" label={`${t('purchase.add')} ${p.code} ${p.name}`} onPress={() => addProduct(p)} />
            ))}
          </>
        ) : (
          <Notice tone="warn" text={t('purchase.noProductPermission')} />
        )}
        {note ? <Notice tone="warn" text={note} /> : null}
        {has('noLines') ? <Text style={k.error}>{t('purchase.v.noLines')}</Text> : null}

        {d.lines.map((l, i) => {
          const est = lineEstimate(l);
          return (
            <View key={l.skuId} style={k.card}>
              <Text style={k.name}>{l.label}</Text>
              <Field label={`${t('purchase.qty')} ${i + 1}`} value={l.qty} onChange={(v) => setLine(i, { qty: v })} keyboard="decimal-pad" />
              <Field label={`${t('purchase.rate')} ${i + 1}`} value={l.rate} onChange={(v) => setLine(i, { rate: v })} keyboard="decimal-pad" />
              <Field label={`${t('purchase.discount')} ${i + 1}`} value={l.discountPct} onChange={(v) => setLine(i, { discountPct: v })} keyboard="decimal-pad" />
              {est ? <Text style={k.sub}>{t('purchase.estimate', { amount: formatINR(est) })}</Text> : null}
              <Button kind="ghost" label={`${t('purchase.remove')} ${l.label}`} onPress={() => setD((x) => ({ ...x, lines: x.lines.filter((_, j) => j !== i) }))} />
            </View>
          );
        })}
        {has('qty') ? <Text style={k.error}>{t('purchase.v.qty')}</Text> : null}
        {has('rate') ? <Text style={k.error}>{t('purchase.v.rate')}</Text> : null}
        {has('discount') ? <Text style={k.error}>{t('purchase.v.discount')}</Text> : null}
        {d.lines.length > 0 ? <Text style={k.name}>{t('purchase.estimateTotal', { amount: formatINR(orderEstimate(d.lines)) })}</Text> : null}
        <Text style={k.sub}>{t('purchase.serverTotals')}</Text>

        {failure ? <Notice tone="error" text={failure} /> : null}
        <Button label={t('purchase.saveOrder')} disabled={busy} onPress={() => void save()} />
      </Gate>
      <BarcodeScanner visible={scan} onScanned={(c) => void onScanned(c)} onClose={() => setScan(false)} />
    </ScrollView>
  );
}

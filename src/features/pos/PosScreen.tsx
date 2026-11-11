import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { ApiError, errorMessage, type ErrorMessage } from '@/api/errors';
import { newId } from '@/device';
import { formatINR } from '@/money';
import { Button } from '@/ui/Button';
import { colors, radius } from '@/ui/theme';
import { BarcodeScanner } from '../stock/BarcodeScanner';
import { StateView } from '../stock/StateView';
import { todayIST } from '../collections/receipt';
import {
  PERM,
  fetchBranches,
  fetchPayModes,
  fetchWarehouses,
  postInvoice,
  posKey,
  previewInvoice,
  productByBarcode,
  searchCustomers,
  searchProducts,
  type CustomerLite,
  type InvoiceResult,
  type Preview,
  type ProductLite,
} from './api';
import {
  addProduct,
  changeFor,
  checkPayment,
  createKeyKeeper,
  emptyCart,
  firstCartError,
  patchLine,
  removeLine,
  toInvoiceBody,
  toTenders,
  type Cart,
  type TenderInputs,
} from './cart';

const isNetwork = (e: unknown) => e instanceof ApiError && e.code === 'NETWORK';

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const h = setTimeout(() => setV(value), ms);
    return () => clearTimeout(h);
  }, [value, ms]);
  return v;
}

export default function PosScreen() {
  const { t } = useTranslation();
  const { me, client } = useAuth();
  const userId = me?.userId ?? '';
  const allowed = me?.permissions === undefined || me.permissions.includes(PERM.pos);
  const ready = client !== null && me !== null && allowed;

  const [cart, setCart] = useState<Cart>(emptyCart);
  const [customer, setCustomer] = useState<CustomerLite | null>(null);
  const [search, setSearch] = useState('');
  const [custSearch, setCustSearch] = useState('');
  const [scan, setScan] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [priced, setPriced] = useState<{ body: string; preview: Preview | null; err: ErrorMessage | null } | null>(null);
  const [billDate, setBillDate] = useState(() => todayIST());
  const [paying, setPaying] = useState(false);
  const [tender, setTender] = useState<TenderInputs>({});
  const [reference, setReference] = useState('');
  const [failure, setFailure] = useState<ErrorMessage | null>(null);
  const [lostAnswer, setLostAnswer] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<InvoiceResult | null>(null);

  const keeper = useRef(createKeyKeeper(newId));
  const sending = useRef(false);
  const seq = useRef(0);

  const q = useDebounced(search.trim(), 300);
  const cq = useDebounced(custSearch.trim(), 300);
  const retry = (n: number, e: unknown) => isNetwork(e) && n < 1;

  const branches = useQuery({
    queryKey: posKey(userId, 'branches'),
    queryFn: ({ signal }) => fetchBranches(client!, signal),
    enabled: ready,
    staleTime: 5 * 60_000,
    retry,
  });
  const warehouses = useQuery({
    queryKey: posKey(userId, 'warehouses'),
    queryFn: ({ signal }) => fetchWarehouses(client!, signal),
    enabled: ready,
    staleTime: 5 * 60_000,
    retry,
  });
  const modes = useQuery({
    queryKey: posKey(userId, 'modes'),
    queryFn: ({ signal }) => fetchPayModes(client!, signal),
    enabled: ready,
    staleTime: 5 * 60_000,
    retry,
  });
  const products = useQuery({
    queryKey: posKey(userId, 'products', q),
    queryFn: ({ signal }) => searchProducts(client!, q, signal),
    enabled: ready && q.length >= 2,
    staleTime: 30_000,
    retry,
  });
  const customers = useQuery({
    queryKey: posKey(userId, 'customers', cq),
    queryFn: ({ signal }) => searchCustomers(client!, cq, signal),
    enabled: ready && cq.length >= 2 && customer === null,
    staleTime: 30_000,
    retry,
  });

  const scope =
    me && Array.isArray(me.branchScope)
      ? (me.branchScope as unknown[]).filter((x): x is string => typeof x === 'string')
      : [];
  const branchId = cart.branchId || branches.data?.[0]?.id || (scope.length === 1 ? scope[0]! : '');
  const effective: Cart = { ...cart, branchId };
  const whOf = (b: string) => warehouses.data?.find((w) => w.branchId === b)?.id ?? '';
  const lineErr = firstCartError(effective);

  // The server prices the bill (tax, round-off, place of supply). Only the newest answer may draw the total, and an answer
  // for an older cart is ignored because it is matched to the exact request body.
  const priceable = ready && !!client && effective.lines.length > 0 && !lineErr && !!branchId;
  const body = JSON.stringify(toInvoiceBody(effective, billDate));
  useEffect(() => {
    if (!priceable || !client) return;
    const mine = ++seq.current;
    const ctl = new AbortController();
    previewInvoice(client, JSON.parse(body), ctl.signal)
      .then((p) => {
        if (mine === seq.current) setPriced({ body, preview: p, err: null });
      })
      .catch((e) => {
        if (mine === seq.current && !ctl.signal.aborted) setPriced({ body, preview: null, err: errorMessage(e) });
      });
    return () => ctl.abort();
  }, [body, client, priceable]);
  const current = priceable && priced?.body === body ? priced : null;
  const preview = current?.preview ?? null;
  const previewErr = current?.err ?? null;

  const changed = () => {
    setFailure(null);
    setLostAnswer(false);
  };
  const add = (p: ProductLite) => {
    const wh = whOf(branchId);
    if (!wh) {
      setNote(t('pos.noWarehouse'));
      return;
    }
    setNote(null);
    setCart((c) => addProduct({ ...c, branchId }, p, wh));
    setSearch('');
    changed();
  };

  async function onScanned(code: string) {
    setScan(false);
    try {
      add(await productByBarcode(client!, code));
    } catch (e) {
      setNote(e instanceof ApiError && e.status === 404 ? t('pos.barcodeNotFound', { code }) : t(errorMessage(e).key, { ...errorMessage(e).params, correlationId: errorMessage(e).params.correlationId ?? '-' }));
    }
  }

  const tenders = toTenders(tender, reference);
  const total = preview?.totals.total ?? '0.00';
  const payCheck = checkPayment(total, tenders, customer !== null);
  const change = changeFor(total, tenders);

  async function finalize() {
    if (sending.current || !client || !preview) return;
    if (payCheck !== 'ok') return;
    sending.current = true;
    setBusy(true);
    setFailure(null);
    setLostAnswer(false);
    const b = toInvoiceBody(effective, billDate, tenders);
    const key = keeper.current.keyFor(b);
    try {
      setDone(await postInvoice(client, b, key));
      keeper.current.reset();
    } catch (e) {
      setFailure(errorMessage(e));
      setLostAnswer(isNetwork(e));
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  function newBill() {
    keeper.current.reset();
    setBillDate(todayIST());
    setCart({ ...emptyCart, branchId });
    setCustomer(null);
    setCustSearch('');
    setTender({});
    setReference('');
    setPaying(false);
    setPriced(null);
    setFailure(null);
    setLostAnswer(false);
    setDone(null);
  }

  if (!allowed) return <StateView state="denied" message={t('pos.denied')} />;

  if (done) {
    return (
      <ScrollView contentContainerStyle={s.page}>
        <View style={s.card} accessibilityRole="alert">
          <Text style={s.ok}>{t('pos.success', { number: done.number })}</Text>
          <Text style={s.line}>{t('pos.totalLine', { amount: formatINR(done.total) })}</Text>
          {Number(done.changeDue) > 0 ? (
            <Text style={s.line}>{t('pos.changeLine', { amount: formatINR(done.changeDue) })}</Text>
          ) : null}
          {Number(done.creditAmount) > 0 ? (
            <Text style={s.line}>{t('pos.creditLine', { amount: formatINR(done.creditAmount) })}</Text>
          ) : null}
        </View>
        <Button label={t('pos.newBill')} onPress={newBill} />
      </ScrollView>
    );
  }

  const loading = [branches, warehouses, modes].some((x) => x.isPending && x.fetchStatus !== 'idle');
  const loadErr = branches.error ?? warehouses.error ?? modes.error;
  if (loadErr && isNetwork(loadErr))
    return (
      <StateView
        state="offline"
        message={t('pos.offline')}
        onRetry={() => {
          void branches.refetch();
          void warehouses.refetch();
          void modes.refetch();
        }}
      />
    );
  if (loadErr) {
    const m = errorMessage(loadErr);
    return (
      <StateView
        state={m.key === 'errors.FORBIDDEN' ? 'denied' : 'error'}
        message={t(m.key, { ...m.params, correlationId: m.params.correlationId ?? '-' })}
        onRetry={() => void branches.refetch()}
      />
    );
  }
  if (loading) return <StateView state="loading" />;

  const err = (k: string) => <Text style={s.fieldError}>{t(`pos.v.${k}`)}</Text>;

  return (
    <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
      <Text style={s.title}>{t('pos.title')}</Text>
      {note ? <Text style={s.error}>{note}</Text> : null}

      {(branches.data?.length ?? 0) > 1 ? (
        <View style={s.chips} accessibilityRole="radiogroup" accessibilityLabel={t('pos.branch')}>
          {branches.data!.map((b) => (
            <Pressable
              key={b.id}
              accessibilityRole="radio"
              accessibilityLabel={b.name}
              accessibilityState={{ selected: branchId === b.id }}
              onPress={() => {
                // lines hold a warehouse of one branch, so a different branch starts an empty bill
                setCart({ ...emptyCart, branchId: b.id });
                changed();
              }}
              style={[s.chip, branchId === b.id && s.chipOn]}
            >
              <Text style={[s.chipTxt, branchId === b.id && s.chipTxtOn]}>{b.name}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <View style={s.row}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder={t('pos.searchProduct')}
          accessibilityLabel={t('pos.searchProduct')}
          autoCorrect={false}
          style={[s.input, s.grow]}
        />
        <Button kind="ghost" label={t('pos.scan')} onPress={() => setScan(true)} />
      </View>
      {products.isFetching ? <ActivityIndicator color={colors.brand} /> : null}
      {q.length >= 2 && products.data && products.data.length === 0 ? (
        <Text style={s.sub}>{t('pos.noProducts')}</Text>
      ) : null}
      {(products.data ?? []).map((p) => (
        <Pressable key={p.id} accessibilityRole="button" accessibilityLabel={p.name} onPress={() => add(p)} style={s.result}>
          <Text style={s.name}>{p.name}</Text>
          <Text style={s.sub}>{[p.code, p.sellingPrice ? formatINR(p.sellingPrice) : null].filter(Boolean).join(' · ')}</Text>
        </Pressable>
      ))}

      {effective.lines.length === 0 ? <Text style={s.sub}>{t('pos.emptyCart')}</Text> : null}
      {effective.lines.map((l, i) => (
        <View key={`${l.skuId}-${l.warehouseId}`} style={s.card}>
          <View style={s.row}>
            <Text style={[s.name, s.grow]}>{l.name}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('pos.remove', { name: l.name })}
              onPress={() => {
                setCart(removeLine(effective, i));
                changed();
              }}
              style={s.link}
            >
              <Text style={s.linkTxt}>{t('pos.removeShort')}</Text>
            </Pressable>
          </View>
          <View style={s.row}>
            <View style={s.grow}>
              <Text style={s.label}>{t('pos.qty')}</Text>
              <TextInput
                value={l.qty}
                onChangeText={(v) => {
                  setCart(patchLine(effective, i, { qty: v }));
                  changed();
                }}
                accessibilityLabel={t('pos.qtyFor', { name: l.name })}
                keyboardType="decimal-pad"
                style={s.input}
              />
            </View>
            <View style={s.grow}>
              <Text style={s.label}>{t('pos.discountPct')}</Text>
              <TextInput
                value={l.discountPct}
                onChangeText={(v) => {
                  setCart(patchLine(effective, i, { discountPct: v }));
                  changed();
                }}
                accessibilityLabel={t('pos.discountFor', { name: l.name })}
                keyboardType="decimal-pad"
                style={s.input}
              />
            </View>
          </View>
          {lineErr?.index === i ? err(lineErr.error) : null}
        </View>
      ))}

      {effective.lines.length > 0 ? (
        <View style={s.card} accessibilityLiveRegion="polite">
          {previewErr ? (
            <Text style={s.error}>
              {t(previewErr.key, { ...previewErr.params, correlationId: previewErr.params.correlationId ?? '-' })}
            </Text>
          ) : preview ? (
            <>
              <Text style={s.sub}>{t('pos.supply', { place: preview.placeOfSupply })}</Text>
              {(['gross', 'discount', 'taxable', 'cgst', 'sgst', 'igst', 'roundOff'] as const)
                .filter((k) => Number(preview.totals[k]) !== 0)
                .map((k) => (
                  <Text key={k} style={s.line}>
                    {t(`pos.tot.${k}`)}: {formatINR(preview.totals[k])}
                  </Text>
                ))}
              <Text style={s.grand}>{t('pos.total', { amount: formatINR(preview.totals.total) })}</Text>
            </>
          ) : lineErr ? null : (
            <ActivityIndicator color={colors.brand} />
          )}
        </View>
      ) : null}

      <Text style={s.label}>{t('pos.customer')}</Text>
      {customer ? (
        <View style={s.selected}>
          <Text style={s.name}>{customer.name}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('pos.walkIn')}
            onPress={() => {
              setCustomer(null);
              setCart({ ...effective, customerId: '' });
              changed();
            }}
            style={s.link}
          >
            <Text style={s.linkTxt}>{t('pos.walkIn')}</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <TextInput
            value={custSearch}
            onChangeText={setCustSearch}
            placeholder={t('pos.searchCustomer')}
            accessibilityLabel={t('pos.searchCustomer')}
            autoCorrect={false}
            style={s.input}
          />
          {(customers.data ?? []).map((c) => (
            <Pressable
              key={c.id}
              accessibilityRole="button"
              accessibilityLabel={c.name}
              onPress={() => {
                setCustomer(c);
                setCart({ ...effective, customerId: c.id });
                changed();
              }}
              style={s.result}
            >
              <Text style={s.name}>{c.name}</Text>
              {c.village || c.mobile ? <Text style={s.sub}>{[c.village, c.mobile].filter(Boolean).join(' · ')}</Text> : null}
            </Pressable>
          ))}
        </>
      )}

      {!paying ? (
        <Button
          label={t('pos.pay')}
          disabled={!preview || effective.lines.length === 0}
          onPress={() => setPaying(true)}
        />
      ) : (
        <View style={s.card}>
          <Text style={s.label}>{t('pos.payments')}</Text>
          <Text style={s.sub}>{customer ? t('pos.creditHint') : t('pos.walkInHint')}</Text>
          {(modes.data ?? []).map((m) => (
            <View key={m.code} style={s.row}>
              <Text style={[s.name, s.grow]}>{m.code}</Text>
              <TextInput
                value={tender[m.code] ?? ''}
                onChangeText={(v) => {
                  setTender((x) => ({ ...x, [m.code]: v }));
                  changed();
                }}
                placeholder="0.00"
                accessibilityLabel={t('pos.amountFor', { mode: m.code })}
                keyboardType="decimal-pad"
                style={[s.input, s.grow]}
              />
            </View>
          ))}
          <TextInput
            value={reference}
            onChangeText={setReference}
            placeholder={t('pos.reference')}
            accessibilityLabel={t('pos.reference')}
            autoCorrect={false}
            style={s.input}
          />
          {Number(change) > 0 ? <Text style={s.line}>{t('pos.changeLine', { amount: formatINR(change) })}</Text> : null}
          {payCheck === 'none' ? err('payNone') : null}
          {payCheck === 'short' ? err('payShort') : null}
          {failure ? (
            <View accessibilityRole="alert">
              <Text style={s.error}>
                {t(failure.key, { ...failure.params, correlationId: failure.params.correlationId ?? '-' })}
              </Text>
              {lostAnswer ? <Text style={s.line}>{t('pos.lostAnswer')}</Text> : null}
            </View>
          ) : null}
          <Button label={busy ? t('common.loading') : t('pos.finalize')} disabled={busy || payCheck !== 'ok'} onPress={() => void finalize()} />
          <Button kind="ghost" label={t('pos.back')} onPress={() => setPaying(false)} />
        </View>
      )}

      <BarcodeScanner visible={scan} onScanned={(c) => void onScanned(c)} onClose={() => setScan(false)} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: { padding: 16, gap: 10, backgroundColor: colors.bg },
  title: { fontSize: 22, fontWeight: '700', color: colors.ink },
  card: { backgroundColor: colors.card, borderRadius: radius, borderWidth: 1, borderColor: colors.line, padding: 12, gap: 8 },
  row: { flexDirection: 'row', gap: 8, alignItems: 'flex-end' },
  grow: { flex: 1 },
  label: { fontSize: 14, color: colors.muted, fontWeight: '600' },
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.line, borderRadius: radius, paddingHorizontal: 12, fontSize: 16, backgroundColor: '#fff', color: colors.ink },
  name: { fontSize: 16, color: colors.ink, fontWeight: '600' },
  sub: { fontSize: 14, color: colors.muted },
  line: { fontSize: 16, color: colors.ink },
  grand: { fontSize: 20, fontWeight: '700', color: colors.ink },
  ok: { fontSize: 18, fontWeight: '700', color: colors.ok },
  error: { fontSize: 15, color: colors.danger },
  fieldError: { fontSize: 14, color: colors.danger },
  result: { minHeight: 48, padding: 12, borderRadius: radius, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card },
  selected: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48 },
  link: { minHeight: 48, minWidth: 48, justifyContent: 'center', paddingHorizontal: 8 },
  linkTxt: { color: colors.info, fontSize: 15, fontWeight: '600' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 48, paddingHorizontal: 16, borderRadius: radius, borderWidth: 1, borderColor: colors.line, justifyContent: 'center', backgroundColor: colors.card },
  chipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipTxt: { fontSize: 15, color: colors.ink },
  chipTxtOn: { color: colors.brandInk, fontWeight: '600' },
});

import { useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { ApiError, errorMessage, type ErrorMessage } from '@/api/errors';
import { Button } from '@/ui/Button';
import { Card, Check, Chips, Field, Notice, kit, useActionKey } from '@/ui/kit';
import { StateView } from '../stock/StateView';
import {
  PERM,
  createProduct,
  type Product,
  fetchBrands,
  fetchCategories,
  fetchProduct,
  fetchUoms,
  pkey,
  updateProduct,
} from './api';
import { draftOf, emptyDraft, toBody, validateDraft, type DraftErrors, type ProductDraft } from './logic';

/** Waits for the product when editing, then mounts the form with it as the starting values (no state set during render). */
export default function ProductFormScreen() {
  const { me, client } = useAuth();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const cur = useQuery({
    queryKey: pkey(me?.userId ?? '', 'one', id ?? ''),
    queryFn: ({ signal }) => fetchProduct(client!, id!, signal),
    enabled: client !== null && me !== null && !!id,
  });
  if (id && cur.isPending && cur.fetchStatus !== 'idle') return <StateView state="loading" />;
  if (id && !cur.data && cur.error) {
    const m = errorMessage(cur.error);
    return <StateView state="error" message={m.key} onRetry={() => void cur.refetch()} />;
  }
  return <ProductForm key={id ?? 'new'} product={cur.data ?? null} />;
}

function ProductForm({ product }: { product: Product | null }) {
  const { t } = useTranslation();
  const { me, client } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const creating = !id;
  const userId = me?.userId ?? '';
  const can = (p: string) => me?.permissions === undefined || me.permissions.includes(p);
  const allowed = can(creating ? PERM.create : PERM.update);
  const canCost = can(PERM.cost);
  const ready = client !== null && me !== null && allowed;
  const ak = useActionKey();

  const [d, setD] = useState<ProductDraft>(product ? draftOf(product) : emptyDraft);
  const [errors, setErrors] = useState<DraftErrors>({});
  const [failure, setFailure] = useState<ErrorMessage | null>(null);
  const [dup, setDup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  const cats = useQuery({
    queryKey: pkey(userId, 'cats'),
    queryFn: ({ signal }) => fetchCategories(client!, signal),
    enabled: ready,
    staleTime: 5 * 60_000,
  });
  const brands = useQuery({
    queryKey: pkey(userId, 'brands'),
    queryFn: ({ signal }) => fetchBrands(client!, signal),
    enabled: ready,
    staleTime: 5 * 60_000,
  });
  const uoms = useQuery({
    queryKey: pkey(userId, 'uoms'),
    queryFn: ({ signal }) => fetchUoms(client!, signal),
    enabled: ready,
    staleTime: 5 * 60_000,
  });

  const set = <K extends keyof ProductDraft>(k: K, v: ProductDraft[K]) => {
    setD((x) => ({ ...x, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
    setFailure(null);
    setDup(false);
  };
  const err = (k: keyof ProductDraft) => (errors[k] ? t(`products.v.${errors[k]}`) : null);

  async function save(confirmDuplicate = false) {
    if (busy || !client) return;
    const e = validateDraft(d, creating, canCost);
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    setBusy(true);
    setFailure(null);
    const body = { ...toBody(d, creating, canCost), ...(confirmDuplicate ? { confirmDuplicate: true } : {}) };
    try {
      const r = creating
        ? await createProduct(client, body, ak.keyFor(JSON.stringify(body)))
        : await updateProduct(
            client,
            product!,
            body,
            ak.keyFor(`${id}|${product!.version}|${JSON.stringify(body)}`),
          );
      ak.reset();
      void qc.invalidateQueries({ queryKey: ['products'] });
      setSaved(t(creating ? 'products.done.created' : 'products.done.saved', { name: r?.name ?? d.name }));
    } catch (x) {
      if (x instanceof ApiError && x.code === 'DUPLICATE_WARNING') setDup(true);
      else setFailure(errorMessage(x));
    } finally {
      setBusy(false);
    }
  }

  if (!allowed) return <StateView state="denied" message={t('products.denied')} />;
  if (saved)
    return (
      <ScrollView contentContainerStyle={kit.page}>
        <Notice tone="ok" text={saved} />
        <Button label={t('products.backToList')} onPress={() => router.replace('/products' as never)} />
      </ScrollView>
    );

  return (
    <ScrollView contentContainerStyle={kit.page} keyboardShouldPersistTaps="handled">
      <Text style={kit.title}>{t(creating ? 'products.new' : 'products.edit')}</Text>
      <Field label={t('products.name')} value={d.name} onChange={(v) => set('name', v)} error={err('name')} />
      <Field label={t('products.localName')} value={d.localName} onChange={(v) => set('localName', v)} />
      <Chips
        label={t('products.category')}
        options={(cats.data ?? []).map((c) => ({
          id: c.id,
          label: `${'— '.repeat(Math.max((c.level ?? 1) - 1, 0))}${c.name}`,
        }))}
        value={d.categoryId}
        onChange={(v) => set('categoryId', v)}
      />
      {err('categoryId') ? <Notice tone="error" text={err('categoryId')!} /> : null}
      <Chips
        label={t('products.brand')}
        options={(brands.data ?? []).map((b) => ({ id: b.id, label: b.name }))}
        value={d.brandId}
        onChange={(v) => set('brandId', v)}
      />
      <Chips
        label={t('products.unit')}
        options={(uoms.data ?? []).map((u) => ({ id: u.id, label: u.code ?? u.name }))}
        value={d.baseUomId}
        onChange={(v) => set('baseUomId', v)}
      />
      {err('baseUomId') ? <Notice tone="error" text={err('baseUomId')!} /> : null}
      {creating ? (
        <>
          <Field
            label={t('products.code')}
            value={d.code}
            onChange={(v) => set('code', v)}
            placeholder={t('products.codeHint')}
          />
          <Field label="HSN" value={d.hsnCode} onChange={(v) => set('hsnCode', v)} />
          <Field label={t('products.taxCode')} value={d.taxCode} onChange={(v) => set('taxCode', v)} />
          <Field
            label="MRP"
            value={d.mrp}
            onChange={(v) => set('mrp', v)}
            keyboard="decimal-pad"
            error={err('mrp')}
          />
          <Field
            label={t('products.selling')}
            value={d.sellingPrice}
            onChange={(v) => set('sellingPrice', v)}
            keyboard="decimal-pad"
            error={err('sellingPrice')}
          />
          {canCost ? (
            <Field
              label={t('products.cost')}
              value={d.purchasePrice}
              onChange={(v) => set('purchasePrice', v)}
              keyboard="decimal-pad"
              error={err('purchasePrice')}
            />
          ) : null}
        </>
      ) : (
        <Text style={kit.sub}>{t('products.priceOnDetail')}</Text>
      )}
      <Field
        label={t('products.reorder')}
        value={d.reorderLevel}
        onChange={(v) => set('reorderLevel', v)}
        keyboard="decimal-pad"
        error={err('reorderLevel')}
      />
      <Field
        label={t('products.shelfLife')}
        value={d.shelfLifeMonths}
        onChange={(v) => set('shelfLifeMonths', v)}
        keyboard="number-pad"
        error={err('shelfLifeMonths')}
      />
      <Check
        label={t('products.mrpItem')}
        value={d.mrpControlled}
        onChange={(v) => set('mrpControlled', v)}
      />
      <Check label={t('products.batchReq')} value={d.batchTracked} onChange={(v) => set('batchTracked', v)} />
      <Check
        label={t('products.expiryReq')}
        value={d.expiryTracked}
        onChange={(v) => set('expiryTracked', v)}
      />
      <Check label={t('products.sellable')} value={d.sellable} onChange={(v) => set('sellable', v)} />
      <Check
        label={t('products.purchasable')}
        value={d.purchasable}
        onChange={(v) => set('purchasable', v)}
      />
      {failure ? (
        <Notice
          tone="error"
          text={t(failure.key, { ...failure.params, correlationId: failure.params.correlationId ?? '-' })}
        />
      ) : null}
      {dup ? (
        <Card>
          <Notice tone="warn" text={t('products.duplicate')} />
          <Button label={t('products.createAnyway')} disabled={busy} onPress={() => void save(true)} />
        </Card>
      ) : null}
      <Button
        label={busy ? t('common.loading') : t('products.save')}
        disabled={busy}
        onPress={() => void save()}
      />
    </ScrollView>
  );
}

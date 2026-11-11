import { useState } from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ApiError, errorMessage, type ErrorMessage } from '@/api/errors';
import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/ui/Button';
import { Card, Check, Chips, Field, Notice, kit, useActionKey } from '@/ui/kit';
import { itemsOf, useCan, useFailureText, useGet } from '../inventory/kit';
import { PERM, createProduct, updateProduct, type Product, type Ref } from './api';
import { draftOf, emptyDraft, toBody, validateDraft, type DraftErrors, type ProductDraft } from './logic';

/** Create (no product) or edit (with product; sends If-Match). One Idempotency-Key per save, reused after a lost answer. */
export default function ProductForm({ product, onSaved, onCancel }: { product?: Product; onSaved: (p: Product) => void; onCancel?: () => void }) {
  const { t } = useTranslation();
  const { client } = useAuth();
  const can = useCan();
  const failText = useFailureText();
  const ak = useActionKey();
  const creating = !product;
  const canCost = can(PERM.cost);
  const [d, setD] = useState<ProductDraft>(() => (product ? draftOf(product) : emptyDraft));
  const [errs, setErrs] = useState<DraftErrors>({});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ErrorMessage | null>(null);
  const [dup, setDup] = useState(false);
  const cats = useGet<{ items: Ref[] }>('/product-categories');
  const brands = useGet<{ items: Ref[] }>('/brands');
  const uoms = useGet<{ items: Ref[] }>('/uoms');
  const set = <K extends keyof ProductDraft>(k: K, v: ProductDraft[K]) => {
    setDup(false);
    setD((p) => ({ ...p, [k]: v }));
  };
  const err = (k: keyof ProductDraft) => (errs[k] ? t(`products.err.${errs[k]}`) : null);
  const txt = (k: keyof ProductDraft, label: string, keyboard?: 'decimal-pad' | 'number-pad') => (
    <Field label={label} value={String(d[k])} onChange={(v) => set(k, v as never)} keyboard={keyboard} error={err(k)} />
  );

  async function save(confirmDuplicate = false) {
    if (busy) return;
    const e = validateDraft(d, creating, canCost);
    setErrs(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    setFailure(null);
    const body = { ...toBody(d, creating, canCost), ...(confirmDuplicate ? { confirmDuplicate: true } : {}) };
    try {
      const key = ak.keyFor(JSON.stringify([product?.id ?? 'new', body]));
      const saved = product ? await updateProduct(client!, product, body, key) : await createProduct(client!, body, key);
      ak.reset();
      onSaved(saved);
    } catch (x) {
      if (x instanceof ApiError && x.code === 'DUPLICATE_WARNING') setDup(true);
      else setFailure(errorMessage(x));
    } finally {
      setBusy(false);
    }
  }

  const opt = (r?: { items: Ref[] }) => itemsOf(r).map((x) => ({ id: x.id, label: x.code ? `${x.name} (${x.code})` : x.name }));
  const uomOpt = itemsOf(uoms.data).map((x) => ({ id: x.id, label: x.code ?? x.name }));
  return (
    <Card>
      <Text style={kit.name}>{product ? t('products.edit', { code: product.code }) : t('products.new')}</Text>
      {txt('name', t('products.name'))}
      {txt('localName', t('products.localName'))}
      <Chips label={t('products.category')} options={opt(cats.data)} value={d.categoryId} onChange={(v) => set('categoryId', v)} />
      {err('categoryId') ? <Notice tone="error" text={err('categoryId')!} /> : null}
      <Chips label={t('products.brand')} options={opt(brands.data)} value={d.brandId} onChange={(v) => set('brandId', d.brandId === v ? '' : v)} />
      <Chips label={t('products.baseUnit')} options={uomOpt} value={d.baseUomId} onChange={(v) => set('baseUomId', v)} />
      {err('baseUomId') ? <Notice tone="error" text={err('baseUomId')!} /> : null}
      {txt('packSize', t('products.packSize'), 'decimal-pad')}
      <Chips label={t('products.packUnit')} options={uomOpt} value={d.packUomId} onChange={(v) => set('packUomId', d.packUomId === v ? '' : v)} />
      {creating ? (
        <>
          {txt('code', t('products.code'))}
          {txt('hsnCode', t('products.hsn'))}
          {d.hsnCode.trim() ? <Check label={t('products.hsnConfirm')} value={d.hsnConfirmed} onChange={(v) => set('hsnConfirmed', v)} /> : null}
          {txt('taxCode', t('products.taxCode'))}
          {txt('mrp', t('products.mrp'), 'decimal-pad')}
          {txt('sellingPrice', t('products.sellingPrice'), 'decimal-pad')}
          {canCost ? txt('purchasePrice', t('products.purchasePrice'), 'decimal-pad') : null}
        </>
      ) : (
        <Text style={kit.sub}>{t('products.priceOnTab')}</Text>
      )}
      {txt('reorderLevel', t('products.reorderLevel'), 'decimal-pad')}
      {txt('shelfLifeMonths', t('products.shelfLife'), 'number-pad')}
      {txt('grade', t('products.grade'))}
      {txt('crop', t('products.crop'))}
      {txt('variety', t('products.variety'))}
      <Check label={t('products.mrpControlled')} value={d.mrpControlled} onChange={(v) => set('mrpControlled', v)} />
      <Check label={t('products.batchTracked')} value={d.batchTracked} onChange={(v) => set('batchTracked', v)} />
      <Check label={t('products.expiryTracked')} value={d.expiryTracked} onChange={(v) => set('expiryTracked', v)} />
      <Check label={t('products.sellable')} value={d.sellable} onChange={(v) => set('sellable', v)} />
      <Check label={t('products.purchasable')} value={d.purchasable} onChange={(v) => set('purchasable', v)} />
      {failure ? <Notice tone="error" text={failText(failure)} /> : null}
      {dup ? (
        <View style={{ gap: 8 }}>
          <Notice tone="warn" text={t('inv.duplicate')} />
          <Button kind="ghost" label={t('inv.createAnyway')} onPress={() => void save(true)} />
        </View>
      ) : null}
      <View style={kit.row}>
        <Button label={t('products.save')} onPress={() => void save()} disabled={busy} />
        {onCancel ? <Button kind="ghost" label={t('inv.close')} onPress={onCancel} /> : null}
      </View>
    </Card>
  );
}

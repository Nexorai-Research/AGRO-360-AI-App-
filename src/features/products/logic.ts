import { dec } from '@/money';
import type { Product } from './api';

export interface ProductDraft {
  name: string;
  localName: string;
  categoryId: string;
  brandId: string;
  baseUomId: string;
  code: string;
  hsnCode: string;
  taxCode: string;
  mrp: string;
  sellingPrice: string;
  purchasePrice: string;
  reorderLevel: string;
  shelfLifeMonths: string;
  mrpControlled: boolean;
  batchTracked: boolean;
  expiryTracked: boolean;
  sellable: boolean;
  purchasable: boolean;
  packSize: string;
  packUomId: string;
  grade: string;
  crop: string;
  variety: string;
  hsnConfirmed: boolean;
}
export const emptyDraft: ProductDraft = {
  name: '', localName: '', categoryId: '', brandId: '', baseUomId: '', code: '', hsnCode: '', taxCode: '', mrp: '',
  sellingPrice: '', purchasePrice: '', reorderLevel: '', shelfLifeMonths: '',
  mrpControlled: true, batchTracked: false, expiryTracked: false, sellable: true, purchasable: true,
  packSize: '', packUomId: '', grade: '', crop: '', variety: '', hsnConfirmed: false,
};
export const draftOf = (p: Product): ProductDraft => ({
  ...emptyDraft,
  name: p.name, localName: p.localName ?? '', categoryId: p.categoryId ?? '', brandId: p.brandId ?? '', baseUomId: p.baseUomId,
  reorderLevel: p.reorderLevel ?? '', shelfLifeMonths: p.shelfLifeMonths === null ? '' : String(p.shelfLifeMonths),
  mrpControlled: p.mrpControlled, batchTracked: p.batchTracked, expiryTracked: p.expiryTracked, sellable: p.sellable, purchasable: p.purchasable,
  packSize: p.packSize ?? '', packUomId: p.packUomId ?? '', grade: p.grade ?? '', crop: p.crop ?? '', variety: p.variety ?? '',
});

const PRICE_RE = /^\d+(\.\d{1,4})?$/;
const QTY_RE = /^\d+(\.\d{1,3})?$/;
const INT_RE = /^\d{1,3}$/;
export type DraftError = 'required' | 'price' | 'qty' | 'int' | 'mrpRequired' | 'aboveMrp' | 'packPair';
export type DraftErrors = Partial<Record<keyof ProductDraft, DraftError>>;

/** Prices are decimal strings (at most 4 places), compared as decimals. The server stays the authority on every rule. */
export function validateDraft(d: ProductDraft, creating: boolean, canCost: boolean): DraftErrors {
  const e: DraftErrors = {};
  if (!d.name.trim()) e.name = 'required';
  if (!d.categoryId) e.categoryId = 'required';
  if (!d.baseUomId) e.baseUomId = 'required';
  if (d.reorderLevel.trim() && !QTY_RE.test(d.reorderLevel.trim())) e.reorderLevel = 'qty';
  if (d.shelfLifeMonths.trim() && !INT_RE.test(d.shelfLifeMonths.trim())) e.shelfLifeMonths = 'int';
  if (d.packSize.trim() && !QTY_RE.test(d.packSize.trim())) e.packSize = 'qty';
  else if (!!d.packSize.trim() !== !!d.packUomId) e.packSize = 'packPair';
  if (creating) {
    if (!d.sellingPrice.trim()) e.sellingPrice = 'required';
    else if (!PRICE_RE.test(d.sellingPrice.trim())) e.sellingPrice = 'price';
    if (d.mrp.trim() && !PRICE_RE.test(d.mrp.trim())) e.mrp = 'price';
    if (d.mrpControlled && !d.mrp.trim()) e.mrp = 'mrpRequired';
    if (!e.mrp && !e.sellingPrice && d.mrpControlled && dec(d.sellingPrice.trim()).gt(d.mrp.trim())) e.sellingPrice = 'aboveMrp';
    if (canCost && d.purchasePrice.trim() && !PRICE_RE.test(d.purchasePrice.trim())) e.purchasePrice = 'price';
  }
  return e;
}

/** Create: blank optional boxes are left out. Edit: a blank optional box clears the value (null), as the web screen does. */
export function toBody(d: ProductDraft, creating: boolean, canCost: boolean): Record<string, unknown> {
  const o: Record<string, unknown> = { name: d.name.trim(), categoryId: d.categoryId, baseUomId: d.baseUomId };
  const opt = (k: string, v: string, conv: (x: string) => unknown = (x) => x) => {
    if (v.trim()) o[k] = conv(v.trim());
    else if (!creating) o[k] = null;
  };
  opt('localName', d.localName);
  opt('brandId', d.brandId);
  opt('reorderLevel', d.reorderLevel);
  opt('shelfLifeMonths', d.shelfLifeMonths, Number);
  opt('packSize', d.packSize);
  opt('packUomId', d.packUomId);
  opt('grade', d.grade);
  opt('crop', d.crop);
  opt('variety', d.variety);
  Object.assign(o, { mrpControlled: d.mrpControlled, batchTracked: d.batchTracked, expiryTracked: d.expiryTracked, sellable: d.sellable, purchasable: d.purchasable });
  if (creating) {
    if (d.code.trim()) o.code = d.code.trim();
    if (d.hsnCode.trim()) o.hsnCode = d.hsnCode.trim();
    if (d.taxCode.trim()) o.taxCode = d.taxCode.trim();
    if (d.hsnCode.trim() && d.hsnConfirmed) o.hsnConfirmed = true;
    o.sellingPrice = d.sellingPrice.trim();
    if (d.mrpControlled && d.mrp.trim()) o.mrp = d.mrp.trim();
    if (canCost && d.purchasePrice.trim()) o.purchasePrice = d.purchasePrice.trim();
  }
  return o;
}

/** A new price may carry only the boxes that were filled. Cost above selling price is a warning, never a block. */
export function priceBody(f: { effectiveFrom: string; mrp: string; sellingPrice: string; purchasePrice: string; reason: string }): Record<string, string> {
  const b: Record<string, string> = {};
  for (const [k, v] of Object.entries(f)) if (v.trim()) b[k] = v.trim();
  return b;
}
export const costAboveSelling = (cost: string, selling: string) =>
  PRICE_RE.test(cost.trim()) && PRICE_RE.test(selling.trim()) && dec(cost.trim()).gt(selling.trim());
export const priceFieldsOk = (f: { mrp: string; sellingPrice: string; purchasePrice: string }) =>
  [f.mrp, f.sellingPrice, f.purchasePrice].every((v) => !v.trim() || PRICE_RE.test(v.trim())) &&
  [f.mrp, f.sellingPrice, f.purchasePrice].some((v) => v.trim());

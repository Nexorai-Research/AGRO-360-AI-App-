import type { ApiClient } from '@/api/client';
import type { Amount } from '@/money';

// Hand-copied from modules/catalogue/src/application/products.ts (ProductView) and the web screen apps/web/src/pages/products.js.
// No OpenAPI file exists yet. Permissions below only hide things; the server checks every call.
export const PERM = {
  view: 'product.view',
  create: 'product.create',
  update: 'product.update',
  barcode: 'product.barcode',
  price: 'pricing.manage',
  cost: 'inventory.value.view',
} as const;

export interface Product {
  id: string;
  version: number;
  code: string;
  name: string;
  localName: string | null;
  status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
  categoryId: string | null;
  categoryName: string | null;
  brandId: string | null;
  brandName: string | null;
  baseUomId: string;
  baseUomCode: string;
  batchTracked: boolean;
  expiryTracked: boolean;
  shelfLifeMonths: number | null;
  reorderLevel: string | null;
  sellable: boolean;
  purchasable: boolean;
  mrpControlled: boolean;
  hsnCode: string | null;
  taxCode: string | null;
  mrp: Amount | null;
  sellingPrice: Amount | null;
  purchasePrice: Amount | null;
  primaryBarcode: string | null;
}
export interface Ref {
  id: string;
  name: string;
  code?: string;
  level?: number;
}
export interface Barcode {
  id: string;
  barcode: string;
  kind: string;
  isPrimary: boolean;
}
export interface PriceRow {
  effectiveFrom: string;
  mrp: Amount | null;
  sellingPrice: Amount | null;
  purchasePrice?: Amount | null;
  reason: string | null;
}
export type ProductStatusFilter = '' | 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';

export const pkey = (userId: string, what: string, extra = '') => ['products', what, userId, extra] as const;

export async function fetchProducts(
  c: ApiClient,
  q: string,
  status: ProductStatusFilter,
  signal?: AbortSignal,
) {
  const r = await c.get<{ items: Product[]; total: number }>('/products', {
    query: { q: q || undefined, status: status || undefined, limit: 100 },
    signal,
  });
  return r;
}
export const fetchProduct = (c: ApiClient, id: string, signal?: AbortSignal) =>
  c.get<Product>(`/products/${id}`, { signal });
const items = async <T>(p: Promise<{ items: T[] } | T[]>): Promise<T[]> => {
  const r = await p;
  return Array.isArray(r) ? r : r.items;
};
export const fetchCategories = (c: ApiClient, signal?: AbortSignal) =>
  items<Ref>(c.get('/product-categories', { signal }));
export const fetchBrands = (c: ApiClient, signal?: AbortSignal) => items<Ref>(c.get('/brands', { signal }));
export const fetchUoms = (c: ApiClient, signal?: AbortSignal) => items<Ref>(c.get('/uoms', { signal }));
export const fetchBarcodes = (c: ApiClient, id: string, signal?: AbortSignal) =>
  items<Barcode>(c.get(`/products/${id}/barcodes`, { signal }));
export const fetchPrices = (c: ApiClient, id: string, signal?: AbortSignal) =>
  items<PriceRow>(c.get(`/products/${id}/prices`, { signal }));

export const createProduct = (c: ApiClient, body: Record<string, unknown>, idempotencyKey: string) =>
  c.post<Product>('/products', { body, idempotencyKey });
export const updateProduct = (
  c: ApiClient,
  p: Product,
  body: Record<string, unknown>,
  idempotencyKey: string,
) => c.patch<Product>(`/products/${p.id}`, { body, version: p.version, idempotencyKey });
export const setProductStatus = (
  c: ApiClient,
  id: string,
  action: 'activate' | 'deactivate' | 'archive',
  body: Record<string, unknown>,
  idempotencyKey: string,
) => c.post<unknown>(`/products/${id}/${action}`, { body, idempotencyKey });
export const addBarcode = (
  c: ApiClient,
  id: string,
  body: { barcode: string } | { generate: true },
  idempotencyKey: string,
) => c.post<unknown>(`/products/${id}/barcodes`, { body, idempotencyKey });
export const removeBarcode = (c: ApiClient, id: string, barcodeId: string, idempotencyKey: string) =>
  c.delete<unknown>(`/products/${id}/barcodes/${barcodeId}`, { idempotencyKey });
export const setPrice = (c: ApiClient, id: string, body: Record<string, string>, idempotencyKey: string) =>
  c.post<unknown>(`/products/${id}/prices`, { body, idempotencyKey });

import type { ApiClient } from '@/api/client';
import type { Amount } from '@/money';

// Shapes copied by hand from the backend (no OpenAPI file exists yet):
//   apps/api/src/procurement.controller.ts      (routes and permissions)
//   modules/procurement/src/application/orders.ts, receipts.ts, suppliers.ts   (views)
//   modules/procurement/src/domain/procurement.ts  (parseOrder, parseGrn, parseReason: the accepted bodies)
// All quantities, rates and money are decimal strings.

/** Permissions only hide things. The server checks every call again. */
export const PERM = {
  view: 'purchase.view',
  create: 'purchase.order.create',
  approve: 'purchase.order.approve',
  grn: 'purchase.grn.create',
  product: 'product.view',
} as const;

export interface SupplierRow {
  id: string;
  code: string;
  name: string;
  type: string;
  gstin: string | null;
  stateCode: string;
  creditDays: number;
  creditLimit: Amount;
  status: string;
}

export interface OrderLine {
  id: string;
  lineNo: number;
  skuId: string;
  skuCode: string;
  skuName: string;
  qty: string;
  rate: string;
  discountPct: string;
  lineTotal: Amount;
  receivedQty: string;
  closedQty: string;
  pendingQty: string;
}
export interface OrderRow {
  id: string;
  number: string | null;
  revision: number;
  branchId: string;
  supplierId: string;
  supplierName: string;
  warehouseId: string;
  orderDate: string;
  expectedDate: string | null;
  status: string;
  total: Amount;
  createdBy: string;
  version: number;
}
export interface OrderDetail extends OrderRow {
  subtotal: Amount;
  taxTotal: Amount;
  notes: string | null;
  reason: string | null;
  lines: OrderLine[];
}
export interface GrnRow {
  id: string;
  number: string | null;
  poId: string | null;
  poNumber: string | null;
  supplierName: string;
  receiptDate: string;
  status: string;
  value: Amount;
}

export interface OrderLineBody {
  skuId: string;
  qty: string;
  rate: string;
  discountPct?: string;
}
export interface OrderBody {
  supplierId: string;
  branchId: string;
  warehouseId: string;
  orderDate: string;
  expectedDate?: string;
  notes?: string;
  lines: OrderLineBody[];
}
export interface GrnLineBody {
  poLineId: string;
  receivedQty: string;
  rejectedQty?: string;
  rejectReason?: string;
  batchNo?: string;
  mfgDate?: string;
  expiryDate?: string;
}
export interface GrnBody {
  poId: string;
  receiptDate: string;
  challanNo?: string;
  rejectWarehouseId?: string;
  lines: GrnLineBody[];
}

export interface Branch {
  id: string;
  name: string;
  status?: string;
}
export interface Warehouse {
  id: string;
  branchId?: string;
  name: string;
  status?: string;
  sellable?: boolean;
}
export interface ProductLite {
  id: string;
  code: string;
  name: string;
  baseUomCode?: string;
}

export const key = (userId: string, what: string, extra = '') => ['purchase', what, userId, extra] as const;

// ---- reads
export async function fetchSuppliers(c: ApiClient, q: string, signal?: AbortSignal) {
  const r = await c.get<{ items: SupplierRow[] }>('/procurement/suppliers', {
    query: { q: q.trim() || undefined, limit: 200 },
    signal,
  });
  return r.items;
}
export async function fetchOrders(c: ApiClient, status: string, signal?: AbortSignal) {
  const r = await c.get<{ items: OrderRow[] }>('/procurement/purchase-orders', {
    query: { status: status || undefined, limit: 100 },
    signal,
  });
  return r.items;
}
export async function fetchApprovals(c: ApiClient, signal?: AbortSignal) {
  const r = await c.get<{ items: OrderRow[] }>('/procurement/purchase-orders/approvals', { signal });
  return r.items;
}
export const getOrder = (c: ApiClient, id: string, signal?: AbortSignal) =>
  c.get<OrderDetail>(`/procurement/purchase-orders/${encodeURIComponent(id)}`, { signal });
export async function fetchReceipts(c: ApiClient, signal?: AbortSignal) {
  const r = await c.get<{ items: GrnRow[] }>('/procurement/goods-receipts', {
    query: { limit: 100 },
    signal,
  });
  return r.items;
}
export async function fetchBranches(c: ApiClient, signal?: AbortSignal) {
  const r = await c.get<{ items: Branch[] }>('/branches', { signal });
  return r.items.filter((b) => b.status === undefined || b.status === 'ACTIVE');
}
export async function fetchWarehouses(c: ApiClient, signal?: AbortSignal) {
  const r = await c.get<{ items: Warehouse[] }>('/warehouses', { signal });
  return r.items.filter((w) => w.status === undefined || w.status === 'ACTIVE');
}
export async function searchProducts(c: ApiClient, q: string, signal?: AbortSignal) {
  const r = await c.get<{ items: ProductLite[] }>('/products', {
    query: { q, status: 'ACTIVE', limit: 20 },
    signal,
  });
  return r.items;
}
export const productByBarcode = (c: ApiClient, code: string, signal?: AbortSignal) =>
  c.get<ProductLite>(`/products/by-barcode/${encodeURIComponent(code)}`, { signal });

// ---- writes. The caller owns the key so that a retry of the same action reuses it.
export const createOrder = (c: ApiClient, body: OrderBody, idempotencyKey: string) =>
  c.post<OrderDetail>('/procurement/purchase-orders', { body, idempotencyKey });
export const submitOrder = (c: ApiClient, o: OrderRow, idempotencyKey: string) =>
  c.post<OrderDetail>(`/procurement/purchase-orders/${o.id}/submit`, {
    body: {},
    version: o.version,
    idempotencyKey,
  });
export const approveOrder = (c: ApiClient, o: OrderRow, idempotencyKey: string) =>
  c.post<OrderDetail>(`/procurement/purchase-orders/${o.id}/approve`, {
    body: {},
    version: o.version,
    idempotencyKey,
  });
export const rejectOrder = (c: ApiClient, o: OrderRow, reason: string, idempotencyKey: string) =>
  c.post<OrderDetail>(`/procurement/purchase-orders/${o.id}/reject`, {
    body: { reason },
    version: o.version,
    idempotencyKey,
  });
export const cancelOrder = (c: ApiClient, o: OrderRow, reason: string, idempotencyKey: string) =>
  c.post<OrderDetail>(`/procurement/purchase-orders/${o.id}/cancel`, {
    body: { reason },
    version: o.version,
    idempotencyKey,
  });
export const createGrn = (c: ApiClient, body: GrnBody, idempotencyKey: string) =>
  c.post<{ id: string; number: string | null }>('/procurement/goods-receipts', { body, idempotencyKey });
export const receiveGrn = (c: ApiClient, id: string, idempotencyKey: string) =>
  c.post<unknown>(`/procurement/goods-receipts/${id}/receive`, { body: {}, idempotencyKey });

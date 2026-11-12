import type { ApiClient } from '@/api/client';
import type { Amount } from '@/money';

// Hand-copied from modules/inventory/src/application/adjustments.ts (AdjustmentView), apps/api/src/inventory.controller.ts and the web
// screen apps/web/src/pages/inventory.js. No OpenAPI file exists yet. Permissions only hide things; the server checks every call.
export const PERM = {
  view: 'inventory.view',
  adjust: 'inventory.adjust.create',
  approve: 'inventory.adjust.approve',
  transfer: 'inventory.transfer',
  damage: 'inventory.damage',
  block: 'inventory.batch.manage',
  unblock: 'inventory.batch.unblock',
} as const;

export const ADJUST_REASONS = ['DAMAGE', 'LEAKAGE', 'THEFT', 'SAMPLE', 'FOUND', 'OTHER'] as const;
export const DAMAGE_REASONS = ['DAMAGED', 'LEAKAGE', 'PEST', 'MOISTURE', 'EXPIRED', 'OTHER'] as const;

export interface Adjustment {
  id: string;
  number: string;
  branchId: string;
  reasonCode: string;
  remarks: string | null;
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  adjustmentDate: string;
  totalValue: Amount | null;
  decisionNote: string | null;
  version: number;
}
export interface Transfer {
  id: string;
  number: string;
  transferDate: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  purpose: string;
  status: string;
}
export interface BatchStock {
  id: string;
  skuId: string;
  skuCode: string;
  skuName: string;
  batchNo: string;
  expiryDate: string | null;
  status: string;
  onHand: string;
  available: string;
}
export interface Wh {
  id: string;
  branchId: string;
  name: string;
  status?: string;
  sellable?: boolean;
}
export interface Br {
  id: string;
  name: string;
  status?: string;
}
export interface AdjustBody {
  branchId: string;
  reasonCode: string;
  remarks?: string;
  lines: { warehouseId: string; skuId: string; batchId: string; qtyDelta: string; unitCost?: string }[];
}
export interface TransferBody {
  fromWarehouseId: string;
  toWarehouseId: string;
  remarks?: string;
  lines: { skuId: string; qty: string }[];
}

export const ikey = (userId: string, what: string, extra = '') => ['inventory', what, userId, extra] as const;

const items = async <T>(p: Promise<{ items: T[] }>): Promise<T[]> => (await p).items;
export const fetchAdjustments = (c: ApiClient, signal?: AbortSignal) =>
  items<Adjustment>(c.get('/inventory/adjustments', { query: { limit: 100 }, signal }));
export const fetchTransfers = (c: ApiClient, signal?: AbortSignal) =>
  items<Transfer>(c.get('/inventory/transfers', { query: { limit: 100 }, signal }));
export const fetchBatches = (c: ApiClient, signal?: AbortSignal) =>
  items<BatchStock>(c.get('/inventory/batches', { query: { withStockOnly: 'true', limit: 500 }, signal }));
export const fetchBranchList = async (c: ApiClient, signal?: AbortSignal) =>
  (await items<Br>(c.get('/branches', { signal }))).filter(
    (b) => b.status === undefined || b.status === 'ACTIVE',
  );
export const fetchWarehouseList = async (c: ApiClient, signal?: AbortSignal) =>
  (await items<Wh>(c.get('/warehouses', { signal }))).filter(
    (w) => w.status === undefined || w.status === 'ACTIVE',
  );

export const createAdjustment = (c: ApiClient, body: AdjustBody, idempotencyKey: string) =>
  c.post<Adjustment>('/inventory/adjustments', { body, idempotencyKey });
export const adjustAction = (
  c: ApiClient,
  id: string,
  action: 'submit' | 'cancel' | 'approve',
  idempotencyKey: string,
) => c.post<unknown>(`/inventory/adjustments/${id}/${action}`, { idempotencyKey });
export const rejectAdjustment = (c: ApiClient, id: string, note: string, idempotencyKey: string) =>
  c.post<unknown>(`/inventory/adjustments/${id}/reject`, { body: { note }, idempotencyKey });
export const postTransfer = (c: ApiClient, body: TransferBody, idempotencyKey: string) =>
  c.post<Transfer>('/inventory/transfers/internal', { body, idempotencyKey });
export const postDamage = (
  c: ApiClient,
  body: { fromWarehouseId: string; reasonCode: string; lines: { skuId: string; qty: string }[] },
  idempotencyKey: string,
) => c.post<unknown>('/inventory/damage', { body, idempotencyKey });
export const blockBatch = (
  c: ApiClient,
  id: string,
  release: boolean,
  reason: string,
  idempotencyKey: string,
) =>
  c.post<unknown>(`/inventory/batches/${id}/${release ? 'unblock' : 'block'}`, {
    body: { reason },
    idempotencyKey,
  });

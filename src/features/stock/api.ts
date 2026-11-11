import type { ApiClient } from '../../api/client';
import type { BatchRow, BatchView, Branch, Page, ProductHit, StockRow, Warehouse } from './types';
import { EXPIRING_DAYS } from './types';

export const PAGE_SIZE = 50;

export interface StockFilter {
  /** Search text on product code or name. */
  q?: string;
  /** Branch id. Never a tenant id: the franchise comes from the token. */
  branch?: string;
  warehouse?: string;
  /** Product (sku) id, set by a barcode scan. */
  product?: string;
}

// The server refuses query names it does not know, so each call sends only the names listed in inventory.controller.ts.
export function stockQuery(f: StockFilter, offset: number): Record<string, string | number | undefined> {
  return {
    q: f.q?.trim() || undefined,
    branch: f.branch,
    warehouse: f.warehouse,
    product: f.product,
    limit: PAGE_SIZE,
    offset,
  };
}

export function batchQuery(
  view: BatchView,
  f: Pick<StockFilter, 'warehouse' | 'product'>,
  offset: number,
): Record<string, string | number | undefined> {
  return {
    product: f.product,
    warehouse: f.warehouse,
    withStockOnly: view === 'withStock' ? 'true' : undefined,
    expiringWithinDays: view === 'expiring' ? EXPIRING_DAYS : undefined,
    expired: view === 'expired' ? 'true' : undefined,
    limit: PAGE_SIZE,
    offset,
  };
}

export const fetchStock = (c: ApiClient, f: StockFilter, offset: number, signal?: AbortSignal) =>
  c.get<Page<StockRow>>('/inventory/stock', { query: stockQuery(f, offset), signal });

export const fetchBatches = (
  c: ApiClient,
  view: BatchView,
  f: Pick<StockFilter, 'warehouse' | 'product'>,
  offset: number,
  signal?: AbortSignal,
) => c.get<Page<BatchRow>>('/inventory/batches', { query: batchQuery(view, f, offset), signal });

export const fetchBranches = async (c: ApiClient): Promise<Branch[]> =>
  (await c.get<{ items: Branch[] }>('/branches')).items;

export const fetchWarehouses = async (c: ApiClient, branchId: string): Promise<Warehouse[]> =>
  (await c.get<{ items: Warehouse[] }>('/warehouses', { query: { branchId } })).items;

export const fetchProductByBarcode = (c: ApiClient, code: string) =>
  c.get<ProductHit>(`/products/by-barcode/${encodeURIComponent(code)}`);

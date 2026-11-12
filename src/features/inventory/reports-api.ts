import type { ApiClient } from '@/api/client';

// Hand-copied from modules/inventory/src/application/{ledger,reorder,valuation}.ts and apps/api/src/inventory.controller.ts. Read only.
// Quantities and money are decimal strings. Cost and value fields are null when the caller lacks `inventory.value.view`.
export const SPERM = { view: 'inventory.view', value: 'inventory.value.view' } as const;

export type StockReportKind = 'expiry' | 'ledger' | 'reorder' | 'valuation';
export const KIND_PERM: Record<StockReportKind, string> = {
  expiry: SPERM.view,
  ledger: SPERM.view,
  reorder: SPERM.view,
  valuation: SPERM.value,
};
export const EXPIRY_WINDOWS = ['expired', '30', '60', '90'] as const;
export type ExpiryWindow = (typeof EXPIRY_WINDOWS)[number];
/** Rows asked for per list. The server pages with limit and offset; the screen shows one page and the total. */
export const PAGE_ROWS = 50;

export interface BatchRow {
  id: string;
  skuCode: string;
  skuName: string;
  batchNo: string;
  expiryDate: string | null;
  daysToExpiry: number | null;
  status: string;
  onHand: string;
  available: string;
  valueAtRisk: string | null;
}
export interface MovementRow {
  id: string;
  businessDate: string;
  movementType: string;
  skuCode: string;
  skuName: string;
  warehouseCode: string;
  batchNo: string | null;
  qty: string;
  value: string | null;
  sourceType: string | null;
  reasonCode: string | null;
  runningBalance: string;
}
export interface Ledger {
  items: MovementRow[];
  total: number;
  currentBalance: string | null;
}
export interface ReorderRule {
  skuCode: string;
  skuName: string;
  branchName: string | null;
  minQty: string;
  reorderLevel: string;
  maxQty: string;
  reorderQty: string;
}
export interface ValuationRow {
  skuCode: string;
  skuName: string;
  branchName: string;
  qty: string;
  avgCost: string | null;
  value: string;
}
export interface Valuation {
  asOn: string;
  costingMethod: string;
  warning: string | null;
  totalQty: string;
  totalValue: string;
  rows: ValuationRow[];
}

export const fetchExpiry = (c: ApiClient, w: ExpiryWindow, signal?: AbortSignal) =>
  c.get<{ items: BatchRow[]; total: number }>('/inventory/batches', {
    query: { withStockOnly: 'true', limit: PAGE_ROWS, ...(w === 'expired' ? { expired: 'true' } : { expiringWithinDays: w }) },
    signal,
  });
export const fetchLedger = (c: ApiClient, signal?: AbortSignal) =>
  c.get<Ledger>('/inventory/ledger', { query: { limit: PAGE_ROWS }, signal });
export const fetchReorderRules = (c: ApiClient, signal?: AbortSignal) =>
  c.get<{ items: ReorderRule[]; total: number }>('/inventory/reorder-rules', { query: { limit: PAGE_ROWS }, signal });
export const fetchValuation = (c: ApiClient, signal?: AbortSignal) => c.get<Valuation>('/inventory/valuation', { signal });

// Shapes of the backend answers (modules/inventory/src/application/ledger.ts). Quantities and money are strings, never numbers.
export interface StockRow {
  skuId: string;
  skuCode: string;
  skuName: string;
  branchId: string;
  branchName: string;
  warehouseId: string;
  warehouseCode: string;
  warehouseKind: string;
  sellable: boolean;
  batchId: string | null;
  batchNo: string | null;
  batchStatus: string | null;
  expiryDate: string | null;
  daysToExpiry: number | null;
  onHand: string;
  reserved: string;
  available: string;
  inTransit: string;
  /** Only present for users with inventory.value.view; otherwise null. */
  avgCost: string | null;
  value: string | null;
}

export interface BatchRow {
  id: string;
  skuId: string;
  skuCode: string;
  skuName: string;
  batchNo: string;
  mfgDate: string | null;
  expiryDate: string | null;
  daysToExpiry: number | null;
  status: string;
  statusReason: string | null;
  onHand: string;
  available: string;
  unitCost: string | null;
  valueAtRisk: string | null;
  version: number;
}

export interface Page<T> {
  items: T[];
  total: number;
}

export interface Branch {
  id: string;
  name: string;
}

export interface Warehouse {
  id: string;
  name: string;
  code?: string;
  branchId?: string;
}

export interface ProductHit {
  id: string;
  code: string;
  name: string;
  status: string;
}

export type BatchView = 'withStock' | 'expiring' | 'expired';
export const EXPIRING_DAYS = 60;

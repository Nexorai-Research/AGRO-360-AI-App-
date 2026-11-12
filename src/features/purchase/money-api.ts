import type { ApiClient } from '@/api/client';

// Hand-copied from modules/procurement/src/application/{bills,payments,returns,reports}.ts and apps/api/src/procurement.controller.ts.
// Read only. All money is a decimal string (up to 4 places from the server).
export const MPERM = { view: 'purchase.view', ledger: 'purchase.supplier.ledger.view' } as const;
export type MoneyKind = 'bills' | 'payments' | 'returns' | 'ageing';
export const MONEY_PERM: Record<MoneyKind, string> = { bills: MPERM.view, payments: MPERM.view, returns: MPERM.view, ageing: MPERM.ledger };
export const MONEY_ROWS = 50;

export interface Bill {
  id: string;
  number: string | null;
  supplierName: string;
  supplierInvoiceNo: string;
  invoiceDate: string;
  dueDate: string;
  status: string;
  matchStatus: string;
  paymentStatus: string;
  total: string;
  paid: string;
  returned: string;
  outstanding: string;
}
export interface Payment {
  id: string;
  number: string;
  supplierName: string;
  paymentDate: string;
  modeCode: string;
  reference: string | null;
  amount: string;
  allocated: string;
  advance: string;
  tdsWithheld: string;
  cashPaid: string;
}
export interface PurchaseReturn {
  id: string;
  number: string;
  supplierName: string;
  billNumber: string | null;
  returnDate: string;
  reason: string;
  total: string;
}
export const AGEING_BUCKETS = ['NOT_DUE', '1-30', '31-60', '61-90', '90+'] as const;
export type AgeingBucket = (typeof AGEING_BUCKETS)[number];
export interface AgeingRow {
  supplierId: string;
  supplierName: string;
  buckets: Record<AgeingBucket, string>;
  total: string;
  unallocatedAdvance: string;
}
export interface Ageing {
  asOf: string;
  rows: AgeingRow[];
  totals: Record<AgeingBucket, string>;
  total: string;
}

export const fetchBills = async (c: ApiClient, openOnly: boolean, signal?: AbortSignal) =>
  (await c.get<{ items: Bill[] }>('/procurement/purchase-bills', { query: { limit: MONEY_ROWS, ...(openOnly ? { open: 'true' } : {}) }, signal })).items;
export const fetchPayments = async (c: ApiClient, signal?: AbortSignal) =>
  (await c.get<{ items: Payment[] }>('/procurement/supplier-payments', { query: { limit: MONEY_ROWS }, signal })).items;
export const fetchReturns = async (c: ApiClient, signal?: AbortSignal) =>
  (await c.get<{ items: PurchaseReturn[] }>('/procurement/purchase-returns', { query: { limit: MONEY_ROWS }, signal })).items;
export const fetchAgeing = (c: ApiClient, signal?: AbortSignal) => c.get<Ageing>('/procurement/reports/payables-aging', { signal });

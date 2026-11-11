import type { ApiClient } from '@/api/client';
import type { Amount } from '@/money';
import type { CustomerLite, InvoiceBody } from './api';

// Shapes copied by hand from the backend: apps/api/src/sales.controller.ts, modules/sales/src/application/documents.ts (InvoiceView),
// returns.ts (refundMode), and the web screen apps/web/src/pages/sales.js. No OpenAPI file exists yet.

export const PERM2 = {
  view: 'sales.view',
  pos: 'sales.pos.use',
  print: 'sales.invoice.print',
  ret: 'sales.return',
  cancel: 'sales.invoice.cancel',
  shift: 'pos.shift',
  dayEnd: 'pos.dayend',
  quickCustomer: 'customer.create',
} as const;

export interface InvoiceRow {
  id: string;
  number: string;
  invoiceDate: string;
  customerName: string | null;
  total: Amount;
  creditAmount: Amount;
  status: string;
}
export interface InvoiceLine {
  id: string;
  skuCode: string;
  qty: string;
  returned: string;
}
export interface InvoiceDetail extends InvoiceRow {
  customerId: string | null;
  lines: InvoiceLine[];
}
export interface HeldRow {
  id: string;
  label: string;
  created_at: string;
}
export interface HeldBill {
  cart: Partial<InvoiceBody> & { lines?: InvoiceBody['lines'] };
  problem?: string;
}
export interface Shift {
  id: string;
  businessDate: string;
  terminal: string;
  openingCash: Amount;
  expectedCash: Amount;
  countedCash: Amount | null;
  difference: Amount | null;
  status: string;
}
export interface ShareLink {
  token: string;
  expiresAt: string;
  url?: string;
  path?: string;
}
export interface ReturnBody {
  invoiceId: string;
  returnDate: string;
  reason: string;
  refundMode: string;
  lines: { invoiceLineId: string; qty: string; toDamaged: boolean }[];
}

export const key2 = (userId: string, what: string) => ['pos2', what, userId] as const;

// ---- held bills
export async function fetchHeld(c: ApiClient, branchId: string, signal?: AbortSignal) {
  const r = await c.get<{ items: HeldRow[] }>('/sales/held', { query: { branchId }, signal });
  return r.items;
}
export const holdBill = (c: ApiClient, branchId: string, label: string, cart: InvoiceBody, idempotencyKey: string) =>
  c.post<{ id: string }>('/sales/held', { body: { branchId, label, cart }, idempotencyKey });
export const getHeld = (c: ApiClient, id: string) => c.get<HeldBill>(`/sales/held/${id}`);
export const dropHeld = (c: ApiClient, id: string) => c.delete<null>(`/sales/held/${id}`);

// ---- invoices
export async function fetchInvoices(c: ApiClient, signal?: AbortSignal) {
  const r = await c.get<{ items: InvoiceRow[] }>('/sales/invoices', { query: { limit: 100 }, signal });
  return r.items;
}
export const getInvoice = (c: ApiClient, id: string) => c.get<InvoiceDetail>(`/sales/invoices/${id}`);
export const postReturn = (c: ApiClient, body: ReturnBody, idempotencyKey: string) =>
  c.post<{ number?: string }>('/sales/returns', { body, idempotencyKey });
export const cancelInvoice = (c: ApiClient, id: string, reason: string, idempotencyKey: string) =>
  c.post<unknown>(`/sales/invoices/${id}/cancel`, { body: { reason }, idempotencyKey });
/** A secure link (valid 30 days) the app hands to the phone's share sheet. With send=true the server also queues it to the customer. */
export const shareInvoice = (c: ApiClient, id: string, send: boolean, idempotencyKey: string) =>
  c.post<ShareLink>(`/sales/invoices/${id}/share`, { body: send ? { send: true } : {}, idempotencyKey });

// ---- quick customer
export const quickCustomer = (c: ApiClient, b: { name: string; mobile: string; village: string }, idempotencyKey: string) =>
  c.post<CustomerLite>('/customers/quick', { body: b, idempotencyKey });

// ---- shifts
export async function fetchShifts(c: ApiClient, signal?: AbortSignal) {
  const r = await c.get<{ items: Shift[] }>('/pos/shifts', { signal });
  return r.items;
}
export const openShift = (c: ApiClient, b: { branchId: string; openingCash: string }, idempotencyKey: string) =>
  c.post<unknown>('/pos/shifts/open', { body: b, idempotencyKey });
export const closeShift = (c: ApiClient, id: string, b: { countedCash: string; note?: string }, idempotencyKey: string) =>
  c.post<unknown>(`/pos/shifts/${id}/close`, { body: b, idempotencyKey });
export const dayEnd = (c: ApiClient, b: { branchId: string; businessDate: string }, idempotencyKey: string) =>
  c.post<unknown>('/pos/day-end', { body: b, idempotencyKey });

import type { ApiClient } from '@/api/client';
import type { Amount } from '@/money';

// Shapes copied by hand from the backend (no OpenAPI file exists yet):
//   modules/sales/src/application/finalize-invoice.ts (LineInput, TenderInput, FinalizeInvoiceResult)
//   modules/catalogue/src/application/products.ts      (ProductView)
//   apps/api/src/catalogue.controller.ts                (GET products/by-barcode/:code)
// The preview answer shape is read from apps/web/src/pages/sales.js (the web counter uses the same call).

/** Permissions are only used to hide things. The server checks every call again. */
export const PERM = { pos: 'sales.pos.use', product: 'product.view', customer: 'customer.view' } as const;

export interface Branch {
  id: string;
  name: string;
  status?: string;
}
export interface Warehouse {
  id: string;
  branchId: string;
  name: string;
  status?: string;
  sellable?: boolean;
}
export interface PaymentMode {
  code: string;
  enabled: boolean;
}
export interface ProductLite {
  id: string;
  code: string;
  name: string;
  status: string;
  sellable: boolean;
  saleBlocked: boolean;
  banned: boolean;
  mrp: Amount | null;
  sellingPrice: Amount | null;
  baseUomCode: string;
  primaryBarcode: string | null;
}
export interface CustomerLite {
  id: string;
  name: string;
  mobile?: string | null;
  village?: string | null;
}

export interface LineBody {
  skuId: string;
  warehouseId: string;
  qty: string;
  unitPrice?: string;
  discountPct?: string;
  crop?: string;
  targetPest?: string;
  dose?: string;
  batchId?: string;
  fefoOverrideReason?: string;
}
export interface TenderBody {
  mode: string;
  amount: string;
  reference?: string;
}
export interface InvoiceBody {
  branchId: string;
  invoiceDate: string;
  customerId?: string;
  billDiscountPct?: string;
  wholesale?: boolean;
  lines: LineBody[];
  tenders?: TenderBody[];
}

export interface PreviewTotals {
  gross: Amount;
  discount: Amount;
  taxable: Amount;
  cgst: Amount;
  sgst: Amount;
  igst: Amount;
  roundOff: Amount;
  total: Amount;
}
export interface Preview {
  docType: string;
  placeOfSupply: string;
  totals: PreviewTotals;
}
export interface InvoiceResult {
  invoiceId: string;
  number: string;
  total: Amount;
  creditAmount: Amount;
  changeDue: Amount;
}

export const posKey = (userId: string, what: string, extra = '') => ['pos', what, userId, extra] as const;

export async function fetchBranches(c: ApiClient, signal?: AbortSignal): Promise<Branch[]> {
  const r = await c.get<{ items: Branch[] }>('/branches', { signal });
  return r.items.filter((b) => b.status === undefined || b.status === 'ACTIVE');
}
export async function fetchWarehouses(c: ApiClient, signal?: AbortSignal): Promise<Warehouse[]> {
  const r = await c.get<{ items: Warehouse[] }>('/warehouses', { signal });
  return r.items.filter((w) => (w.status === undefined || w.status === 'ACTIVE') && w.sellable !== false);
}
/** A bill may be paid in any enabled mode except CREDIT: credit is whatever is left unpaid for a registered customer. */
export async function fetchPayModes(c: ApiClient, signal?: AbortSignal): Promise<PaymentMode[]> {
  const r = await c.get<{ items: PaymentMode[] }>('/settings/payment-modes', { signal });
  return r.items.filter((m) => m.enabled && m.code !== 'CREDIT');
}
export async function searchProducts(c: ApiClient, q: string, signal?: AbortSignal): Promise<ProductLite[]> {
  const r = await c.get<{ items: ProductLite[] }>('/products', {
    query: { q, status: 'ACTIVE', limit: 20 },
    signal,
  });
  return r.items.filter((p) => p.sellable && !p.saleBlocked && !p.banned);
}
export const productByBarcode = (c: ApiClient, code: string, signal?: AbortSignal) =>
  c.get<ProductLite>(`/products/by-barcode/${encodeURIComponent(code)}`, { signal });
export async function searchCustomers(
  c: ApiClient,
  q: string,
  signal?: AbortSignal,
): Promise<CustomerLite[]> {
  const r = await c.get<{ items: CustomerLite[] }>('/customers', {
    query: { q, status: 'ACTIVE', limit: 8 },
    signal,
  });
  return r.items;
}
export const previewInvoice = (c: ApiClient, body: InvoiceBody, signal?: AbortSignal) =>
  c.post<Preview>('/sales/invoices/preview', { body, signal });
/** A money movement: online only. The caller owns the key so a retry of the same bill reuses it. */
export const postInvoice = (c: ApiClient, body: InvoiceBody, idempotencyKey: string) =>
  c.post<InvoiceResult>('/sales/invoices', { body, idempotencyKey });

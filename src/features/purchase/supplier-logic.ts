import type { ApiClient } from '@/api/client';
import { dec } from '@/money';

// Copied from modules/procurement/src/domain/procurement.ts (parseSupplier) and apps/api/src/procurement.controller.ts. Needs purchase.supplier.manage.
// The server also checks the GSTIN check digit and that the state code is a real GST state; the app checks the shapes only.
export const SUPPLIER_PERM = 'purchase.supplier.manage';
export const SUPPLIER_TYPES = ['COMPANY', 'DISTRIBUTOR', 'WHOLESALER', 'LOCAL', 'OTHER'] as const;

export interface SupplierFull {
  id: string;
  code: string;
  name: string;
  type: string;
  gstin: string | null;
  pan: string | null;
  stateCode: string;
  address: string | null;
  creditDays: number;
  creditLimit: string;
  leadTimeDays: number | null;
  paymentTerms: string | null;
  tdsApplicable: boolean;
  tcsApplicable: boolean;
  status: string;
  version: number;
}
export interface SupplierDraft {
  name: string;
  type: string;
  gstin: string;
  pan: string;
  stateCode: string;
  address: string;
  creditDays: string;
  creditLimit: string;
  leadTimeDays: string;
  paymentTerms: string;
  tdsApplicable: boolean;
  tcsApplicable: boolean;
}
export const emptySupplier: SupplierDraft = {
  name: '',
  type: 'COMPANY',
  gstin: '',
  pan: '',
  stateCode: '',
  address: '',
  creditDays: '0',
  creditLimit: '0',
  leadTimeDays: '',
  paymentTerms: '',
  tdsApplicable: false,
  tcsApplicable: false,
};
export const draftOfSupplier = (s: SupplierFull): SupplierDraft => ({
  name: s.name,
  type: s.type,
  gstin: s.gstin ?? '',
  pan: s.pan ?? '',
  stateCode: s.stateCode,
  address: s.address ?? '',
  creditDays: String(s.creditDays),
  creditLimit: dec(s.creditLimit).toFixed(2),
  leadTimeDays: s.leadTimeDays === null ? '' : String(s.leadTimeDays),
  paymentTerms: s.paymentTerms ?? '',
  tdsApplicable: s.tdsApplicable,
  tcsApplicable: s.tcsApplicable,
});

export type SupplierErrors = Partial<
  Record<
    keyof SupplierDraft,
    'required' | 'name' | 'gstin' | 'gstinState' | 'pan' | 'state' | 'days' | 'amount' | 'long'
  >
>;
const GSTIN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const PAN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const whole = (v: string, max: number) => /^\d{1,3}$/.test(v.trim()) && Number(v) <= max;

export function validateSupplier(d: SupplierDraft): SupplierErrors {
  const e: SupplierErrors = {};
  const n = d.name.trim();
  if (!n) e.name = 'required';
  else if (n.length < 2 || n.length > 120) e.name = 'name';
  if (!/^[0-9]{2}$/.test(d.stateCode.trim())) e.stateCode = d.stateCode.trim() ? 'state' : 'required';
  const g = d.gstin.trim().toUpperCase();
  if (g) {
    if (!GSTIN.test(g)) e.gstin = 'gstin';
    else if (!e.stateCode && g.slice(0, 2) !== d.stateCode.trim()) e.gstin = 'gstinState';
  }
  if (d.pan.trim() && !PAN.test(d.pan.trim().toUpperCase())) e.pan = 'pan';
  if (d.address.trim().length > 500) e.address = 'long';
  if (d.paymentTerms.trim().length > 200) e.paymentTerms = 'long';
  if (!whole(d.creditDays, 365)) e.creditDays = 'days';
  if (d.leadTimeDays.trim() && !whole(d.leadTimeDays, 365)) e.leadTimeDays = 'days';
  if (!/^\d{1,12}(\.\d{1,4})?$/.test(d.creditLimit.trim())) e.creditLimit = 'amount';
  return e;
}

const NULLABLE = ['gstin', 'pan', 'address', 'leadTimeDays', 'paymentTerms'] as const;
const norm = (d: SupplierDraft, k: keyof SupplierDraft): string | boolean => {
  const v = d[k];
  if (typeof v === 'boolean') return v;
  return k === 'gstin' || k === 'pan' ? v.trim().toUpperCase() : v.trim();
};
const typed = (k: keyof SupplierDraft, v: string | boolean) =>
  typeof v === 'boolean' ? v : k === 'creditDays' || k === 'leadTimeDays' ? Number(v) : v;

/** Create: what was filled. Edit: only what changed; a cleared optional field is null. When the GSTIN changes the state goes with it, as the server asks. */
export function supplierBody(d: SupplierDraft, original: SupplierFull | null): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  const base = original ? draftOfSupplier(original) : null;
  for (const k of Object.keys(d) as (keyof SupplierDraft)[]) {
    const now = norm(d, k);
    if (base) {
      if (now === norm(base, k)) continue;
      body[k] = now === '' && (NULLABLE as readonly string[]).includes(k) ? null : typed(k, now);
    } else if (typeof now === 'boolean') {
      if (now) body[k] = true;
    } else if (now !== '') body[k] = typed(k, now);
  }
  if (base && body.gstin && body.stateCode === undefined) body.stateCode = norm(d, 'stateCode');
  if (base && body.creditLimit !== undefined) body.creditLimit = String(body.creditLimit);
  return body;
}

const path = (id?: string) =>
  id ? `/procurement/suppliers/${encodeURIComponent(id)}` : '/procurement/suppliers';
export const fetchSupplier = (c: ApiClient, id: string, signal?: AbortSignal) =>
  c.get<SupplierFull>(path(id), { signal });
export const createSupplier = (c: ApiClient, body: Record<string, unknown>, idempotencyKey: string) =>
  c.post<SupplierFull>(path(), { body, idempotencyKey });
export const updateSupplier = (
  c: ApiClient,
  id: string,
  version: number,
  body: Record<string, unknown>,
  idempotencyKey: string,
) => c.patch<SupplierFull>(path(id), { body, version, idempotencyKey });

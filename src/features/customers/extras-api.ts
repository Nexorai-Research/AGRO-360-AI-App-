import type { ApiClient } from '../../api/client';
import { dec } from '../../money';

// Web parity, phase 1 (customer 360). Copied from apps/web/src/pages/customers.js and the backend:
// apps/api/src/{crm,crm-admin,collections,sales}.controller.ts, modules/customer/src/domain/crm.ts (parseApplication),
// modules/credit/src/domain/collections.ts (parseGuarantor), modules/customer/src/application/{interactions,loyalty}.ts.

export const XPERM = {
  view: 'customer.view',
  tasks: 'customer.interaction',
  applications: 'agri.application.record',
  kycView: 'customer.kyc.view',
  kyc: 'customer.kyc',
  guarantor: 'credit.guarantor',
  credit: 'customer.ledger.view',
  share: 'receipt.create',
  household: 'crm.household.manage',
  pos: 'sales.pos.use',
} as const;

const base = (id: string) => `/customers/${encodeURIComponent(id)}`;

// ---- 1.1 open CRM tasks ---------------------------------------------------------------------------------------------------
export interface TaskView {
  id: string;
  customerId: string;
  title: string;
  dueOn: string;
  status: string;
  overdue: boolean;
}
export const fetchOpenTasks = async (c: ApiClient, customerId: string, signal?: AbortSignal) =>
  (await c.get<{ items: TaskView[] }>('/crm/tasks', { query: { customerId, status: 'OPEN' }, signal })).items;
export const taskDone = (c: ApiClient, id: string, idempotencyKey: string) =>
  c.post<unknown>(`/crm/tasks/${encodeURIComponent(id)}/done`, { body: {}, idempotencyKey });

// ---- 1.3 inputs applied (UC-340) -------------------------------------------------------------------------------------------
export interface ApplicationView {
  id: string;
  appliedOn: string;
  productName: string;
  regulated?: boolean;
  batchNo: string | null;
  qty: string;
  unit: string;
  source: string;
  verified: boolean;
}
export interface ApplicationForm {
  productName: string;
  batchNo: string;
  qty: string;
  unit: string;
  appliedOn: string;
  method: string;
  regulatedCheck: string;
}
export const emptyApplication = (today: string): ApplicationForm => ({
  productName: '',
  batchNo: '',
  qty: '',
  unit: 'litre',
  appliedOn: today,
  method: '',
  regulatedCheck: '',
});
const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
export function realDay(v: string): boolean {
  const m = DAY.exec(v.trim());
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!));
  return d.getUTCFullYear() === +m[1]! && d.getUTCMonth() === +m[2]! - 1 && d.getUTCDate() === +m[3]!;
}
/** Up to `dp` decimals, more than zero, at most `max`. */
export function positiveDecimal(v: string, dp: number, max: string): boolean {
  const s = v.trim();
  if (!new RegExp(`^\\d+(\\.\\d{1,${dp}})?$`).test(s)) return false;
  try {
    const x = dec(s);
    return x.gt(0) && x.lte(max);
  } catch {
    return false;
  }
}
export type ApplicationError = 'product' | 'batch' | 'qty' | 'unit' | 'date' | 'method' | 'check';
export function applicationErrors(f: ApplicationForm): ApplicationError[] {
  const e: ApplicationError[] = [];
  const p = f.productName.trim();
  if (p.length < 1 || p.length > 160) e.push('product');
  if (f.batchNo.trim().length > 60) e.push('batch');
  if (!positiveDecimal(f.qty, 3, '999999999')) e.push('qty');
  const u = f.unit.trim();
  if (u.length < 1 || u.length > 20) e.push('unit');
  if (!realDay(f.appliedOn)) e.push('date');
  if (f.method.trim().length > 60) e.push('method');
  if (f.regulatedCheck.trim().length > 300) e.push('check');
  return e;
}
/** Like the web: blank fields are left out. */
export function applicationBody(f: ApplicationForm): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(f)) if (v.trim() !== '') out[k] = v.trim();
  return out;
}
export const fetchApplications = async (c: ApiClient, id: string, signal?: AbortSignal) =>
  (await c.get<{ items: ApplicationView[] }>(`${base(id)}/applications`, { signal })).items;
export const postApplication = (
  c: ApiClient,
  id: string,
  body: Record<string, string>,
  idempotencyKey: string,
) => c.post<unknown>(`${base(id)}/applications`, { body, idempotencyKey });
export const verifyApplication = (c: ApiClient, id: string, appId: string, idempotencyKey: string) =>
  c.post<unknown>(`${base(id)}/applications/${encodeURIComponent(appId)}:verify`, { idempotencyKey });

// ---- 1.5 KYC documents ---------------------------------------------------------------------------------------------------
export const DOC_TYPES = [
  'AADHAAR',
  'PAN',
  'VOTER_ID',
  'DRIVING_LICENCE',
  'PASSPORT',
  'LAND_RECORD',
  'BANK_PASSBOOK',
  'OTHER',
] as const;
/** The web refuses files above 2 MB before sending. */
export const KYC_MAX_BYTES = 2 * 1024 * 1024;
export interface KycDoc {
  id: string;
  docType: string;
  numberMasked: string | null;
  expiresOn: string | null;
  expired: boolean;
  filename: string;
}
export const fetchDocuments = async (c: ApiClient, id: string, signal?: AbortSignal) =>
  (await c.get<{ items: KycDoc[] }>(`${base(id)}/documents`, { signal })).items;
export function documentBody(
  f: { docType: string; number: string; expiresOn: string },
  file: { name: string; base64: string },
) {
  return {
    docType: f.docType,
    ...(f.number.trim() ? { number: f.number.trim() } : {}),
    ...(f.expiresOn.trim() ? { expiresOn: f.expiresOn.trim() } : {}),
    filename: file.name,
    contentBase64: file.base64,
  };
}
export const uploadDocument = (
  c: ApiClient,
  id: string,
  body: ReturnType<typeof documentBody>,
  idempotencyKey: string,
) => c.post<unknown>(`${base(id)}/documents`, { body, idempotencyKey });
export const documentContent = (c: ApiClient, id: string, docId: string) =>
  c.get<{ filename: string; contentType: string; contentBase64: string }>(
    `${base(id)}/documents/${encodeURIComponent(docId)}/content`,
  );
export const removeDocument = (c: ApiClient, id: string, docId: string, idempotencyKey: string) =>
  c.post<unknown>(`${base(id)}/documents/${encodeURIComponent(docId)}:remove`, { idempotencyKey });

// ---- 1.6 loyalty points ledger ---------------------------------------------------------------------------------------------
export interface PointsEntry {
  id: string;
  points: number;
  reason: string;
  ref: string | null;
  at: string;
}
export const fetchPointsLedger = async (c: ApiClient, id: string, signal?: AbortSignal) =>
  (await c.get<{ items: PointsEntry[] }>(`${base(id)}/loyalty/ledger`, { signal })).items;

// ---- 1.8 new household ---------------------------------------------------------------------------------------------------
export const householdBody = (name: string, customerId: string) => ({
  name: name.trim(),
  decisionMakerId: customerId,
  payerId: customerId,
  members: [{ customerId, relationship: 'SELF' }],
});
export const createHousehold = (
  c: ApiClient,
  body: ReturnType<typeof householdBody>,
  idempotencyKey: string,
) => c.post<unknown>('/crm/households', { body, idempotencyKey });

// ---- 1.9 purchase history ------------------------------------------------------------------------------------------------
export const SEASONS = ['KHARIF', 'RABI', 'ZAID'] as const;
export interface PurchaseRow {
  number: string;
  d: string;
  sku_code: string;
  sku_name: string;
  batch_no: string | null;
  qty: string;
  returned: string;
  line_total: string;
  status: string;
}
export const fetchPurchases = async (
  c: ApiClient,
  id: string,
  f: { season: string; year: string },
  signal?: AbortSignal,
) =>
  (
    await c.get<{ items: PurchaseRow[] }>(`${base(id)}/purchases`, {
      query: { limit: 200, ...(f.season ? { season: f.season, year: f.year } : {}) },
      signal,
    })
  ).items;

// ---- 1.4 guarantors ------------------------------------------------------------------------------------------------------
export interface GuarantorView {
  id: string;
  name: string;
  mobile: string | null;
  relationship: string;
  limitCovered: string | null;
  overdue: string | null;
}
export const fetchGuarantors = async (c: ApiClient, id: string, signal?: AbortSignal) =>
  (await c.get<{ guarantors?: GuarantorView[] }>(`${base(id)}/credit`, { signal })).guarantors ?? [];
export interface GuarantorForm {
  name: string;
  mobile: string;
  relationship: string;
  documentRef: string;
  limitCovered: string;
  /** Web parity 11.6: an existing customer as the guarantor; then name and mobile are not needed. */
  guarantorCustomerId?: string;
}
export const emptyGuarantor = (): GuarantorForm => ({
  name: '',
  mobile: '',
  relationship: '',
  documentRef: '',
  limitCovered: '',
  guarantorCustomerId: '',
});
export type GuarantorError = 'name' | 'mobile' | 'relationship' | 'document' | 'amount';
/** Same rules as parseGuarantor: someone who is not a customer needs a name and a 10 digit mobile starting 6-9. */
export function guarantorErrors(f: GuarantorForm): GuarantorError[] {
  const e: GuarantorError[] = [];
  const n = f.name.trim();
  const existing = !!f.guarantorCustomerId;
  if (!existing && (n.length < 2 || n.length > 120)) e.push('name');
  if (
    existing
      ? f.mobile.trim() !== '' && !/^[6-9]\d{9}$/.test(f.mobile.trim())
      : !/^[6-9]\d{9}$/.test(f.mobile.trim())
  )
    e.push('mobile');
  const r = f.relationship.trim();
  if (r.length < 2 || r.length > 60) e.push('relationship');
  if (f.documentRef.trim().length > 200) e.push('document');
  if (f.limitCovered.trim() !== '' && !positiveDecimal(f.limitCovered, 4, '999999999999')) e.push('amount');
  return e;
}
/** Like the web: an existing customer is sent by id, name and mobile only when typed. */
export const guarantorBody = (f: GuarantorForm) =>
  f.guarantorCustomerId
    ? {
        relationship: f.relationship.trim(),
        guarantorCustomerId: f.guarantorCustomerId,
        ...(f.name.trim() ? { name: f.name.trim() } : {}),
        ...(f.mobile.trim() ? { mobile: f.mobile.trim() } : {}),
        ...(f.documentRef.trim() ? { documentRef: f.documentRef.trim() } : {}),
        ...(f.limitCovered.trim() ? { limitCovered: f.limitCovered.trim() } : {}),
      }
    : {
        relationship: f.relationship.trim(),
        name: f.name.trim(),
        mobile: f.mobile.trim(),
        ...(f.documentRef.trim() ? { documentRef: f.documentRef.trim() } : {}),
        ...(f.limitCovered.trim() ? { limitCovered: f.limitCovered.trim() } : {}),
      };

// ---- 11.7 reorder at the counter from the purchase history ----------------------------------------------------------------
export interface ReorderLine {
  code: string;
  qty: number;
}
/**
 * Like the web: lines of bills that are not cancelled, net of returns, added up per product first and floored at zero once at
 * the end, so a fully returned bill cannot hide an earlier purchase or invent a quantity.
 */
export function reorderLines(rows: PurchaseRow[]): ReorderLine[] {
  const by = new Map<string, number>();
  for (const x of rows.filter((y) => y.status !== 'CANCELLED'))
    by.set(x.sku_code, (by.get(x.sku_code) ?? 0) + Number(x.qty) - Number(x.returned));
  return [...by.entries()].map(([code, qty]) => ({ code, qty: Math.max(qty, 0) })).filter((l) => l.qty > 0);
}
export const REORDER_PERM = 'sales.pos.use';
export const addGuarantor = (
  c: ApiClient,
  id: string,
  body: ReturnType<typeof guarantorBody>,
  idempotencyKey: string,
) => c.post<unknown>(`${base(id)}/guarantors`, { body, idempotencyKey });
export const removeGuarantor = (c: ApiClient, id: string, gid: string, idempotencyKey: string) =>
  c.delete<unknown>(`${base(id)}/guarantors/${encodeURIComponent(gid)}`, { idempotencyKey });

// ---- 1.7 share the statement ---------------------------------------------------------------------------------------------
export interface ShareResult {
  url: string;
  message?: { status: string; reason?: string | null } | null;
}
/** parseShare: ttlDays is a whole number from 1 to 90. */
export const validTtl = (v: string) => /^\d{1,2}$/.test(v.trim()) && Number(v) >= 1 && Number(v) <= 90;
export const shareStatement = (
  c: ApiClient,
  id: string,
  b: { language: string; ttlDays: string; send: boolean },
  idempotencyKey: string,
) =>
  c.post<ShareResult>(`${base(id)}/statement/share`, {
    body: { ...(b.language ? { language: b.language } : {}), ttlDays: Number(b.ttlDays || 30), send: b.send },
    idempotencyKey,
  });

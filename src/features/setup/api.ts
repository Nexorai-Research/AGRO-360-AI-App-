import type { ApiClient } from '@/api/client';
import type { Amount } from '@/money';

// Shapes copied by hand from the backend (no OpenAPI file yet): apps/api/src/org.controller.ts and modules/org/src/{domain/org.ts,application/*.ts}.

export const SP = {
  view: 'org.config.view',
  year: 'org.financial_year.manage',
  tax: 'org.tax.manage',
  numbering: 'org.numbering.manage',
  print: 'org.print.manage',
  branch: 'org.branch.manage',
  warehouse: 'org.warehouse.manage',
} as const;

export const skey = (userId: string, what: string, extra = '') =>
  ['sal', 'setup', what, userId, extra] as const;
const id = encodeURIComponent;

// ---- financial years ----
export interface FinancialYear {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
  status: 'OPEN' | 'LOCKED';
  lockedAt: string | null;
  periodCount: number;
  /** Something is booked in it (a locked month, an issued number, a budget, a year-end close): it can no longer change. */
  inUse?: boolean;
  /** It has not started yet. */
  future?: boolean;
}
export interface Period {
  id: string;
  fyId: string;
  label: string;
  startDate: string;
  endDate: string;
  status: 'OPEN' | 'LOCKED';
  lockedAt: string | null;
}
export const fetchYears = async (c: ApiClient, signal?: AbortSignal) =>
  (await c.get<{ items: FinancialYear[] }>('/financial-years', { signal })).items;
export const fetchPeriods = async (c: ApiClient, yearId: string, signal?: AbortSignal) =>
  (await c.get<{ items: Period[] }>(`/financial-years/${id(yearId)}/periods`, { signal })).items;
export const createYear = (
  c: ApiClient,
  body: { startDate: string; endDate?: string },
  idempotencyKey: string,
) => c.post<FinancialYear>('/financial-years', { body, idempotencyKey });
export const lockYear = (c: ApiClient, yearId: string, reason: string, idempotencyKey: string) =>
  c.post<FinancialYear>(`/financial-years/${id(yearId)}:lock`, { body: { reason }, idempotencyKey });
/** Web parity 16: new dates for an open year nothing is booked in; its months are rebuilt. */
export const editYear = (
  c: ApiClient,
  yearId: string,
  body: { startDate: string; endDate: string },
  idempotencyKey: string,
) => c.put<FinancialYear>(`/financial-years/${id(yearId)}`, { body, idempotencyKey });
/** Web parity 16: removes the last year when it has not started and nothing is booked in it, with a recorded reason. */
export const deleteYear = (c: ApiClient, yearId: string, reason: string, idempotencyKey: string) =>
  c.post<{ id: string; label: string }>(`/financial-years/${id(yearId)}:delete`, {
    body: { reason },
    idempotencyKey,
  });
export const yearEditable = (y: FinancialYear) => y.status === 'OPEN' && y.inUse === false;
export const yearDeletable = (y: FinancialYear, all: FinancialYear[]) =>
  yearEditable(y) && y.future === true && all[all.length - 1]?.id === y.id;
/** Why Edit or Delete is not offered (the web's reasons), or null. */
export function yearWhyNot(y: FinancialYear, what: 'edit' | 'delete', all: FinancialYear[] = []) {
  if (y.status === 'LOCKED') return 'locked';
  if (y.inUse !== false) return 'inUse';
  if (what === 'delete' && y.future !== true) return 'started';
  if (what === 'delete' && all[all.length - 1]?.id !== y.id) return 'notLast';
  return null;
}
export const lockPeriod = (c: ApiClient, periodId: string, reason: string, idempotencyKey: string) =>
  c.post<Period>(`/accounting-periods/${id(periodId)}:lock`, { body: { reason }, idempotencyKey });

// ---- tax ----
export const TAX_KINDS = ['GST', 'EXEMPT', 'NIL', 'NON_GST'] as const;
export type TaxKind = (typeof TAX_KINDS)[number];
export interface TaxRate {
  id: string;
  code: string;
  name: string;
  kind: string;
  ratePct: Amount;
  effectiveFrom: string;
  reason: string | null;
}
export interface HsnMap {
  hsnCode: string;
  taxCode: string;
  effectiveFrom: string;
}
export interface TaxSetting {
  compositionScheme: boolean;
  rounding: 'PAISA' | 'RUPEE';
  version: number;
}
export const fetchTaxRates = (c: ApiClient, signal?: AbortSignal) =>
  c.get<{ current: TaxRate[]; history: TaxRate[] }>('/settings/tax-rates', { signal });
export const fetchHsn = (c: ApiClient, signal?: AbortSignal) =>
  c.get<{ current: HsnMap[]; history: HsnMap[] }>('/settings/hsn-tax', { signal });
export const fetchTaxSetting = (c: ApiClient, signal?: AbortSignal) =>
  c.get<TaxSetting>('/settings/tax', { signal });
export const addTaxRate = (c: ApiClient, body: unknown, idempotencyKey: string) =>
  c.post<TaxRate>('/settings/tax-rates', { body, idempotencyKey });
export const mapHsn = (c: ApiClient, body: HsnMap, idempotencyKey: string) =>
  c.post<HsnMap>('/settings/hsn-tax', { body, idempotencyKey });
export const saveTaxSetting = (
  c: ApiClient,
  version: number,
  body: { compositionScheme: boolean; rounding: 'PAISA' | 'RUPEE' },
  idempotencyKey: string,
) => c.put<TaxSetting>('/settings/tax', { version, body, idempotencyKey });

// ---- numbering ----
export interface Series {
  id: string;
  branchId: string;
  docType: string;
  fy: string;
  prefix: string;
  padding: number;
  nextNumber: number;
  issued: number;
  nextExample: string;
  version: number;
}
export const fetchSeries = async (c: ApiClient, branchId: string, fy: string, signal?: AbortSignal) =>
  (await c.get<{ items: Series[] }>('/settings/number-series', { query: { branchId, fy }, signal })).items;
export const saveSeries = (
  c: ApiClient,
  body: {
    branchId: string;
    docType: string;
    fy: string;
    prefix: string;
    padding: number;
    nextNumber: number;
  },
  idempotencyKey: string,
) => c.put<Series>('/settings/number-series', { body, idempotencyKey });

// ---- print templates ----
export const PAPERS = ['A4', 'A5', 'THERMAL_3IN', 'THERMAL_2IN'] as const;
export const FLAGS = [
  'showLogo',
  'showLicenceNumbers',
  'showBatch',
  'showExpiry',
  'showHsn',
  'showTerms',
  'showUpiQr',
] as const;
export type Flag = (typeof FLAGS)[number];
export interface PrintTemplate {
  docType: string;
  paper: (typeof PAPERS)[number];
  showLogo: boolean;
  showLicenceNumbers: boolean;
  showBatch: boolean;
  showExpiry: boolean;
  showHsn: boolean;
  showTerms: boolean;
  showUpiQr: boolean;
  terms: string | null;
  footer: string | null;
  version: number;
  isDefault: boolean;
}
export const fetchTemplates = async (c: ApiClient, signal?: AbortSignal) =>
  (await fetchTemplateList(c, signal)).items;
/** With the document types deleted from the list (web parity 16), which can be added back. */
export const fetchTemplateList = async (c: ApiClient, signal?: AbortSignal) => {
  const r = await c.get<{ items: PrintTemplate[]; removed?: string[] }>('/settings/print-templates', {
    signal,
  });
  return { items: r.items, removed: r.removed ?? [] };
};
/** Deleted from the list: documents of this type still print with the standard layout; issued documents do not change. */
export const deleteTemplate = (c: ApiClient, docType: string, idempotencyKey: string) =>
  c.post<unknown>('/settings/print-templates:delete', { body: { docType }, idempotencyKey });
/** Added back with the default layout. */
export const restoreTemplate = (c: ApiClient, docType: string, idempotencyKey: string) =>
  c.post<unknown>('/settings/print-templates:restore', { body: { docType }, idempotencyKey });
export const saveTemplate = (c: ApiClient, version: number, body: unknown, idempotencyKey: string) =>
  c.put<PrintTemplate>('/settings/print-templates', { version, body, idempotencyKey });

// ---- branches, warehouses, bins ----
export interface Branch {
  id: string;
  code: string;
  name: string;
  address: string | null;
  stateCode: string | null;
  gstin: string | null;
  phone: string | null;
  managerUserId: string | null;
  openingDate: string | null;
  timezone: string;
  isHeadOffice: boolean;
  status: 'ACTIVE' | 'INACTIVE';
  version: number;
}
export const WAREHOUSE_KINDS = [
  'SELLABLE',
  'STORE_SHELF',
  'GODOWN',
  'QUARANTINE',
  'VENDOR_RETURN',
  'IN_TRANSIT',
  'DAMAGED',
] as const;
export interface Warehouse {
  id: string;
  branchId: string;
  code: string;
  name: string;
  kind: string;
  sellable: boolean;
  status: 'ACTIVE' | 'INACTIVE';
  version: number;
}
export interface Bin {
  id: string;
  warehouseId: string;
  label: string;
  rack: string | null;
  shelf: string | null;
  active: boolean;
}
export const fetchBranchList = async (c: ApiClient, signal?: AbortSignal) =>
  (await c.get<{ items: Branch[] }>('/branches', { signal })).items;
export const createBranch = (c: ApiClient, body: unknown, idempotencyKey: string) =>
  c.post<Branch>('/branches', { body, idempotencyKey });
export const patchBranch = (c: ApiClient, b: Branch, body: unknown, idempotencyKey: string) =>
  c.patch<Branch>(`/branches/${id(b.id)}`, { version: b.version, body, idempotencyKey });
export const deactivateBranch = (c: ApiClient, branchId: string, reason: string, idempotencyKey: string) =>
  c.post<Branch>(`/branches/${id(branchId)}:deactivate`, { body: { reason }, idempotencyKey });
export const reactivateBranch = (c: ApiClient, branchId: string, idempotencyKey: string) =>
  c.post<Branch>(`/branches/${id(branchId)}:reactivate`, { body: {}, idempotencyKey });

export const fetchWarehouseList = async (c: ApiClient, signal?: AbortSignal) =>
  (await c.get<{ items: Warehouse[] }>('/warehouses', { signal })).items;
export const createWarehouse = (c: ApiClient, body: unknown, idempotencyKey: string) =>
  c.post<Warehouse>('/warehouses', { body, idempotencyKey });
export const patchWarehouse = (c: ApiClient, w: Warehouse, body: unknown, idempotencyKey: string) =>
  c.patch<Warehouse>(`/warehouses/${id(w.id)}`, { version: w.version, body, idempotencyKey });
export const deactivateWarehouse = (c: ApiClient, whId: string, reason: string, idempotencyKey: string) =>
  c.post<Warehouse>(`/warehouses/${id(whId)}:deactivate`, { body: { reason }, idempotencyKey });
export const reactivateWarehouse = (c: ApiClient, whId: string, idempotencyKey: string) =>
  c.post<Warehouse>(`/warehouses/${id(whId)}:reactivate`, { body: {}, idempotencyKey });
export const fetchBins = async (c: ApiClient, whId: string, signal?: AbortSignal) =>
  (await c.get<{ items: Bin[] }>(`/warehouses/${id(whId)}/bins`, { signal })).items;
export const createBin = (c: ApiClient, whId: string, body: unknown, idempotencyKey: string) =>
  c.post<Bin>(`/warehouses/${id(whId)}/bins`, { body, idempotencyKey });
export const setBinActive = (c: ApiClient, binId: string, active: boolean, idempotencyKey: string) =>
  c.patch<Bin>(`/bins/${id(binId)}`, { body: { active }, idempotencyKey });

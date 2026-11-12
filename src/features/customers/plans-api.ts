import type { ApiClient } from '@/api/client';
import type { Amount } from '@/money';

// Shapes copied by hand from the backend (no OpenAPI file yet): apps/api/src/{agri,crm,crm-admin,sales}.controller.ts,
// modules/customer/src/domain/{agri,crm,privacy}.ts and modules/customer/src/application/{crops,field-service,groups,privacy,kyc}.ts.

export const PP = {
  view: 'customer.view',
  crop: 'customer.crop',
  plan: 'crm.plan.manage',
  service: 'crm.service.manage',
  household: 'crm.household.manage',
  prefs: 'crm.preferences.manage',
  privacy: 'customer.privacy',
  update: 'customer.update',
} as const;

export const SEASONS = ['KHARIF', 'RABI', 'ZAID', 'PERENNIAL'] as const;
export const AREA_UNITS = ['ACRE', 'HECTARE', 'GUNTHA'] as const;
export const CASE_KINDS = ['QUERY', 'VISIT', 'ADVICE'] as const;
export const ADVICE_SOURCES = ['APPROVED_SOURCE', 'EXPERT_PROVIDED'] as const;
export const CHANNELS = ['SMS', 'WHATSAPP', 'EMAIL', 'CALL'] as const;
export type PlanStatus = 'PLANNED' | 'SOWN' | 'GROWING' | 'HARVESTED' | 'ABANDONED';
/** The only moves the server allows from each status. */
export const NEXT: Record<PlanStatus, PlanStatus[]> = {
  PLANNED: ['SOWN'],
  SOWN: ['GROWING', 'HARVESTED'],
  GROWING: ['HARVESTED'],
  HARVESTED: [],
  ABANDONED: [],
};

export const pkey = (userId: string, what: string, customerId: string) =>
  ['sal', 'cust', what, userId, customerId] as const;
const base = (id: string) => `/customers/${encodeURIComponent(id)}`;

export interface Crop {
  id: string;
  name: string;
  durationDays: number;
  seasons: string[];
  reviewed: boolean;
  status: string;
}
export interface CropPlan {
  id: string;
  season: string;
  seasonYear: number;
  cropId: string;
  cropName: string;
  varietyName: string | null;
  plotId: string | null;
  plotName: string | null;
  areaAcres: Amount;
  sowingDate: string;
  expectedHarvestDate: string;
  actualHarvestDate: string | null;
  status: PlanStatus;
  stage: string | null;
  version: number;
}
export interface PurchasePlan {
  id: string;
  season: string;
  seasonYear: number;
  status: string;
  notes: string | null;
  version: number;
  lines: { id: string; description: string; qty: Amount; neededBy: string | null }[];
}
export interface ServiceCase {
  id: string;
  caseNo: string;
  kind: string;
  queryText: string;
  adviceText: string | null;
  adviceSource: string | null;
  adviceReference: string | null;
  status: string;
  followUpOn: string | null;
}
export interface Contact {
  id: string;
  name: string;
  phone: string;
  relation: string | null;
  isPrimary: boolean;
}
export interface Preference {
  customerId: string;
  preferredChannel: string | null;
  quietStart: string | null;
  quietEnd: string | null;
  maxPerWeek: number | null;
  language: string;
  version: number;
}
export interface AccessLogRow {
  id: string;
  documentId: string | null;
  actorId: string | null;
  action: string;
  at: string;
}
export interface PlotRef {
  id: string;
  name: string;
  areaAcres: string;
}

export const fetchCrops = async (c: ApiClient, signal?: AbortSignal) =>
  (await c.get<{ items: Crop[] }>('/crops', { signal })).items;
export const fetchCropPlans = async (c: ApiClient, id: string, signal?: AbortSignal) =>
  (await c.get<{ items: CropPlan[] }>(`${base(id)}/crop-plans`, { signal })).items;
export const fetchPlots = async (c: ApiClient, id: string, signal?: AbortSignal): Promise<PlotRef[]> =>
  (
    await c.get<{ items: { status: string; plots: (PlotRef & { status: string })[] }[] }>(
      `${base(id)}/farms`,
      { signal },
    )
  ).items
    .filter((f) => f.status === 'ACTIVE')
    .flatMap((f) => f.plots.filter((p) => p.status === 'ACTIVE'));
export const createCropPlan = (c: ApiClient, id: string, body: unknown, idempotencyKey: string) =>
  c.post<CropPlan>(`${base(id)}/crop-plans`, { body, idempotencyKey });
export const transitionCropPlan = (
  c: ApiClient,
  id: string,
  planId: string,
  body: unknown,
  idempotencyKey: string,
) =>
  c.post<CropPlan>(`${base(id)}/crop-plans/${encodeURIComponent(planId)}/transition`, {
    body,
    idempotencyKey,
  });

export const fetchPurchasePlans = async (c: ApiClient, id: string, signal?: AbortSignal) =>
  (await c.get<{ items: PurchasePlan[] }>(`${base(id)}/purchase-plans`, { signal })).items;
export const createPurchasePlan = (c: ApiClient, id: string, body: unknown, idempotencyKey: string) =>
  c.post<PurchasePlan>(`${base(id)}/purchase-plans`, { body, idempotencyKey });
export const confirmPurchasePlan = (c: ApiClient, id: string, planId: string, idempotencyKey: string) =>
  c.post<PurchasePlan>(`${base(id)}/purchase-plans/${encodeURIComponent(planId)}/status`, {
    body: { status: 'CONFIRMED' },
    idempotencyKey,
  });

export const fetchCases = async (c: ApiClient, id: string, signal?: AbortSignal) =>
  (await c.get<{ items: ServiceCase[] }>(`${base(id)}/service-cases`, { signal })).items;
export const createCase = (c: ApiClient, id: string, body: unknown, idempotencyKey: string) =>
  c.post<ServiceCase>(`${base(id)}/service-cases`, { body, idempotencyKey });

export const fetchContacts = async (c: ApiClient, id: string, signal?: AbortSignal) =>
  (await c.get<{ items: Contact[] }>(`${base(id)}/contacts`, { signal })).items;
export const addContact = (c: ApiClient, id: string, body: unknown, idempotencyKey: string) =>
  c.post<Contact[]>(`${base(id)}/contacts`, { body, idempotencyKey });
export const removeContact = (c: ApiClient, id: string, contactId: string, idempotencyKey: string) =>
  c.post<unknown>(`${base(id)}/contacts/${encodeURIComponent(contactId)}:remove`, {
    body: {},
    idempotencyKey,
  });

export const fetchPreference = (c: ApiClient, id: string, signal?: AbortSignal) =>
  c.get<Preference>(`${base(id)}/preferences`, { signal });
export const savePreference = (
  c: ApiClient,
  id: string,
  version: number,
  body: unknown,
  idempotencyKey: string,
) => c.put<Preference>(`${base(id)}/preferences`, { version, body, idempotencyKey });
export const fetchAccessLog = async (c: ApiClient, id: string, signal?: AbortSignal) =>
  (await c.get<{ items: AccessLogRow[] }>(`${base(id)}/documents/access-log`, { signal })).items;
export const anonymizeCustomer = (
  c: ApiClient,
  id: string,
  body: { reason: string; confirm: string },
  idempotencyKey: string,
) => c.post<unknown>(`${base(id)}/anonymize`, { body, idempotencyKey });
export const setCustomerStatus = (
  c: ApiClient,
  id: string,
  status: 'ACTIVE' | 'INACTIVE',
  idempotencyKey: string,
) => c.post<unknown>(`${base(id)}/status`, { body: { status }, idempotencyKey });

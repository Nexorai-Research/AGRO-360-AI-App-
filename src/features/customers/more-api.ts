import type { ApiClient } from '../../api/client';

// Shapes copied by hand from modules/customer/src/application/{farms,kyc,loyalty,groups,customers,interactions}.ts. Read only.
// Money and areas are decimal strings. KYC numbers arrive already masked; the app never asks for the document file itself.

export interface PlotView {
  id: string;
  name: string;
  areaAcres: string;
  soilType: string | null;
  irrigationSource: string | null;
  status: string;
}
export interface FarmView {
  id: string;
  name: string;
  ownership: string;
  areaAcres: string | null;
  plotAcres: string;
  status: string;
  version?: number;
  plots: PlotView[];
}
export interface KycView {
  id: string;
  docType: string;
  numberMasked: string | null;
  expiresOn: string | null;
  expired: boolean;
  filename: string;
  status: string;
}
export interface TierView {
  id: string;
  name: string;
  minSpend: string;
  minInvoices: number;
  discountPct: string;
}
export interface LoyaltyView {
  tier: TierView | null;
  nextTier: TierView | null;
  points: number;
  spend: string;
  invoices: number;
  why: string;
  eligible: boolean;
}
export interface HouseholdView {
  id: string;
  name: string;
  decisionMakerCustomerId: string | null;
  payerCustomerId: string | null;
  members: { customerId: string; name: string; code: string; mobile: string | null; relationship: string }[];
}
export interface ConsentView {
  purpose: string;
  channel: string;
  granted: boolean;
  capturedAt: string;
}
export interface InteractionView {
  id: string;
  kind: string;
  occurredAt: string;
  notes: string;
  cropIssue: string | null;
  advice: string | null;
  followUpOn: string | null;
}

const base = (id: string) => `/customers/${encodeURIComponent(id)}`;
export const fetchFarms = async (c: ApiClient, id: string, signal?: AbortSignal) =>
  (await c.get<{ items: FarmView[] }>(`${base(id)}/farms`, { signal })).items;
/** Listing documents is written to the KYC access log by the server, so call this only when the user opens the section. */
export const fetchKyc = async (c: ApiClient, id: string, signal?: AbortSignal) =>
  (await c.get<{ items: KycView[] }>(`${base(id)}/documents`, { signal })).items;
export const fetchLoyalty = (c: ApiClient, id: string, signal?: AbortSignal) => c.get<LoyaltyView>(`${base(id)}/loyalty`, { signal });
export const fetchHousehold = async (c: ApiClient, id: string, signal?: AbortSignal) =>
  (await c.get<{ household: HouseholdView | null }>(`${base(id)}/household`, { signal })).household;
export const fetchConsents = async (c: ApiClient, id: string, signal?: AbortSignal) =>
  (await c.get<{ current: ConsentView[] }>(`${base(id)}/consents`, { signal })).current;
export const fetchActivity = async (c: ApiClient, id: string, signal?: AbortSignal) =>
  (await c.get<{ items: InteractionView[] }>(`${base(id)}/interactions`, { signal })).items;

export type SectionKey = 'farms' | 'kyc' | 'loyalty' | 'household' | 'consents' | 'activity';
/** What each section needs. KYC needs its own permission; the server refuses without it. */
export const SECTION_PERM: Record<SectionKey, string> = {
  farms: 'customer.view',
  kyc: 'customer.kyc.view',
  loyalty: 'customer.view',
  household: 'customer.view',
  consents: 'customer.view',
  activity: 'customer.view',
};
export const SECTIONS = Object.keys(SECTION_PERM) as SectionKey[];

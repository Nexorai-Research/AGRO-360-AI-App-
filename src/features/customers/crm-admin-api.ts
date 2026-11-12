import type { ApiClient } from '../../api/client';

// Calls and shapes for the CRM back-office screens. Shapes were copied by hand from the backend source
// (crm.controller.ts, crm-admin.controller.ts, agri.controller.ts); there is no OpenAPI file yet. Money and
// percentages are decimal strings. Every write takes the Idempotency-Key made once per action by the screen.

export const CRMPERM = {
  view: 'customer.view',
  territoryManage: 'territory.manage',
  territoryAssign: 'territory.assign',
  crop: 'customer.crop',
  cropReview: 'agri.reference.manage',
  merge: 'customer.merge',
  segment: 'customer.segment',
  group: 'customer.group',
  import: 'customer.import',
  loyalty: 'crm.loyalty.manage',
  consent: 'privacy.consent.manage',
  calendar: 'crm.calendar.manage',
  greeting: 'crm.greeting.manage',
  complaintResolve: 'customer.complaint.resolve',
} as const;

const enc = encodeURIComponent;
type Rec = Record<string, unknown>;

// ---- villages, territories, crops ---------------------------------------------------------------------------
export interface Village {
  id: string;
  name: string;
  taluka: string;
  district: string;
  stateCode: string;
  pin: string | null;
  status: string;
  version: number;
}
export interface Territory {
  id: string;
  name: string;
  status?: string;
  version?: number;
  villageCount?: number;
  villages?: { id: string; name: string }[];
  assignees?: { userId: string; fullName?: string; name?: string }[];
}
export interface Crop {
  id: string;
  name: string;
  durationDays: number;
  seasons: string[];
  reviewed: boolean;
}
export interface OfficerUser {
  id: string;
  fullName: string;
  status: string;
  roleIds: string[];
}
export const fetchVillages = async (c: ApiClient, signal?: AbortSignal) =>
  (await c.get<{ items: Village[] }>('/villages', { query: { limit: 1000 }, signal })).items;
export const createVillage = (c: ApiClient, body: Rec, key: string) =>
  c.post<Village>('/villages', { body, idempotencyKey: key });
export const patchVillage = (c: ApiClient, v: Village, body: Rec, key: string) =>
  c.patch<Village>(`/villages/${enc(v.id)}`, { body, version: v.version, idempotencyKey: key });
export interface VillageImportResult {
  total: number;
  created: number;
  duplicates?: number;
  failed?: number;
  errors?: { row: number; message: string }[];
}
export const importVillages = (c: ApiClient, csv: string, key: string) =>
  c.post<VillageImportResult>('/villages/import', { body: { csv }, idempotencyKey: key });

export const fetchTerritories = async (c: ApiClient, signal?: AbortSignal) =>
  (await c.get<{ items: Territory[] }>('/territories', { signal })).items;
export const fetchTerritory = (c: ApiClient, id: string, signal?: AbortSignal) =>
  c.get<Territory>(`/territories/${enc(id)}`, { signal });
export const createTerritory = (c: ApiClient, body: Rec, key: string) =>
  c.post<Territory>('/territories', { body, idempotencyKey: key });
export const patchTerritory = (c: ApiClient, id: string, version: number, body: Rec, key: string) =>
  c.patch<Territory>(`/territories/${enc(id)}`, { body, version, idempotencyKey: key });
export const putAssignees = (c: ApiClient, id: string, userIds: string[], key: string) =>
  c.put<unknown>(`/territories/${enc(id)}/assignees`, { body: { userIds }, idempotencyKey: key });
/** Needs identity.user.manage and identity.role.manage; a 403 here is shown as "nobody can be assigned". */
export const fetchOfficers = async (c: ApiClient, signal?: AbortSignal): Promise<OfficerUser[]> => {
  const [users, roles] = await Promise.all([
    c.get<{ items: OfficerUser[] }>('/users', { signal }),
    c.get<{ items: { id: string; systemKey: string | null }[] }>('/roles', { signal }),
  ]);
  const role = roles.items.find((r) => r.systemKey === 'field_officer');
  if (!role) return [];
  return users.items.filter((u) => u.status !== 'DEACTIVATED' && (u.roleIds ?? []).includes(role.id));
};

export const fetchCrops = async (c: ApiClient, signal?: AbortSignal) =>
  (await c.get<{ items: Crop[] }>('/crops', { signal })).items;
export const createCrop = (c: ApiClient, body: Rec, key: string) =>
  c.post<Crop>('/crops', { body, idempotencyKey: key });
export const reviewCrop = (c: ApiClient, id: string, key: string) =>
  c.post<unknown>(`/crops/${enc(id)}:review`, { body: {}, idempotencyKey: key });

// ---- duplicates, merge, segments, groups, import ------------------------------------------------------------
export interface DupMember {
  id: string;
  code: string;
  name: string;
  mobile: string | null;
}
export interface DupGroup {
  customers: DupMember[];
  reason?: string;
  score: number;
}
export interface MergeRow {
  id: string;
  mergedAt: string;
  survivorCode: string;
  mergedCode: string;
  status: string;
}
export const fetchDuplicates = async (c: ApiClient, signal?: AbortSignal) =>
  (await c.get<{ items: DupGroup[] }>('/customers/duplicates', { signal })).items;
export const fetchMerges = async (c: ApiClient, signal?: AbortSignal) =>
  (await c.get<{ items: MergeRow[] }>('/customers/merges', { signal })).items;
export const mergeCustomers = (
  c: ApiClient,
  body: { survivorId: string; mergedId: string; reason: string },
  key: string,
) => c.post<unknown>('/customers/merge', { body, idempotencyKey: key });
export const undoMerge = (c: ApiClient, id: string, key: string) =>
  c.post<unknown>(`/customers/merges/${enc(id)}:undo`, { idempotencyKey: key });

export interface SegmentRule {
  field: string;
  op: string;
  value: unknown;
}
export interface Segment {
  id: string;
  name: string;
  rules: SegmentRule[];
  status: string;
}
export interface Cohort {
  cohort: string;
  hidden: boolean;
  size?: number;
  counts: number[];
}
export const fetchSegments = async (c: ApiClient, signal?: AbortSignal) =>
  (await c.get<{ items: Segment[] }>('/customer-segments', { signal })).items;
export const createSegment = (c: ApiClient, body: { name: string; rules: SegmentRule[] }, key: string) =>
  c.post<Segment>('/customer-segments', { body, idempotencyKey: key });
export const previewSegment = (c: ApiClient, id: string) =>
  c.get<{ count: number; belowMinimumCohort: boolean; minimumCohort: number }>(
    `/customer-segments/${enc(id)}/preview`,
  );
export const fetchCohorts = (c: ApiClient, months: number, signal?: AbortSignal) =>
  c.get<{ minimumCohort: number; items: Cohort[] }>('/customer-segments/cohorts', {
    query: { months },
    signal,
  });

export interface Group {
  id: string;
  code: string;
  name: string;
  kind: string;
  memberCount: number;
  status: string;
}
export interface GroupDetail extends Group {
  members: { customerId: string; name: string; role: string }[];
}
export const fetchGroups = async (c: ApiClient, signal?: AbortSignal) =>
  (await c.get<{ items: Group[] }>('/customer-groups', { signal })).items;
export const fetchGroup = (c: ApiClient, id: string, signal?: AbortSignal) =>
  c.get<GroupDetail>(`/customer-groups/${enc(id)}`, { signal });
export const createGroup = (
  c: ApiClient,
  body: { name: string; kind: string; leaderCustomerId: string },
  key: string,
) => c.post<Group>('/customer-groups', { body, idempotencyKey: key });
export const changeMembers = (c: ApiClient, id: string, add: string[], remove: string[], key: string) =>
  c.post<unknown>(`/customer-groups/${enc(id)}/members`, {
    body: { add: add.map((customerId) => ({ customerId })), remove },
    idempotencyKey: key,
  });

export interface ImportPreview {
  jobId: string;
  totalRows: number;
  validRows: number;
  duplicateRows: number;
  errorRows: number;
  openingTotal: string;
  errors: { row: number; column: string; message: string }[];
}
export interface ImportJob {
  id: string;
  createdAt: string;
  filename: string | null;
  totalRows: number;
  status: string;
  result?: { created: number; skipped: number } | null;
}
export const fetchImportJobs = async (c: ApiClient, signal?: AbortSignal) =>
  (await c.get<{ items: ImportJob[] }>('/customers/import-jobs', { signal })).items;
export const fetchBranches = async (c: ApiClient, signal?: AbortSignal) =>
  (await c.get<{ items: { id: string; name: string }[] }>('/branches', { signal })).items;
export const fetchImportTemplate = (c: ApiClient) =>
  c.get<string>('/customers/import/template', { as: 'text' });
export const uploadImport = (c: ApiClient, body: Rec, key: string) =>
  c.post<ImportPreview>('/customers/import', { body, idempotencyKey: key });
export const commitImport = (c: ApiClient, jobId: string, key: string) =>
  c.post<{ result: { created: number; skipped: number } }>(`/customers/import/${enc(jobId)}/commit`, {
    body: { mode: 'ROW_WISE' },
    idempotencyKey: key,
  });

// ---- engagement ---------------------------------------------------------------------------------------------
export interface Tier {
  id: string;
  name: string;
  rank: number;
  minSpend: string;
  minInvoices: number;
  discountPct: string;
  benefits: string | null;
}
export interface Purpose {
  code: string;
  name: string;
  wordingVersion: number | null;
  wording?: { en?: string; hi?: string; mr?: string } | null;
}
export interface CoverageRow {
  purpose: string;
  channel: string;
  granted: number;
  coveragePct: number;
}
export interface CrmEvent {
  id: string;
  title: string;
  kind: string;
  startDate: string;
  endDate: string | null;
  source: string | null;
}
export interface GreetingRule {
  id: string;
  name: string;
  occasion: string;
  month?: number | null;
  day?: number | null;
  channel: string;
  templateEn: string;
}
export interface CrmMessage {
  id: string;
  createdAt: string;
  customerName?: string | null;
  customerId: string;
  channel: string;
  purpose: string;
  status: string;
  suppressReason?: string | null;
}
export const fetchTiers = async (c: ApiClient, signal?: AbortSignal) =>
  (await c.get<{ items: Tier[] }>('/crm/loyalty/tiers', { signal })).items;
export const createTier = (c: ApiClient, body: Rec, key: string) =>
  c.post<Tier>('/crm/loyalty/tiers', { body, idempotencyKey: key });
export const recomputeTiers = (c: ApiClient, key: string) =>
  c.post<{ changed?: number; pointsAdded?: number }>('/crm/loyalty/recompute', {
    body: {},
    idempotencyKey: key,
  });
export const fetchPurposes = async (c: ApiClient, signal?: AbortSignal) =>
  (await c.get<{ items: Purpose[] }>('/crm/consent/purposes', { signal })).items;
export const createPurpose = (c: ApiClient, body: Rec, key: string) =>
  c.post<unknown>('/crm/consent/purposes', { body, idempotencyKey: key });
export const createWording = (c: ApiClient, code: string, body: Rec, key: string) =>
  c.post<unknown>(`/crm/consent/purposes/${enc(code)}/wording`, { body, idempotencyKey: key });
export const fetchCoverage = (c: ApiClient, signal?: AbortSignal) =>
  c.get<{ activeCustomers: number; rows: CoverageRow[] }>('/crm/consent/coverage', { signal });
export const fetchEvents = async (c: ApiClient, from: string, signal?: AbortSignal) =>
  (await c.get<{ items: CrmEvent[] }>('/crm/events', { query: { from }, signal })).items;
export const createEvent = (c: ApiClient, body: Rec, key: string) =>
  c.post<unknown>('/crm/events', { body, idempotencyKey: key });
export const fetchGreetings = async (c: ApiClient, signal?: AbortSignal) =>
  (await c.get<{ items: GreetingRule[] }>('/crm/greetings', { signal })).items;
export const createGreeting = (c: ApiClient, body: Rec, key: string) =>
  c.post<unknown>('/crm/greetings', { body, idempotencyKey: key });
export const fetchMessages = (c: ApiClient, signal?: AbortSignal) =>
  c.get<{ items: CrmMessage[]; providerConfigured: boolean }>('/crm/messages', {
    query: { limit: 50 },
    signal,
  });
export const processComms = (c: ApiClient, key: string) =>
  c.post<{ greetings: { queued: number }; providerConfigured: boolean }>('/crm/comms/process', {
    body: {},
    idempotencyKey: key,
  });

// ---- complaints insight -------------------------------------------------------------------------------------
export interface Trends {
  total: number;
  open: number;
  breached: number;
  avgResolutionHours: number | null;
  avgRating: number | null;
  byBatch?: { batchNo: string; complaints: number }[];
  byCategory?: Record<string, number>;
  bySeverity?: Record<string, number>;
}
export const fetchTrends = (c: ApiClient, signal?: AbortSignal) =>
  c.get<Trends>('/crm/complaints/trends', { signal });
export const slaSweep = (c: ApiClient, key: string) =>
  c.post<{ escalated?: number }>('/crm/complaints/sla-sweep', { body: {}, idempotencyKey: key });

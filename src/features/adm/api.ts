import type { ApiClient } from '@/api/client';

// Shapes copied by hand from the backend: apps/api/src/{security,org,catalogue}.controller.ts, modules/identity/src/application/
// (security.ts, devices.ts, profile.ts), modules/org/src/application/(platform-config.ts, payment-modes.ts, settings.ts, profile.ts)
// and modules/catalogue/src/application/import-export.ts.
export const P = {
  security: 'identity.security.manage',
  session: 'identity.session.view',
  users: 'identity.user.manage',
  settings: 'org.settings.manage',
  company: 'org.company.manage',
  config: 'org.config.view',
  paymentMode: 'org.payment_mode.manage',
  productImport: 'product.import',
} as const;

export const admKey = (userId: string, ...parts: unknown[]) => ['adm', userId, ...parts] as const;

// ---- security centre ----
export interface SecurityPolicy {
  minLength: number;
  requireLettersNumbers: true;
  historyCount: number;
  mfaRequiredRoles: string[];
  version: number;
}
export const MFA_ROLES = [
  'franchise_admin',
  'branch_manager',
  'accountant',
  'inventory_keeper',
  'purchase_officer',
  'hr_manager',
  'field_officer',
  'auditor',
  'cashier',
] as const;
export type Severity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type IncidentStatus = 'OPEN' | 'INVESTIGATING' | 'RESOLVED' | 'CLOSED';
export const SEVERITIES: Severity[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
export const INCIDENT_STATUSES: IncidentStatus[] = ['OPEN', 'INVESTIGATING', 'RESOLVED', 'CLOSED'];
export const NEXT_STATUS: Record<IncidentStatus, IncidentStatus[]> = {
  OPEN: ['INVESTIGATING', 'RESOLVED'],
  INVESTIGATING: ['RESOLVED', 'OPEN'],
  RESOLVED: ['INVESTIGATING', 'CLOSED'],
  CLOSED: [],
};
export interface Incident {
  id: string;
  title: string;
  severity: Severity;
  status: IncidentStatus;
  source: string;
  rule: string | null;
  subjectUserId: string | null;
  assigneeId: string | null;
  version: number;
  createdAt: string;
  notes: { id: string; authorId: string | null; note: string; at: string }[];
}
export interface SecurityEvent {
  id: string;
  type: string;
  userId: string | null;
  ip: string | null;
  at: string;
}

export const fetchPolicy = (c: ApiClient, signal?: AbortSignal) =>
  c.get<SecurityPolicy>('/settings/security', { signal });
export const savePolicy = (
  c: ApiClient,
  p: SecurityPolicy,
  body: { minLength: number; historyCount: number; mfaRequiredRoles: string[] },
  idempotencyKey: string,
) => c.put<SecurityPolicy>('/settings/security', { body, version: p.version, idempotencyKey });
export const fetchIncidents = (c: ApiClient, status: string, signal?: AbortSignal) =>
  c.get<{ items: Incident[] }>('/security/incidents', { query: { status }, signal });
export const fetchIncident = (c: ApiClient, id: string, signal?: AbortSignal) =>
  c.get<Incident>(`/security/incidents/${encodeURIComponent(id)}`, { signal });
export const openIncident = (
  c: ApiClient,
  body: { title: string; severity: Severity },
  idempotencyKey: string,
) => c.post<Incident>('/security/incidents', { body, idempotencyKey });
export const transitionIncident = (
  c: ApiClient,
  i: Incident,
  status: IncidentStatus,
  idempotencyKey: string,
) =>
  c.post<Incident>(`/security/incidents/${encodeURIComponent(i.id)}:transition`, {
    body: { status },
    version: i.version,
    idempotencyKey,
  });
export const addIncidentNote = (c: ApiClient, id: string, note: string, idempotencyKey: string) =>
  c.post<Incident>(`/security/incidents/${encodeURIComponent(id)}/notes`, { body: { note }, idempotencyKey });
export const fetchSecurityEvents = (c: ApiClient, signal?: AbortSignal) =>
  c.get<{ items: SecurityEvent[] }>('/security/events', { query: { limit: 50 }, signal });

// ---- devices ----
export const PLATFORMS = ['ANDROID', 'IOS', 'WEB', 'POS_TERMINAL', 'DESKTOP'] as const;
export type Platform = (typeof PLATFORMS)[number];
export interface Device {
  id: string;
  userId: string;
  name: string;
  platform: string;
  status: 'REGISTERED' | 'REVOKED';
  registeredAt: string;
  lastSeenAt: string | null;
  revokedAt: string | null;
  permissions: string[];
}
export const fetchMyDevices = (c: ApiClient, signal?: AbortSignal) =>
  c.get<{ items: Device[] }>('/devices', { signal });
/** The device key in the answer is shown by the server only once. The caller puts it in secure storage and never displays or logs it. */
export const registerDevice = (
  c: ApiClient,
  body: { name: string; platform: Platform },
  idempotencyKey: string,
) => c.post<{ device: Device; deviceKey: string }>('/devices', { body, idempotencyKey });
export const revokeMyDevice = (c: ApiClient, id: string, reason: string, idempotencyKey: string) =>
  c.post<Device>(`/devices/${encodeURIComponent(id)}:revoke`, { body: { reason }, idempotencyKey });

// ---- import history ----
export interface ImportJob {
  id: string;
  entity: 'products';
  filename: string | null;
  status: 'VALIDATED' | 'COMMITTED';
  mode: string | null;
  totalRows: number;
  errorRows: number;
  result: { created: number; updated: number; unchanged: number; failed: number } | null;
  createdBy: string | null;
  createdAt: string;
  committedAt: string | null;
}
export const fetchImportJobs = (c: ApiClient, cursor: string | undefined, signal?: AbortSignal) =>
  c.get<{ items: ImportJob[]; next_cursor: string | null }>('/products/import-jobs', {
    query: { limit: 50, cursor },
    signal,
  });
export const fetchImportReport = (c: ApiClient, id: string) =>
  c.get<string>(`/products/import/${encodeURIComponent(id)}/report`, { as: 'text' });

// ---- configuration ----
export interface FieldCfg {
  field: string;
  label: string;
  locked: boolean;
  visible: boolean;
  required: boolean | null;
  labels: Record<string, string>;
  sortOrder: number | null;
}
export interface MenuCfg {
  key: string;
  label: string;
  labels: Record<string, string>;
  sortOrder: number;
}
export const fetchScreens = (c: ApiClient, signal?: AbortSignal) =>
  c.get<{ items: { screen: string; fields: number }[] }>('/config/fields', { signal });
export const fetchFieldCfg = (c: ApiClient, screen: string, signal?: AbortSignal) =>
  c.get<{ screen: string; fields: FieldCfg[] }>(`/config/fields/${encodeURIComponent(screen)}`, { signal });
export const saveFieldCfg = (c: ApiClient, screen: string, fields: unknown[], idempotencyKey: string) =>
  c.put<{ screen: string; fields: FieldCfg[] }>(`/config/fields/${encodeURIComponent(screen)}`, {
    body: { fields },
    idempotencyKey,
  });
export const fetchMenuCfg = (c: ApiClient, signal?: AbortSignal) =>
  c.get<{ items: MenuCfg[] }>('/config/menu', { signal });
export const saveMenuCfg = (c: ApiClient, items: unknown[], idempotencyKey: string) =>
  c.put<{ items: MenuCfg[] }>('/config/menu', { body: { items }, idempotencyKey });

// ---- settings (edit) ----
export interface CompanyFull {
  legalName: string;
  tradeName: string | null;
  gstin: string | null;
  pan: string | null;
  stateCode: string | null;
  address: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  bankName: string | null;
  bankAccountHolder: string | null;
  bankAccountNumber: string | null;
  bankIfsc: string | null;
  signatoryName: string | null;
  signatoryDesignation: string | null;
  version: number;
}
export const COMPANY_FIELDS = [
  'legalName',
  'tradeName',
  'gstin',
  'pan',
  'stateCode',
  'address',
  'contactPhone',
  'contactEmail',
  'bankName',
  'bankAccountHolder',
  'bankAccountNumber',
  'bankIfsc',
  'signatoryName',
  'signatoryDesignation',
] as const;
export type CompanyField = (typeof COMPANY_FIELDS)[number];
export const fetchCompanyFull = (c: ApiClient, signal?: AbortSignal) =>
  c.get<CompanyFull>('/settings/company', { signal });
export const saveCompany = (
  c: ApiClient,
  version: number,
  body: Record<string, string | null>,
  idempotencyKey: string,
) =>
  c.put<{ profile: CompanyFull; warnings?: string[] }>('/settings/company', {
    body,
    version,
    idempotencyKey,
  });

export interface PayMode {
  code: string;
  enabled: boolean;
  ledgerAccountId: string | null;
  upiVpa: string | null;
  version: number;
}
export const fetchModes = (c: ApiClient, signal?: AbortSignal) =>
  c.get<{ items: PayMode[] }>('/settings/payment-modes', { signal });
export const saveMode = (
  c: ApiClient,
  m: PayMode,
  body: { enabled?: boolean; upiVpa?: string | null },
  idempotencyKey: string,
) =>
  c.put<PayMode>('/settings/payment-modes', {
    body: { code: m.code, ...body },
    version: m.version,
    idempotencyKey,
  });

export type SettingValue = boolean | number | string | null;
export interface PolicyItem {
  value: SettingValue;
  default: SettingValue;
  type: string;
  specifiedBySource: boolean;
  description: string;
  customised: boolean;
}
export interface PolicyView {
  settings: Record<string, PolicyItem>;
  costingMethod: { effective: string; scheduled: { effectiveFrom: string; method: string }[] };
}
export const fetchPolicyView = (c: ApiClient, signal?: AbortSignal) =>
  c.get<PolicyView>('/settings/general', { signal });
export const savePolicies = (
  c: ApiClient,
  body: { settings?: Record<string, SettingValue>; costingMethod?: string; costingEffectiveFrom?: string },
  idempotencyKey: string,
) => c.put<PolicyView>('/settings/general', { body, idempotencyKey });

// ---- people: unlock, 2FA reset, sign-ins of another user ----
export interface UserRow {
  id: string;
  username: string;
  fullName: string;
  status: string;
}
export interface UserSession {
  id: string;
  ip: string | null;
  browser: string | null;
  startedAt: string;
  lastAccessAt: string;
}
export const searchUsers = (c: ApiClient, q: string, signal?: AbortSignal) =>
  c.get<{ items: UserRow[]; next_cursor: string | null }>('/users', {
    query: { q: q.trim(), limit: 25 },
    signal,
  });
export const fetchUserSessions = (c: ApiClient, id: string, signal?: AbortSignal) =>
  c.get<{ items: UserSession[] }>(`/users/${encodeURIComponent(id)}/sessions`, { signal });
export const endUserSession = (c: ApiClient, id: string, sid: string, idempotencyKey: string) =>
  c.delete<null>(`/users/${encodeURIComponent(id)}/sessions/${encodeURIComponent(sid)}`, { idempotencyKey });
export const unlockUser = (c: ApiClient, id: string, reason: string, idempotencyKey: string) =>
  c.post<{ id: string; unlocked: boolean }>(`/users/${encodeURIComponent(id)}:unlock`, {
    body: { reason },
    idempotencyKey,
  });
export const resetUser2fa = (c: ApiClient, id: string, reason: string, idempotencyKey: string) =>
  c.post<{ id: string; mfaReset: boolean }>(`/users/${encodeURIComponent(id)}:reset-2fa`, {
    body: { reason },
    idempotencyKey,
  });

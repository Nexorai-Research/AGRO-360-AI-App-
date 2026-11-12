import type { ApiClient } from '@/api/client';

// Shapes copied by hand from the backend: modules/identity/src/application (users.ts, roles.ts, security.ts), modules/org/src/application
// (documents.ts, profile.ts, branches.ts, payment-modes.ts, settings.ts) and apps/api/src/{identity,security,org}.controller.ts.
export const PERM = {
  users: 'identity.user.manage',
  roles: 'identity.role.manage',
  audit: 'identity.security.manage',
  docView: 'org.document.view',
  docManage: 'org.document.manage',
  company: 'org.company.manage',
  config: 'org.config.view',
} as const;

export type UserStatus = 'PENDING_INVITE' | 'ACTIVE' | 'DEACTIVATED';
export interface UserView {
  id: string;
  username: string;
  fullName: string;
  mobile: string;
  email: string | null;
  status: UserStatus;
  allBranches: boolean;
  defaultBranchId: string | null;
  roleIds: string[];
  branchIds: string[];
  version: number;
  createdAt: string;
}
export interface RoleView {
  id: string;
  name: string;
  isSystem: boolean;
  systemKey: string | null;
  version: number;
  permissions: string[];
  assignedUsers: number;
  limits: Record<string, string>;
}
export interface AuditEvent {
  id: string;
  at: string;
  actorId: string | null;
  actorName: string | null;
  actorUsername: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  outcome: string;
  correlationId: string | null;
}
export type DocStatus = 'ACTIVE' | 'EXPIRING_SOON' | 'EXPIRED' | 'INACTIVE';
export interface DocumentView {
  id: string;
  title: string;
  category: string;
  expiresOn: string | null;
  notes: string | null;
  active: boolean;
  status: DocStatus;
  currentVersion: number;
  filename: string;
  contentType: string;
  sizeBytes: number;
  uploadedAt: string;
  updatedAt: string;
}
export interface CompanyProfile {
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
export interface BranchView {
  id: string;
  code: string;
  name: string;
  address: string | null;
  gstin: string | null;
  isHeadOffice: boolean;
  status: 'ACTIVE' | 'INACTIVE';
}
export interface PaymentMode {
  code: string;
  enabled: boolean;
}
export interface PolicySetting {
  value: string | number | boolean | null;
  default: string | number | boolean | null;
  description: string;
  customised: boolean;
}
export interface Policies {
  settings: Record<string, PolicySetting>;
  costingMethod: { effective: string };
}

export interface Page<T> {
  items: T[];
  next_cursor: string | null;
}

export const LIMIT = 50;
export const adminKey = (userId: string, ...parts: unknown[]) => ['admin', userId, ...parts] as const;

export const fetchUsers = (
  c: ApiClient,
  q: { q: string; status: string; cursor?: string },
  signal?: AbortSignal,
) =>
  c.get<Page<UserView>>('/users', {
    query: { q: q.q.trim(), status: q.status, limit: LIMIT, cursor: q.cursor },
    signal,
  });
export const fetchRoles = (c: ApiClient, signal?: AbortSignal) =>
  c.get<{ items: RoleView[] }>('/roles', { signal });

export const deactivateUser = (c: ApiClient, id: string, reason: string, idempotencyKey: string) =>
  c.post<UserView>(`/users/${encodeURIComponent(id)}:deactivate`, {
    body: { reason: reason.trim() },
    idempotencyKey,
  });
export const reactivateUser = (c: ApiClient, id: string, idempotencyKey: string) =>
  c.post<UserView>(`/users/${encodeURIComponent(id)}:reactivate`, { idempotencyKey });

export interface AuditFilter {
  action: string;
  entity: string;
  actor: string;
  from?: string;
  to?: string;
}
export const fetchAudit = (c: ApiClient, f: AuditFilter, cursor: string | undefined, signal?: AbortSignal) =>
  c.get<Page<AuditEvent>>('/audit', {
    query: {
      action: f.action,
      entity: f.entity,
      actor: f.actor,
      from: f.from,
      to: f.to,
      limit: LIMIT,
      cursor,
    },
    signal,
  });

export interface DocFilter {
  q: string;
  category: string;
  status: string;
}
export const fetchDocuments = (
  c: ApiClient,
  f: DocFilter,
  cursor: string | undefined,
  signal?: AbortSignal,
) =>
  c.get<Page<DocumentView>>('/documents', {
    query: { q: f.q.trim(), category: f.category, status: f.status, limit: LIMIT, cursor },
    signal,
  });
export const setDocumentActive = (c: ApiClient, id: string, active: boolean, idempotencyKey: string) =>
  c.post<DocumentView>(`/documents/${encodeURIComponent(id)}:${active ? 'restore' : 'deactivate'}`, {
    idempotencyKey,
  });

export const fetchCompany = (c: ApiClient, signal?: AbortSignal) =>
  c.get<CompanyProfile>('/settings/company', { signal });
export const fetchBranches = (c: ApiClient, signal?: AbortSignal) =>
  c.get<{ items: BranchView[] }>('/branches', { signal });
export const fetchPaymentModes = (c: ApiClient, signal?: AbortSignal) =>
  c.get<{ items: PaymentMode[] }>('/settings/payment-modes', { signal });
export const fetchPolicies = (c: ApiClient, signal?: AbortSignal) =>
  c.get<Policies>('/settings/general', { signal });

export const DOC_CATEGORIES = [
  'GENERAL',
  'LICENCE',
  'CERTIFICATE',
  'CONTRACT',
  'INVOICE',
  'COMPLIANCE',
  'OTHER',
] as const;
export const DOC_STATUSES = ['ACTIVE', 'EXPIRING_SOON', 'EXPIRED', 'INACTIVE'] as const;

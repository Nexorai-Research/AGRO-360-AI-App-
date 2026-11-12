import type { ApiClient } from '@/api/client';
import type { BranchView, DocumentView, RoleView, UserView } from './api';
import type { PermissionView } from './usr-logic';

// Paths, bodies and permissions copied from apps/api/src/{identity,security,org}.controller.ts. Not run against a real server.

export interface UserInput {
  fullName?: string;
  username?: string;
  mobile?: string;
  email?: string | null;
  roleIds?: string[];
  allBranches?: boolean;
  branchIds?: string[];
}
export const createUser = (c: ApiClient, body: UserInput, idempotencyKey: string) => c.post<UserView>('/users', { body, idempotencyKey });
export const updateUser = (c: ApiClient, id: string, version: number, body: UserInput, idempotencyKey: string) =>
  c.patch<UserView>(`/users/${encodeURIComponent(id)}`, { body, version, idempotencyKey });

export interface UserSession {
  id: string;
  ip: string | null;
  browser: string | null;
  startedAt: string;
  lastAccessAt: string;
}
export const fetchUserSessions = (c: ApiClient, id: string, signal?: AbortSignal) =>
  c.get<{ items: UserSession[] }>(`/users/${encodeURIComponent(id)}/sessions`, { signal });
export const endUserSession = (c: ApiClient, id: string, sid: string, idempotencyKey: string) =>
  c.delete<null>(`/users/${encodeURIComponent(id)}/sessions/${encodeURIComponent(sid)}`, { idempotencyKey });
export const unlockUser = (c: ApiClient, id: string, reason: string, idempotencyKey: string) =>
  c.post<{ id: string; unlocked: boolean }>(`/users/${encodeURIComponent(id)}:unlock`, { body: { reason: reason.trim() }, idempotencyKey });
export const resetUser2fa = (c: ApiClient, id: string, reason: string, idempotencyKey: string) =>
  c.post<{ id: string; mfaReset: boolean }>(`/users/${encodeURIComponent(id)}:reset-2fa`, { body: { reason: reason.trim() }, idempotencyKey });

export const fetchPermissions = (c: ApiClient, signal?: AbortSignal) => c.get<{ items: PermissionView[] }>('/permissions', { signal });
export const createRole = (c: ApiClient, body: { name: string; cloneFromRoleId?: string }, idempotencyKey: string) =>
  c.post<RoleView>('/roles', { body, idempotencyKey });
export const renameRole = (c: ApiClient, id: string, version: number, name: string, idempotencyKey: string) =>
  c.patch<RoleView>(`/roles/${encodeURIComponent(id)}`, { body: { name: name.trim() }, version, idempotencyKey });
export const deleteRole = (c: ApiClient, id: string, idempotencyKey: string) =>
  c.delete<null>(`/roles/${encodeURIComponent(id)}`, { idempotencyKey });
export const setRolePermissions = (c: ApiClient, id: string, version: number, permissions: string[], idempotencyKey: string) =>
  c.put<RoleView>(`/roles/${encodeURIComponent(id)}/permissions`, { body: { permissions }, version, idempotencyKey });
export const setRoleLimits = (c: ApiClient, id: string, version: number, limits: Record<string, string>, idempotencyKey: string) =>
  c.put<RoleView>(`/roles/${encodeURIComponent(id)}/limits`, { body: { limits }, version, idempotencyKey });

export interface DocDashboard {
  total: number;
  byStatus: Record<string, number>;
}
export interface DocVersion {
  version: number;
  filename: string;
  contentType: string;
  sizeBytes: number;
  uploadedAt: string;
}
export const fetchDocDashboard = (c: ApiClient, signal?: AbortSignal) => c.get<DocDashboard>('/documents/dashboard', { signal });
export const fetchDocVersions = (c: ApiClient, id: string, signal?: AbortSignal) =>
  c.get<{ items: DocVersion[] }>(`/documents/${encodeURIComponent(id)}/versions`, { signal });
export const fetchDocContent = (c: ApiClient, id: string, version?: number) =>
  c.get<{ filename: string; contentType: string; contentBase64: string }>(`/documents/${encodeURIComponent(id)}/content`, {
    query: { version },
  });
export interface UploadBody {
  title: string;
  category: string;
  expiresOn: string | null;
  notes: string | null;
  filename: string;
  contentBase64: string;
}
export const uploadDocument = (c: ApiClient, body: UploadBody, idempotencyKey: string) =>
  c.post<DocumentView>('/documents', { body, idempotencyKey });
export const replaceDocument = (c: ApiClient, id: string, body: { filename: string; contentBase64: string }, idempotencyKey: string) =>
  c.post<DocumentView>(`/documents/${encodeURIComponent(id)}/versions`, { body, idempotencyKey });

export const fetchBranchList = (c: ApiClient, signal?: AbortSignal): Promise<{ items: BranchView[] }> =>
  c.get<{ items: BranchView[] } | BranchView[]>('/branches', { signal }).then((r) => (Array.isArray(r) ? { items: r } : r));

export interface PrefsFull {
  displayName: string;
  language: string;
  dateFormat: string;
  theme: string;
  printer: string | null;
  defaultBranchId: string | null;
}
export const savePrefsExtra = (
  c: ApiClient,
  body: { dateFormat?: string; theme?: string; printer?: string | null },
  idempotencyKey: string,
) => c.put<PrefsFull>('/me/preferences', { body, idempotencyKey });

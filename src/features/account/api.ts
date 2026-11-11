import type { ApiClient } from '@/api/client';

// Shapes copied by hand from the backend: modules/identity/src/application/profile.ts (Preferences), devices.ts (DeviceView),
// idp.ts (IdpSession) and apps/api/src/security.controller.ts. All of these need the permission `identity.session.view`.
export const ACCOUNT_PERMISSION = 'identity.session.view';

export interface Preferences {
  displayName: string;
  language: string;
  dateFormat: string;
  theme: string;
  printer: string | null;
  defaultBranchId: string | null;
}

/** The server already masks the address. The app never asks for or shows more. */
export interface SessionInfo {
  id: string;
  ip: string | null;
  browser: string | null;
  startedAt: string;
  lastAccessAt: string;
}

export interface DeviceInfo {
  id: string;
  userId: string;
  name: string;
  platform: string;
  status: 'REGISTERED' | 'REVOKED';
  registeredAt: string;
  lastSeenAt: string | null;
  revokedAt: string | null;
}

export const acctKey = (userId: string, part: string) => ['account', userId, part] as const;

export const fetchPreferences = (c: ApiClient, signal?: AbortSignal) => c.get<Preferences>('/me/preferences', { signal });
export const fetchSessions = (c: ApiClient, signal?: AbortSignal) => c.get<{ items: SessionInfo[] }>('/auth/sessions', { signal });
export const fetchDevices = (c: ApiClient, signal?: AbortSignal) => c.get<{ items: DeviceInfo[] }>('/devices', { signal });

/** Only the fields the person changed are sent; the server keeps the rest. */
export const savePreferences = (c: ApiClient, body: { displayName?: string; language?: string }, idempotencyKey: string) =>
  c.put<Preferences>('/me/preferences', { body, idempotencyKey });

export const endSession = (c: ApiClient, id: string, idempotencyKey: string) =>
  c.delete<null>(`/auth/sessions/${encodeURIComponent(id)}`, { idempotencyKey });

export const logoutAll = (c: ApiClient, idempotencyKey: string) => c.post<null>('/auth/logout-all', { idempotencyKey });

export const revokeDevice = (c: ApiClient, id: string, reason: string, idempotencyKey: string) =>
  c.post<DeviceInfo>(`/devices/${encodeURIComponent(id)}:revoke`, { body: { reason }, idempotencyKey });

export const validName = (v: string) => v.trim().length >= 2 && v.trim().length <= 120;

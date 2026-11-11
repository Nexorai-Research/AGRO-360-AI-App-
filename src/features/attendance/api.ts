import type { ApiClient } from '@/api/client';

// Shapes copied by hand from the backend: modules/hr/src/application/attendance.ts (AttendanceView, myToday, checkIn, checkOut)
// and apps/api/src/hr.controller.ts. M12 UC-214 is DONE there ("integration tests are pending" in the tracker).
// Every one of these endpoints needs the permission `hr.attendance.self`.
export const ATTENDANCE_PERMISSION = 'hr.attendance.self';

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  /** YYYY-MM-DD in the franchise's day. */
  date: string;
  /** ISO instants, or null. */
  checkIn: string | null;
  checkOut: string | null;
  method: string;
  status: string; // PRESENT | ABSENT | HALF_DAY | LEAVE
  workedMinutes: number | null;
  autoClosed: boolean;
  /** Free text written by the server (English). */
  flag: string | null;
  /** The branch geo-fence only flags a punch; it never blocks it. */
  outsideFence: boolean;
  correctionReason: string | null;
  hasLocation: boolean;
}

export interface TodayAttendance {
  employeeId: string;
  date: string;
  record: AttendanceRecord | null;
  /** The employee has agreed to share location at check in and out. */
  geoConsent: boolean;
  /** The franchise allows location capture at all. Both must be true for the server to keep a location. */
  geoCaptureAllowed: boolean;
}

export type PunchResult = AttendanceRecord & { locationIgnored: boolean };

/** lat and lng are JSON numbers (the server refuses strings) and go together. */
export interface PunchBody {
  method: 'MOBILE';
  lat?: number;
  lng?: number;
}

export const todayKey = (userId: string) => ['attendance', 'today', userId] as const;
export const mineKey = (userId: string, from: string, to: string) =>
  ['attendance', 'mine', userId, from, to] as const;

export const fetchToday = (client: ApiClient, signal?: AbortSignal) =>
  client.get<TodayAttendance>('/hr/attendance/today', { signal });

export const fetchMine = (client: ApiClient, from: string, to: string, signal?: AbortSignal) =>
  client.get<{ items: AttendanceRecord[] }>('/hr/attendance/mine', { query: { from, to }, signal });

export const checkIn = (client: ApiClient, body: PunchBody, idempotencyKey: string) =>
  client.post<PunchResult>('/hr/attendance/check-in', { body, idempotencyKey });

export const checkOut = (client: ApiClient, body: PunchBody, idempotencyKey: string) =>
  client.post<PunchResult>('/hr/attendance/check-out', { body, idempotencyKey });

/** The employee's own choice; needs only hr.attendance.self. */
export const setGeoConsent = (client: ApiClient, consent: boolean, idempotencyKey: string) =>
  client.post<unknown>('/hr/me/geo-consent', { body: { consent }, idempotencyKey });

/** YYYY-MM-DD minus n days, done on the calendar date alone (no time zone involved). */
export function daysBefore(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
  t.setUTCDate(t.getUTCDate() - n);
  return t.toISOString().slice(0, 10);
}

/** 135 minutes -> "2:15". */
export function formatWorked(minutes: number | null): string {
  if (minutes === null) return '';
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
}

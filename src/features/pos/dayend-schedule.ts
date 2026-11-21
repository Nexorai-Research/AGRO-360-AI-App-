// Web parity phase 25: automatic day-end (web sales.js, server modules/sales dayend-schedule.ts). Needs pos.dayend.
// GET /pos/day-end-schedules, PUT /pos/day-end-schedules/:branchId, POST /pos/day-end-schedules/:branchId/postpone.
import type { ApiClient } from '@/api/client';

export interface DaySchedule {
  branchId: string;
  branchName: string;
  enabled: boolean;
  /** HH:MM, India time. */
  closeTime: string;
  reminderMinutes: number;
  /** true: the server closes the day itself; false: it only reminds. */
  autoClose: boolean;
  postponedUntil: string | null;
  lastResult: string | null;
  businessDate: string;
  closedToday: boolean;
  closeAt: string;
}

export interface ScheduleInput {
  enabled: boolean;
  closeTime: string;
  reminderMinutes: number;
  autoClose: boolean;
}

export const fetchSchedules = async (c: ApiClient, signal?: AbortSignal): Promise<DaySchedule[]> => {
  const r = await c.get<{ items?: DaySchedule[] }>('/pos/day-end-schedules', { signal });
  return r.items ?? [];
};
export const saveSchedule = (c: ApiClient, branchId: string, body: ScheduleInput, idempotencyKey: string) =>
  c.put<DaySchedule>(`/pos/day-end-schedules/${encodeURIComponent(branchId)}`, { body, idempotencyKey });
export const postponeDayEnd = (c: ApiClient, branchId: string, minutes: number, idempotencyKey: string) =>
  c.post<DaySchedule>(`/pos/day-end-schedules/${encodeURIComponent(branchId)}/postpone`, {
    body: { minutes },
    idempotencyKey,
  });

const HHMM = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
/** The server's rules: a time like 21:00 and a reminder of 0 to 240 minutes. */
export const scheduleError = (closeTime: string, reminder: string): 'time' | 'reminder' | null => {
  if (!HHMM.test(closeTime.trim())) return 'time';
  if (!/^\d{1,3}$/.test(reminder.trim()) || Number(reminder) > 240) return 'reminder';
  return null;
};
/** Postpone by 5 to 240 minutes (server). */
export const postponeError = (minutes: string): boolean =>
  !/^\d{1,3}$/.test(minutes.trim()) || Number(minutes) < 5 || Number(minutes) > 240;

export const minutesLeft = (closeAt: string, now: number): number => Math.ceil((Date.parse(closeAt) - now) / 60000);

export type BannerKind = 'left' | 'held' | 'pastAuto' | 'pastRemind';
/** The web's reminder: shown from `reminderMinutes` before the closing time until the day is closed. */
export function reminderOf(s: DaySchedule, now: number): { kind: BannerKind; minutes: number } | null {
  if (!s.enabled || s.closedToday) return null;
  const minutes = minutesLeft(s.closeAt, now);
  if (minutes > s.reminderMinutes) return null;
  if (s.postponedUntil && Date.parse(s.postponedUntil) > now) return { kind: 'held', minutes };
  if (minutes > 0) return { kind: 'left', minutes };
  return { kind: s.autoClose ? 'pastAuto' : 'pastRemind', minutes };
}

/** "09:30 pm" style local time of an ISO instant, for "postponed until". */
export const clockOf = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '–' : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

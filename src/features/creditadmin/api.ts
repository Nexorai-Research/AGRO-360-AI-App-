import type { ApiClient } from '@/api/client';
import type { Amount } from '@/money';

// Shapes copied by hand from the backend (no OpenAPI file yet):
//   apps/api/src/collections.controller.ts   (credit/settings, credit/collections/run, credit/reminder-rules, credit/reminders/*, credit/interest-runs/*)
//   modules/credit/src/application/{common,collections,interest}.ts   modules/credit/src/domain/collections.ts (parsers)

export const CXPERM = {
  settingsView: 'customer.ledger.view',
  settingsManage: 'credit.settings.manage',
  interest: 'credit.interest',
  reminders: 'credit.reminders',
} as const;

export interface CreditSettings {
  interestEnabled: boolean;
  interestRatePa: Amount;
  interestGraceDays: number;
  interestFirst: boolean;
  autoHoldEnabled: boolean;
  holdOverdueDays: number | null;
  holdOverdueAmount: Amount | null;
  holdOnBounce: boolean;
  bounceCharge: Amount;
  settlementLimit: Amount | null;
  version: number;
}
export type SettingsBody = Omit<CreditSettings, 'version'>;

export interface InterestRunRow {
  id: string;
  number: string;
  periodFrom: string;
  periodTo: string;
  ratePa: Amount;
  graceDays: number;
  status: 'DRAFT' | 'POSTED' | 'CANCELLED';
  total: Amount;
  postedAt: string | null;
}
export interface InterestLine {
  id: string;
  customerId: string;
  customerName: string;
  branchId: string;
  amount: Amount;
  status: 'INCLUDED' | 'WAIVED';
  waiveReason: string | null;
  debitNoteNo: string | null;
  detail: {
    receivableId: string;
    docNumber: string | null;
    dueDate: string;
    days: number;
    interest: Amount;
  }[];
}
export interface InterestRun extends InterestRunRow {
  lines: InterestLine[];
}

export interface ReminderRule {
  id: string | null;
  name: string;
  offsetDays: number;
  channel: 'SMS' | 'WHATSAPP';
  bodyEn: string;
  bodyHi: string | null;
  bodyMr: string | null;
  active: boolean;
}
export interface ReminderLogRow {
  id: string;
  ruleName: string;
  customerId: string;
  customerName: string;
  docNumber: string | null;
  runDate: string;
  status: string;
  reason: string | null;
  message: { status: string; suppressReason?: string | null; error?: string | null } | null;
}
export interface PassResult {
  held: number;
  tasks: { created: number };
  reminders: { queued: number };
  interestDraft?: unknown;
}

export const cxkey = (userId: string, what: string, extra = '') =>
  ['sal', 'crx', what, userId, extra] as const;

export const fetchSettings = (c: ApiClient, signal?: AbortSignal) =>
  c.get<CreditSettings>('/credit/settings', { signal });
export const saveSettings = (c: ApiClient, version: number, body: unknown, idempotencyKey: string) =>
  c.put<CreditSettings>('/credit/settings', { version, body, idempotencyKey });
export const runDailyPass = (c: ApiClient, idempotencyKey: string) =>
  c.post<PassResult>('/credit/collections/run', { body: {}, idempotencyKey });

export async function fetchInterestRuns(c: ApiClient, signal?: AbortSignal) {
  return (await c.get<{ items: InterestRunRow[] }>('/credit/interest-runs', { signal })).items;
}
export const fetchInterestRun = (c: ApiClient, id: string, signal?: AbortSignal) =>
  c.get<InterestRun>(`/credit/interest-runs/${encodeURIComponent(id)}`, { signal });
export const createInterestRun = (c: ApiClient, periodTo: string, idempotencyKey: string) =>
  c.post<InterestRun>('/credit/interest-runs', { body: { periodTo }, idempotencyKey });
export const postInterestRun = (c: ApiClient, id: string, idempotencyKey: string) =>
  c.post<InterestRun>(`/credit/interest-runs/${encodeURIComponent(id)}/post`, { body: {}, idempotencyKey });
export const cancelInterestRun = (c: ApiClient, id: string, reason: string, idempotencyKey: string) =>
  c.post<InterestRun>(`/credit/interest-runs/${encodeURIComponent(id)}/cancel`, {
    body: { reason },
    idempotencyKey,
  });
export const waiveInterestLine = (
  c: ApiClient,
  id: string,
  lineId: string,
  reason: string,
  idempotencyKey: string,
) =>
  c.post<InterestRun>(
    `/credit/interest-runs/${encodeURIComponent(id)}/lines/${encodeURIComponent(lineId)}/waive`,
    {
      body: { reason },
      idempotencyKey,
    },
  );

export async function fetchReminderRules(c: ApiClient, signal?: AbortSignal) {
  return (await c.get<{ items: ReminderRule[] }>('/credit/reminder-rules', { signal })).items;
}
/** The server replaces the whole list, so the screen sends every rule it knows. */
export async function saveReminderRules(c: ApiClient, rules: ReminderRule[], idempotencyKey: string) {
  const body = { rules: rules.map((r) => ({ ...r, id: r.id ?? undefined })) };
  return (await c.put<{ items: ReminderRule[] }>('/credit/reminder-rules', { body, idempotencyKey })).items;
}
export async function fetchReminderLog(c: ApiClient, signal?: AbortSignal) {
  return (
    await c.get<{ items: ReminderLogRow[] }>('/credit/reminders/log', { query: { limit: 100 }, signal })
  ).items;
}
export const runReminders = (c: ApiClient, idempotencyKey: string) =>
  c.post<{ queued: number; suppressed: number }>('/credit/reminders/run', { body: {}, idempotencyKey });

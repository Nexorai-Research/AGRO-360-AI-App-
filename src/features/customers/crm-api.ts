import type { ApiClient } from '../../api/client';

// Copied from apps/api/src/sales.controller.ts (consents), crm.controller.ts (interactions), modules/customer/src/domain/{customer,crm}.ts.
export const CRM_PERM = { consent: 'customer.consent', interaction: 'customer.interaction' } as const;
export const CHANNELS = ['SMS', 'WHATSAPP', 'EMAIL', 'CALL'] as const;
export const KINDS = ['CALL', 'VISIT', 'SHOP_VISIT'] as const;
export interface Purpose { code: string; name: string; status?: string }

const base = (id: string) => `/customers/${encodeURIComponent(id)}`;
export const fetchPurposes = async (c: ApiClient, signal?: AbortSignal) =>
  (await c.get<{ items: Purpose[] }>('/crm/consent/purposes', { signal })).items.filter((p) => p.status !== 'INACTIVE');
/** The staff records what the customer said. The server keeps the history; the newest answer per purpose and channel counts. */
export const putConsent = (c: ApiClient, id: string, b: { purpose: string; channel: string; granted: boolean; evidence?: string }, idempotencyKey: string) =>
  c.put<unknown>(`${base(id)}/consents`, { body: { consents: [{ ...b, source: 'STAFF' }] }, idempotencyKey });

export interface InteractionDraft { kind: string; notes: string; cropIssue: string; advice: string; followUpOn: string }
export const emptyInteraction: InteractionDraft = { kind: 'CALL', notes: '', cropIssue: '', advice: '', followUpOn: '' };
/** A date typed as YYYY-MM-DD that really exists. */
export function validDay(v: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim());
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!));
  return d.getUTCFullYear() === +m[1]! && d.getUTCMonth() === +m[2]! - 1 && d.getUTCDate() === +m[3]!;
}
export function interactionOk(d: InteractionDraft): boolean {
  const n = d.notes.trim();
  return n.length >= 1 && n.length <= 2000 && d.cropIssue.trim().length <= 500 && d.advice.trim().length <= 1000 && (d.followUpOn.trim() === '' || validDay(d.followUpOn));
}
export const interactionBody = (d: InteractionDraft) => ({
  kind: d.kind,
  notes: d.notes.trim(),
  ...(d.cropIssue.trim() ? { cropIssue: d.cropIssue.trim() } : {}),
  ...(d.advice.trim() ? { advice: d.advice.trim() } : {}),
  ...(d.followUpOn.trim() ? { followUpOn: d.followUpOn.trim() } : {}),
});
export const postInteraction = (c: ApiClient, id: string, body: Record<string, unknown>, idempotencyKey: string) =>
  c.post<unknown>(`${base(id)}/interactions`, { body, idempotencyKey });

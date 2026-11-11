import type { ApiClient } from '@/api/client';
import type { Amount } from '@/money';

// Shapes copied by hand from the backend (no OpenAPI file exists yet):
//   apps/api/src/collections.controller.ts  (credit/tasks/:id/outcome, credit/promises, customers/:id/promises)
//   apps/api/src/sales.controller.ts        (GET receipts)
//   modules/credit/src/domain/collections.ts (parseOutcome, parsePromise)  modules/credit/src/application/collections.ts (PromiseView)

export const XPERM = {
  tasks: 'credit.followup',
  promise: 'credit.promise',
  receipts: 'customer.ledger.view',
} as const;

export const OUTCOMES = ['PAID', 'PROMISE', 'NOT_REACHABLE', 'DISPUTE'] as const;
export type Outcome = (typeof OUTCOMES)[number];

export interface OutcomeBody {
  outcome: Outcome;
  note?: string;
  promiseAmount?: Amount;
  promiseDate?: string;
}
export interface PromiseBody {
  amount: Amount;
  promiseDate: string;
  note?: string;
}
export interface PromiseRow {
  id: string;
  customerId: string;
  customerName: string;
  promisedAmount: Amount;
  promiseDate: string;
  madeOn: string;
  status: 'PENDING' | 'KEPT' | 'PARTIAL' | 'BROKEN' | 'CANCELLED';
  receivedAmount: Amount;
  note: string | null;
}
export interface ReceiptRow {
  id: string;
  number: string;
  customerId: string;
  receiptDate: string;
  modeCode: string;
  reference: string | null;
  amount: Amount;
  allocated: Amount;
  onAccount: Amount;
  status: 'ACTIVE' | 'VOID';
}

export const xkey = (userId: string, what: string, extra = '') => ['followup', what, userId, extra] as const;

export async function fetchPromises(c: ApiClient, signal?: AbortSignal) {
  const r = await c.get<{ items: PromiseRow[] }>('/credit/promises', { query: { limit: 100 }, signal });
  return r.items;
}
export async function fetchReceiptList(c: ApiClient, signal?: AbortSignal) {
  const r = await c.get<{ items: ReceiptRow[] }>('/receipts', { query: { limit: 50 }, signal });
  return r.items;
}
export const recordOutcome = (c: ApiClient, taskId: string, body: OutcomeBody, idempotencyKey: string) =>
  c.post<unknown>(`/credit/tasks/${taskId}/outcome`, { body, idempotencyKey });
export const createPromise = (c: ApiClient, customerId: string, body: PromiseBody, idempotencyKey: string) =>
  c.post<PromiseRow>(`/customers/${encodeURIComponent(customerId)}/promises`, { body, idempotencyKey });
export const cancelPromise = (c: ApiClient, id: string, idempotencyKey: string) =>
  c.post<unknown>(`/credit/promises/${id}/cancel`, { body: {}, idempotencyKey });

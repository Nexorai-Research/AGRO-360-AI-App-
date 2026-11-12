import type { ApiClient } from '../../api/client';

// Copied from modules/credit/src/application/credit.ts and apps/api/src/sales.controller.ts. Money is a decimal string (4 places).
export const CRPERM = {
  view: 'customer.ledger.view',
  limit: 'credit.limit.manage',
  hold: 'credit.hold',
} as const;

export interface CreditAccount {
  customerId: string;
  creditLimit: string;
  seasonLimit: string | null;
  termId: string | null;
  hold: boolean;
  holdReason: string | null;
  outstanding: string;
  available: string;
  version: number;
}
export interface LimitChange {
  oldLimit: string;
  newLimit: string;
  reason: string | null;
  changedAt: string;
}
export interface HoldChange {
  action: string;
  source: string;
  reason: string | null;
  at: string;
}
export interface CreditReview {
  account: CreditAccount;
  history: LimitChange[];
  holds: HoldChange[];
}

const base = (id: string) => `/customers/${encodeURIComponent(id)}`;
export const fetchCredit = (c: ApiClient, id: string, signal?: AbortSignal) =>
  c.get<CreditReview>(`${base(id)}/credit`, { signal });
/** The account version goes as If-Match; the server refuses a stale one. */
export const putCreditLimit = (
  c: ApiClient,
  id: string,
  version: number,
  body: { creditLimit: string; seasonLimit?: string | null; reason?: string },
  idempotencyKey: string,
) => c.put<CreditAccount>(`${base(id)}/credit-limit`, { body, version, idempotencyKey });
export const holdCredit = (c: ApiClient, id: string, reason: string, idempotencyKey: string) =>
  c.post<CreditAccount>(`${base(id)}/credit-hold`, { body: { reason }, idempotencyKey });
export const releaseCredit = (c: ApiClient, id: string, reason: string, idempotencyKey: string) =>
  c.post<CreditAccount>(`${base(id)}/credit-release`, { body: { reason }, idempotencyKey });

const AMOUNT = /^\d{1,12}(\.\d{1,4})?$/;
/** Credit limit: zero or more, up to 4 decimals, at most 999999999999 (the server limit). */
export const validLimit = (v: string) => AMOUNT.test(v.trim());
/** Season limit may be left empty. */
export const validSeason = (v: string) => v.trim() === '' || AMOUNT.test(v.trim());
export const validHoldReason = (v: string) => v.trim().length >= 3 && v.trim().length <= 500;

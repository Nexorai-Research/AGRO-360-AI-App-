import type { ApiClient } from '@/api/client';
import { positiveDecimal, realDay } from '../customers/extras-api';

// Web parity 1.10: customer credit / debit adjustments (UC-356).
// apps/web/src/pages/collections.js adjustmentsTab; modules/credit/src/application/adjustments.ts (parseAdjustment, CREDIT_ACCOUNTS, DEBIT_ACCOUNTS).

export const ADJ_PERM = { view: 'reports.receivables', post: 'credit.adjustment' } as const;
export type AdjKind = 'CREDIT' | 'DEBIT';
/** The closed list of accounts on the other side of the receivable; a credit and a debit use different ones. */
export const ACCOUNTS: Record<AdjKind, readonly string[]> = {
  CREDIT: ['4030', '4040', '5050'],
  DEBIT: ['4900', '4910'],
};

export interface AdjustmentView {
  id: string;
  number: string;
  customerId: string;
  customerName?: string | null;
  branchId: string;
  kind: AdjKind;
  amount: string;
  accountCode: string;
  reason: string;
  adjustmentDate: string;
}
export interface AdjustmentForm {
  customerId: string;
  branchId: string;
  kind: AdjKind;
  amount: string;
  accountCode: string;
  adjustmentDate: string;
  reason: string;
}
export type AdjError = 'customer' | 'branch' | 'amount' | 'account' | 'date' | 'reason';
export function adjustmentErrors(f: AdjustmentForm): AdjError[] {
  const e: AdjError[] = [];
  if (!f.customerId) e.push('customer');
  if (!f.branchId) e.push('branch');
  if (!positiveDecimal(f.amount, 2, '999999999999')) e.push('amount');
  if (!ACCOUNTS[f.kind].includes(f.accountCode)) e.push('account');
  if (f.adjustmentDate.trim() !== '' && !realDay(f.adjustmentDate)) e.push('date');
  const r = f.reason.trim();
  if (r.length < 3 || r.length > 500) e.push('reason');
  return e;
}
export const adjustmentBody = (f: AdjustmentForm) => ({
  customerId: f.customerId,
  branchId: f.branchId,
  kind: f.kind,
  amount: f.amount.trim(),
  accountCode: f.accountCode,
  reason: f.reason.trim(),
  ...(f.adjustmentDate.trim() ? { adjustmentDate: f.adjustmentDate.trim() } : {}),
});

export const fetchAdjustments = async (c: ApiClient, signal?: AbortSignal) => {
  const r = await c.get<{ items: AdjustmentView[] } | AdjustmentView[]>('/credit/adjustments', { signal });
  return Array.isArray(r) ? r : (r.items ?? []);
};
export const postAdjustment = (
  c: ApiClient,
  body: ReturnType<typeof adjustmentBody>,
  idempotencyKey: string,
) => c.post<AdjustmentView>('/credit/adjustments', { body, idempotencyKey });

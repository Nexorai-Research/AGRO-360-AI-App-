import type { ApiClient } from '../../api/client';

// Copied from apps/api/src/crm-admin.controller.ts and modules/customer/src/domain/privacy.ts (parsePointsAdjustment). Points are whole numbers, not money.
export const LOYALTY_PERM = 'crm.loyalty.manage';
/** A whole number, not zero, between -100000 and 100000. A plus sign is allowed. */
export function validPoints(v: string): boolean {
  const x = v.trim();
  if (!/^[+-]?\d{1,6}$/.test(x)) return false;
  const n = Number(x);
  return n !== 0 && n >= -100000 && n <= 100000;
}
export const validPointsReason = (v: string) => v.trim().length >= 3 && v.trim().length <= 200;
export const adjustPoints = (
  c: ApiClient,
  id: string,
  b: { points: number; reason: string },
  idempotencyKey: string,
) => c.post<unknown>(`/customers/${encodeURIComponent(id)}/loyalty/points`, { body: b, idempotencyKey });

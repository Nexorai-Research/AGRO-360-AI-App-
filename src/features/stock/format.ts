import { dec } from '../../money';

export type ExpiryLevel = 'expired' | 'soon' | 'ok' | 'none';
export const SOON_DAYS = 30;

export function expiryLevel(days: number | null | undefined): ExpiryLevel {
  if (days === null || days === undefined) return 'none';
  if (days < 0) return 'expired';
  return days <= SOON_DAYS ? 'soon' : 'ok';
}

/** A quantity string from the API (for example "12.500000") shown without trailing zeros. Decimal only, no float. */
export function formatQty(q: string | null | undefined): string {
  if (q === null || q === undefined || q === '') return '-';
  return dec(q).toDecimalPlaces(3).toFixed();
}

export const hasQty = (q: string | null | undefined) => q !== null && q !== undefined && q !== '' && !dec(q).isZero();

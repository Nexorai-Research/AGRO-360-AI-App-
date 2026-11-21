import * as SecureStore from 'expo-secure-store';
import { ApiError, type Problem } from '@/api/errors';
import { config } from '@/config';
import { getAppVersion, newId } from '@/device';
import type { Amount } from '@/money';

// Farmer self-service portal (web parity 25; web `portal.js`, server `portal.controller.ts`, UC-159). A farmer asks for a code on their
// mobile and sees only their own dues, loyalty, crops and purchases. The portal token belongs to ONE customer; it is kept only in secure
// storage (never in a URL, never logged), is not a staff sign-in and is never sent to any other call.

const KEY = 'agro360.portal';

export const loadPortalToken = async (): Promise<string | null> => {
  try {
    return await SecureStore.getItemAsync(KEY);
  } catch {
    return null;
  }
};
export const savePortalToken = (t: string) => SecureStore.setItemAsync(KEY, t);
export const clearPortalToken = async () => {
  try {
    await SecureStore.deleteItemAsync(KEY);
  } catch {
    /* nothing stored */
  }
};

export interface PortalMe {
  name: string;
  code: string;
  village: string | null;
  language: string | null;
  shop: string | null;
}
export interface PortalOutstanding {
  outstanding: Amount;
}
export interface PortalLoyalty {
  points: number | string;
  tier: { name: string } | null;
  why?: string;
}
export interface PortalCrop {
  cropName: string;
  stage: string;
  expectedHarvestDate: string | null;
}
export interface PortalPurchase {
  number: string;
  d: string;
  sku_name: string;
  line_total: Amount;
}

type Fetch = typeof fetch;

/** One call to the portal API. `token` is null for the two sign-in calls. Every POST carries its own Idempotency-Key. */
export async function portalCall<T>(
  method: 'GET' | 'POST',
  path: string,
  o: { token: string | null; body?: unknown; key?: string; fetchImpl?: Fetch } = { token: null },
): Promise<T> {
  const corr = newId();
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-Correlation-Id': corr,
    'X-App-Version': getAppVersion(),
  };
  if (o.body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET') headers['Idempotency-Key'] = o.key ?? newId();
  if (o.token) headers.Authorization = `Bearer ${o.token}`;
  let res: Response;
  try {
    res = await (o.fetchImpl ?? fetch)(`${config.apiBaseUrl}${path}`, {
      method,
      headers,
      body: o.body === undefined ? undefined : JSON.stringify(o.body),
    });
  } catch {
    throw new ApiError(0, null, corr);
  }
  if (res.status === 204) return null as T;
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) throw new ApiError(res.status, data as Problem | null, res.headers.get('X-Correlation-Id') ?? corr);
  return data as T;
}

export const MOBILE_RE = /^\d{10}$/;
export const CODE_RE = /^\d{6}$/;
export const SHOP_RE = /^[A-Za-z0-9_-]{2,40}$/;

/** Asks for a one-time code. The server answers the same whether or not the number is registered. `devCode` exists only on a development server. */
export const requestCode = (shop: string, mobile: string, key: string) =>
  portalCall<{ devCode?: string }>('POST', '/portal/auth/otp', {
    token: null,
    body: { franchiseCode: shop, mobile },
    key,
  });
export const verifyCode = (shop: string, mobile: string, code: string, key: string) =>
  portalCall<{ token: string; expiresAt?: string }>('POST', '/portal/auth/verify', {
    token: null,
    body: { franchiseCode: shop, mobile, code },
    key,
  });
export const portalLogout = (token: string) => portalCall<null>('POST', '/portal/auth/logout', { token });

export async function fetchPortal(token: string) {
  const [me, due, inv, loy, crops] = await Promise.all([
    portalCall<PortalMe>('GET', '/portal/me', { token }),
    portalCall<PortalOutstanding>('GET', '/portal/me/outstanding', { token }),
    portalCall<{ items: PortalPurchase[] }>('GET', '/portal/me/invoices?limit=20', { token }),
    portalCall<PortalLoyalty>('GET', '/portal/me/loyalty', { token }),
    portalCall<{ items: PortalCrop[] }>('GET', '/portal/me/crops', { token }),
  ]);
  return { me, outstanding: due.outstanding, purchases: inv.items, loyalty: loy, crops: crops.items };
}
export const fetchPayLink = (token: string) =>
  portalCall<{ amount: Amount; link: string }>('GET', '/portal/me/pay-link', { token });

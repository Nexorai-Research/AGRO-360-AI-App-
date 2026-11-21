import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import { Linking } from 'react-native';
import { setLanguage } from '../src/i18n';
import PortalScreen from '../src/features/portal/PortalScreen';
import { CODE_RE, MOBILE_RE, SHOP_RE } from '../src/features/portal/api';

let mockId = 0;
jest.mock('../src/device', () => ({ newId: () => `key-${++mockId}`, getAppVersion: () => '1.0.0' }));
jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({}) }));
jest.mock('../src/config', () => ({ config: { apiBaseUrl: 'https://api.test/api/v1' } }));

type Call = { method: string; path: string; headers: Record<string, string>; body?: unknown };
let calls: Call[];
let routes: Record<string, () => { status?: number; body?: unknown }>;
const okBody: Record<string, unknown> = {
  '/portal/me': { name: 'Ramesh Patil', code: 'C-001', village: 'Wadgaon', language: 'mr', shop: 'Patil Agro' },
  '/portal/me/outstanding': { outstanding: '1250.50' },
  '/portal/me/loyalty': { points: 120, tier: { name: 'Silver' }, why: 'Spend more to reach Gold.' },
  '/portal/me/crops': { items: [{ cropName: 'Cotton', stage: 'GROWING', expectedHarvestDate: '2026-12-10' }] },
  '/portal/me/invoices': { items: [{ number: 'INV-1', d: '2026-11-01', sku_name: 'Urea 50kg', line_total: '540.00' }] },
};

beforeEach(async () => {
  mockId = 0;
  calls = [];
  routes = {
    '/portal/auth/otp': () => ({ body: {} }),
    '/portal/auth/verify': () => ({ body: { token: 'tenant.rawtoken' } }),
    '/portal/auth/logout': () => ({ status: 204 }),
    '/portal/me/pay-link': () => ({ body: { amount: '1250.50', link: 'upi://pay?pa=shop@upi&am=1250.50' } }),
    ...Object.fromEntries(Object.entries(okBody).map(([p, b]) => [p, () => ({ body: b })])),
  };
  globalThis.fetch = jest.fn(async (url: string, init: RequestInit) => {
    const path = url.replace('https://api.test/api/v1', '').split('?')[0]!;
    calls.push({
      method: init.method ?? 'GET',
      path,
      headers: init.headers as Record<string, string>,
      body: init.body ? JSON.parse(init.body as string) : undefined,
    });
    const r = routes[path]?.() ?? { status: 404, body: { title: 'NOT_FOUND' } };
    const status = r.status ?? 200;
    return {
      ok: status < 400,
      status,
      headers: { get: () => null },
      json: async () => r.body ?? null,
    } as unknown as Response;
  }) as unknown as typeof fetch;
  await SecureStore.deleteItemAsync('agro360.portal');
  await setLanguage('en');
});

describe('rules', () => {
  test('shop code, 10-digit mobile, 6-digit code', () => {
    expect(SHOP_RE.test('DEMO')).toBe(true);
    expect(SHOP_RE.test('a')).toBe(false);
    expect(MOBILE_RE.test('9876543210')).toBe(true);
    expect(MOBILE_RE.test('98765')).toBe(false);
    expect(CODE_RE.test('123456')).toBe(true);
    expect(CODE_RE.test('12345a')).toBe(false);
  });
});

async function signIn() {
  await render(<PortalScreen />);
  await fireEvent.changeText(await screen.findByLabelText('Shop code'), 'DEMO');
  await fireEvent.changeText(screen.getByLabelText('10-digit mobile'), '9876543210');
  await fireEvent.press(screen.getByText('Send code'));
  await fireEvent.changeText(await screen.findByLabelText('6-digit code'), '123456');
  await fireEvent.press(screen.getByText('Sign in'));
}

describe('sign in', () => {
  test('send code is blocked until the shop code and mobile are right', async () => {
    await render(<PortalScreen />);
    await fireEvent.changeText(await screen.findByLabelText('Shop code'), 'DEMO');
    await fireEvent.changeText(screen.getByLabelText('10-digit mobile'), '12345');
    expect(screen.getByText('Enter a 10-digit mobile number.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Send code'));
    expect(calls).toHaveLength(0);
  });

  test('code then token; every POST has an Idempotency-Key and the sign-in calls carry no bearer token', async () => {
    await signIn();
    expect(await screen.findByText(/Ramesh Patil/)).toBeTruthy();
    const otp = calls.find((c) => c.path === '/portal/auth/otp')!;
    const verify = calls.find((c) => c.path === '/portal/auth/verify')!;
    expect(otp.body).toEqual({ franchiseCode: 'DEMO', mobile: '9876543210' });
    expect(verify.body).toEqual({ franchiseCode: 'DEMO', mobile: '9876543210', code: '123456' });
    expect(otp.headers['Idempotency-Key']).toBeTruthy();
    expect(verify.headers['Idempotency-Key']).toBeTruthy();
    expect(otp.headers['Idempotency-Key']).not.toBe(verify.headers['Idempotency-Key']);
    expect(otp.headers.Authorization).toBeUndefined();
    expect(verify.headers.Authorization).toBeUndefined();
    expect(await SecureStore.getItemAsync('agro360.portal')).toBe('tenant.rawtoken');
  });

  test('a refused code is shown and no token is kept', async () => {
    routes['/portal/auth/verify'] = () => ({ status: 401, body: { title: 'UNAUTHENTICATED' } });
    await signIn();
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(await SecureStore.getItemAsync('agro360.portal')).toBeNull();
  });
});

describe('the farmer sees only their own record', () => {
  test('dues, loyalty, crops and purchases, all with the portal token', async () => {
    await signIn();
    expect(await screen.findByText('You owe ₹1,250.50.')).toBeTruthy();
    expect(screen.getByText('Silver tier, 120 points.')).toBeTruthy();
    expect(screen.getByText(/Cotton · GROWING · harvest 2026-12-10/)).toBeTruthy();
    expect(screen.getByText(/INV-1 · 2026-11-01 · Urea 50kg · ₹540.00/)).toBeTruthy();
    const mine = calls.filter((c) => c.path.startsWith('/portal/me'));
    expect(mine.length).toBe(5);
    for (const c of mine) expect(c.headers.Authorization).toBe('Bearer tenant.rawtoken');
  });

  test('a saved token opens the record without asking for a code', async () => {
    await SecureStore.setItemAsync('agro360.portal', 'tenant.saved');
    await render(<PortalScreen />);
    expect(await screen.findByText(/Ramesh Patil/)).toBeTruthy();
    expect(calls.some((c) => c.path === '/portal/auth/otp')).toBe(false);
  });

  test('Pay dues opens the UPI link', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    await signIn();
    await fireEvent.press(await screen.findByText('Pay dues'));
    await fireEvent.press(await screen.findByText('Pay ₹1,250.50 by UPI'));
    expect(open).toHaveBeenCalledWith('upi://pay?pa=shop@upi&am=1250.50');
  });

  test('no dues: no pay button', async () => {
    routes['/portal/me/outstanding'] = () => ({ body: { outstanding: '0.00' } });
    await signIn();
    expect(await screen.findByText('You have no dues.')).toBeTruthy();
    expect(screen.queryByText('Pay dues')).toBeNull();
  });

  test('a 401 clears the saved token and returns to the sign-in', async () => {
    await SecureStore.setItemAsync('agro360.portal', 'tenant.old');
    routes['/portal/me'] = () => ({ status: 401, body: { title: 'UNAUTHENTICATED' } });
    await render(<PortalScreen />);
    await waitFor(async () => expect(await SecureStore.getItemAsync('agro360.portal')).toBeNull());
    expect(await screen.findByText('Send code')).toBeTruthy();
  });

  test('sign out clears the token and ends the server session', async () => {
    await signIn();
    await fireEvent.press(await screen.findByText('Sign out'));
    await waitFor(() => expect(calls.some((c) => c.path === '/portal/auth/logout')).toBe(true));
    expect(await SecureStore.getItemAsync('agro360.portal')).toBeNull();
    expect(await screen.findByText('Send code')).toBeTruthy();
  });
});

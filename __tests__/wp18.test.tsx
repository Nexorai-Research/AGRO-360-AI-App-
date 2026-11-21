import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { i18n, setLanguage } from '../src/i18n';
import parts from '../i18n-parts/cus.json';
import EngagementScreen from '../src/features/customers/EngagementScreen';
import { fetchPurposes as customerPurposes } from '../src/features/customers/crm-api';
import type { ApiClient } from '../src/api/client';

const mockGet = jest.fn();
const mockPost = jest.fn();
let mockMe: { userId: string; tenantId: string; roles: string[]; permissions?: string[] };
let mockId = 0;
const mockClient = { get: (...a: unknown[]) => mockGet(...a), post: (...a: unknown[]) => mockPost(...a) };
jest.mock('expo-router', () => ({ Stack: { Screen: () => null } }));
jest.mock('../src/auth/AuthProvider', () => ({
  useAuth: () => ({ status: 'signedIn', me: mockMe, client: mockClient }),
}));
jest.mock('../src/device', () => ({ newId: () => `key-${++mockId}` }));

let qc: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={qc}>{children}</QueryClientProvider>
);
const purposes = {
  items: [
    { code: 'PROMOTIONAL', name: 'Promotions', status: 'ACTIVE', wordingVersion: 1 },
    { code: 'TEST1', name: 'Made while testing', status: 'ACTIVE', wordingVersion: null },
    { code: 'OLD', name: 'Old reminders', status: 'INACTIVE', wordingVersion: 1 },
  ],
};
beforeAll(() => {
  for (const l of ['en', 'hi', 'mr'] as const) i18n.addResourceBundle(l, 'translation', parts[l], true, true);
});
beforeEach(async () => {
  [mockGet, mockPost].forEach((m) => m.mockReset());
  mockId = 0;
  mockMe = {
    userId: 'u1',
    tenantId: 't1',
    roles: [],
    permissions: ['customer.view', 'privacy.consent.manage', 'crm.loyalty.manage'],
  };
  qc = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retryDelay: 0 } } });
  await setLanguage('en');
  mockGet.mockImplementation(async (path: string) => {
    if (path === '/crm/loyalty/tiers') return { items: [] };
    if (path === '/crm/consent/purposes') return purposes;
    if (path === '/crm/consent/coverage') return { activeCustomers: 0, rows: [] };
    return { items: [] };
  });
  mockPost.mockResolvedValue({});
});
const go = async () => {
  await render(<EngagementScreen />, { wrapper });
  await fireEvent.press(await screen.findByLabelText('Consent'));
  await screen.findByText('TEST1 · Made while testing');
};

test('retire asks first, then sends INACTIVE; a built-in purpose cannot be retired', async () => {
  await go();
  expect(screen.getAllByText('Retire')).toHaveLength(1); // only TEST1: PROMOTIONAL is built in, OLD is retired
  await fireEvent.press(screen.getByText('Retire'));
  expect(screen.getByText(/Made while testing will no longer be asked for/)).toBeTruthy();
  expect(mockPost).not.toHaveBeenCalled();
  await fireEvent.press(screen.getAllByText('Retire').at(-1)!);
  await waitFor(() =>
    expect(mockPost).toHaveBeenCalledWith('/crm/consent/purposes/TEST1/status', {
      body: { status: 'INACTIVE' },
      idempotencyKey: 'key-1',
    }),
  );
});

test('a retired purpose shows as retired and comes back without a question', async () => {
  await go();
  expect(screen.getByText('Retired')).toBeTruthy();
  await fireEvent.press(screen.getByText('Reactivate'));
  await waitFor(() =>
    expect(mockPost).toHaveBeenCalledWith('/crm/consent/purposes/OLD/status', {
      body: { status: 'ACTIVE' },
      idempotencyKey: 'key-1',
    }),
  );
});

test("a customer's consent list shows only active purposes", async () => {
  mockGet.mockResolvedValue(purposes);
  const list = await customerPurposes(mockClient as unknown as ApiClient);
  expect(list.map((p) => p.code)).toEqual(['PROMOTIONAL', 'TEST1']);
});

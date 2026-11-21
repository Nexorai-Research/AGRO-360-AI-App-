import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { i18n, setLanguage } from '../src/i18n';
import {
  FranchisesScreen,
  PlansScreen,
  PlatformAuditScreen,
  PlatformDashboardScreen,
  emptyFranchise,
  franchiseBody,
  franchiseErrors,
  isPlatformUser,
  planOk,
  reasonOk,
} from '../src/features/platform/PlatformScreens';
import {
  ObservabilityScreen,
  PlatformObservabilityScreen,
  ago,
  franchiseHealth,
  needAttention,
} from '../src/features/platform/ObservabilityScreens';
import { ModuleGrid } from '../src/features/home/ModuleGrid';

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockPut = jest.fn();
let mockMe: { userId: string; roles: string[]; permissions?: string[] };
let mockId = 0;
jest.mock('../src/auth/AuthProvider', () => ({
  useAuth: () => ({
    status: 'signedIn',
    me: mockMe,
    client: {
      get: (...a: unknown[]) => mockGet(...a),
      post: (...a: unknown[]) => mockPost(...a),
      put: (...a: unknown[]) => mockPut(...a),
    },
  }),
}));
jest.mock('../src/device', () => ({ newId: () => `key-${++mockId}` }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() }, useRouter: () => ({ push: jest.fn() }) }));

let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);
beforeEach(async () => {
  [mockGet, mockPost, mockPut].forEach((m) => m.mockReset());
  mockId = 0;
  mockMe = { userId: 'op-1', roles: ['platform_admin'] };
  client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retryDelay: 0 } } });
  await setLanguage('en');
});
const plans = {
  items: [
    {
      id: 'p1',
      code: 'GROW',
      name: 'Grow',
      status: 'ACTIVE',
      versions: [
        { id: 'v1', versionNo: 1, status: 'RETIRED', entitlements: {}, publishedAt: null },
        { id: 'v2', versionNo: 2, status: 'PUBLISHED', entitlements: { a: 1 }, publishedAt: '2026-01-01' },
      ],
    },
  ],
};
const franchise = {
  id: 'f1',
  franchiseId: 'F-001',
  code: 'KISAN',
  displayName: 'Kisan Agro',
  legalName: 'Kisan Agro Pvt Ltd',
  businessType: 'Agro input retailer',
  status: 'ACTIVE',
  statusReason: null,
  stateCode: '27',
  gstin: null,
  createdAt: '2026-01-01T00:00:00Z',
  version: 3,
  city: 'Pune',
  address: null,
  adminLogin: {
    loginId: 'KISAN-admin',
    state: 'ACTIVE',
    passwordStatus: 'TEMPORARY',
    passwordIssuedAt: '2026-01-02T00:00:00Z',
  },
  contact: { fullName: 'Ravi', mobile: '98******10', email: null },
  provisioning: { status: 'READY', steps: [{ key: 'roles', status: 'DONE', lastError: null }] },
  usage: { reason: 'Usage is counted monthly.' },
  recentAudit: [],
};

describe('logic', () => {
  test('platform users are the platform roles only', () => {
    expect(isPlatformUser(['platform_support'])).toBe(true);
    expect(isPlatformUser(['owner'])).toBe(false);
    expect(isPlatformUser(undefined)).toBe(false);
  });
  test('a new franchise: required fields, state code, GSTIN of the same state, body like the web', () => {
    expect(franchiseErrors(emptyFranchise())).toEqual([
      'legalName',
      'displayName',
      'contactName',
      'contactMobile',
      'contactEmail',
    ]);
    const f = {
      ...emptyFranchise(),
      legalName: 'Kisan Agro Pvt Ltd',
      displayName: 'Kisan Agro',
      stateCode: '27',
      gstin: '29ABCDE1234F1Z5',
      contactName: 'Ravi',
      contactMobile: '9876543210',
      contactEmail: 'ravi@example.com',
    };
    expect(franchiseErrors(f)).toEqual(['gstin']);
    expect(franchiseBody({ ...f, gstin: '', code: 'kisan' })).toEqual({
      legalName: 'Kisan Agro Pvt Ltd',
      displayName: 'Kisan Agro',
      businessType: 'Agro input retailer',
      stateCode: '27',
      contact: { fullName: 'Ravi', mobile: '9876543210', email: 'ravi@example.com' },
      code: 'KISAN',
    });
    expect(reasonOk('too short')).toBe(false);
    expect(reasonOk('Owner asked to pause the account')).toBe(true);
    expect(planOk({ code: 'grow', name: 'Grow' })).toBe(true);
  });
  test('observability helpers like the web', () => {
    const t = i18n.getFixedT('en');
    const now = Date.parse('2026-11-19T12:00:00Z');
    expect(ago(t, null, now)).toBe('never');
    expect(ago(t, '2026-11-18T10:00:00Z', now)).toBe('yesterday');
    expect(ago(t, '2026-11-19T09:00:00Z', now)).toBe('3 h ago');
    const u = (adoption: string) => ({
      userId: adoption,
      userName: adoption,
      profile: { adoption, score: 1, signals: [] },
      usage: null,
    });
    expect(needAttention([u('ACTIVE'), u('NEW'), u('DORMANT')]).map((x) => x.userId)).toEqual(['DORMANT']);
    expect(franchiseHealth({ status: 'ACTIVE', events: 0, errors: 0, p95Ms: null })).toBe('quiet');
    expect(franchiseHealth({ status: 'ACTIVE', events: 9, errors: 30, p95Ms: 100 })).toBe('struggling');
    expect(franchiseHealth({ status: 'SUSPENDED', events: 9, errors: 0, p95Ms: 100 })).toBe('off');
  });
});

describe('screens', () => {
  test('home: the platform console card only for a platform operator', async () => {
    await render(<ModuleGrid />, { wrapper });
    expect(screen.getByTestId('module-platform')).toBeTruthy();
  });
  test('home: no platform card for a franchise user', async () => {
    mockMe = { userId: 'u-1', roles: ['owner'] };
    await render(<ModuleGrid />, { wrapper });
    expect(screen.queryByTestId('module-platform')).toBeNull();
  });
  test('franchises: list, open one, suspend with a recorded reason', async () => {
    mockGet.mockImplementation((p: string) =>
      Promise.resolve(p === '/platform/franchises' ? { items: [franchise] } : franchise),
    );
    mockPost.mockResolvedValue({});
    await render(<FranchisesScreen />, { wrapper });
    await fireEvent.press(await screen.findByText('Open Kisan Agro'));
    expect(await screen.findByText('F-001 / KISAN')).toBeTruthy();
    await fireEvent.press(screen.getByText('Suspend'));
    await fireEvent.changeText(
      screen.getByLabelText('Reason (recorded, 10-500 characters)'),
      'Unpaid for three months',
    );
    await fireEvent.press(screen.getAllByText('Suspend').at(-1)!);
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    expect(mockPost.mock.calls[0][0]).toBe('/platform/franchises/f1:suspend');
    expect(mockPost.mock.calls[0][1].body).toEqual({ reason: 'Unpaid for three months' });
  });
  test('franchises: refused for a franchise user', async () => {
    mockMe = { userId: 'u-1', roles: ['owner'] };
    await render(<FranchisesScreen />, { wrapper });
    expect(screen.getByText('You do not have access to this screen.')).toBeTruthy();
    expect(mockGet).not.toHaveBeenCalled();
  });
  test('plans: list and create', async () => {
    mockGet.mockResolvedValue(plans);
    mockPost.mockResolvedValue({});
    await render(<PlansScreen />, { wrapper });
    expect(await screen.findByText(/Grow \(GROW\)/)).toBeTruthy();
    await fireEvent.press(screen.getByText('New plan'));
    await fireEvent.changeText(screen.getByLabelText('Plan code (capital letters, digits)'), 'pro');
    await fireEvent.changeText(screen.getByLabelText('Plan name'), 'Pro');
    await fireEvent.press(screen.getByText('Create plan'));
    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith('/platform/plans', {
        body: { code: 'PRO', name: 'Pro' },
        idempotencyKey: 'key-1',
      }),
    );
  });
  test('audit and dashboard', async () => {
    mockGet.mockImplementation((p: string) =>
      Promise.resolve(
        p === '/platform/audit'
          ? {
              items: [
                {
                  at: '2026-11-19T10:00:00Z',
                  action: 'platform.franchise.suspend',
                  targetType: 'franchise',
                  targetId: 'f1aaaaaaaa',
                  actorId: null,
                  outcome: 'SUCCESS',
                },
              ],
            }
          : {
              franchises: { total: 3, active: 2, suspended: 1, draft: 0 },
              growth: { newThisMonth: 1, newLastMonth: 0 },
              plans: [{ plan: 'Grow v2', franchises: 2 }],
              usageThisMonth: [],
              provisioningFailures: [],
              recentFranchises: [],
              unavailable: [],
            },
      ),
    );
    await render(<PlatformAuditScreen />, { wrapper });
    expect(await screen.findByText('platform.franchise.suspend')).toBeTruthy();
    await render(<PlatformDashboardScreen />, { wrapper });
    expect(await screen.findByText('Grow v2')).toBeTruthy();
  });
  test('observability (franchise admin): overview, then one user and an AI briefing', async () => {
    mockMe = { userId: 'u-1', roles: ['owner'], permissions: ['identity.security.manage'] };
    const user = {
      userId: 'u-9',
      userName: 'Sunil',
      username: 'sunil',
      profile: {
        adoption: 'DORMANT',
        score: 20,
        signals: [{ severity: 'bad', text: 'No sign-in for 21 days' }],
      },
      usage: { lastSeen: null, activeDays: 0, pageViews: 0, errors: 0, slow: 0 },
    };
    mockGet.mockImplementation((p: string) => {
      if (p === '/observability/overview')
        return Promise.resolve({
          days: 30,
          retentionDays: 90,
          totals: {
            activeUsers: 3,
            accounts: 5,
            events: 120,
            errors: 2,
            warnings: 1,
            slow: 0,
            p95Ms: 400,
            trainingNeeded: 1,
          },
          daily: [],
          surfaces: [],
          adoption: { ACTIVE: 3, DORMANT: 1 },
          pages: [],
          issues: [],
          users: [user],
        });
      if (p === '/observability/users/u-9/coaching')
        return Promise.resolve({ summary: 'Call Sunil this week.' });
      return Promise.resolve({
        user: { userName: 'Sunil', username: 'sunil' },
        profile: {
          ...user.profile,
          label: 'Dormant',
          talkingPoints: ['Ask what stopped them'],
          trainingNeeded: true,
        },
        usage: null,
        journey: [],
        pages: [],
        issues: [],
      });
    });
    await render(<ObservabilityScreen />, { wrapper });
    expect(await screen.findByText('No sign-in for 21 days', { exact: false })).toBeTruthy();
    await fireEvent.press(screen.getByText('Open Sunil'));
    expect(await screen.findByText('• Ask what stopped them')).toBeTruthy();
    await fireEvent.press(screen.getByText('Write a briefing with AI'));
    expect(await screen.findByText('Call Sunil this week.')).toBeTruthy();
    expect(mockGet).toHaveBeenCalledWith(
      '/observability/users/u-9',
      expect.objectContaining({ query: { days: '30' } }),
    );
  });
  test('observability is refused without identity.security.manage', async () => {
    mockMe = { userId: 'u-1', roles: ['cashier'], permissions: ['sales.pos.use'] };
    await render(<ObservabilityScreen />, { wrapper });
    expect(screen.getByText('You do not have access to this screen.')).toBeTruthy();
  });
  test('platform observability: franchises and one franchise', async () => {
    mockGet.mockImplementation((p: string) =>
      Promise.resolve(
        p === '/platform/observability/overview'
          ? {
              days: 30,
              retentionDays: 90,
              totals: {
                franchises: 1,
                quietFranchises: 0,
                activeUsers: 3,
                events: 10,
                errors: 0,
                slow: 0,
                p95Ms: 300,
              },
              daily: [],
              surfaces: [],
              pages: [],
              issues: [],
              franchises: [
                {
                  tenantId: 't1',
                  name: 'Kisan Agro',
                  code: 'KISAN',
                  status: 'ACTIVE',
                  activeUsers: 3,
                  events: 10,
                  errors: 0,
                  slow: 0,
                  p95Ms: 300,
                  lastSeen: null,
                  surfaces: { MOBILE: 4 },
                },
              ],
            }
          : {
              days: 30,
              franchise: { name: 'Kisan Agro', code: 'KISAN', status: 'ACTIVE' },
              totals: { events: 10, errors: 0, slow: 0, p95Ms: 300 },
              daily: [],
              surfaces: [],
              users: [],
              pages: [],
              issues: [],
            },
      ),
    );
    await render(<PlatformObservabilityScreen />, { wrapper });
    expect(await screen.findByText('Healthy')).toBeTruthy();
    await fireEvent.press(screen.getByText('Open Kisan Agro'));
    expect(await screen.findByText('Nobody has used the application in this period.')).toBeTruthy();
    expect(mockGet).toHaveBeenCalledWith(
      '/platform/observability/franchises/t1',
      expect.objectContaining({ query: { days: '30' } }),
    );
  });
});

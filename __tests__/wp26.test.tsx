import type { ReactNode } from 'react';
import { Share } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setLanguage } from '../src/i18n';
import {
  FranchisesScreen,
  editBody,
  editErrors,
  editFromDetail,
  emptyFranchise,
  franchiseBody,
  type FranchiseDetail,
} from '../src/features/platform/PlatformScreens';
import { loginStateKey, revealOutcome, stateName } from '../src/features/platform/franchise-login';

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockPatch = jest.fn();
let mockMe: { userId: string; roles: string[]; permissions?: string[] };
let mockId = 0;
jest.mock('../src/auth/AuthProvider', () => ({
  useAuth: () => ({
    status: 'signedIn',
    me: mockMe,
    client: {
      get: (...a: unknown[]) => mockGet(...a),
      post: (...a: unknown[]) => mockPost(...a),
      patch: (...a: unknown[]) => mockPatch(...a),
    },
  }),
}));
jest.mock('expo-router', () => ({ router: { push: jest.fn() }, useLocalSearchParams: () => ({}) }));
jest.mock('../src/device', () => ({ newId: () => `key-${++mockId}` }));

let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);
beforeEach(async () => {
  [mockGet, mockPost, mockPatch].forEach((m) => m.mockReset());
  mockId = 0;
  mockMe = { userId: 'op-1', roles: ['platform_admin'] };
  client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retryDelay: 0 } } });
  await setLanguage('en');
});

const login = (over: Record<string, unknown> = {}) => ({
  loginId: 'KISAN-admin',
  state: 'ACTIVE',
  passwordStatus: 'TEMPORARY',
  passwordIssuedAt: '2026-01-02T00:00:00Z',
  passwordChangedAt: null,
  stateChangedAt: null,
  ...over,
});
const detail = (over: Record<string, unknown> = {}): FranchiseDetail =>
  ({
    id: 'f1',
    franchiseId: 'F-001',
    code: 'KISAN',
    displayName: 'Kisan Agro',
    legalName: 'Kisan Agro Pvt Ltd',
    businessType: 'Agro input retailer',
    status: 'ACTIVE',
    statusReason: null,
    version: 3,
    stateCode: '27',
    city: 'Pune',
    address: null,
    gstin: null,
    createdAt: '2026-01-01T00:00:00Z',
    adminLogin: login(),
    contact: { fullName: 'Ravi', mobile: '98******10', email: null },
    provisioning: { status: 'READY', steps: [] },
    usage: { reason: 'Usage is counted monthly.' },
    recentAudit: [],
    ...over,
  }) as FranchiseDetail;
const row = (d: FranchiseDetail) => ({ ...d, contact: d.contact });
const serve = (d: FranchiseDetail, extra: Record<string, unknown> = {}) =>
  mockGet.mockImplementation((p: string) =>
    Promise.resolve(p === '/platform/franchises' ? { items: [row(d)] } : (extra[p] ?? d)),
  );
const openCard = async () => fireEvent.press(await screen.findByText('Open Kisan Agro'));

describe('rules like the web', () => {
  test('state names, the owner login badge and the reply of "Show password"', () => {
    expect(stateName('27')).toBe('Maharashtra (27)');
    expect(stateName('25')).toBe('State (25)');
    expect(stateName(null)).toBe('-');
    expect(loginStateKey(null)).toBe('none');
    expect(loginStateKey(login({ state: 'DEACTIVATED_BY_OWNER', passwordStatus: 'CHANGED' }))).toBe('off');
    expect(loginStateKey(login({ passwordStatus: 'CHANGED' }))).toBe('changed');
    expect(loginStateKey(login())).toBe('temporary');
    expect(loginStateKey(login({ passwordStatus: 'NOT_STORED' }))).toBe('active');
    expect(revealOutcome({ adminLogin: null, password: null })).toEqual({ kind: 'none' });
    expect(revealOutcome({ adminLogin: login({ passwordStatus: 'CHANGED' }), password: null })).toEqual({
      kind: 'changed',
    });
    expect(revealOutcome({ adminLogin: login({ passwordStatus: 'NOT_STORED' }), password: null })).toEqual({
      kind: 'notKept',
    });
    expect(revealOutcome({ adminLogin: login(), password: 'Tmp-123' })).toEqual({
      kind: 'show',
      loginId: 'KISAN-admin',
      password: 'Tmp-123',
    });
  });
  test('a new franchise has no plan, sends the location only when written, and starts in Maharashtra', () => {
    expect(emptyFranchise().stateCode).toBe('27');
    const f = {
      ...emptyFranchise(),
      legalName: 'L',
      displayName: 'D',
      contactName: 'R',
      contactMobile: '9',
      contactEmail: 'r@x.in',
    };
    expect(Object.keys(franchiseBody(f))).not.toContain('planVersionId');
    expect(franchiseBody(f)).not.toHaveProperty('city');
    expect(franchiseBody({ ...f, city: ' Pune ' })).toHaveProperty('city', 'Pune');
  });
  test('edit: empty location, address and GSTIN go as null; the GSTIN must start with the state code', () => {
    const e = { ...editFromDetail(detail()), city: '', address: '', gstin: '' };
    expect(editBody(e)).toEqual({
      displayName: 'Kisan Agro',
      legalName: 'Kisan Agro Pvt Ltd',
      businessType: 'Agro input retailer',
      stateCode: '27',
      city: null,
      address: null,
      gstin: null,
    });
    expect(editErrors({ ...e, gstin: '29ABCDE1234F1Z5' })).toEqual(['gstin']);
    expect(editErrors({ ...e, displayName: ' ' })).toEqual(['displayName']);
  });
});

describe('franchises', () => {
  test('the list shows the location, the state by name and the owner login', async () => {
    serve(detail());
    await render(<FranchisesScreen />, { wrapper });
    expect(await screen.findByText('Pune')).toBeTruthy();
    expect(screen.getByText('Maharashtra (27)')).toBeTruthy();
    expect(screen.getByText('KISAN-admin · Issued password in use')).toBeTruthy();
  });

  test('a new franchise: no plan is sent, the first admin login is shown once and can be shared', async () => {
    serve(detail());
    mockPost.mockResolvedValue({
      ...detail(),
      adminCredentials: {
        status: 'READY',
        loginId: 'KISAN-admin',
        temporaryPassword: 'Tmp-9xQ2',
        mustChangePassword: true,
      },
    });
    const share = jest
      .spyOn(Share, 'share')
      .mockResolvedValue({ action: 'sharedAction', activityType: undefined });
    await render(<FranchisesScreen />, { wrapper });
    await fireEvent.press(await screen.findByText('New franchise'));
    await fireEvent.changeText(screen.getByLabelText('Legal name'), 'Kisan Agro Pvt Ltd');
    await fireEvent.changeText(screen.getByLabelText('Display name'), 'Kisan Agro');
    await fireEvent.changeText(screen.getByLabelText('Location (city or district, e.g. Pune)'), 'Pune');
    await fireEvent.changeText(screen.getByLabelText('Admin full name'), 'Ravi');
    await fireEvent.changeText(screen.getByLabelText('Admin mobile'), '9876543210');
    await fireEvent.changeText(screen.getByLabelText('Admin email'), 'ravi@example.com');
    await fireEvent.press(screen.getByText('Create franchise'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    const [path, opts] = mockPost.mock.calls[0] as [
      string,
      { body: Record<string, unknown>; idempotencyKey: string },
    ];
    expect(path).toBe('/platform/franchises');
    expect(opts.body).not.toHaveProperty('planVersionId');
    expect(opts.body).toMatchObject({ city: 'Pune', stateCode: '27' });
    expect(opts.idempotencyKey).toBe('key-1');
    expect(await screen.findByText('Login created')).toBeTruthy();
    expect(screen.getByText('Tmp-9xQ2')).toBeTruthy();
    await fireEvent.press(screen.getByText('Share both'));
    expect(share).toHaveBeenCalledWith({ message: 'Login ID: KISAN-admin\nTemporary password: Tmp-9xQ2' });
    await fireEvent.press(screen.getByText('Done'));
    expect(screen.queryByText('Tmp-9xQ2')).toBeNull();
    share.mockRestore();
  });

  test('a login that could not be created says why and shows no password', async () => {
    serve(detail());
    mockPost.mockResolvedValue({
      ...detail(),
      adminCredentials: {
        status: 'FAILED',
        loginId: 'KISAN-admin',
        reason: 'The identity provider is down.',
      },
    });
    await render(<FranchisesScreen />, { wrapper });
    await fireEvent.press(await screen.findByText('New franchise'));
    const fields: [string, string][] = [
      ['Legal name', 'L Ltd'],
      ['Display name', 'L'],
      ['Admin full name', 'Ravi'],
      ['Admin mobile', '9876543210'],
      ['Admin email', 'ravi@example.com'],
    ];
    for (const [l, v] of fields) await fireEvent.changeText(screen.getByLabelText(l), v);
    await fireEvent.press(screen.getByText('Create franchise'));
    expect(await screen.findByText('Login not created')).toBeTruthy();
    expect(screen.getByText('The identity provider is down.')).toBeTruthy();
    expect(screen.queryByText('Share both')).toBeNull();
  });

  test('Show password reads the issued password once the owner has not chosen their own', async () => {
    serve(detail(), {
      '/platform/franchises/f1/admin-login': { adminLogin: login(), password: 'Tmp-77', vaultOn: true },
    });
    await render(<FranchisesScreen />, { wrapper });
    await openCard();
    await fireEvent.press(await screen.findByText('Show password'));
    expect(await screen.findByText('Tmp-77')).toBeTruthy();
    expect(mockGet.mock.calls.some((c) => c[0] === '/platform/franchises/f1/admin-login')).toBe(true);
  });

  test('once the owner chose their own password there is no Show button', async () => {
    serve(
      detail({ adminLogin: login({ passwordStatus: 'CHANGED', passwordChangedAt: '2026-02-03T00:00:00Z' }) }),
    );
    await render(<FranchisesScreen />, { wrapper });
    await openCard();
    expect(await screen.findByText(/The owner chose their own password on 2026-02-03/)).toBeTruthy();
    expect(screen.queryByText('Show password')).toBeNull();
  });

  test('Issue a new login asks first, posts an empty body with one key and shows the new password', async () => {
    serve(detail());
    mockPost.mockResolvedValue({
      status: 'READY',
      loginId: 'KISAN-admin',
      temporaryPassword: 'New-55',
      mustChangePassword: true,
    });
    await render(<FranchisesScreen />, { wrapper });
    await openCard();
    await fireEvent.press(await screen.findByText('Issue a new login'));
    expect(mockPost).not.toHaveBeenCalled();
    expect(screen.getByText(/The old password stops working/)).toBeTruthy();
    await fireEvent.press(screen.getByText('Issue login'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    const [path, opts] = mockPost.mock.calls[0] as [string, { body: unknown; idempotencyKey: string }];
    expect(path).toBe('/platform/franchises/f1:issue-admin-login');
    expect(opts.body).toEqual({});
    expect(opts.idempotencyKey).toBe('key-1');
    expect(await screen.findByText('New-55')).toBeTruthy();
  });

  test('a draft franchise cannot get a new login', async () => {
    serve(detail({ status: 'DRAFT' }));
    await render(<FranchisesScreen />, { wrapper });
    await openCard();
    await screen.findByText('F-001 / KISAN');
    expect(screen.queryByText('Issue a new login')).toBeNull();
  });

  test('Activate admin account only when the owner switched their account off', async () => {
    serve(
      detail({
        adminLogin: login({ state: 'DEACTIVATED_BY_OWNER', stateChangedAt: '2026-03-04T00:00:00Z' }),
      }),
    );
    mockPost.mockResolvedValue({ adminLogin: login() });
    await render(<FranchisesScreen />, { wrapper });
    await openCard();
    await fireEvent.press(await screen.findByText('Activate admin account'));
    await fireEvent.press(screen.getByText('Activate'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    expect(mockPost.mock.calls[0][0]).toBe('/platform/franchises/f1:activate-admin');
    expect(mockPost.mock.calls[0][1].body).toEqual({});
    expect(await screen.findByText('The admin account is active again')).toBeTruthy();
  });

  test('Edit sends the version as If-Match and the new location', async () => {
    serve(detail());
    mockPatch.mockResolvedValue({});
    await render(<FranchisesScreen />, { wrapper });
    await openCard();
    await fireEvent.press(await screen.findByText('Edit'));
    await fireEvent.changeText(screen.getByLabelText('Location (city or district, e.g. Pune)'), 'Nashik');
    await fireEvent.press(screen.getByText('Save franchise'));
    await waitFor(() => expect(mockPatch).toHaveBeenCalledTimes(1));
    const [path, opts] = mockPatch.mock.calls[0] as [
      string,
      { body: Record<string, unknown>; version: number; idempotencyKey: string },
    ];
    expect(path).toBe('/platform/franchises/f1');
    expect(opts.version).toBe(3);
    expect(opts.body).toMatchObject({ city: 'Nashik', address: null, gstin: null });
    expect(opts.idempotencyKey).toBe('key-1');
    expect(await screen.findByText('Franchise saved')).toBeTruthy();
  });

  test('the detail no longer offers a plan change; it points to Access control', async () => {
    serve(detail());
    await render(<FranchisesScreen />, { wrapper });
    await openCard();
    expect(await screen.findByText('What this franchise can use')).toBeTruthy();
    expect(screen.queryByText('Change plan')).toBeNull();
  });

  test('refused for a franchise user: nothing is asked from the server', async () => {
    mockMe = { userId: 'u-1', roles: ['owner'] };
    await render(<FranchisesScreen />, { wrapper });
    expect(screen.getByText('You do not have access to this screen.')).toBeTruthy();
    expect(mockGet).not.toHaveBeenCalled();
  });
});

import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setLanguage } from '../src/i18n';
import {
  SyncDeskScreen,
  discardOk,
  payloadSummary,
  settingsErrors,
} from '../src/features/offline/SyncDeskScreen';

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

let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);
const conflict = {
  id: 'cf1',
  deviceId: 'dev-12345678',
  clientOpId: 'dev-12345678-a',
  kind: 'SALE_INVOICE',
  code: 'CREDIT_LIMIT_EXCEEDED',
  policy: 'MANUAL_REVIEW',
  message: 'over the credit limit',
  status: 'OPEN',
  resolution: null,
  note: null,
  createdAt: '2026-11-19T10:00:00Z',
  resolvedAt: null,
};
beforeEach(async () => {
  [mockGet, mockPost, mockPut].forEach((m) => m.mockReset());
  mockId = 0;
  mockMe = { userId: 'u-1', roles: [], permissions: ['integration.sync.manage'] };
  client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retryDelay: 0 } } });
  await setLanguage('en');
  mockGet.mockImplementation(async (path: string) => {
    if (path === '/sync/health')
      return {
        devices: [
          {
            deviceId: 'dev-12345678',
            platform: 'ANDROID',
            appVersion: '1.0.0',
            lastSeenAt: '2026-11-19T10:00:00Z',
            lastPushAt: '2026-11-19T10:00:00Z',
            lastPullAt: null,
            pendingReported: 0,
            oldestPendingHours: null,
            openConflicts: 1,
            state: 'CONFLICTS',
          },
        ],
        totals: { devices: 1, attention: 1, openConflicts: 1, rejected7d: 0, applied24h: 4 },
      };
    if (path === '/sync/conflicts') return { items: [conflict] };
    if (path === '/sync/conflicts/cf1')
      return {
        ...conflict,
        payload: { branchId: 'b-1', lines: [{}, {}], tenders: [{ mode: 'CASH', amount: '300.00' }] },
      };
    if (path === '/sync/failed-ops') return { items: [] };
    if (path === '/sync/settings')
      return { minAppVersion: '1.0.0', offlineGraceHours: 72, maxBatch: 100, version: 3, isDefault: false };
    throw new Error(`unexpected ${path}`);
  });
});

describe('rules', () => {
  test('settings like the server: version, 1-720 hours, 1-500 bills', () => {
    expect(settingsErrors({ minAppVersion: '1.4.0', offlineGraceHours: '72', maxBatch: '100' })).toEqual([]);
    expect(settingsErrors({ minAppVersion: '1.4', offlineGraceHours: '0', maxBatch: '501' })).toEqual([
      'version',
      'grace',
      'batch',
    ]);
    expect(discardOk('dup')).toBe(false);
    expect(discardOk('Paid in cash at the office')).toBe(true);
  });
  test('what a person needs to decide about the bill', () => {
    expect(
      payloadSummary({
        branchId: 'b',
        customerId: 'c-1234567890',
        lines: [{}],
        tenders: [{ mode: 'UPI', amount: '10.00' }],
      }),
    ).toEqual({
      branchId: 'b',
      customerId: 'c-1234567890',
      lines: 1,
      paid: ['UPI 10.00'],
    });
    expect(payloadSummary(null)).toEqual({ lines: 0, paid: [] });
  });
});

describe('sync desk', () => {
  test('totals and an open bill; retry books it again', async () => {
    mockPost.mockResolvedValue({ conflict: { ...conflict, status: 'RESOLVED' }, applied: true });
    await render(<SyncDeskScreen />, { wrapper });
    expect(await screen.findByText('over the credit limit')).toBeTruthy();
    await fireEvent.press(screen.getByText('See the bill'));
    expect(await screen.findByText('CASH 300.00')).toBeTruthy();
    await fireEvent.press(screen.getByText('Retry'));
    await fireEvent.press(screen.getByText('Book it now'));
    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith('/sync/conflicts/cf1/retry', {
        body: {},
        idempotencyKey: 'key-1',
      }),
    );
    expect(await screen.findByText('Booked.')).toBeTruthy();
  });

  test('a retry the server still refuses says so and stays open', async () => {
    mockPost.mockResolvedValue({ conflict, applied: false });
    await render(<SyncDeskScreen />, { wrapper });
    await fireEvent.press(await screen.findByText('Retry'));
    await fireEvent.press(screen.getByText('Book it now'));
    expect(await screen.findByText('The server still could not book it. It stays open.')).toBeTruthy();
  });

  test('discard needs a reason', async () => {
    mockPost.mockResolvedValue({ conflict: { ...conflict, status: 'RESOLVED' }, applied: false });
    await render(<SyncDeskScreen />, { wrapper });
    await fireEvent.press(await screen.findByText('Discard'));
    expect(screen.getByLabelText('Discard bill').props.accessibilityState?.disabled).toBe(true);
    await fireEvent.changeText(screen.getByLabelText('Reason (recorded)'), 'Customer paid at the office');
    await fireEvent.press(screen.getByText('Discard bill'));
    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith('/sync/conflicts/cf1/discard', {
        body: { note: 'Customer paid at the office' },
        idempotencyKey: 'key-1',
      }),
    );
  });

  test('phones and settings (saved with the version)', async () => {
    mockPut.mockResolvedValue({});
    await render(<SyncDeskScreen />, { wrapper });
    await fireEvent.press(await screen.findByText('Phones'));
    expect(await screen.findByText(/Bills to decide · ANDROID 1.0.0/)).toBeTruthy();
    await fireEvent.press(screen.getByText('Settings'));
    await fireEvent.changeText(await screen.findByDisplayValue('72'), '48');
    await fireEvent.press(screen.getByText('Save settings'));
    await waitFor(() =>
      expect(mockPut).toHaveBeenCalledWith('/sync/settings', {
        body: { minAppVersion: '1.0.0', offlineGraceHours: 48, maxBatch: 100 },
        version: 3,
        idempotencyKey: 'key-1',
      }),
    );
  });

  test('refused without integration.sync.manage', async () => {
    mockMe = { userId: 'u-2', roles: [], permissions: ['sales.pos.use'] };
    await render(<SyncDeskScreen />, { wrapper });
    expect(screen.getByText('You do not have access to the sync desk.')).toBeTruthy();
    expect(mockGet).not.toHaveBeenCalled();
  });
});

import type { ReactNode } from 'react';
import { Share } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '../src/api/errors';
import { i18n, setLanguage } from '../src/i18n';
import parts from '../i18n-parts/adm.json';
import DevicesScreen from '../src/features/adm/DevicesScreen';
import ImportHistoryScreen from '../src/features/adm/ImportHistoryScreen';

const mockGet = jest.fn();
const mockPost = jest.fn();
let mockMe: { userId: string; roles: string[]; permissions?: string[] };
let mockId = 0;
const mockClient = { get: (...a: unknown[]) => mockGet(...a), post: (...a: unknown[]) => mockPost(...a) };
jest.mock('../src/auth/AuthProvider', () => ({
  useAuth: () => ({
    status: 'signedIn',
    me: mockMe,
    client: mockClient,
    signIn: jest.fn(),
    signOut: jest.fn(),
  }),
}));
jest.mock('../src/device', () => ({ newId: () => `key-${++mockId}` }));

let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

const dev = {
  id: 'd-1',
  userId: 'u-1',
  name: 'Counter phone',
  platform: 'ANDROID',
  status: 'REGISTERED',
  registeredAt: '2026-10-01T04:00:00Z',
  lastSeenAt: null,
  revokedAt: null,
  permissions: [],
};

beforeAll(() => {
  for (const l of ['en', 'hi', 'mr'] as const) i18n.addResourceBundle(l, 'translation', parts[l], true, true);
});
beforeEach(async () => {
  [mockGet, mockPost].forEach((m) => m.mockReset());
  (SecureStore.setItemAsync as jest.Mock).mockClear();
  mockId = 0;
  mockMe = { userId: 'u-1', roles: [], permissions: undefined };
  client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retryDelay: 0 } } });
  await setLanguage('en');
});

describe('devices screen', () => {
  const show = () => render(<DevicesScreen />, { wrapper });
  beforeEach(() => mockGet.mockImplementation(async () => ({ items: [dev] })));

  test('lists devices', async () => {
    await show();
    expect(await screen.findByText('Counter phone · Android phone')).toBeTruthy();
    expect(screen.getByText(/Active/)).toBeTruthy();
  });

  test('loading state', async () => {
    mockGet.mockImplementation(() => new Promise(() => undefined));
    await show();
    expect(await screen.findByTestId('state-loading')).toBeTruthy();
  });

  test('empty state', async () => {
    mockGet.mockImplementation(async () => ({ items: [] }));
    await show();
    expect(await screen.findByText('No devices registered.')).toBeTruthy();
  });

  test('offline state', async () => {
    mockGet.mockRejectedValue(new ApiError(0, null));
    await show();
    expect(
      await screen.findByText('No network. Check your connection and try again.', {}, { timeout: 3000 }),
    ).toBeTruthy();
  });

  test('error state shows the reference', async () => {
    mockGet.mockRejectedValue(new ApiError(500, { title: 'BOOM', correlationId: 'c-4' }));
    await show();
    expect(await screen.findByText(/reference c-4/)).toBeTruthy();
  });

  test('permission denied: nothing is called', async () => {
    mockMe = { userId: 'u-1', roles: [], permissions: ['sales.invoice.view'] };
    await show();
    expect(await screen.findByText('You do not have permission to see devices.')).toBeTruthy();
    expect(mockGet).not.toHaveBeenCalled();
  });

  test('register sends name and platform with a key, puts the device key in secure storage and never shows it', async () => {
    mockPost.mockResolvedValue({
      device: { ...dev, id: 'd-2', name: 'Shop phone' },
      deviceKey: 'SECRET-DEVICE-KEY',
    });
    await show();
    await screen.findByText('Counter phone · Android phone');
    await fireEvent.changeText(screen.getByLabelText('Device name (2 to 80 characters)'), 'x');
    expect(screen.getByText('The name must be 2 to 80 characters.')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Device name (2 to 80 characters)'), 'Shop phone');
    await fireEvent.press(screen.getByLabelText('iPhone'));
    await fireEvent.press(screen.getByLabelText('Register'));
    expect(await screen.findByText('Device registered. Its key is kept safely on this phone.')).toBeTruthy();
    expect(mockPost.mock.calls[0]![0]).toBe('/devices');
    expect(mockPost.mock.calls[0]![1].body).toEqual({ name: 'Shop phone', platform: 'IOS' });
    expect(mockPost.mock.calls[0]![1].idempotencyKey).toBe('key-1');
    const saved = (SecureStore.setItemAsync as jest.Mock).mock.calls.at(-1)!;
    expect(saved[0]).toBe('agro360.registeredDevice');
    expect(JSON.parse(saved[1])).toEqual({ id: 'd-2', key: 'SECRET-DEVICE-KEY' });
    expect(screen.queryByText(/SECRET-DEVICE-KEY/)).toBeNull();
  });

  test('register: lost answer retries with the same key', async () => {
    mockPost.mockRejectedValueOnce(new ApiError(0, null)).mockResolvedValue({ device: dev, deviceKey: 'k' });
    await show();
    await screen.findByText('Counter phone · Android phone');
    await fireEvent.changeText(screen.getByLabelText('Device name (2 to 80 characters)'), 'Shop phone');
    await fireEvent.press(screen.getByLabelText('Register'));
    await screen.findByText('No network. Check your connection and try again.');
    await fireEvent.press(screen.getByLabelText('Register'));
    await screen.findByText(/Device registered/);
    expect(mockPost.mock.calls[1]![1].idempotencyKey).toBe(mockPost.mock.calls[0]![1].idempotencyKey);
  });

  test('revoke needs a reason of 5+ characters', async () => {
    mockPost.mockResolvedValue({ ...dev, status: 'REVOKED' });
    await show();
    await screen.findByText('Counter phone · Android phone');
    await fireEvent.press(screen.getByLabelText('Revoke'));
    await fireEvent.changeText(screen.getByLabelText('Reason (5 to 300 characters)'), 'lost');
    expect(screen.getByText('The reason must be 5 to 300 characters.')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Reason (5 to 300 characters)'), 'lost the phone');
    await fireEvent.press(screen.getByLabelText('Revoke now'));
    expect(await screen.findByText('Device revoked.')).toBeTruthy();
    expect(mockPost.mock.calls[0]![0]).toBe('/devices/d-1:revoke');
    expect(mockPost.mock.calls[0]![1].body).toEqual({ reason: 'lost the phone' });
  });

  test('a revoked device has no revoke button; Marathi text', async () => {
    mockGet.mockImplementation(async () => ({ items: [{ ...dev, status: 'REVOKED' }] }));
    await setLanguage('mr');
    await show();
    expect(await screen.findByText('डिव्हाइस')).toBeTruthy();
    expect(screen.queryByLabelText('काढा')).toBeNull();
  });
});

describe('import history screen', () => {
  const job = {
    id: '11111111-aaaa-bbbb-cccc-222222222222',
    entity: 'products',
    filename: 'seeds.csv',
    status: 'COMMITTED',
    mode: null,
    totalRows: 40,
    errorRows: 2,
    result: { created: 30, updated: 5, unchanged: 3, failed: 2 },
    createdBy: null,
    createdAt: '2026-11-10T04:00:00Z',
    committedAt: '2026-11-10T04:05:00Z',
  };
  const show = () => render(<ImportHistoryScreen />, { wrapper });

  test('lists jobs with the outcome', async () => {
    mockGet.mockResolvedValue({ items: [job], next_cursor: null });
    await show();
    expect(await screen.findByText('Products - seeds.csv')).toBeTruthy();
    expect(screen.getByText('30 created, 5 updated, 3 unchanged, 2 failed')).toBeTruthy();
    expect(screen.getByText('40 rows, 2 with errors')).toBeTruthy();
  });

  test('a checked-only job says it was not applied', async () => {
    mockGet.mockResolvedValue({ items: [{ ...job, status: 'VALIDATED', result: null }], next_cursor: null });
    await show();
    expect(await screen.findByText('Checked, not applied')).toBeTruthy();
  });

  test('load more passes the cursor', async () => {
    mockGet
      .mockResolvedValueOnce({ items: [job], next_cursor: 'abc' })
      .mockResolvedValue({ items: [{ ...job, id: 'j-2', filename: 'more.csv' }], next_cursor: null });
    await show();
    await screen.findByText('Products - seeds.csv');
    await fireEvent.press(screen.getByLabelText('Load more'));
    expect(await screen.findByText('Products - more.csv')).toBeTruthy();
    expect(mockGet.mock.calls[1]![1].query).toEqual({ limit: 50, cursor: 'abc' });
  });

  test('error report is fetched as text and handed to the share sheet', async () => {
    mockGet.mockImplementation(async (path: string) =>
      path.endsWith('/report') ? 'row,error\n3,bad hsn' : { items: [job], next_cursor: null },
    );
    const share = jest
      .spyOn(Share, 'share')
      .mockResolvedValue({ action: 'sharedAction', activityType: undefined });
    await show();
    await screen.findByText('Products - seeds.csv');
    await fireEvent.press(screen.getByLabelText('Share error report'));
    expect(await screen.findByText('The error report is ready to share.')).toBeTruthy();
    const call = mockGet.mock.calls.find((c) => String(c[0]).endsWith('/report'))!;
    expect(call[0]).toBe(`/products/import/${job.id}/report`);
    expect(call[1]).toEqual({ as: 'text' });
    expect(share).toHaveBeenCalledWith({
      title: 'import-report-11111111.csv',
      message: 'row,error\n3,bad hsn',
    });
    share.mockRestore();
  });

  test('loading state', async () => {
    mockGet.mockImplementation(() => new Promise(() => undefined));
    await show();
    expect(await screen.findByTestId('state-loading')).toBeTruthy();
  });

  test('empty state', async () => {
    mockGet.mockResolvedValue({ items: [], next_cursor: null });
    await show();
    expect(await screen.findByText('No imports yet. Imports are started on the web app.')).toBeTruthy();
  });

  test('offline state', async () => {
    mockGet.mockRejectedValue(new ApiError(0, null));
    await show();
    expect(
      await screen.findByText('No network. Check your connection and try again.', {}, { timeout: 3000 }),
    ).toBeTruthy();
  });

  test('a 403 from the server shows the translated message', async () => {
    mockGet.mockRejectedValue(new ApiError(403, { title: 'FORBIDDEN', correlationId: 'c-5' }));
    await show();
    expect(await screen.findByText('You are not allowed to do this.')).toBeTruthy();
  });

  test('permission denied: nothing is called', async () => {
    mockMe = { userId: 'u-1', roles: [], permissions: ['sales.invoice.view'] };
    await show();
    expect(await screen.findByText('You do not have permission to see imports.')).toBeTruthy();
    expect(mockGet).not.toHaveBeenCalled();
  });

  test('a failed report download shows the error and does not share', async () => {
    mockGet.mockImplementation(async (path: string) => {
      if (path.endsWith('/report')) throw new ApiError(500, { title: 'BOOM', correlationId: 'c-8' });
      return { items: [job], next_cursor: null };
    });
    const share = jest
      .spyOn(Share, 'share')
      .mockResolvedValue({ action: 'sharedAction', activityType: undefined });
    await show();
    await screen.findByText('Products - seeds.csv');
    await fireEvent.press(screen.getByLabelText('Share error report'));
    expect(await screen.findByText(/reference c-8/)).toBeTruthy();
    expect(share).not.toHaveBeenCalled();
    share.mockRestore();
  });
});

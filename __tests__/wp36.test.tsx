import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '../src/api/errors';
import { setLanguage } from '../src/i18n';
import AccountScreen from '../src/features/account/AccountScreen';

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockSignOut = jest.fn();
let mockMe: { userId: string; roles: string[]; permissions?: string[] };
let mockId = 0;
jest.mock('../src/auth/AuthProvider', () => ({
  useAuth: () => ({
    status: 'signedIn',
    me: mockMe,
    client: {
      get: (...a: unknown[]) => mockGet(...a),
      post: (...a: unknown[]) => mockPost(...a),
      put: jest.fn(),
      delete: jest.fn(),
    },
    signIn: jest.fn(),
    signOut: mockSignOut,
  }),
}));
jest.mock('../src/device', () => ({ newId: () => `key-${++mockId}` }));

let qc: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={qc}>{children}</QueryClientProvider>
);
beforeEach(async () => {
  [mockGet, mockPost, mockSignOut].forEach((m) => m.mockReset());
  mockId = 0;
  mockMe = { userId: 'u-1', roles: [], permissions: ['identity.session.view', 'identity.role.manage'] };
  qc = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retryDelay: 0 } } });
  await setLanguage('en');
  mockGet.mockImplementation(async (path: string) => {
    if (path === '/me/preferences')
      return {
        displayName: 'Asha',
        language: 'en',
        dateFormat: 'DD/MM/YYYY',
        theme: 'light',
        printer: null,
        defaultBranchId: null,
      };
    if (path === '/auth/sessions') return { items: [] };
    if (path === '/devices') return { items: [] };
    throw new Error(`unexpected ${path}`);
  });
});
const press = async (label: string) => fireEvent.press(await screen.findByLabelText(label));

describe('Deactivate my account (the owner switches their own login off)', () => {
  test('three confirmations in a row; nothing is sent before the last one', async () => {
    mockPost.mockResolvedValue({ deactivated: true });
    await render(<AccountScreen />, { wrapper });
    await press('Deactivate my account');
    expect(screen.getByText('Deactivate your account?')).toBeTruthy();
    await press('Continue');
    expect(screen.getByText('Are you really sure?')).toBeTruthy();
    expect(mockPost).not.toHaveBeenCalled();
    await press('Yes, I am sure');
    expect(screen.getByText('Last confirmation')).toBeTruthy();
    expect(mockPost).not.toHaveBeenCalled();
    await press('Deactivate my account');
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    const [path, o] = mockPost.mock.calls[0] as [string, { body: unknown; idempotencyKey: string }];
    expect(path).toBe('/me/deactivate-account');
    expect(o.body).toEqual({ confirmations: 3 });
    expect(o.idempotencyKey).toBe('key-1');
    expect(await screen.findByText('Your account is deactivated')).toBeTruthy();
  });

  test('after the answer the user is signed out', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    try {
      mockPost.mockResolvedValue({ deactivated: true });
      await render(<AccountScreen />, { wrapper });
      await press('Deactivate my account');
      await press('Continue');
      await press('Yes, I am sure');
      await press('Deactivate my account');
      await waitFor(() => expect(mockPost).toHaveBeenCalled());
      expect(mockSignOut).not.toHaveBeenCalled();
      await jest.advanceTimersByTimeAsync(1000);
      expect(mockSignOut).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  test('stopping at any confirmation leaves the account as it is', async () => {
    await render(<AccountScreen />, { wrapper });
    await press('Deactivate my account');
    await press('Continue');
    await press('Cancel');
    expect(mockPost).not.toHaveBeenCalled();
    expect(screen.queryByText('Are you really sure?')).toBeNull();
    // it starts again from the first question
    await press('Deactivate my account');
    expect(screen.getByText('Deactivate your account?')).toBeTruthy();
  });

  test('a refusal shows the reference, signs nobody out, and the same press retries with the same key', async () => {
    mockPost
      .mockRejectedValueOnce(new ApiError(500, { title: 'BOOM', correlationId: 'corr-36' }))
      .mockResolvedValue({ deactivated: true });
    await render(<AccountScreen />, { wrapper });
    await press('Deactivate my account');
    await press('Continue');
    await press('Yes, I am sure');
    await press('Deactivate my account');
    expect(await screen.findByText(/corr-36/)).toBeTruthy();
    expect(mockSignOut).not.toHaveBeenCalled();
    await press('Deactivate my account');
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(2));
    expect(mockPost.mock.calls[0]![1].idempotencyKey).toBe(mockPost.mock.calls[1]![1].idempotencyKey);
  });

  test('only someone who can manage roles (a Franchise Admin) is offered it', async () => {
    mockMe = { userId: 'u-1', roles: [], permissions: ['identity.session.view'] };
    await render(<AccountScreen />, { wrapper });
    await screen.findByText('Sign out everywhere');
    expect(screen.queryByText('Deactivate my account')).toBeNull();
  });

  test('Hindi text', async () => {
    await setLanguage('hi');
    await render(<AccountScreen />, { wrapper });
    expect(await screen.findAllByText('मेरा खाता बंद करें')).toBeTruthy();
  });
});

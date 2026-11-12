import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '../src/api/errors';
import { i18n, setLanguage } from '../src/i18n';
import parts from '../i18n-parts/adm.json';
import SecurityScreen from '../src/features/adm/SecurityScreen';
import UserSecurityScreen from '../src/features/adm/UserSecurityScreen';

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockPut = jest.fn();
const mockDelete = jest.fn();
let mockMe: { userId: string; roles: string[]; permissions?: string[] };
let mockId = 0;
const mockClient = {
  get: (...a: unknown[]) => mockGet(...a),
  post: (...a: unknown[]) => mockPost(...a),
  put: (...a: unknown[]) => mockPut(...a),
  delete: (...a: unknown[]) => mockDelete(...a),
};
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

const policy = {
  minLength: 8,
  requireLettersNumbers: true,
  historyCount: 3,
  mfaRequiredRoles: ['franchise_admin'],
  version: 2,
};
const incident = {
  id: 'inc-1',
  title: 'Many failed sign-ins',
  severity: 'HIGH',
  status: 'OPEN',
  source: 'ANOMALY_RULE',
  rule: 'LOGIN_FAILED_BURST',
  subjectUserId: null,
  assigneeId: null,
  version: 3,
  createdAt: '2026-11-10T08:30:00Z',
  notes: [{ id: 'n-1', authorId: 'a-1', note: 'Looking into it', at: '2026-11-10T09:00:00Z' }],
};
const ev = {
  id: 'e-1',
  type: 'LOGIN_FAILED',
  userId: '12345678-aaaa',
  ip: '10.1.*.*',
  at: '2026-11-10T08:00:00Z',
};

beforeAll(() => {
  for (const l of ['en', 'hi', 'mr'] as const) i18n.addResourceBundle(l, 'translation', parts[l], true, true);
});
beforeEach(async () => {
  [mockGet, mockPost, mockPut, mockDelete].forEach((m) => m.mockReset());
  mockId = 0;
  mockMe = { userId: 'u-1', roles: [], permissions: undefined };
  client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retryDelay: 0 } } });
  await setLanguage('en');
});

describe('security centre', () => {
  beforeEach(() => {
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/settings/security') return policy;
      if (path === '/security/incidents') return { items: [incident] };
      if (path === '/security/incidents/inc-1') return incident;
      if (path === '/security/events') return { items: [ev] };
      throw new Error(`unexpected ${path}`);
    });
  });
  const show = () => render(<SecurityScreen />, { wrapper });

  test('shows policy, incidents and events', async () => {
    await show();
    expect(await screen.findByText('Many failed sign-ins')).toBeTruthy();
    expect(screen.getByLabelText('Minimum password length (8 to 64)').props.value).toBe('8');
    expect(screen.getByText(/Raised automatically: LOGIN_FAILED_BURST/)).toBeTruthy();
    expect(screen.getByText(/LOGIN_FAILED · 12345678 · 10.1.\*.\*/)).toBeTruthy();
  });

  test('loading state', async () => {
    mockGet.mockImplementation(() => new Promise(() => undefined));
    await show();
    expect(await screen.findByTestId('state-loading')).toBeTruthy();
  });

  test('offline state', async () => {
    mockGet.mockRejectedValue(new ApiError(0, null));
    await show();
    expect(
      await screen.findByText('No network. Check your connection and try again.', {}, { timeout: 3000 }),
    ).toBeTruthy();
  });

  test('permission denied: nothing is called', async () => {
    mockMe = { userId: 'u-1', roles: [], permissions: ['sales.invoice.view'] };
    await show();
    expect(await screen.findByText('You do not have permission to open the security centre.')).toBeTruthy();
    expect(mockGet).not.toHaveBeenCalled();
  });

  test('a failing part shows its error with the reference and the rest still works', async () => {
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/security/events') throw new ApiError(500, { title: 'BOOM', correlationId: 'c-9' });
      if (path === '/settings/security') return policy;
      return { items: [] };
    });
    await show();
    expect(await screen.findByText(/Code BOOM, reference c-9/)).toBeTruthy();
    expect(await screen.findByText('No incidents.')).toBeTruthy();
  });

  test('empty incident list', async () => {
    mockGet.mockImplementation(async (path: string) =>
      path === '/settings/security' ? policy : { items: [] },
    );
    await show();
    expect(await screen.findByText('No incidents.')).toBeTruthy();
    expect(screen.getByText('No events recorded yet.')).toBeTruthy();
  });

  test('save policy sends the version, numbers and sorted roles; lost answer retries with the same key, a changed body gets a new key', async () => {
    let first = true;
    mockPut.mockImplementation(async () => {
      if (first) {
        first = false;
        throw new ApiError(0, null);
      }
      return { ...policy, minLength: 12, version: 3 };
    });
    await show();
    await screen.findByText('Many failed sign-ins');
    await fireEvent.changeText(screen.getByLabelText('Minimum password length (8 to 64)'), '12');
    await fireEvent.press(screen.getByLabelText('accountant'));
    await fireEvent.press(screen.getByLabelText('Save policy'));
    await screen.findByText('No network. Check your connection and try again.');
    await fireEvent.press(screen.getByLabelText('Save policy'));
    await screen.findByText('Policy saved.');
    const [path, opts] = mockPut.mock.calls[1]!;
    expect(path).toBe('/settings/security');
    expect(opts.body).toEqual({
      minLength: 12,
      historyCount: 3,
      mfaRequiredRoles: ['accountant', 'franchise_admin'],
    });
    expect(opts.version).toBe(2);
    expect(mockPut.mock.calls[0]![1].idempotencyKey).toBe(opts.idempotencyKey);
  });

  test('a changed body gets a new key', async () => {
    mockPut.mockRejectedValueOnce(new ApiError(0, null)).mockResolvedValue(policy);
    await show();
    await screen.findByText('Many failed sign-ins');
    await fireEvent.changeText(screen.getByLabelText('Minimum password length (8 to 64)'), '12');
    await fireEvent.press(screen.getByLabelText('Save policy'));
    await screen.findByText('No network. Check your connection and try again.');
    await fireEvent.changeText(screen.getByLabelText('Minimum password length (8 to 64)'), '14');
    await fireEvent.press(screen.getByLabelText('Save policy'));
    await screen.findByText('Policy saved.');
    expect(mockPut.mock.calls[1]![1].idempotencyKey).not.toBe(mockPut.mock.calls[0]![1].idempotencyKey);
  });

  test('a policy weaker than the minimum cannot be saved', async () => {
    await show();
    await screen.findByText('Many failed sign-ins');
    await fireEvent.changeText(screen.getByLabelText('Minimum password length (8 to 64)'), '6');
    expect(screen.getByText('Enter a whole number from 8 to 64.')).toBeTruthy();
    expect(
      screen.getByLabelText('Save policy').props.accessibilityState?.disabled ??
        screen.getByLabelText('Save policy').props.disabled,
    ).toBeTruthy();
    expect(mockPut).not.toHaveBeenCalled();
  });

  test('open an incident needs a title of 5+ characters and sends severity', async () => {
    mockPost.mockResolvedValue(incident);
    await show();
    await screen.findByText('Many failed sign-ins');
    await fireEvent.changeText(screen.getByLabelText('What happened? (5 to 200 characters)'), 'abc');
    expect(screen.getByText('The title must be 5 to 200 characters.')).toBeTruthy();
    await fireEvent.changeText(
      screen.getByLabelText('What happened? (5 to 200 characters)'),
      'Lost phone with the till',
    );
    await fireEvent.press(screen.getByLabelText('Critical'));
    await fireEvent.press(screen.getByLabelText('Open incident'));
    expect(await screen.findByText('Incident opened.')).toBeTruthy();
    expect(mockPost.mock.calls[0]![0]).toBe('/security/incidents');
    expect(mockPost.mock.calls[0]![1].body).toEqual({
      title: 'Lost phone with the till',
      severity: 'CRITICAL',
    });
    expect(mockPost.mock.calls[0]![1].idempotencyKey).toBe('key-1');
  });

  test('incident detail: transition sends the version, note is added', async () => {
    mockPost.mockResolvedValue(incident);
    await show();
    await screen.findByText('Many failed sign-ins');
    await fireEvent.press(screen.getByLabelText('View incident'));
    expect(await screen.findByText(/Looking into it/)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Mark as Investigating'));
    expect(await screen.findByText('Incident updated.')).toBeTruthy();
    expect(mockPost.mock.calls[0]![0]).toBe('/security/incidents/inc-1:transition');
    expect(mockPost.mock.calls[0]![1]).toMatchObject({ body: { status: 'INVESTIGATING' }, version: 3 });
    await fireEvent.changeText(screen.getByLabelText('Add an investigation note'), 'Called the user');
    await fireEvent.press(screen.getByLabelText('Add note'));
    expect(await screen.findByText('Note added.')).toBeTruthy();
    expect(mockPost.mock.calls[1]![0]).toBe('/security/incidents/inc-1/notes');
    expect(mockPost.mock.calls[1]![1].body).toEqual({ note: 'Called the user' });
  });

  test('a closed incident has no more steps and no note box', async () => {
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/settings/security') return policy;
      if (path === '/security/incidents') return { items: [{ ...incident, status: 'CLOSED' }] };
      if (path === '/security/incidents/inc-1') return { ...incident, status: 'CLOSED' };
      return { items: [] };
    });
    await show();
    await screen.findByText('Many failed sign-ins');
    await fireEvent.press(screen.getByLabelText('View incident'));
    await screen.findByText(/Looking into it/);
    expect(screen.queryByLabelText('Add note')).toBeNull();
    expect(screen.queryByLabelText(/^Mark as/)).toBeNull();
  });

  test('the status filter goes to the server', async () => {
    await show();
    await screen.findByText('Many failed sign-ins');
    await fireEvent.press(screen.getByLabelText('Resolved'));
    await screen.findByText('Many failed sign-ins');
    const calls = mockGet.mock.calls.filter((c) => c[0] === '/security/incidents');
    expect(calls.at(-1)![1].query).toEqual({ status: 'RESOLVED' });
  });

  test('Hindi text', async () => {
    await setLanguage('hi');
    await show();
    expect(await screen.findByText('सुरक्षा केंद्र')).toBeTruthy();
  });
});

describe('unlock and sign-ins of other users', () => {
  const user = { id: 'u-2', username: 'ramesh', fullName: 'Ramesh Patil', status: 'ACTIVE' };
  const sess = {
    id: 's-1',
    ip: '10.2.*.*',
    browser: 'Chrome',
    startedAt: '2026-11-10T04:00:00Z',
    lastAccessAt: '2026-11-10T05:00:00Z',
  };
  beforeEach(() => {
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/users') return { items: [user], next_cursor: null };
      if (path === '/users/u-2/sessions') return { items: [sess] };
      throw new Error(`unexpected ${path}`);
    });
  });
  const show = () => render(<UserSecurityScreen />, { wrapper });
  const open = async () => {
    await show();
    await screen.findByText('Ramesh Patil');
    await fireEvent.press(screen.getByLabelText('Choose'));
    await screen.findByText(/Chrome/);
  };

  test('permission denied: nothing is called', async () => {
    mockMe = { userId: 'u-1', roles: [], permissions: ['sales.invoice.view'] };
    await show();
    expect(await screen.findByText('You do not have permission to manage users.')).toBeTruthy();
    expect(mockGet).not.toHaveBeenCalled();
  });

  test('empty search result', async () => {
    mockGet.mockResolvedValue({ items: [], next_cursor: null });
    await show();
    expect(await screen.findByText('No users found.')).toBeTruthy();
  });

  test('unlock needs a reason of 10+ characters, then posts it with a key', async () => {
    mockPost.mockResolvedValue({ id: 'u-2', unlocked: true });
    await open();
    await fireEvent.changeText(screen.getByLabelText('Reason'), 'short');
    expect(screen.getByText('The reason must be 10 to 500 characters.')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Reason'), 'Locked after a forgotten password');
    await fireEvent.press(screen.getByLabelText('Unlock account'));
    expect(await screen.findByText('Account unlocked.')).toBeTruthy();
    expect(mockPost.mock.calls[0]![0]).toBe('/users/u-2:unlock');
    expect(mockPost.mock.calls[0]![1].body).toEqual({ reason: 'Locked after a forgotten password' });
    expect(mockPost.mock.calls[0]![1].idempotencyKey).toBe('key-1');
  });

  test('reset 2FA that needs a fresh sign-in shows the message, retry uses the same key', async () => {
    mockPost
      .mockRejectedValueOnce(new ApiError(403, { title: 'FRESH_AUTH_REQUIRED', correlationId: 'c-2' }))
      .mockResolvedValue({ id: 'u-2', mfaReset: true });
    await open();
    await fireEvent.changeText(screen.getByLabelText('Reason'), 'Lost the authenticator phone');
    await fireEvent.press(screen.getByLabelText('Reset 2FA'));
    expect(await screen.findByText('Please enter your password again to continue.')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Reset 2FA'));
    expect(await screen.findByText('2FA reset. The user must set it up again.')).toBeTruthy();
    expect(mockPost.mock.calls[0]![0]).toBe('/users/u-2:reset-2fa');
    expect(mockPost.mock.calls[1]![1].idempotencyKey).toBe(mockPost.mock.calls[0]![1].idempotencyKey);
  });

  test('end one sign-in', async () => {
    mockDelete.mockResolvedValue(null);
    await open();
    await fireEvent.press(screen.getByLabelText('End this sign-in'));
    expect(await screen.findByText('That sign-in has ended.')).toBeTruthy();
    expect(mockDelete.mock.calls[0]![0]).toBe('/users/u-2/sessions/s-1');
    expect(mockDelete.mock.calls[0]![1].idempotencyKey).toBe('key-1');
  });

  test('a user who has not signed in yet shows the error with a reference', async () => {
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/users') return { items: [user], next_cursor: null };
      throw new ApiError(409, { title: 'USER_NOT_LINKED', correlationId: 'c-7' });
    });
    await show();
    await screen.findByText('Ramesh Patil');
    await fireEvent.press(screen.getByLabelText('Choose'));
    expect(await screen.findByText(/reference c-7/)).toBeTruthy();
  });
});

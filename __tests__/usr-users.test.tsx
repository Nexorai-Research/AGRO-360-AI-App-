import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '../src/api/errors';
import { i18n, setLanguage } from '../src/i18n';
import step5 from '../i18n-parts/step5.json';
import usr from '../i18n-parts/usr.json';
import UsersScreen from '../src/features/admin/UsersScreen';

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockPatch = jest.fn();
const mockDelete = jest.fn();
let mockMe: { userId: string; roles: string[]; permissions?: string[] };
let mockId = 0;
const mockClient = {
  get: (...a: unknown[]) => mockGet(...a),
  post: (...a: unknown[]) => mockPost(...a),
  patch: (...a: unknown[]) => mockPatch(...a),
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
const user = {
  id: 'u-2',
  username: 'ramesh',
  fullName: 'Ramesh Patil',
  mobile: '9876543210',
  email: 'r@example.com',
  status: 'ACTIVE',
  allBranches: false,
  defaultBranchId: 'b-1',
  roleIds: ['r-1'],
  branchIds: ['b-1'],
  version: 3,
  createdAt: '2026-10-01T04:00:00Z',
};
const roles = [
  {
    id: 'r-1',
    name: 'Counter staff',
    isSystem: false,
    systemKey: null,
    version: 1,
    permissions: [],
    assignedUsers: 4,
    limits: {},
  },
  {
    id: 'r-2',
    name: 'Manager',
    isSystem: false,
    systemKey: null,
    version: 1,
    permissions: [],
    assignedUsers: 1,
    limits: {},
  },
];
const branches = [
  {
    id: 'b-1',
    code: 'HO',
    name: 'Head office',
    address: null,
    gstin: null,
    isHeadOffice: true,
    status: 'ACTIVE',
  },
  {
    id: 'b-2',
    code: 'PN',
    name: 'Pune shop',
    address: null,
    gstin: null,
    isHeadOffice: false,
    status: 'ACTIVE',
  },
];

beforeAll(() => {
  for (const l of ['en', 'hi', 'mr'] as const) {
    i18n.addResourceBundle(l, 'translation', step5[l], true, true);
    i18n.addResourceBundle(l, 'translation', usr[l], true, true);
  }
});
beforeEach(async () => {
  [mockGet, mockPost, mockPatch, mockDelete].forEach((m) => m.mockReset());
  mockId = 0;
  mockMe = { userId: 'u-1', roles: [], permissions: undefined };
  client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retryDelay: 0 } } });
  await setLanguage('en');
  mockGet.mockImplementation(async (path: string) => {
    if (path === '/users') return { items: [user], next_cursor: null };
    if (path === '/roles') return { items: roles };
    if (path === '/branches') return { items: branches };
    if (path === '/users/u-2/sessions')
      return {
        items: [
          {
            id: 's-1',
            ip: '10.0.x.x',
            browser: 'Chrome',
            startedAt: '2026-11-10T04:00:00Z',
            lastAccessAt: '2026-11-10T05:00:00Z',
          },
        ],
      };
    throw new Error(`unexpected ${path}`);
  });
});

const show = async () => {
  await render(<UsersScreen />, { wrapper });
  await screen.findByText('Ramesh Patil');
};

describe('add user', () => {
  async function openForm() {
    await show();
    await fireEvent.press(screen.getByLabelText('Add user'));
    await screen.findByText('Create user');
    await screen.findByLabelText('Pune shop');
  }

  test('shows what is wrong and sends nothing until the form is valid', async () => {
    await openForm();
    await fireEvent.press(screen.getByLabelText('Create user'));
    expect(await screen.findByText('Choose at least one role.')).toBeTruthy();
    expect(screen.getByText('The name must be 2 to 120 characters.')).toBeTruthy();
    expect(screen.getByText('Enter a 10-digit mobile number starting with 6, 7, 8 or 9.')).toBeTruthy();
    expect(screen.getByText('Choose at least one branch, or tick access to all branches.')).toBeTruthy();
    expect(mockPost).not.toHaveBeenCalled();
  });

  test('creates the user; a lost answer retries with the SAME key; no tenant id is sent', async () => {
    let first = true;
    mockPost.mockImplementation(async () => {
      if (first) {
        first = false;
        throw new ApiError(0, null);
      }
      return { ...user, id: 'u-9' };
    });
    await openForm();
    await fireEvent.changeText(screen.getByLabelText('Full name'), 'Sunita Jadhav');
    await fireEvent.changeText(screen.getByLabelText('Username'), 'sunita.j');
    await fireEvent.changeText(screen.getByLabelText('Mobile'), '+91 98765 11111');
    await fireEvent.changeText(screen.getByLabelText('Email'), 'sunita@example.com');
    await fireEvent.press(screen.getByLabelText('Manager'));
    await fireEvent.press(screen.getByLabelText('Pune shop'));
    await fireEvent.press(screen.getByLabelText('Create user'));
    expect(await screen.findByText(/Code NETWORK|No network|reference/)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Create user'));
    expect(await screen.findByText('User created. The invitation is sent in the background.')).toBeTruthy();
    expect(mockPost).toHaveBeenCalledTimes(2);
    const [path, opts] = mockPost.mock.calls[0]!;
    expect(path).toBe('/users');
    expect(opts.body).toEqual({
      fullName: 'Sunita Jadhav',
      username: 'sunita.j',
      mobile: '9876511111',
      email: 'sunita@example.com',
      roleIds: ['r-2'],
      allBranches: false,
      branchIds: ['b-2'],
    });
    expect(JSON.stringify(opts.body)).not.toMatch(/tenant/i);
    expect(mockPost.mock.calls[1]![1].idempotencyKey).toBe(opts.idempotencyKey);
  });

  test('a user without email is created with a plain warning', async () => {
    mockPost.mockResolvedValue({ ...user, id: 'u-9' });
    await openForm();
    expect(screen.getByText(/Without an email the person cannot get an invitation/)).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Full name'), 'Sunita Jadhav');
    await fireEvent.changeText(screen.getByLabelText('Username'), 'sunita.j');
    await fireEvent.changeText(screen.getByLabelText('Mobile'), '9876511111');
    await fireEvent.press(screen.getByLabelText('Manager'));
    await fireEvent.press(screen.getByLabelText('Access to all branches'));
    await fireEvent.press(screen.getByLabelText('Create user'));
    expect(
      await screen.findByText('User created, but no email was given so no invitation was sent.'),
    ).toBeTruthy();
    expect(mockPost.mock.calls[0]![1].body).toMatchObject({ email: null, allBranches: true, branchIds: [] });
  });

  test('a server refusal is shown with its reference', async () => {
    mockPost.mockRejectedValue(new ApiError(409, { title: 'DUPLICATE', correlationId: 'c-77' }));
    await openForm();
    await fireEvent.changeText(screen.getByLabelText('Full name'), 'Sunita Jadhav');
    await fireEvent.changeText(screen.getByLabelText('Username'), 'sunita.j');
    await fireEvent.changeText(screen.getByLabelText('Mobile'), '9876511111');
    await fireEvent.press(screen.getByLabelText('Manager'));
    await fireEvent.press(screen.getByLabelText('Access to all branches'));
    await fireEvent.press(screen.getByLabelText('Create user'));
    expect(await screen.findByText(/c-77/)).toBeTruthy();
  });

  test('without the role permission a new user cannot be created and roles are not requested', async () => {
    mockMe = { userId: 'u-1', roles: [], permissions: ['identity.user.manage'] };
    await show();
    await fireEvent.press(screen.getByLabelText('Add user'));
    expect(await screen.findByText(/list of roles is not available to you/)).toBeTruthy();
    expect(mockGet.mock.calls.some((c) => c[0] === '/roles')).toBe(false);
  });
});

describe('edit user', () => {
  async function openEdit() {
    await show();
    await fireEvent.press(screen.getByLabelText('Show details'));
    await fireEvent.press(await screen.findByLabelText('Edit user'));
    await screen.findByText('Save changes');
    await screen.findByLabelText('Pune shop');
  }

  test('sends only what changed, with the version in If-Match', async () => {
    mockPatch.mockResolvedValue({ ...user, version: 4 });
    await openEdit();
    expect(
      screen.getByText('Save changes').props.accessibilityState?.disabled ??
        screen.getByLabelText('Save changes').props.accessibilityState?.disabled,
    ).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Full name'), 'Ramesh P Patil');
    await fireEvent.press(screen.getByLabelText('Manager'));
    await fireEvent.press(screen.getByLabelText('Pune shop'));
    await fireEvent.press(screen.getByLabelText('Save changes'));
    expect(await screen.findByText('User updated.')).toBeTruthy();
    const [path, opts] = mockPatch.mock.calls[0]!;
    expect(path).toBe('/users/u-2');
    expect(opts.version).toBe(3);
    expect(opts.body).toEqual({
      fullName: 'Ramesh P Patil',
      roleIds: ['r-1', 'r-2'],
      allBranches: false,
      branchIds: ['b-1', 'b-2'],
    });
    expect(opts.idempotencyKey).toBeTruthy();
  });

  test('a stale version error is shown with its reference', async () => {
    mockPatch.mockRejectedValue(new ApiError(412, { title: 'STALE_VERSION', correlationId: 'c-5' }));
    await openEdit();
    await fireEvent.changeText(screen.getByLabelText('Full name'), 'Ramesh P Patil');
    await fireEvent.press(screen.getByLabelText('Save changes'));
    expect(await screen.findByText(/Someone else changed this/)).toBeTruthy();
  });

  test('a deactivated user cannot be edited, only activated again', async () => {
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/users') return { items: [{ ...user, status: 'DEACTIVATED' }], next_cursor: null };
      if (path === '/roles') return { items: roles };
      return { items: branches };
    });
    await show();
    await fireEvent.press(screen.getByLabelText('Show details'));
    await screen.findByLabelText('Activate again');
    expect(screen.queryByLabelText('Edit user')).toBeNull();
  });
});

describe('unlock, reset two-factor and sign-ins', () => {
  async function openDetails() {
    await show();
    await fireEvent.press(screen.getByLabelText('Show details'));
    await screen.findByLabelText('Unlock account');
  }

  test('unlock needs a reason of 10+ characters and sends it with a key', async () => {
    mockPost.mockResolvedValue({ id: 'u-2', unlocked: true });
    await openDetails();
    await fireEvent.press(screen.getByLabelText('Unlock account'));
    await fireEvent.changeText(screen.getAllByLabelText('Reason (10 to 500 characters)')[0]!, 'short');
    expect(screen.getByLabelText('Unlock now').props.accessibilityState?.disabled).toBe(true);
    await fireEvent.changeText(
      screen.getAllByLabelText('Reason (10 to 500 characters)')[0]!,
      'forgot the password',
    );
    await fireEvent.press(screen.getByLabelText('Unlock now'));
    expect(await screen.findByText('Account unlocked.')).toBeTruthy();
    const [path, opts] = mockPost.mock.calls[0]!;
    expect(path).toBe('/users/u-2:unlock');
    expect(opts.body).toEqual({ reason: 'forgot the password' });
    expect(opts.idempotencyKey).toBeTruthy();
  });

  test('reset two-factor shows the server refusal when a recent sign-in is needed', async () => {
    mockPost.mockRejectedValue(new ApiError(403, { title: 'FRESH_AUTH_REQUIRED', correlationId: 'c-9' }));
    await openDetails();
    await fireEvent.press(screen.getByLabelText('Reset two-factor sign-in'));
    await fireEvent.changeText(
      screen.getAllByLabelText('Reason (10 to 500 characters)')[0]!,
      'phone was lost',
    );
    await fireEvent.press(screen.getByLabelText('Reset now'));
    expect(await screen.findByText('Please enter your password again to continue.')).toBeTruthy();
    expect(mockPost.mock.calls[0]![0]).toBe('/users/u-2:reset-2fa');
  });

  test('lists the sign-ins of the person and ends one', async () => {
    mockDelete.mockResolvedValue(null);
    await openDetails();
    await fireEvent.press(screen.getByLabelText('Sign-ins of this person'));
    expect(await screen.findByText('Chrome')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Sign out this sign-in'));
    await waitFor(() => expect(mockDelete).toHaveBeenCalled());
    expect(mockDelete.mock.calls[0]![0]).toBe('/users/u-2/sessions/s-1');
    expect(mockDelete.mock.calls[0]![1].idempotencyKey).toBeTruthy();
  });

  test('sign-ins that cannot be loaded say so', async () => {
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/users') return { items: [user], next_cursor: null };
      if (path === '/roles') return { items: roles };
      if (path === '/branches') return { items: branches };
      throw new ApiError(409, { title: 'USER_NOT_LINKED' });
    });
    await openDetails();
    await fireEvent.press(screen.getByLabelText('Sign-ins of this person'));
    expect(await screen.findByText(/sign-ins are not available/)).toBeTruthy();
  });
});

describe('texts in Hindi and Marathi', () => {
  test.each([
    ['hi', 'उपयोगकर्ता जोड़ें'],
    ['mr', 'वापरकर्ता जोडा'],
  ] as const)('%s', async (lang, label) => {
    await setLanguage(lang);
    await render(<UsersScreen />, { wrapper });
    expect(await screen.findByLabelText(label)).toBeTruthy();
  });
});

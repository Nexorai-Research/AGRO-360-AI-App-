import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '../src/api/errors';
import { i18n, setLanguage } from '../src/i18n';
import step5 from '../i18n-parts/step5.json';
import usr from '../i18n-parts/usr.json';
import RolesScreen from '../src/features/admin/RolesScreen';

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockPut = jest.fn();
const mockPatch = jest.fn();
const mockDelete = jest.fn();
let mockMe: { userId: string; roles: string[]; permissions?: string[] };
let mockId = 0;
const mockClient = {
  get: (...a: unknown[]) => mockGet(...a),
  post: (...a: unknown[]) => mockPost(...a),
  put: (...a: unknown[]) => mockPut(...a),
  patch: (...a: unknown[]) => mockPatch(...a),
  delete: (...a: unknown[]) => mockDelete(...a),
};
jest.mock('../src/auth/AuthProvider', () => ({
  useAuth: () => ({ status: 'signedIn', me: mockMe, client: mockClient, signIn: jest.fn(), signOut: jest.fn() }),
}));
jest.mock('../src/device', () => ({ newId: () => `key-${++mockId}` }));

let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
const custom = { id: 'r-1', name: 'Counter staff', isSystem: false, systemKey: null, version: 7, permissions: ['sales.invoice.view'], assignedUsers: 0, limits: { line_discount_pct: '5' } };
const used = { ...custom, id: 'r-2', name: 'Manager', assignedUsers: 3, limits: {} };
const system = { ...custom, id: 'r-3', name: 'Admin', isSystem: true, systemKey: 'admin', assignedUsers: 1 };
const perms = [
  { code: 'sales.invoice.create', module: 'sales', description: 'Create invoices', enabled: true },
  { code: 'sales.invoice.view', module: 'sales', description: 'View invoices', enabled: true },
  { code: 'stock.adjust', module: 'stock', description: 'Adjust stock', enabled: false },
  { code: 'finance.post', module: 'finance', description: 'Post', enabled: true },
];

beforeAll(() => {
  for (const l of ['en', 'hi', 'mr'] as const) {
    i18n.addResourceBundle(l, 'translation', step5[l], true, true);
    i18n.addResourceBundle(l, 'translation', usr[l], true, true);
  }
});
beforeEach(async () => {
  [mockGet, mockPost, mockPut, mockPatch, mockDelete].forEach((m) => m.mockReset());
  mockId = 0;
  mockMe = { userId: 'u-1', roles: [], permissions: ['identity.role.manage', 'sales.invoice.create', 'sales.invoice.view', 'stock.adjust'] };
  client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retryDelay: 0 } } });
  await setLanguage('en');
  mockGet.mockImplementation(async (path: string) => {
    if (path === '/roles') return { items: [custom, used, system] };
    if (path === '/permissions') return { items: perms };
    throw new Error(`unexpected ${path}`);
  });
});

const open = async (name: string) => {
  await render(<RolesScreen />, { wrapper });
  await screen.findByText(name);
};
const openRole = async (index: number) => {
  await fireEvent.press(screen.getAllByLabelText('Show permissions')[index]!);
};

describe('new role', () => {
  test('validates the name, then creates an empty role or a copy, with a key', async () => {
    mockPost.mockResolvedValue({ ...custom, id: 'r-9' });
    await open('Counter staff');
    await fireEvent.press(screen.getByLabelText('New role'));
    await fireEvent.press(screen.getByLabelText('Create role'));
    expect(await screen.findByText('The name must be 2 to 80 characters.')).toBeTruthy();
    expect(mockPost).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText('Role name'), 'Night shift');
    await fireEvent.press(screen.getByLabelText('Manager'));
    await fireEvent.press(screen.getByLabelText('Create role'));
    expect(await screen.findByText('Role created.')).toBeTruthy();
    const [path, opts] = mockPost.mock.calls[0]!;
    expect(path).toBe('/roles');
    expect(opts.body).toEqual({ name: 'Night shift', cloneFromRoleId: 'r-2' });
    expect(opts.idempotencyKey).toBeTruthy();
  });

  test('a duplicate name is shown with the reference and the retry keeps the key', async () => {
    mockPost.mockRejectedValue(new ApiError(409, { title: 'DUPLICATE', correlationId: 'c-3' }));
    await open('Counter staff');
    await fireEvent.press(screen.getByLabelText('New role'));
    await fireEvent.changeText(screen.getByLabelText('Role name'), 'Night shift');
    await fireEvent.press(screen.getByLabelText('Create role'));
    expect(await screen.findByText(/c-3/)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Create role'));
    await screen.findByText(/c-3/);
    expect(mockPost.mock.calls[1]![1].idempotencyKey).toBe(mockPost.mock.calls[0]![1].idempotencyKey);
  });
});

describe('permission matrix', () => {
  test('saves the chosen permissions with the role version; locked ones cannot be switched on', async () => {
    mockPut.mockResolvedValue(custom);
    await open('Counter staff');
    await openRole(0);
    await fireEvent.press(await screen.findByLabelText('stock (0/1)'));
    expect(screen.getByText('stock.adjust - module not in your plan')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('finance (0/1)'));
    expect(screen.getByText('finance.post - you do not hold this, so you cannot give it')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('sales (1/2)'));
    await fireEvent.press(screen.getByLabelText('sales.invoice.create'));
    await fireEvent.press(screen.getByLabelText('sales.invoice.view'));
    await fireEvent.press(screen.getByLabelText('Save permissions'));
    expect(await screen.findByText('Permissions saved.')).toBeTruthy();
    const [path, opts] = mockPut.mock.calls[0]!;
    expect(path).toBe('/roles/r-1/permissions');
    expect(opts.version).toBe(7);
    expect(opts.body).toEqual({ permissions: ['sales.invoice.create'] });
    expect(opts.idempotencyKey).toBeTruthy();
  });

  test('the permission list failing is reported without hiding the rest', async () => {
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/roles') return { items: [custom] };
      throw new ApiError(500, { title: 'BOOM', correlationId: 'c-1' });
    });
    await open('Counter staff');
    await openRole(0);
    expect(await screen.findByText('The list of permissions is not available.')).toBeTruthy();
    expect(screen.getByLabelText('Save limits')).toBeTruthy();
  });
});

describe('approval limits', () => {
  test('rejects a percentage over 100 and a bad amount, then saves only the set limits', async () => {
    mockPut.mockResolvedValue(custom);
    await open('Counter staff');
    await openRole(0);
    const pct = await screen.findByLabelText('Line discount (%)');
    await fireEvent.changeText(pct, '120');
    expect(screen.getByText('A number from 0 to 100 with up to 4 decimals.')).toBeTruthy();
    expect(screen.getByLabelText('Save limits').props.accessibilityState?.disabled).toBe(true);
    await fireEvent.changeText(pct, '7.5');
    await fireEvent.changeText(screen.getByLabelText('Cash refund (amount)'), '1.23456');
    expect(screen.getByText('A number with up to 4 decimals, not negative.')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Cash refund (amount)'), '2500.50');
    await fireEvent.press(screen.getByLabelText('Save limits'));
    expect(await screen.findByText('Limits saved.')).toBeTruthy();
    const [path, opts] = mockPut.mock.calls[0]!;
    expect(path).toBe('/roles/r-1/limits');
    expect(opts.version).toBe(7);
    expect(opts.body).toEqual({ limits: { line_discount_pct: '7.5', cash_refund_amount: '2500.50' } });
  });
});

describe('rename and delete', () => {
  test('rename sends the new name with the version', async () => {
    mockPatch.mockResolvedValue({ ...custom, name: 'Till staff' });
    await open('Counter staff');
    await openRole(0);
    const box = await screen.findByLabelText('Role name');
    await fireEvent.changeText(box, 'Till staff');
    await fireEvent.press(screen.getByLabelText('Rename role'));
    expect(await screen.findByText('Role renamed.')).toBeTruthy();
    expect(mockPatch.mock.calls[0]![0]).toBe('/roles/r-1');
    expect(mockPatch.mock.calls[0]![1]).toMatchObject({ body: { name: 'Till staff' }, version: 7 });
  });

  test('a role with users cannot be deleted; an empty one needs a confirm step', async () => {
    mockDelete.mockResolvedValue(null);
    await open('Counter staff');
    await openRole(1);
    expect(await screen.findByText('3 users have this role. Move them to another role before deleting it.')).toBeTruthy();
    expect(screen.getByLabelText('Delete role').props.accessibilityState?.disabled).toBe(true);
    await openRole(0);
    await fireEvent.press(screen.getAllByLabelText('Delete role')[0]!);
    expect(await screen.findByText('Delete the role Counter staff? This cannot be undone.')).toBeTruthy();
    expect(mockDelete).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText('Yes, delete the role'));
    expect(await screen.findByText('Role deleted.')).toBeTruthy();
    expect(mockDelete.mock.calls[0]![0]).toBe('/roles/r-1');
    expect(mockDelete.mock.calls[0]![1].idempotencyKey).toBeTruthy();
  });

  test('a system role is fixed and has no editor', async () => {
    await open('Admin');
    await openRole(2);
    expect(await screen.findByText(/System role. It is fixed/)).toBeTruthy();
    expect(screen.queryByLabelText('Save permissions')).toBeNull();
  });
});

describe('states', () => {
  test('permission denied sends nothing', async () => {
    mockMe = { userId: 'u-1', roles: [], permissions: ['sales.invoice.view'] };
    await render(<RolesScreen />, { wrapper });
    expect(await screen.findByText('You do not have permission to see roles.')).toBeTruthy();
    expect(mockGet).not.toHaveBeenCalled();
  });
  test('Hindi and Marathi', async () => {
    await setLanguage('hi');
    const { unmount } = await render(<RolesScreen />, { wrapper });
    expect(await screen.findByLabelText('नई भूमिका')).toBeTruthy();
    unmount();
    await setLanguage('mr');
    await render(<RolesScreen />, { wrapper });
    expect(await screen.findByLabelText('नवीन भूमिका')).toBeTruthy();
  });
});

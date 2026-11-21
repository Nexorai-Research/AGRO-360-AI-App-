import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '../src/api/errors';
import { setLanguage } from '../src/i18n';
import FranchiseAccessScreen from '../src/features/platform/FranchiseAccessScreen';
import UserAccessScreen from '../src/features/admin/UserAccessScreen';
import {
  buildTree,
  changes,
  featureName,
  matches,
  originOf,
  placeOf,
  setMany,
  stateOf,
  userLockedWhy,
  type CatalogueItem,
  type UserAccess,
} from '../src/features/access/access-logic';

const mockGet = jest.fn();
const mockPut = jest.fn();
let mockMe: { userId: string; roles: string[]; permissions?: string[] };
let mockId = 0;
jest.mock('../src/auth/AuthProvider', () => ({
  useAuth: () => ({
    status: 'signedIn',
    me: mockMe,
    client: { get: (...a: unknown[]) => mockGet(...a), put: (...a: unknown[]) => mockPut(...a) },
  }),
}));
jest.mock('../src/device', () => ({ newId: () => `key-${++mockId}` }));
jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useLocalSearchParams: () => ({}),
}));

let qc: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={qc}>{children}</QueryClientProvider>
);
beforeEach(async () => {
  [mockGet, mockPut].forEach((m) => m.mockReset());
  mockId = 0;
  mockMe = { userId: 'op-1', roles: ['platform_admin'] };
  qc = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retryDelay: 0 } } });
  await setLanguage('en');
});

const item = (code: string, description = '', enabled = true): CatalogueItem => ({
  code,
  module: code.split('.')[0],
  description,
  enabled,
});
const CAT = [
  item('sales.invoice.create', 'Create invoices'),
  item('sales.invoice.cancel', 'Cancel an invoice'),
  item('inventory.stock.view', 'See stock'),
  item('hr.employee.manage', 'Manage staff'),
  item('org.document.manage', 'Manage documents'),
  item('weird.thing', 'Something new', false),
];
const press = async (label: string) => fireEvent.press(await screen.findByLabelText(label));
const checked = (label: string) => screen.getByLabelText(label).props.accessibilityState.checked;

describe('the access rules like the web', () => {
  test('a code belongs to a menu and a page; unknown areas go to Other features', () => {
    expect(placeOf('sales.invoice.cancel')).toEqual(['Operations', 'Sales and billing']);
    expect(placeOf('pos.shift')).toEqual(['Operations', 'Sales and billing']);
    expect(placeOf('hr.employee.manage')).toEqual(['Staff & payroll', 'Staff and payroll']);
    expect(placeOf('org.document.manage')).toEqual(['Administration', 'Documents']);
    expect(placeOf('org.config.view')).toEqual(['Setup', 'Settings and configuration']);
    expect(placeOf('zzz.new')).toEqual(['Other features', 'Other']);
    expect(featureName('sales.invoice_cancel')).toBe('Invoice cancel');
  });
  test('features that cannot be switched are left out of the tree', () => {
    const t = buildTree(CAT);
    expect([...t.get('Operations')!.keys()]).toEqual(['Sales and billing', 'Inventory']);
    expect(t.get('Other features')!.size).toBe(0);
  });
  test('switching many leaves a locked feature alone; the save bar counts what changed', () => {
    const by = new Map(CAT.map((p) => [p.code, p]));
    const locked = (p: CatalogueItem) => (p.code === 'sales.invoice.cancel' ? 'no' : null);
    const was = new Set(['sales.invoice.create', 'sales.invoice.cancel', 'inventory.stock.view']);
    const off = setMany(was, [...was], false, by, locked);
    expect([...off]).toEqual(['sales.invoice.cancel']);
    expect(changes(off, was)).toEqual({ added: 0, removed: 2 });
    expect(stateOf([...was], off)).toEqual({ n: 1, all: false, some: true });
  });
  test('the search reads the name, the description and the page; the filter is All, On or Off', () => {
    const p = item('sales.invoice.cancel', 'Cancel an invoice');
    const on = new Set(['sales.invoice.cancel']);
    expect(matches(p, 'Sales and billing', 'cancel', 'all', on)).toBe(true);
    expect(matches(p, 'Sales and billing', 'billing', 'all', on)).toBe(true);
    expect(matches(p, 'Sales and billing', 'stock', 'all', on)).toBe(false);
    expect(matches(p, 'Sales and billing', '', 'off', on)).toBe(false);
    expect(matches(p, 'Sales and billing', '', 'on', on)).toBe(true);
  });
  test('one person: where a feature comes from and why it cannot be changed, in the web order', () => {
    const s = {
      fullAccess: false,
      status: 'ACTIVE',
      effective: ['a.x', 'b.x'],
      granted: ['a.x'],
      denied: ['c.x'],
      fromRole: ['b.x', 'c.x'],
    } as unknown as UserAccess;
    expect(originOf(s, 'a.x')).toBe('extra');
    expect(originOf(s, 'c.x')).toBe('taken');
    expect(originOf(s, 'b.x')).toBe('role');
    expect(originOf(s, 'z.x')).toBe('');
    expect(userLockedWhy({ ...s, fullAccess: true }, new Set(), 'a.x')).toBe('fullAccess');
    expect(userLockedWhy({ ...s, status: 'DEACTIVATED' }, new Set(['a.x']), 'a.x')).toBe('deactivated');
    expect(userLockedWhy(s, new Set(), 'z.x')).toBe('cannotGive');
    expect(userLockedWhy(s, new Set(), 'a.x')).toBe('cannotTake');
    expect(userLockedWhy(s, new Set(['a.x']), 'a.x')).toBeNull();
  });
});

describe('Access control for a franchise (phase 34)', () => {
  const franchise = {
    id: 'f1',
    franchiseId: 'F-001',
    code: 'KISAN',
    displayName: 'Kisan Agro',
    status: 'ACTIVE',
  };
  const serve = (restricted: boolean, allowed: string[]) =>
    mockGet.mockImplementation(async (p: string) => {
      if (p === '/platform/franchises') return { items: [franchise] };
      if (p === '/platform/franchises/f1/access') return { franchise, restricted, allowed, catalogue: CAT };
      throw new Error(`unexpected ${p}`);
    });
  const open = async () => {
    await render(<FranchiseAccessScreen />, { wrapper });
    await press('Choose Kisan Agro');
    await screen.findByText(/Sales and billing · \d\/2/);
  };

  test('a franchise nobody restricted yet shows that everything is on', async () => {
    serve(
      false,
      CAT.map((p) => p.code),
    );
    await open();
    expect(screen.getByText('Not restricted yet: everything is on')).toBeTruthy();
    expect(screen.getByText(/has not been restricted yet, so it can use everything/)).toBeTruthy();
    expect(screen.getByText('KISAN · ACTIVE · 5 of 5 features on')).toBeTruthy();
  });

  test('turn one feature off, see the count, save: the whole list goes with one Idempotency-Key', async () => {
    serve(true, ['sales.invoice.create', 'sales.invoice.cancel', 'inventory.stock.view']);
    mockPut.mockResolvedValue({ restricted: true, allowed: [] });
    await open();
    expect(screen.queryByText('Not restricted yet: everything is on')).toBeNull();
    expect(checked('Sales and billing: Invoice cancel')).toBe(true);
    await press('Sales and billing: Invoice cancel');
    expect(checked('Sales and billing: Invoice cancel')).toBe(false);
    expect(screen.getByText('0 turned on, 1 turned off, not saved yet')).toBeTruthy();
    expect(mockPut).not.toHaveBeenCalled();
    await press('Save access');
    await waitFor(() => expect(mockPut).toHaveBeenCalledTimes(1));
    const [path, o] = mockPut.mock.calls[0] as [
      string,
      { body: { permissions: string[] }; idempotencyKey: string },
    ];
    expect(path).toBe('/platform/franchises/f1/access');
    expect(o.body.permissions).toEqual(['inventory.stock.view', 'sales.invoice.create']);
    expect(o.idempotencyKey).toBe('key-1');
  });

  test('the switch of a whole page turns all its features off; Discard puts everything back', async () => {
    serve(true, ['sales.invoice.create', 'sales.invoice.cancel', 'inventory.stock.view']);
    await open();
    await press('Turn every Sales and billing feature on or off');
    expect(screen.getByText('0 turned on, 2 turned off, not saved yet')).toBeTruthy();
    await press('Discard');
    expect(screen.queryByText(/not saved yet/)).toBeNull();
    expect(checked('Sales and billing: Invoice create')).toBe(true);
  });

  test('another menu shows its own pages; the search and the Off filter narrow the list', async () => {
    serve(true, ['sales.invoice.create']);
    await open();
    await fireEvent.changeText(screen.getByLabelText('Search features'), 'stock');
    expect(await screen.findByLabelText('Inventory: Stock view')).toBeTruthy();
    expect(screen.queryByLabelText('Sales and billing: Invoice create')).toBeNull();
    await fireEvent.changeText(screen.getByLabelText('Search features'), '');
    await press('On');
    expect(screen.queryByLabelText('Inventory: Stock view')).toBeNull();
    expect(screen.getByLabelText('Sales and billing: Invoice create')).toBeTruthy();
    await press('Staff & payroll 0/1');
    await press('Off');
    expect(await screen.findByLabelText('Staff and payroll: Employee manage')).toBeTruthy();
  });

  test('a refused save shows the reference and keeps the change', async () => {
    serve(true, ['sales.invoice.create', 'sales.invoice.cancel', 'inventory.stock.view']);
    mockPut.mockRejectedValue(new ApiError(500, { title: 'BOOM', correlationId: 'corr-ac' }));
    await open();
    await press('Sales and billing: Invoice cancel');
    await press('Save access');
    expect(await screen.findByText(/corr-ac/)).toBeTruthy();
    expect(screen.getByText('0 turned on, 1 turned off, not saved yet')).toBeTruthy();
  });

  test('refused for a franchise user: nothing is asked from the server', async () => {
    mockMe = { userId: 'u-1', roles: ['owner'] };
    await render(<FranchiseAccessScreen />, { wrapper });
    expect(screen.getByText('You do not have access to this screen.')).toBeTruthy();
    expect(mockGet).not.toHaveBeenCalled();
  });
});

describe('Access control for one person (phase 35)', () => {
  const person = {
    id: 'u-2',
    username: 'ramesh',
    fullName: 'Ramesh Patil',
    mobile: '9800000000',
    status: 'ACTIVE',
  };
  const access = (o: Partial<UserAccess> = {}): UserAccess => ({
    userId: 'u-2',
    username: 'ramesh',
    fullName: 'Ramesh Patil',
    status: 'ACTIVE',
    roles: [{ name: 'Cashier' }],
    fullAccess: false,
    effective: ['sales.invoice.create', 'inventory.stock.view'],
    granted: ['inventory.stock.view'],
    denied: ['sales.invoice.cancel'],
    fromRole: ['sales.invoice.create', 'sales.invoice.cancel'],
    ...o,
  });
  const serve = (s: UserAccess) =>
    mockGet.mockImplementation(async (p: string) => {
      if (p === '/users') return { items: [person], next_cursor: null };
      if (p === '/permissions') return { items: CAT };
      if (p === '/users/u-2/access') return s;
      throw new Error(`unexpected ${p}`);
    });
  const open = async () => {
    await render(<UserAccessScreen />, { wrapper });
    await press('Choose Ramesh Patil');
    await screen.findByText('ramesh · Cashier · 2 of 5 features on');
  };
  beforeEach(() => {
    mockMe = { userId: 'u-1', roles: [], permissions: ['identity.user.manage', ...CAT.map((p) => p.code)] };
  });

  test('the people are read newest first; each feature says where it comes from', async () => {
    serve(access());
    await open();
    const call = mockGet.mock.calls.find((c) => c[0] === '/users')!;
    expect(call[1].query).toMatchObject({ limit: 200, order: 'newest' });
    expect(screen.getByText('People (1)')).toBeTruthy();
    expect(screen.getByText('Create invoices · From the role')).toBeTruthy();
    expect(screen.getByText('See stock · Extra for this person')).toBeTruthy();
    expect(screen.getByText('Cancel an invoice · Taken away for this person')).toBeTruthy();
  });

  test('save sends the permissions of this person to PUT /users/:id/access with one key', async () => {
    serve(access());
    mockPut.mockResolvedValue(access());
    await open();
    await press('Sales and billing: Invoice cancel');
    await press('Save access');
    await waitFor(() => expect(mockPut).toHaveBeenCalledTimes(1));
    const [path, o] = mockPut.mock.calls[0] as [
      string,
      { body: { permissions: string[] }; idempotencyKey: string },
    ];
    expect(path).toBe('/users/u-2/access');
    expect(o.body.permissions).toEqual([
      'inventory.stock.view',
      'sales.invoice.cancel',
      'sales.invoice.create',
    ]);
    expect(o.idempotencyKey).toBe('key-1');
  });

  test('a Franchise Admin has full access: every switch is locked and says why', async () => {
    serve(access({ fullAccess: true, effective: CAT.map((p) => p.code) }));
    await render(<UserAccessScreen />, { wrapper });
    await press('Choose Ramesh Patil');
    expect(await screen.findByText('Full access (Franchise Admin)')).toBeTruthy();
    expect(screen.getByLabelText('Sales and billing: Invoice cancel').props.accessibilityState.disabled).toBe(
      true,
    );
    expect(screen.getAllByText(/A Franchise Admin has full access/).length).toBeGreaterThan(0);
  });

  test('a permission the changer does not hold cannot be given', async () => {
    mockMe = { userId: 'u-1', roles: [], permissions: ['identity.user.manage', 'sales.invoice.create'] };
    serve(access());
    await open();
    expect(screen.getByLabelText('Sales and billing: Invoice cancel').props.accessibilityState.disabled).toBe(
      true,
    );
    expect(screen.getByText(/you cannot give it to someone else/)).toBeTruthy();
    expect(screen.getByLabelText('Sales and billing: Invoice create').props.accessibilityState.disabled).toBe(
      false,
    );
  });

  test('without identity.user.manage nothing is asked', async () => {
    mockMe = { userId: 'u-1', roles: [], permissions: ['sales.invoice.create'] };
    await render(<UserAccessScreen />, { wrapper });
    expect(screen.getByText('You do not have permission to change who can use what.')).toBeTruthy();
    expect(mockGet).not.toHaveBeenCalled();
  });
});

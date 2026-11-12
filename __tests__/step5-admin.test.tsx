import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '../src/api/errors';
import { i18n, setLanguage } from '../src/i18n';
import parts from '../i18n-parts/step5.json';
import UsersScreen from '../src/features/admin/UsersScreen';
import RolesScreen from '../src/features/admin/RolesScreen';
import AuditScreen from '../src/features/admin/AuditScreen';
import DocumentsScreen from '../src/features/admin/DocumentsScreen';
import SettingsScreen from '../src/features/admin/SettingsScreen';
import { auditRange, fmtWhen, formatBytes, maskTail, validAction, validActor, validDate, validReason } from '../src/features/admin/logic';

const mockGet = jest.fn();
const mockPost = jest.fn();
let mockMe: { userId: string; roles: string[]; permissions?: string[] };
let mockId = 0;
const mockClient = { get: (...a: unknown[]) => mockGet(...a), post: (...a: unknown[]) => mockPost(...a) };
jest.mock('../src/auth/AuthProvider', () => ({
  useAuth: () => ({ status: 'signedIn', me: mockMe, client: mockClient, signIn: jest.fn(), signOut: jest.fn() }),
}));
jest.mock('../src/device', () => ({ newId: () => `key-${++mockId}` }));

let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
const user = { id: 'u-2', username: 'ramesh', fullName: 'Ramesh Patil', mobile: '9876543210', email: 'r@example.com', status: 'ACTIVE', allBranches: false, defaultBranchId: null, roleIds: ['r-1'], branchIds: ['b-1'], version: 3, createdAt: '2026-10-01T04:00:00Z' };
const role = { id: 'r-1', name: 'Counter staff', isSystem: false, systemKey: null, version: 1, permissions: ['sales.invoice.create', 'sales.invoice.view'], assignedUsers: 4, limits: { line_discount_pct: '5' } };
const doc = { id: 'doc-1', title: 'Fertiliser licence', category: 'LICENCE', expiresOn: '2027-03-31', notes: null, active: true, status: 'ACTIVE', currentVersion: 2, filename: 'lic.pdf', contentType: 'application/pdf', sizeBytes: 2048, uploadedAt: '2026-10-01T04:00:00Z', updatedAt: '2026-10-01T04:00:00Z' };
const event = { id: 'e-1', at: '2026-11-10T08:30:00Z', actorId: 'a-1', actorName: 'Asha Kulkarni', actorUsername: 'asha', action: 'identity.user.unlock', targetType: 'identity.user', targetId: '12345678-aaaa', outcome: 'SUCCESS', correlationId: 'corr-1' };

beforeAll(() => {
  for (const l of ['en', 'hi', 'mr'] as const) i18n.addResourceBundle(l, 'translation', parts[l], true, true);
});
beforeEach(async () => {
  [mockGet, mockPost].forEach((m) => m.mockReset());
  mockId = 0;
  mockMe = { userId: 'u-1', roles: [], permissions: undefined };
  client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retryDelay: 0 } } });
  await setLanguage('en');
});
const lastQuery = (path: string) => mockGet.mock.calls.filter((c) => c[0] === path).at(-1)![1].query;

describe('logic', () => {
  test('reason length, masking, dates and the audit day range', () => {
    expect(validReason('too short')).toBe(false);
    expect(validReason('left the company')).toBe(true);
    expect(maskTail('123456789012')).toBe('XXXX9012');
    expect(maskTail('12')).toBe('XXXX');
    expect(validDate('2026-02-30')).toBe(false);
    expect(validDate('2026-11-11')).toBe(true);
    expect(auditRange('2026-11-10', '2026-11-11')).toEqual({ from: '2026-11-10T00:00:00+05:30', to: '2026-11-12T00:00:00+05:30' });
    expect(validAction('identity.user.unlock')).toBe(true);
    expect(validAction('Bad Action')).toBe(false);
    expect(validActor('not-a-uuid')).toBe(false);
    expect(formatBytes(2048)).toBe('2 KB');
    expect(fmtWhen('2026-11-10T20:00:00Z')).toBe('11/11/2026 01:30');
  });
});

describe('users screen', () => {
  const show = () => render(<UsersScreen />, { wrapper });
  beforeEach(() => {
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/users') return { items: [user], next_cursor: null };
      if (path === '/roles') return { items: [role] };
      throw new Error(`unexpected ${path}`);
    });
  });

  test('lists users, then details show role names and the mobile', async () => {
    await show();
    expect(await screen.findByText('Ramesh Patil')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Show details'));
    expect(await screen.findByText('Roles: Counter staff')).toBeTruthy();
    expect(screen.getByText('Mobile: 9876543210')).toBeTruthy();
  });

  test('loading state', async () => {
    mockGet.mockImplementation(() => new Promise(() => undefined));
    await show();
    expect(await screen.findByTestId('state-loading')).toBeTruthy();
  });

  test('empty state', async () => {
    mockGet.mockImplementation(async (p: string) => (p === '/users' ? { items: [], next_cursor: null } : { items: [] }));
    await show();
    expect(await screen.findByText('No users match.')).toBeTruthy();
  });

  test('offline state', async () => {
    mockGet.mockRejectedValue(new ApiError(0, null));
    await show();
    expect(await screen.findByText('No network. Check your connection and try again.', {}, { timeout: 3000 })).toBeTruthy();
  });

  test('error state shows the reference', async () => {
    mockGet.mockRejectedValue(new ApiError(500, { title: 'BOOM', correlationId: 'c-1' }));
    await show();
    expect(await screen.findByText(/Code BOOM, reference c-1/)).toBeTruthy();
  });

  test('permission denied: nothing is called', async () => {
    mockMe = { userId: 'u-1', roles: [], permissions: ['sales.invoice.view'] };
    await show();
    expect(await screen.findByText('You do not have permission to see users.')).toBeTruthy();
    expect(mockGet).not.toHaveBeenCalled();
  });

  test('without the role permission the roles are not requested and only a count shows', async () => {
    mockMe = { userId: 'u-1', roles: [], permissions: ['identity.user.manage'] };
    await show();
    await screen.findByText('Ramesh Patil');
    await fireEvent.press(screen.getByLabelText('Show details'));
    expect(await screen.findByText('Roles: 1')).toBeTruthy();
    expect(mockGet.mock.calls.some((c) => c[0] === '/roles')).toBe(false);
  });

  test('search and status filter go to the server', async () => {
    await show();
    await screen.findByText('Ramesh Patil');
    await fireEvent.changeText(screen.getByLabelText('Search name, username or mobile'), 'ram');
    await fireEvent.press(screen.getByLabelText('Search'));
    await fireEvent.press(screen.getByLabelText('Deactivated'));
    await screen.findByText('Ramesh Patil');
    expect(lastQuery('/users')).toMatchObject({ q: 'ram', status: 'DEACTIVATED', limit: 50 });
  });

  test('deactivate needs a 10+ character reason; lost answer retries with the SAME key; a changed reason gets a NEW key', async () => {
    let first = true;
    mockPost.mockImplementation(async () => {
      if (first) {
        first = false;
        throw new ApiError(0, null);
      }
      return { ...user, status: 'DEACTIVATED' };
    });
    await show();
    await screen.findByText('Ramesh Patil');
    await fireEvent.press(screen.getByLabelText('Show details'));
    const reason = await screen.findByLabelText('Reason (10 to 500 characters)');
    await fireEvent.changeText(reason, 'short');
    await fireEvent.press(screen.getByLabelText('Deactivate'));
    expect(mockPost).not.toHaveBeenCalled();
    await fireEvent.changeText(reason, 'left the company');
    await fireEvent.press(screen.getByLabelText('Deactivate'));
    await screen.findByText(/No network/);
    await fireEvent.press(screen.getByLabelText('Deactivate'));
    expect(await screen.findByText('User deactivated.')).toBeTruthy();
    expect(mockPost.mock.calls.map((c) => c[1].idempotencyKey)).toEqual(['key-1', 'key-1']);
    expect(mockPost.mock.calls[0]![0]).toBe('/users/u-2:deactivate');
    expect(mockPost.mock.calls[0]![1].body).toEqual({ reason: 'left the company' });

    // a different reason after a failure is a different action
    mockPost.mockReset();
    mockPost.mockRejectedValue(new ApiError(0, null));
    await fireEvent.changeText(screen.getByLabelText('Reason (10 to 500 characters)'), 'reason number one');
    await fireEvent.press(screen.getByLabelText('Deactivate'));
    await screen.findByText(/No network/);
    await fireEvent.changeText(screen.getByLabelText('Reason (10 to 500 characters)'), 'reason number two');
    await fireEvent.press(screen.getByLabelText('Deactivate'));
    await screen.findByText(/No network/);
    const keys = mockPost.mock.calls.map((c) => c[1].idempotencyKey);
    expect(keys[0]).not.toBe(keys[1]);
  });

  test('a deactivated user shows Activate again (no reason box) and posts reactivate with a key', async () => {
    mockGet.mockImplementation(async (path: string) =>
      path === '/users' ? { items: [{ ...user, status: 'DEACTIVATED' }], next_cursor: null } : { items: [role] },
    );
    mockPost.mockResolvedValue({ ...user });
    await show();
    await screen.findByText('Ramesh Patil');
    await fireEvent.press(screen.getByLabelText('Show details'));
    expect(screen.queryByLabelText('Reason (10 to 500 characters)')).toBeNull();
    await fireEvent.press(await screen.findByLabelText('Activate again'));
    expect(await screen.findByText('User is active again.')).toBeTruthy();
    expect(mockPost.mock.calls[0]![0]).toBe('/users/u-2:reactivate');
    expect(mockPost.mock.calls[0]![1].idempotencyKey).toBe('key-1');
  });

  test('the server asking for a fresh sign-in is shown as a plain message', async () => {
    mockPost.mockRejectedValue(new ApiError(403, { title: 'FRESH_AUTH_REQUIRED' }));
    await show();
    await screen.findByText('Ramesh Patil');
    await fireEvent.press(screen.getByLabelText('Show details'));
    await fireEvent.changeText(await screen.findByLabelText('Reason (10 to 500 characters)'), 'left the company');
    await fireEvent.press(screen.getByLabelText('Deactivate'));
    expect(await screen.findByText('Please enter your password again to continue.')).toBeTruthy();
  });

  test('Load more asks for the next cursor', async () => {
    mockGet.mockImplementation(async (path: string, o?: { query?: { cursor?: string } }) => {
      if (path === '/roles') return { items: [role] };
      return o?.query?.cursor ? { items: [{ ...user, id: 'u-3', fullName: 'Sita More' }], next_cursor: null } : { items: [user], next_cursor: 'c2' };
    });
    await show();
    await screen.findByText('Ramesh Patil');
    await fireEvent.press(screen.getByLabelText('Load more'));
    expect(await screen.findByText('Sita More')).toBeTruthy();
  });
});

describe('roles screen', () => {
  const show = () => render(<RolesScreen />, { wrapper });
  test('lists roles and shows grouped permissions and limits', async () => {
    mockGet.mockResolvedValue({ items: [role] });
    await show();
    expect(await screen.findByText('Counter staff')).toBeTruthy();
    expect(screen.getByText('4 users · 2 permissions')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Show permissions'));
    expect(await screen.findByText('sales: invoice.create, invoice.view')).toBeTruthy();
    expect(screen.getByText('line_discount_pct: 5')).toBeTruthy();
  });
  test('denied: nothing is called', async () => {
    mockMe = { userId: 'u-1', roles: [], permissions: [] };
    await show();
    expect(await screen.findByText('You do not have permission to see roles.')).toBeTruthy();
    expect(mockGet).not.toHaveBeenCalled();
  });
  test('empty', async () => {
    mockGet.mockResolvedValue({ items: [] });
    await show();
    expect(await screen.findByText('No roles.')).toBeTruthy();
  });
  test('offline', async () => {
    mockGet.mockRejectedValue(new ApiError(0, null));
    await show();
    expect(await screen.findByText('No network. Check your connection and try again.', {}, { timeout: 3000 })).toBeTruthy();
  });
});

describe('audit screen', () => {
  const show = () => render(<AuditScreen />, { wrapper });
  test('lists events with who, what, when; the filters are sent when applied', async () => {
    mockGet.mockResolvedValue({ items: [event], next_cursor: null });
    await show();
    expect(await screen.findByText('identity.user.unlock')).toBeTruthy();
    expect(screen.getByText('By Asha Kulkarni')).toBeTruthy();
    expect(screen.getByText('Request id: corr-1')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Action, for example identity.user.unlock'), 'identity.user.unlock');
    await fireEvent.changeText(screen.getByLabelText('From date (YYYY-MM-DD)'), '2026-11-10');
    await fireEvent.changeText(screen.getByLabelText('To date (YYYY-MM-DD)'), '2026-11-11');
    await fireEvent.press(screen.getByLabelText('Apply filters'));
    await screen.findByText('identity.user.unlock');
    expect(lastQuery('/audit')).toMatchObject({
      action: 'identity.user.unlock',
      from: '2026-11-10T00:00:00+05:30',
      to: '2026-11-12T00:00:00+05:30',
      limit: 50,
    });
  });
  test('a wrong filter is explained and Apply is blocked', async () => {
    mockGet.mockResolvedValue({ items: [], next_cursor: null });
    await show();
    await screen.findByText('No events match.');
    const calls = mockGet.mock.calls.length;
    await fireEvent.changeText(screen.getByLabelText('From date (YYYY-MM-DD)'), '11/11/2026');
    expect(await screen.findByText('Use the date format YYYY-MM-DD.')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Apply filters'));
    expect(mockGet.mock.calls.length).toBe(calls);
  });
  test('denied (needs the security permission): nothing is called', async () => {
    mockMe = { userId: 'u-1', roles: [], permissions: ['identity.user.manage'] };
    await show();
    expect(await screen.findByText('You do not have permission to see the audit trail.')).toBeTruthy();
    expect(mockGet).not.toHaveBeenCalled();
  });
  test('offline', async () => {
    mockGet.mockRejectedValue(new ApiError(0, null));
    await show();
    expect(await screen.findByText('No network. Check your connection and try again.', {}, { timeout: 3000 })).toBeTruthy();
  });
  test('error', async () => {
    mockGet.mockRejectedValue(new ApiError(500, { title: 'BOOM', correlationId: 'c-2' }));
    await show();
    expect(await screen.findByText(/Code BOOM, reference c-2/)).toBeTruthy();
  });
  test('the audit screen never sends a write', async () => {
    mockGet.mockResolvedValue({ items: [event], next_cursor: null });
    await show();
    await screen.findByText('identity.user.unlock');
    expect(mockPost).not.toHaveBeenCalled();
  });
});

describe('documents screen', () => {
  const show = () => render(<DocumentsScreen />, { wrapper });
  beforeEach(() => {
    mockGet.mockResolvedValue({ items: [doc], next_cursor: null });
  });
  test('lists documents with category, status, size and expiry', async () => {
    await show();
    expect(await screen.findByText('Fertiliser licence')).toBeTruthy();
    expect(screen.getByText('Licence · Active')).toBeTruthy();
    expect(screen.getByText('lic.pdf · 2 KB · version 2')).toBeTruthy();
    expect(screen.getByText('Expires 2027-03-31')).toBeTruthy();
  });
  test('filters go to the server', async () => {
    await show();
    await screen.findByText('Fertiliser licence');
    await fireEvent.press(screen.getByLabelText('Expired'));
    await fireEvent.press(screen.getByLabelText('Contract'));
    await screen.findByText('Fertiliser licence');
    expect(lastQuery('/documents')).toMatchObject({ status: 'EXPIRED', category: 'CONTRACT' });
  });
  test('deactivate button is hidden without the manage permission and no call is made', async () => {
    mockMe = { userId: 'u-1', roles: [], permissions: ['org.document.view'] };
    await show();
    await screen.findByText('Fertiliser licence');
    expect(screen.queryByLabelText('Deactivate')).toBeNull();
    expect(mockPost).not.toHaveBeenCalled();
  });
  test('deactivate: lost answer retries with the SAME key', async () => {
    let first = true;
    mockPost.mockImplementation(async () => {
      if (first) {
        first = false;
        throw new ApiError(0, null);
      }
      return { ...doc, active: false };
    });
    await show();
    await fireEvent.press(await screen.findByLabelText('Deactivate'));
    await screen.findByText(/No network/);
    await fireEvent.press(screen.getByLabelText('Deactivate'));
    expect(await screen.findByText('Document deactivated.')).toBeTruthy();
    expect(mockPost.mock.calls.map((c) => c[1].idempotencyKey)).toEqual(['key-1', 'key-1']);
    expect(mockPost.mock.calls[0]![0]).toBe('/documents/doc-1:deactivate');
  });
  test('an inactive document offers Restore (a different action, a new key)', async () => {
    mockGet.mockResolvedValue({ items: [{ ...doc, active: false, status: 'INACTIVE' }], next_cursor: null });
    mockPost.mockResolvedValue({ ...doc });
    await show();
    await fireEvent.press(await screen.findByLabelText('Restore'));
    expect(await screen.findByText('Document restored.')).toBeTruthy();
    expect(mockPost.mock.calls[0]![0]).toBe('/documents/doc-1:restore');
  });
  test('denied: nothing is called', async () => {
    mockMe = { userId: 'u-1', roles: [], permissions: [] };
    await show();
    expect(await screen.findByText('You do not have permission to see documents.')).toBeTruthy();
    expect(mockGet).not.toHaveBeenCalled();
  });
  test('empty', async () => {
    mockGet.mockResolvedValue({ items: [], next_cursor: null });
    await show();
    expect(await screen.findByText('No documents match.')).toBeTruthy();
  });
  test('offline', async () => {
    mockGet.mockRejectedValue(new ApiError(0, null));
    await show();
    expect(await screen.findByText('No network. Check your connection and try again.', {}, { timeout: 3000 })).toBeTruthy();
  });
});

describe('settings screen', () => {
  const show = () => render(<SettingsScreen />, { wrapper });
  const company = { legalName: 'Green Agro Pvt Ltd', tradeName: 'Green Agro', gstin: '27AAAAA0000A1Z5', pan: 'AAAAA0000A', stateCode: '27', address: 'Pune', contactPhone: '020123', contactEmail: 'a@b.in', bankName: 'SBI', bankAccountHolder: 'Green', bankAccountNumber: '123456789012', bankIfsc: 'SBIN0001', signatoryName: null, signatoryDesignation: null, version: 1 };
  beforeEach(() => {
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/settings/company') return company;
      if (path === '/branches') return { items: [{ id: 'b-1', code: 'PUNE', name: 'Pune store', address: null, gstin: null, isHeadOffice: true, status: 'ACTIVE' }] };
      if (path === '/settings/payment-modes') return { items: [{ code: 'CASH', enabled: true }, { code: 'UPI', enabled: false }] };
      if (path === '/settings/general') return { settings: { allow_negative_stock: { value: false, default: false, description: 'Allow negative stock', customised: false } }, costingMethod: { effective: 'WEIGHTED_AVERAGE' } };
      throw new Error(`unexpected ${path}`);
    });
  });
  test('shows company, branches, modes and rules; the bank account number is masked', async () => {
    await show();
    expect(await screen.findByText('Green Agro')).toBeTruthy();
    expect(screen.getByText('Account number: XXXX9012')).toBeTruthy();
    expect(screen.queryByText(/123456789012/)).toBeNull();
    expect(await screen.findByText('Pune store (PUNE)')).toBeTruthy();
    expect(screen.getByText('CASH: on')).toBeTruthy();
    expect(screen.getByText('UPI: off')).toBeTruthy();
    expect(screen.getByText('Allow negative stock: false (default)')).toBeTruthy();
    expect(screen.getByText(/Changing settings is not in this app/)).toBeTruthy();
  });
  test('with only the config permission the company is not requested', async () => {
    mockMe = { userId: 'u-1', roles: [], permissions: ['org.config.view'] };
    await show();
    await screen.findByText('Pune store (PUNE)');
    expect(mockGet.mock.calls.some((c) => c[0] === '/settings/company')).toBe(false);
    expect(screen.queryByText('Company')).toBeNull();
  });
  test('denied: nothing is called', async () => {
    mockMe = { userId: 'u-1', roles: [], permissions: [] };
    await show();
    expect(await screen.findByText('You do not have permission to see settings.')).toBeTruthy();
    expect(mockGet).not.toHaveBeenCalled();
  });
  test('one failing part leaves the others', async () => {
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/branches') throw new ApiError(500, { title: 'BOOM' });
      if (path === '/settings/company') return company;
      return { items: [], settings: {}, costingMethod: { effective: 'FIFO' } };
    });
    await show();
    expect(await screen.findByText('This part could not be loaded.')).toBeTruthy();
    expect(screen.getByText('Green Agro')).toBeTruthy();
  });
  test('offline', async () => {
    mockGet.mockRejectedValue(new ApiError(0, null));
    await show();
    expect(await screen.findByText('No network. Check your connection and try again.', {}, { timeout: 3000 })).toBeTruthy();
  });
  test('loading state', async () => {
    mockGet.mockImplementation(() => new Promise(() => undefined));
    await show();
    expect(await screen.findByTestId('state-loading')).toBeTruthy();
  });
});

import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '../src/api/errors';
import { i18n, setLanguage } from '../src/i18n';
import parts from '../i18n-parts/cus.json';
import ToolsScreen from '../src/features/customers/ToolsScreen';

const mockGet = jest.fn();
const mockPost = jest.fn();
let mockMe: { userId: string; tenantId: string; roles: string[]; permissions?: string[] };
let mockId = 0;
const mockClient = { get: (...a: unknown[]) => mockGet(...a), post: (...a: unknown[]) => mockPost(...a) };
jest.mock('expo-router', () => ({ Stack: { Screen: () => null } }));
jest.mock('../src/auth/AuthProvider', () => ({
  useAuth: () => ({ status: 'signedIn', me: mockMe, client: mockClient }),
}));
jest.mock('../src/device', () => ({ newId: () => `key-${++mockId}` }));

let qc: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={qc}>{children}</QueryClientProvider>
);
const ALL = ['customer.view', 'customer.merge', 'customer.segment', 'customer.group', 'customer.import'];
const dup = {
  customers: [
    { id: 'a1', code: 'CUS-1', name: 'Ramesh Patil', mobile: '9876543210' },
    { id: 'a2', code: 'CUS-2', name: 'Ramesh Patel', mobile: '9876543211' },
  ],
  reason: 'same village and similar name',
  score: 0.87,
};

beforeAll(() => {
  for (const l of ['en', 'hi', 'mr'] as const) i18n.addResourceBundle(l, 'translation', parts[l], true, true);
});
beforeEach(async () => {
  [mockGet, mockPost].forEach((m) => m.mockReset());
  mockId = 0;
  mockMe = { userId: 'u1', tenantId: 't1', roles: [], permissions: ALL };
  qc = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retryDelay: 0 } } });
  await setLanguage('en');
  mockGet.mockImplementation(async (path: string) => {
    if (path === '/customers/duplicates') return { items: [dup] };
    if (path === '/customers/merges')
      return {
        items: [
          {
            id: 'm1',
            mergedAt: '2026-11-01T05:00:00Z',
            survivorCode: 'CUS-9',
            mergedCode: 'CUS-8',
            status: 'MERGED',
          },
        ],
      };
    if (path === '/customer-segments')
      return {
        items: [
          {
            id: 's1',
            name: 'Cotton farmers',
            status: 'ACTIVE',
            rules: [{ field: 'crop', op: 'eq', value: 'Cotton' }],
          },
        ],
      };
    if (path === '/customer-segments/s1/preview')
      return { count: 3, belowMinimumCohort: true, minimumCohort: 5 };
    if (path === '/customer-segments/cohorts')
      return {
        minimumCohort: 5,
        items: [
          { cohort: '2026-05', hidden: false, size: 10, counts: [10, 5, 2] },
          { cohort: '2026-06', hidden: true, counts: [] },
        ],
      };
    if (path === '/customer-groups')
      return {
        items: [
          { id: 'g1', code: 'GRP-1', name: 'Shirur FPO', kind: 'FPO', memberCount: 2, status: 'ACTIVE' },
        ],
      };
    if (path === '/customer-groups/g1')
      return {
        id: 'g1',
        members: [
          { customerId: 'a1', name: 'Ramesh Patil', role: 'LEADER' },
          { customerId: 'a3', name: 'Sunita Jadhav', role: 'MEMBER' },
        ],
      };
    if (path === '/customers')
      return {
        items: [
          {
            id: 'a5',
            code: 'CUS-5',
            name: 'Meena Shinde',
            mobile: null,
            village: null,
            categoryName: null,
            status: 'ACTIVE',
            creditHold: false,
          },
        ],
      };
    if (path === '/customers/import-jobs')
      return {
        items: [
          {
            id: 'j1',
            createdAt: '2026-10-01T05:00:00Z',
            filename: 'old.csv',
            totalRows: 20,
            status: 'COMMITTED',
            result: { created: 18, skipped: 2 },
          },
        ],
      };
    if (path === '/branches') return { items: [{ id: 'b1', name: 'Main shop' }] };
    if (path === '/customers/import/template') return 'name,mobile,village\n';
    return {};
  });
});
const tab = async (name: string) => {
  await fireEvent.press(screen.getByLabelText(name));
};

describe('duplicates and merge', () => {
  test('lists the duplicate pair with the reason and a merge history', async () => {
    await render(<ToolsScreen />, { wrapper });
    expect(await screen.findByText('CUS-1 Ramesh Patil 9876543210')).toBeTruthy();
    expect(screen.getByText('same village and similar name (87%)')).toBeTruthy();
    expect(await screen.findByText('Kept CUS-9, merged CUS-8')).toBeTruthy();
  });

  test('merge needs a record to keep and a reason, then posts survivor and merged ids with one key', async () => {
    mockPost.mockRejectedValueOnce(new ApiError(0, null)).mockResolvedValue({});
    await render(<ToolsScreen />, { wrapper });
    await screen.findByText('CUS-1 Ramesh Patil 9876543210');
    await fireEvent.press(screen.getAllByLabelText('Merge')[0]!);
    await fireEvent.press(screen.getAllByLabelText('Merge')[1]!);
    expect(await screen.findByText('Choose which record to keep.')).toBeTruthy();
    expect(mockPost).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText('CUS-1 Ramesh Patil'));
    await fireEvent.changeText(screen.getByLabelText('Reason'), 'same person');
    await fireEvent.press(screen.getAllByLabelText('Merge')[1]!);
    await screen.findByText(/No network/);
    await fireEvent.press(screen.getAllByLabelText('Merge')[1]!);
    await screen.findByText('Merged.');
    expect(mockPost).toHaveBeenCalledTimes(2);
    expect(mockPost.mock.calls[0]![0]).toBe('/customers/merge');
    expect(mockPost.mock.calls[0]![1].body).toEqual({
      survivorId: 'a1',
      mergedId: 'a2',
      reason: 'same person',
    });
    expect(mockPost.mock.calls[0]![1].idempotencyKey).toBe(mockPost.mock.calls[1]![1].idempotencyKey);
  });

  test('undo asks first, then posts the undo', async () => {
    mockPost.mockResolvedValue({});
    await render(<ToolsScreen />, { wrapper });
    await screen.findByText('Kept CUS-9, merged CUS-8');
    await fireEvent.press(screen.getByLabelText('Undo merge'));
    expect(mockPost).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText('Yes, do it'));
    await waitFor(() => expect(mockPost).toHaveBeenCalled());
    expect(mockPost.mock.calls[0]![0]).toBe('/customers/merges/m1:undo');
  });

  test('without customer.merge the merge buttons and history are hidden', async () => {
    mockMe.permissions = ['customer.view'];
    await render(<ToolsScreen />, { wrapper });
    await screen.findByText('CUS-1 Ramesh Patil 9876543210');
    expect(screen.queryByLabelText('Merge')).toBeNull();
    expect(mockGet).not.toHaveBeenCalledWith('/customers/merges', expect.anything());
  });
});

describe('segments and retention', () => {
  test('lists a segment and counts it, hiding the exact figure behind the privacy note when small', async () => {
    await render(<ToolsScreen />, { wrapper });
    await screen.findByText('CUS-1 Ramesh Patil 9876543210');
    await tab('Segments');
    expect(await screen.findByText('Cotton farmers')).toBeTruthy();
    expect(screen.getByText('Crop is Cotton')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Count customers'));
    expect(await screen.findByText('3 customers (too few to show details)')).toBeTruthy();
  });

  test('new segment posts a rule built from the field, operator and value', async () => {
    mockPost.mockResolvedValue({});
    await render(<ToolsScreen />, { wrapper });
    await screen.findByText('CUS-1 Ramesh Patil 9876543210');
    await tab('Segments');
    await screen.findByText('Cotton farmers');
    await fireEvent.press(screen.getByLabelText('New segment'));
    await fireEvent.press(screen.getByLabelText('Land (acres)'));
    await fireEvent.press(screen.getByLabelText('more than'));
    await fireEvent.changeText(screen.getByLabelText('Segment name'), 'Big farms');
    await fireEvent.changeText(screen.getByLabelText(/^Value/), '2.5');
    await fireEvent.press(screen.getAllByLabelText('Save')[0]!);
    await waitFor(() => expect(mockPost).toHaveBeenCalled());
    expect(mockPost.mock.calls[0]![0]).toBe('/customer-segments');
    expect(mockPost.mock.calls[0]![1].body).toEqual({
      name: 'Big farms',
      rules: [{ field: 'landAcres', op: 'gt', value: 2.5 }],
    });
  });

  test('a value that does not fit is stopped before any call', async () => {
    await render(<ToolsScreen />, { wrapper });
    await screen.findByText('CUS-1 Ramesh Patil 9876543210');
    await tab('Segments');
    await screen.findByText('Cotton farmers');
    await fireEvent.press(screen.getByLabelText('New segment'));
    await fireEvent.press(screen.getByLabelText('Season'));
    await fireEvent.changeText(screen.getByLabelText('Segment name'), 'Winter');
    await fireEvent.changeText(screen.getByLabelText(/^Value/), 'winter');
    await fireEvent.press(screen.getAllByLabelText('Save')[0]!);
    expect(await screen.findByText('This value does not fit the field.')).toBeTruthy();
    expect(mockPost).not.toHaveBeenCalled();
  });

  test('retention shows percentages and hides small cohorts', async () => {
    await render(<ToolsScreen />, { wrapper });
    await screen.findByText('CUS-1 Ramesh Patil 9876543210');
    await tab('Retention');
    expect(await screen.findByText('+1: 50%   +2: 20%')).toBeTruthy();
    expect(screen.getByText('Too few customers to show.')).toBeTruthy();
  });
});

describe('groups', () => {
  test('lists groups; members can be removed except the leader', async () => {
    mockPost.mockResolvedValue({});
    await render(<ToolsScreen />, { wrapper });
    await screen.findByText('CUS-1 Ramesh Patil 9876543210');
    await tab('Groups');
    expect(await screen.findByText('GRP-1 Shirur FPO')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Members'));
    expect(await screen.findByText('Sunita Jadhav (member)')).toBeTruthy();
    expect(screen.queryByLabelText('Remove Ramesh Patil')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Remove Sunita Jadhav'));
    await waitFor(() => expect(mockPost).toHaveBeenCalled());
    expect(mockPost.mock.calls[0]![0]).toBe('/customer-groups/g1/members');
    expect(mockPost.mock.calls[0]![1].body).toEqual({ add: [], remove: ['a3'] });
  });

  test('add a member by searching for a customer', async () => {
    mockPost.mockResolvedValue({});
    await render(<ToolsScreen />, { wrapper });
    await screen.findByText('CUS-1 Ramesh Patil 9876543210');
    await tab('Groups');
    await screen.findByText('GRP-1 Shirur FPO');
    await fireEvent.press(screen.getByLabelText('Members'));
    await screen.findByText('Sunita Jadhav (member)');
    await fireEvent.changeText(screen.getByLabelText('Add a member (name or mobile)'), 'Meena');
    await fireEvent.press(await screen.findByLabelText('Meena Shinde CUS-5'));
    await waitFor(() => expect(mockPost).toHaveBeenCalled());
    expect(mockPost.mock.calls[0]![1].body).toEqual({ add: [{ customerId: 'a5' }], remove: [] });
  });

  test('new group needs a leader, then posts name, kind and leader', async () => {
    mockPost.mockResolvedValue({});
    await render(<ToolsScreen />, { wrapper });
    await screen.findByText('CUS-1 Ramesh Patil 9876543210');
    await tab('Groups');
    await screen.findByText('GRP-1 Shirur FPO');
    await fireEvent.press(screen.getByLabelText('New group'));
    await fireEvent.changeText(screen.getByLabelText('Group name'), 'Daund SHG');
    await fireEvent.press(screen.getByLabelText('Self-help group'));
    await fireEvent.press(screen.getAllByLabelText('Save')[0]!);
    expect(await screen.findByText('Pick the group leader first.')).toBeTruthy();
    expect(mockPost).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText('Find the leader (name or mobile)'), 'Meena');
    await fireEvent.press(await screen.findByLabelText('Meena Shinde CUS-5'));
    await fireEvent.press(screen.getAllByLabelText('Save')[0]!);
    await waitFor(() => expect(mockPost).toHaveBeenCalled());
    expect(mockPost.mock.calls[0]![1].body).toEqual({
      name: 'Daund SHG',
      kind: 'SHG',
      leaderCustomerId: 'a5',
    });
  });
});

describe('customer import', () => {
  test('checks the file, shows the preview with money from a string, then commits row-wise', async () => {
    mockPost.mockImplementation(async (path: string) => {
      if (path === '/customers/import')
        return {
          jobId: 'job1',
          totalRows: 3,
          validRows: 2,
          duplicateRows: 1,
          errorRows: 0,
          openingTotal: '12500.50',
          errors: [],
        };
      return { result: { created: 2, skipped: 1 } };
    });
    await render(<ToolsScreen />, { wrapper });
    await screen.findByText('CUS-1 Ramesh Patil 9876543210');
    await tab('Import customers');
    await screen.findByText('old.csv');
    await fireEvent.press(await screen.findByLabelText('Main shop'));
    await fireEvent.changeText(screen.getByLabelText('CSV text'), 'name,mobile\nA,9876543210');
    await fireEvent.press(screen.getByLabelText('Check the file'));
    expect(
      await screen.findByText(/2 ready, 1 duplicate \(skipped\), 0 with errors\. Opening dues: ₹12,500\.50/),
    ).toBeTruthy();
    expect(mockPost.mock.calls[0]![1].body).toMatchObject({
      csv: 'name,mobile\nA,9876543210',
      branchId: 'b1',
    });
    await fireEvent.press(screen.getByLabelText('Import'));
    expect(await screen.findByText('2 customers created, 1 skipped.')).toBeTruthy();
    expect(mockPost.mock.calls[1]![0]).toBe('/customers/import/job1/commit');
    expect(mockPost.mock.calls[1]![1].body).toEqual({ mode: 'ROW_WISE' });
  });

  test('needs a branch and text before it calls the server; hidden without customer.import', async () => {
    await render(<ToolsScreen />, { wrapper });
    await screen.findByText('CUS-1 Ramesh Patil 9876543210');
    await tab('Import customers');
    await screen.findByText('old.csv');
    await fireEvent.press(screen.getByLabelText('Check the file'));
    expect(await screen.findByText('Choose a branch and paste the CSV.')).toBeTruthy();
    expect(mockPost).not.toHaveBeenCalled();
  });
});

describe('states', () => {
  test('no permission at all: permission message and no call', async () => {
    mockMe.permissions = ['sales.pos.use'];
    await render(<ToolsScreen />, { wrapper });
    expect(await screen.findByText('You do not have permission to see this.')).toBeTruthy();
    expect(mockGet).not.toHaveBeenCalled();
  });
  test('segment and import tabs are hidden without their permissions', async () => {
    mockMe.permissions = ['customer.view'];
    await render(<ToolsScreen />, { wrapper });
    await screen.findByText('CUS-1 Ramesh Patil 9876543210');
    expect(screen.queryByLabelText('Segments')).toBeNull();
    expect(screen.queryByLabelText('Import customers')).toBeNull();
    expect(screen.getByLabelText('Groups')).toBeTruthy();
  });
  test('error shows the reference code', async () => {
    mockGet.mockRejectedValue(new ApiError(500, { title: 'BOOM', correlationId: 'corr-5' }));
    await render(<ToolsScreen />, { wrapper });
    expect(await screen.findByText(/corr-5/)).toBeTruthy();
  });
  test('offline shows the offline text', async () => {
    mockGet.mockRejectedValue(new ApiError(0, null));
    await render(<ToolsScreen />, { wrapper });
    expect(await screen.findByText('No network. Check your connection and try again.')).toBeTruthy();
  });
  test('empty shows empty', async () => {
    mockGet.mockResolvedValue({ items: [] });
    await render(<ToolsScreen />, { wrapper });
    expect(await screen.findByText('No duplicates found.')).toBeTruthy();
  });
  test('Marathi text', async () => {
    await setLanguage('mr');
    await render(<ToolsScreen />, { wrapper });
    expect(await screen.findByText('संभाव्य डुप्लिकेट')).toBeTruthy();
  });
});

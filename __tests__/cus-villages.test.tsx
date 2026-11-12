import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '../src/api/errors';
import { i18n, setLanguage } from '../src/i18n';
import parts from '../i18n-parts/cus.json';
import VillagesScreen from '../src/features/customers/VillagesScreen';

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockPatch = jest.fn();
const mockPut = jest.fn();
let mockMe: { userId: string; tenantId: string; roles: string[]; permissions?: string[] };
let mockId = 0;
const mockClient = {
  get: (...a: unknown[]) => mockGet(...a),
  post: (...a: unknown[]) => mockPost(...a),
  patch: (...a: unknown[]) => mockPatch(...a),
  put: (...a: unknown[]) => mockPut(...a),
};
jest.mock('expo-router', () => ({ Stack: { Screen: () => null } }));
jest.mock('../src/auth/AuthProvider', () => ({
  useAuth: () => ({ status: 'signedIn', me: mockMe, client: mockClient }),
}));
jest.mock('../src/device', () => ({ newId: () => `key-${++mockId}` }));

let qc: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={qc}>{children}</QueryClientProvider>
);
const ALL = [
  'customer.view',
  'territory.manage',
  'territory.assign',
  'customer.crop',
  'agri.reference.manage',
];
const village = {
  id: 'v1',
  name: 'Uruli',
  taluka: 'Haveli',
  district: 'Pune',
  stateCode: '27',
  pin: '412204',
  status: 'ACTIVE',
  version: 3,
};
const village2 = {
  id: 'v2',
  name: 'Shirur',
  taluka: 'Shirur',
  district: 'Pune',
  stateCode: '27',
  pin: null,
  status: 'ACTIVE',
  version: 1,
};
const territory = {
  id: 't1',
  name: 'East Pune',
  villageCount: 1,
  version: 2,
  status: 'ACTIVE',
  villages: [{ id: 'v1', name: 'Uruli' }],
  assignees: [{ userId: 'u9', fullName: 'Asha Field' }],
};

beforeAll(() => {
  for (const l of ['en', 'hi', 'mr'] as const) i18n.addResourceBundle(l, 'translation', parts[l], true, true);
});
beforeEach(async () => {
  [mockGet, mockPost, mockPatch, mockPut].forEach((m) => m.mockReset());
  mockId = 0;
  mockMe = { userId: 'u1', tenantId: 't1', roles: [], permissions: ALL };
  qc = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retryDelay: 0 } } });
  await setLanguage('en');
  mockGet.mockImplementation(async (path: string) => {
    if (path === '/villages') return { items: [village, village2] };
    if (path === '/territories') return { items: [territory] };
    if (path === '/territories/t1') return territory;
    if (path === '/crops')
      return {
        items: [{ id: 'c1', name: 'Cotton', durationDays: 180, seasons: ['KHARIF'], reviewed: false }],
      };
    if (path === '/users')
      return {
        items: [
          { id: 'u9', fullName: 'Asha Field', status: 'ACTIVE', roleIds: ['r1'] },
          { id: 'u8', fullName: 'Not Officer', status: 'ACTIVE', roleIds: ['r2'] },
        ],
      };
    if (path === '/roles')
      return {
        items: [
          { id: 'r1', systemKey: 'field_officer' },
          { id: 'r2', systemKey: null },
        ],
      };
    return {};
  });
});
const open = (name: string) => fireEvent.press(screen.getByLabelText(name));

describe('villages tab', () => {
  test('lists villages, filters by search, and shows the count of the rest when cut', async () => {
    await render(<VillagesScreen />, { wrapper });
    expect(await screen.findByText('Uruli')).toBeTruthy();
    expect(screen.getByText('Shirur')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Search'), 'shir');
    expect(screen.queryByText('Uruli')).toBeNull();
    expect(screen.getByText('Shirur')).toBeTruthy();
  });

  test('add village sends the body with one key, reuses it after a lost answer, and a changed body gets a new key', async () => {
    mockPost.mockRejectedValueOnce(new ApiError(0, null)).mockResolvedValue({ id: 'v3' });
    await render(<VillagesScreen />, { wrapper });
    await screen.findByText('Uruli');
    await open('Add a village');
    await fireEvent.changeText(screen.getByLabelText('District'), 'Pune');
    await fireEvent.changeText(screen.getByLabelText('Taluka'), 'Daund');
    await fireEvent.changeText(screen.getByLabelText('Village'), 'Kedgaon');
    await fireEvent.press(screen.getAllByLabelText('Save')[0]!);
    await screen.findByText(/No network/);
    await fireEvent.press(screen.getAllByLabelText('Save')[0]!);
    await screen.findByText('Saved.');
    expect(mockPost).toHaveBeenCalledTimes(2);
    expect(mockPost.mock.calls[0]![0]).toBe('/villages');
    expect(mockPost.mock.calls[0]![1].body).toEqual({
      stateCode: '27',
      district: 'Pune',
      taluka: 'Daund',
      name: 'Kedgaon',
    });
    expect(mockPost.mock.calls[0]![1].idempotencyKey).toBe(mockPost.mock.calls[1]![1].idempotencyKey);
  });

  test('a bad PIN is stopped before any call', async () => {
    await render(<VillagesScreen />, { wrapper });
    await screen.findByText('Uruli');
    await open('Add a village');
    await fireEvent.changeText(screen.getByLabelText('District'), 'Pune');
    await fireEvent.changeText(screen.getByLabelText('Taluka'), 'Daund');
    await fireEvent.changeText(screen.getByLabelText('Village'), 'Kedgaon');
    await fireEvent.changeText(screen.getByLabelText('PIN code'), '123');
    await fireEvent.press(screen.getAllByLabelText('Save')[0]!);
    expect(await screen.findByText('PIN is 6 digits.')).toBeTruthy();
    expect(mockPost).not.toHaveBeenCalled();
  });

  test('edit sends only the changed field with the version as If-Match', async () => {
    mockPatch.mockResolvedValue({ ...village, name: 'Uruli Kanchan', version: 4 });
    await render(<VillagesScreen />, { wrapper });
    await screen.findByText('Uruli');
    await fireEvent.press(screen.getAllByLabelText('Edit')[0]!);
    await fireEvent.changeText(screen.getAllByLabelText('Village')[0]!, 'Uruli Kanchan');
    await fireEvent.press(screen.getAllByLabelText('Save')[0]!);
    await waitFor(() => expect(mockPatch).toHaveBeenCalled());
    const [path, o] = mockPatch.mock.calls[0]!;
    expect(path).toBe('/villages/v1');
    expect(o.body).toEqual({ name: 'Uruli Kanchan' });
    expect(o.version).toBe(3);
    expect(o.idempotencyKey).toBeTruthy();
  });

  test('deactivate asks first, then sends the status with the version', async () => {
    mockPatch.mockResolvedValue({});
    await render(<VillagesScreen />, { wrapper });
    await screen.findByText('Uruli');
    await fireEvent.press(screen.getAllByLabelText('Deactivate')[0]!);
    expect(screen.getByText(/will no longer be offered/)).toBeTruthy();
    expect(mockPatch).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText('Yes, do it'));
    await waitFor(() => expect(mockPatch).toHaveBeenCalled());
    expect(mockPatch.mock.calls[0]![1]).toMatchObject({ body: { status: 'INACTIVE' }, version: 3 });
  });

  test('CSV import posts the pasted text and reports rejected rows', async () => {
    mockPost.mockResolvedValue({
      total: 3,
      created: 1,
      duplicates: 1,
      failed: 1,
      errors: [{ row: 3, message: 'bad PIN' }],
    });
    await render(<VillagesScreen />, { wrapper });
    await screen.findByText('Uruli');
    await open('Import villages (paste CSV)');
    await fireEvent.changeText(screen.getByLabelText('CSV text'), '27,Pune,Haveli,Loni,412201');
    await fireEvent.press(screen.getByLabelText('Import'));
    expect(await screen.findByText(/1 added, 1 already existed, 1 rejected \(of 3 rows\)/)).toBeTruthy();
    expect(screen.getByText(/Row 3: bad PIN/)).toBeTruthy();
    expect(mockPost.mock.calls[0]![1].body).toEqual({ csv: '27,Pune,Haveli,Loni,412201' });
  });

  test('without territory.manage there are no add or edit buttons', async () => {
    mockMe.permissions = ['customer.view'];
    await render(<VillagesScreen />, { wrapper });
    await screen.findByText('Uruli');
    expect(screen.queryByLabelText('Add a village')).toBeNull();
    expect(screen.queryByLabelText('Edit')).toBeNull();
  });
});

describe('states', () => {
  test('no customer.view: permission message and no call', async () => {
    mockMe.permissions = ['sales.pos.use'];
    await render(<VillagesScreen />, { wrapper });
    expect(await screen.findByText('You do not have permission to see this.')).toBeTruthy();
    expect(mockGet).not.toHaveBeenCalled();
  });
  test('a 403 from the server shows permission denied', async () => {
    mockGet.mockRejectedValue(new ApiError(403, { title: 'FORBIDDEN' }));
    await render(<VillagesScreen />, { wrapper });
    expect(await screen.findByText('You do not have permission to see this.')).toBeTruthy();
  });
  test('offline shows the offline message with retry', async () => {
    mockGet.mockRejectedValue(new ApiError(0, null));
    await render(<VillagesScreen />, { wrapper });
    expect(await screen.findByText('No network. Check your connection and try again.')).toBeTruthy();
    expect(screen.getByLabelText('Try again')).toBeTruthy();
  });
  test('a server error shows the reference code', async () => {
    mockGet.mockRejectedValue(new ApiError(500, { title: 'BOOM', correlationId: 'corr-77' }));
    await render(<VillagesScreen />, { wrapper });
    expect(await screen.findByText(/corr-77/)).toBeTruthy();
  });
  test('empty list', async () => {
    mockGet.mockResolvedValue({ items: [] });
    await render(<VillagesScreen />, { wrapper });
    expect(await screen.findByText('No villages yet.')).toBeTruthy();
  });
  test('Hindi text', async () => {
    await setLanguage('hi');
    await render(<VillagesScreen />, { wrapper });
    expect(await screen.findByText('गाँव जोड़ें')).toBeTruthy();
  });
});

describe('territories tab', () => {
  const goTerritories = async () => {
    await render(<VillagesScreen />, { wrapper });
    await screen.findByText('Uruli');
    await fireEvent.press(screen.getByLabelText('Territories and officers'));
    await screen.findByText('East Pune');
  };
  test('lists the territory with its officers', async () => {
    await goTerritories();
    expect(screen.getByText('Field officers: Asha Field')).toBeTruthy();
  });
  test('new territory sends name and the chosen village ids', async () => {
    mockPost.mockResolvedValue({ id: 't2' });
    await goTerritories();
    await fireEvent.press(screen.getByLabelText('New territory'));
    await fireEvent.changeText(screen.getByLabelText('Territory name'), 'West Pune');
    await fireEvent.press(screen.getByLabelText('Shirur, Shirur'));
    await fireEvent.press(screen.getAllByLabelText('Save')[0]!);
    await waitFor(() => expect(mockPost).toHaveBeenCalled());
    expect(mockPost.mock.calls[0]![0]).toBe('/territories');
    expect(mockPost.mock.calls[0]![1].body).toEqual({ name: 'West Pune', villageIds: ['v2'] });
  });
  test('assign officers offers only field officers and sends a PUT with a key', async () => {
    mockPut.mockResolvedValue({});
    await goTerritories();
    await fireEvent.press(screen.getByLabelText('Assign officers'));
    expect(await screen.findByLabelText('Asha Field')).toBeTruthy();
    expect(screen.queryByLabelText('Not Officer')).toBeNull();
    await fireEvent.press(screen.getAllByLabelText('Save')[0]!);
    await waitFor(() => expect(mockPut).toHaveBeenCalled());
    expect(mockPut.mock.calls[0]![0]).toBe('/territories/t1/assignees');
    expect(mockPut.mock.calls[0]![1].body).toEqual({ userIds: ['u9'] });
  });
  test('edit loads the territory and sends the version', async () => {
    mockPatch.mockResolvedValue({});
    await goTerritories();
    await fireEvent.press(screen.getAllByLabelText('Edit')[0]!);
    await fireEvent.changeText(await screen.findByLabelText('Territory name'), 'East Pune 2');
    await fireEvent.press(screen.getAllByLabelText('Save')[0]!);
    await waitFor(() => expect(mockPatch).toHaveBeenCalled());
    expect(mockPatch.mock.calls[0]![0]).toBe('/territories/t1');
    expect(mockPatch.mock.calls[0]![1]).toMatchObject({
      version: 2,
      body: { name: 'East Pune 2', status: 'ACTIVE', villageIds: ['v1'] },
    });
  });
});

describe('crops tab', () => {
  test('shows crops, adds one with seasons, and marks one reviewed', async () => {
    mockPost.mockResolvedValue({});
    await render(<VillagesScreen />, { wrapper });
    await screen.findByText('Uruli');
    await fireEvent.press(screen.getByLabelText('Crop master'));
    expect(await screen.findByText('Cotton')).toBeTruthy();
    expect(screen.getByText('Not reviewed')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Mark reviewed'));
    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith('/crops/c1:review', expect.objectContaining({ body: {} })),
    );
    mockPost.mockClear();
    await fireEvent.press(screen.getByLabelText('Add a crop'));
    await fireEvent.changeText(screen.getByLabelText('Crop name'), 'Soybean');
    await fireEvent.changeText(screen.getByLabelText('Days from sowing to harvest'), '100');
    await fireEvent.press(screen.getByLabelText('Kharif'));
    await fireEvent.press(screen.getAllByLabelText('Save')[0]!);
    await waitFor(() => expect(mockPost).toHaveBeenCalled());
    expect(mockPost.mock.calls[0]![1].body).toEqual({
      name: 'Soybean',
      durationDays: 100,
      seasons: ['KHARIF'],
    });
  });
});

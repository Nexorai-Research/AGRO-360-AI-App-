import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import parts from '../i18n-parts/wp4.json';
import { i18n, setLanguage } from '../src/i18n';
import {
  BranchDashboard,
  SeasonsCard,
  ViewBuilder,
  ViewManage,
  parseSeasonLines,
  viewBody,
  viewErrors,
  viewToForm,
} from '../src/features/reportsmore/Parity4';

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockPut = jest.fn();
const mockPatch = jest.fn();
const mockDelete = jest.fn();
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
      patch: (...a: unknown[]) => mockPatch(...a),
      delete: (...a: unknown[]) => mockDelete(...a),
    },
  }),
}));
jest.mock('../src/device', () => ({ newId: () => `key-${++mockId}` }));

let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);
beforeAll(() => {
  for (const lg of ['en', 'hi', 'mr'] as const)
    i18n.addResourceBundle(lg, 'translation', (parts as Record<string, object>)[lg], true, true);
});
beforeEach(async () => {
  [mockGet, mockPost, mockPut, mockPatch, mockDelete].forEach((m) => m.mockReset());
  mockId = 0;
  mockMe = { userId: 'u-1', roles: [], permissions: undefined };
  client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retryDelay: 0 } } });
  await setLanguage('en');
});

const datasets = {
  datasets: [
    {
      id: 'sales',
      label: 'Sales',
      fields: [
        { key: 'date', label: 'Date' },
        { key: 'product', label: 'Product' },
        { key: 'net', label: 'Net sales' },
      ],
      measures: ['net'],
    },
  ],
};

describe('logic', () => {
  test('season lines: code, name, months 1-12, each code once', () => {
    expect(parseSeasonLines('kharif, Kharif, 6, 10\nRABI, Rabi, 11, 3')).toEqual({
      seasons: [
        { code: 'KHARIF', name: 'Kharif', startMonth: 6, endMonth: 10 },
        { code: 'RABI', name: 'Rabi', startMonth: 11, endMonth: 3 },
      ],
    });
    expect(parseSeasonLines('KHARIF, Kharif, 6, 13')).toEqual({ badLine: 1 });
    expect(parseSeasonLines('A, Aa, 1, 2\nA, Bb, 3, 4')).toEqual({ badLine: 2 });
    expect(parseSeasonLines('')).toEqual({ badLine: 1 });
  });
  test('custom report: like the web builder', () => {
    const f = {
      ...viewToForm(null, 'sales'),
      name: 'Daily sales',
      columns: ['date', 'net'],
      groupBy: ['date'],
      filterField: 'net',
      filterOp: 'gt',
      filterValue: '1000',
    };
    expect(viewErrors(f)).toEqual([]);
    expect(viewBody(f)).toEqual({
      name: 'Daily sales',
      definition: {
        dataset: 'sales',
        columns: ['date', 'net'],
        groupBy: ['date'],
        filters: [{ field: 'net', op: 'gt', value: 1000 }],
        limit: 500,
      },
      sharedRoles: [],
    });
    expect(viewBody({ ...f, filterOp: 'contains', filterValue: '12' }).definition.filters![0]!.value).toBe(
      '12',
    );
    expect(viewErrors({ ...f, name: 'x', columns: [], limit: '0', shared: 'Store Manager' })).toEqual([
      'name',
      'columns',
      'limit',
      'shared',
    ]);
  });
});

describe('screens', () => {
  test('season months: saved with PUT and the version; only with reports.financial', async () => {
    mockGet.mockResolvedValue({
      seasons: [{ code: 'KHARIF', name: 'Kharif', startMonth: 6, endMonth: 10 }],
      version: 5,
    });
    mockPut.mockResolvedValue({});
    await render(<SeasonsCard />, { wrapper });
    await fireEvent.press(await screen.findByText('Change season months'));
    const box = screen.getByLabelText('Seasons');
    await fireEvent.changeText(box, 'KHARIF, Kharif, 6, 10\nRABI, Rabi, 11');
    expect(screen.getByText(/Line 2 is not/)).toBeTruthy();
    await fireEvent.changeText(box, 'KHARIF, Kharif, 6, 10\nRABI, Rabi, 11, 3');
    await fireEvent.press(screen.getByText('Save seasons'));
    await waitFor(() => expect(mockPut).toHaveBeenCalledTimes(1));
    expect(mockPut.mock.calls[0][0]).toBe('/reports/seasons');
    expect(mockPut.mock.calls[0][1].version).toBe(5);
    expect(mockPut.mock.calls[0][1].body.seasons).toHaveLength(2);
  });
  test('season months hidden without reports.financial', async () => {
    mockMe = { userId: 'u-1', roles: [], permissions: ['reports.sales'] };
    await render(<SeasonsCard />, { wrapper });
    expect(screen.queryByText('Season months')).toBeNull();
    expect(mockGet).not.toHaveBeenCalled();
  });
  test('branch dashboard reads the chosen branch', async () => {
    mockGet.mockImplementation((p: string) => {
      if (p === '/branches')
        return Promise.resolve({
          items: [
            { id: 'b-1', name: 'Baramati' },
            { id: 'b-2', name: 'Indapur' },
          ],
        });
      if (p === '/reports/dashboard/branch')
        return Promise.resolve({
          branch: { id: 'b-1', name: 'Baramati' },
          date: '2026-11-18',
          asOf: '2026-11-18T10:00:00Z',
          tiles: [{ id: 'net_sales', label: 'Net sales', value: '12000.00', unit: 'money' }],
          salesByHour: [{ hour: 9, bills: 3, total: '4000.00' }],
          topProducts: [{ label: 'Urea', quantity: '10', netSales: '3000.00' }],
          notes: [],
        });
      return Promise.reject(new Error(p));
    });
    await render(<BranchDashboard />, { wrapper });
    expect(await screen.findByText('Net sales')).toBeTruthy();
    expect(screen.getByText('09:00')).toBeTruthy();
    expect(screen.getByText('Urea × 10')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Indapur'));
    await waitFor(() =>
      expect(mockGet).toHaveBeenCalledWith(
        '/reports/dashboard/branch',
        expect.objectContaining({ query: { branchId: 'b-2' } }),
      ),
    );
  });
  test('new custom report: pick columns and save with POST', async () => {
    mockGet.mockResolvedValue(datasets);
    mockPost.mockResolvedValue({});
    const done = jest.fn();
    await render(<ViewBuilder view={null} onDone={done} />, { wrapper });
    await fireEvent.changeText(await screen.findByLabelText('Name (2 to 80 letters)'), 'Daily sales');
    await fireEvent.press(screen.getByText('Save report'));
    expect(await screen.findByText('Pick at least one column.')).toBeTruthy();
    // the column boxes come before the filter chips with the same names
    await fireEvent.press(screen.getAllByLabelText('Date')[0]!);
    await fireEvent.press(screen.getAllByLabelText('Net sales')[0]!);
    await fireEvent.press(screen.getByLabelText('by Date'));
    expect(screen.queryByLabelText('by Net sales')).toBeNull();
    await fireEvent.press(screen.getByText('Save report'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    expect(mockPost.mock.calls[0][0]).toBe('/reports/views');
    expect(mockPost.mock.calls[0][1].body).toEqual({
      name: 'Daily sales',
      definition: { dataset: 'sales', columns: ['date', 'net'], groupBy: ['date'], limit: 500 },
      sharedRoles: [],
    });
    await waitFor(() => expect(done).toHaveBeenCalled());
  });
  const view = {
    id: 'v-1',
    name: 'Daily sales',
    dataset: 'sales',
    mine: true,
    version: 2,
    sharedRoles: [],
    definition: { dataset: 'sales', columns: ['date'], limit: 100 },
  };
  test('change sends PATCH with the version; delete asks first', async () => {
    mockGet.mockResolvedValue(datasets);
    mockPatch.mockResolvedValue({});
    mockDelete.mockResolvedValue(null);
    await render(<ViewManage view={view} />, { wrapper });
    await fireEvent.press(screen.getByText('Change Daily sales'));
    await fireEvent.press((await screen.findAllByLabelText('Product'))[0]!);
    await fireEvent.press(screen.getByText('Save report'));
    await waitFor(() => expect(mockPatch).toHaveBeenCalledTimes(1));
    expect(mockPatch.mock.calls[0][0]).toBe('/reports/views/v-1');
    expect(mockPatch.mock.calls[0][1].version).toBe(2);
    expect(mockPatch.mock.calls[0][1].body.definition).toMatchObject({
      columns: ['date', 'product'],
      limit: 100,
    });
    await fireEvent.press(await screen.findByText('Delete Daily sales'));
    expect(mockDelete).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText('Delete report'));
    await waitFor(() => expect(mockDelete).toHaveBeenCalledTimes(1));
    expect(mockDelete.mock.calls[0][0]).toBe('/reports/views/v-1');
  });
  test('a shared report can only be run', async () => {
    await render(<ViewManage view={{ ...view, mine: false }} />, { wrapper });
    expect(screen.getByText('Shared with you')).toBeTruthy();
    expect(screen.queryByText('Delete Daily sales')).toBeNull();
  });
});

import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setLanguage } from '../src/i18n';
import { BrandsScreen, UnitsScreen, unitBody } from '../src/features/stk/CatalogueScreens';
import DocumentsScreen from '../src/features/admin/DocumentsScreen';
import ExpensesScreen from '../src/features/finance/ExpensesScreen';
import ControlScreen from '../src/features/finance/ControlScreen';

const mockGet = jest.fn();
const mockPost = jest.fn();
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
      patch: (...a: unknown[]) => mockPatch(...a),
      delete: (...a: unknown[]) => mockDelete(...a),
    },
    signIn: jest.fn(),
    signOut: jest.fn(),
  }),
}));
jest.mock('../src/device', () => ({ newId: () => `key-${++mockId}` }));
jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({}), router: { push: jest.fn() } }));

let qc: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={qc}>{children}</QueryClientProvider>
);
const ALL = [
  'product.view',
  'product.brand.manage',
  'product.uom.manage',
  'org.document.view',
  'org.document.manage',
  'finance.account.view',
  'finance.expense.create',
  'finance.budget.manage',
  'finance.period.lock',
];
beforeEach(async () => {
  [mockGet, mockPost, mockPatch, mockDelete].forEach((m) => m.mockReset());
  mockId = 0;
  mockMe = { userId: 'u-1', roles: [], permissions: ALL };
  qc = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retryDelay: 0 } } });
  await setLanguage('en');
});
const route = (map: Record<string, unknown>) =>
  mockGet.mockImplementation(async (p: string) => map[p] ?? { items: [] });
const press = async (label: string, i = 0) => fireEvent.press((await screen.findAllByLabelText(label))[i]!);
const type = async (label: string, v: string) => fireEvent.changeText(await screen.findByLabelText(label), v);
const isDisabled = (label: string) => {
  const el = screen.getByLabelText(label);
  return Boolean(el.props.accessibilityState?.disabled ?? el.props.disabled);
};

describe('manufacturers', () => {
  const maker = (o: Record<string, unknown>) => ({
    registrationNo: null,
    phone: null,
    contactName: null,
    email: null,
    address: null,
    version: 3,
    ...o,
  });
  beforeEach(() =>
    route({
      '/manufacturers': { items: [maker({ id: 'm1', name: 'IFFCO' }), maker({ id: 'm2', name: 'Free Co' })] },
      '/brands': {
        items: [
          {
            id: 'b1',
            name: 'Kisan',
            manufacturerId: 'm1',
            manufacturerName: 'IFFCO',
            registrationNo: null,
            productCount: 0,
            status: 'ACTIVE',
            version: 1,
          },
        ],
      },
    }),
  );
  test('a manufacturer that brands use cannot be deleted; a free one is asked about first', async () => {
    await render(<BrandsScreen />, { wrapper });
    await screen.findByText('Free Co');
    expect(isDisabled('Delete IFFCO')).toBe(true);
    expect(screen.getByText('Brands use this manufacturer.')).toBeTruthy();
    await press('Delete Free Co');
    expect(screen.getByText('Free Co will be removed.')).toBeTruthy();
    expect(mockDelete).not.toHaveBeenCalled();
    mockDelete.mockResolvedValue(null);
    await press('Delete');
    await waitFor(() => expect(mockDelete).toHaveBeenCalledTimes(1));
    expect(mockDelete.mock.calls[0]![0]).toBe('/manufacturers/m2');
    expect(mockDelete.mock.calls[0]![1].idempotencyKey).toBe('key-1');
    expect(await screen.findByText('Manufacturer deleted.')).toBeTruthy();
  });
  test('Cancel sends nothing', async () => {
    await render(<BrandsScreen />, { wrapper });
    await press('Delete Free Co');
    await press('Cancel');
    expect(mockDelete).not.toHaveBeenCalled();
    expect(screen.queryByText('Free Co will be removed.')).toBeNull();
  });
  test('Edit sends the version as If-Match with contact, email and address (empty ones as null)', async () => {
    mockPatch.mockResolvedValue({});
    await render(<BrandsScreen />, { wrapper });
    await press('Edit IFFCO');
    await type('Contact', 'Ravi');
    await type('Address', 'Pune');
    await press('Save manufacturer');
    await waitFor(() => expect(mockPatch).toHaveBeenCalledTimes(1));
    const [path, o] = mockPatch.mock.calls[0] as [string, { body: unknown; version: number }];
    expect(path).toBe('/manufacturers/m1');
    expect(o.version).toBe(3);
    expect(o.body).toEqual({
      name: 'IFFCO',
      registrationNo: null,
      phone: null,
      contactName: 'Ravi',
      email: null,
      address: 'Pune',
    });
  });
  test('without product.brand.manage there are no Edit or Delete buttons', async () => {
    mockMe = { userId: 'u-1', roles: [], permissions: ['product.view'] };
    await render(<BrandsScreen />, { wrapper });
    await screen.findByText('Free Co');
    expect(screen.queryByLabelText('Delete Free Co')).toBeNull();
    expect(screen.queryByLabelText('Edit IFFCO')).toBeNull();
  });
});

describe('units', () => {
  beforeEach(() =>
    route({ '/uoms': { items: [{ id: 'u1', code: 'KG', name: 'Kilogram', precision: 3, active: true }] } }),
  );
  test('the body of an edit: name, decimal places and Active only (the code never changes)', () => {
    expect(unitBody(' Kilo ', '2', false)).toEqual({ name: 'Kilo', precision: 2, active: false });
  });
  test('Edit patches the name, the places and Active', async () => {
    mockPatch.mockResolvedValue({});
    await render(<UnitsScreen />, { wrapper });
    await press('Edit KG');
    expect(screen.getByText('Code KG (the code never changes)')).toBeTruthy();
    await type('Name', 'Kilo');
    await type('Decimal places (0 to 6)', '2');
    await press('Active');
    await press('Save unit');
    await waitFor(() => expect(mockPatch).toHaveBeenCalledTimes(1));
    expect(mockPatch.mock.calls[0]![0]).toBe('/uoms/u1');
    expect(mockPatch.mock.calls[0]![1].body).toEqual({ name: 'Kilo', precision: 2, active: false });
  });
  test('Delete asks first, then sends DELETE; a refusal (unit in use) shows the server answer', async () => {
    await render(<UnitsScreen />, { wrapper });
    await press('Delete KG');
    expect(screen.getByText(/A unit that products use cannot be deleted/)).toBeTruthy();
    expect(mockDelete).not.toHaveBeenCalled();
    mockDelete.mockResolvedValue(null);
    await press('Delete');
    await waitFor(() => expect(mockDelete).toHaveBeenCalledTimes(1));
    expect(mockDelete.mock.calls[0]![0]).toBe('/uoms/u1');
  });
});

describe('documents', () => {
  const doc = {
    id: 'doc-1',
    title: 'Fertiliser licence',
    category: 'LICENCE',
    expiresOn: null,
    notes: null,
    active: true,
    status: 'ACTIVE',
    currentVersion: 3,
    filename: 'lic.pdf',
    contentType: 'application/pdf',
    sizeBytes: 2048,
    uploadedAt: '2026-10-01T04:00:00Z',
    updatedAt: '2026-10-01T04:00:00Z',
  };
  beforeEach(() => mockGet.mockResolvedValue({ items: [doc], next_cursor: null }));
  test('Delete tells that every version goes for good, and sends nothing until confirmed', async () => {
    mockDelete.mockResolvedValue(null);
    await render(<DocumentsScreen />, { wrapper });
    await screen.findByText('Fertiliser licence');
    await press('Delete');
    expect(screen.getByText(/The file and all 3 versions are removed for good/)).toBeTruthy();
    expect(mockDelete).not.toHaveBeenCalled();
    await press('Delete', 1);
    await waitFor(() => expect(mockDelete).toHaveBeenCalledTimes(1));
    expect(mockDelete.mock.calls[0]![0]).toBe('/documents/doc-1');
    expect(mockDelete.mock.calls[0]![1].idempotencyKey).toBe('key-1');
    expect(await screen.findByText('Document deleted.')).toBeTruthy();
  });
  test('one version is "1 version"', async () => {
    mockGet.mockResolvedValue({ items: [{ ...doc, currentVersion: 1 }], next_cursor: null });
    await render(<DocumentsScreen />, { wrapper });
    await screen.findByText('Fertiliser licence');
    await press('Delete');
    expect(screen.getByText(/The file and all 1 version are removed for good/)).toBeTruthy();
  });
  test('without org.document.manage there is no Delete', async () => {
    mockMe = { userId: 'u-1', roles: [], permissions: ['org.document.view'] };
    await render(<DocumentsScreen />, { wrapper });
    await screen.findByText('Fertiliser licence');
    expect(screen.queryByLabelText('Delete')).toBeNull();
  });
});

describe('draft expenses and budgets', () => {
  const exp = (o: Record<string, unknown> = {}) => ({
    id: 'e1',
    expenseNo: 'EX-0001',
    expenseDate: '2026-11-10',
    accountId: 'x1',
    accountCode: '6100',
    accountName: 'Electricity',
    payee: 'MSEB',
    amount: '1000.00',
    taxAmount: '180.00',
    inputTaxEligible: true,
    total: '1180.00',
    documentNo: 'B-77',
    status: 'DRAFT',
    needsApproval: false,
    decisionNote: null,
    reverseReason: null,
    version: 2,
    ...o,
  });
  test('a draft expense: Delete asks, deletes, and goes back to the list', async () => {
    route({ '/finance/expenses': { items: [exp()] }, '/finance/expenses/e1': exp() });
    mockDelete.mockResolvedValue(null);
    await render(<ExpensesScreen />, { wrapper });
    await press('EX-0001');
    await screen.findByText('₹1,180.00');
    await press('Delete');
    expect(screen.getByText(/EX-0001 \(MSEB\) will be removed/)).toBeTruthy();
    expect(mockDelete).not.toHaveBeenCalled();
    await press('Delete');
    await waitFor(() => expect(mockDelete).toHaveBeenCalledTimes(1));
    expect(mockDelete.mock.calls[0]![0]).toBe('/finance/expenses/e1');
    expect(mockDelete.mock.calls[0]![1].idempotencyKey).toBe('key-1');
  });
  test('a submitted expense has no Delete', async () => {
    const sub = exp({ status: 'SUBMITTED' });
    route({ '/finance/expenses': { items: [sub] }, '/finance/expenses/e1': sub });
    await render(<ExpensesScreen />, { wrapper });
    await press('EX-0001');
    await screen.findByText('₹1,180.00');
    expect(screen.queryByLabelText('Delete')).toBeNull();
  });

  const budget = (o: Record<string, unknown> = {}) => ({
    id: 'bg1',
    name: 'Annual budget',
    fyLabel: '2026-27',
    version: 2,
    status: 'DRAFT',
    total: '240000.00',
    lineCount: 12,
    ...o,
  });
  const openBudgets = async () => {
    await render(<ControlScreen />, { wrapper });
    await press('Budgets');
    await screen.findByText('Annual budget · 2026-27 v2');
  };
  test('a draft budget: Delete asks, then deletes it with its lines', async () => {
    route({ '/finance/budgets': { items: [budget()] } });
    mockDelete.mockResolvedValue(null);
    await openBudgets();
    await press('Delete');
    expect(screen.getByText('Annual budget (2026-27 v2) and its lines will be removed.')).toBeTruthy();
    expect(mockDelete).not.toHaveBeenCalled();
    await press('Delete', 1);
    await waitFor(() => expect(mockDelete).toHaveBeenCalledTimes(1));
    expect(mockDelete.mock.calls[0]![0]).toBe('/finance/budgets/bg1');
    expect(mockDelete.mock.calls[0]![1].idempotencyKey).toBe('key-1');
  });
  test('an approved budget is a record: no Delete', async () => {
    route({ '/finance/budgets': { items: [budget({ status: 'APPROVED' })] } });
    await openBudgets();
    expect(screen.queryByLabelText('Delete')).toBeNull();
  });
});

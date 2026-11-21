import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '../src/api/errors';
import { setLanguage } from '../src/i18n';
import EmployeesScreen, { designationsOf, filterEmployees } from '../src/features/staff/EmployeesScreen';
import type { Employee } from '../src/features/staff/api';

const mockGet = jest.fn();
const mockRequest = jest.fn();
let mockMe: { userId: string; roles: string[]; permissions?: string[] };
let mockId = 0;
jest.mock('../src/auth/AuthProvider', () => ({
  useAuth: () => ({
    status: 'signedIn',
    me: mockMe,
    client: { get: (...a: unknown[]) => mockGet(...a), request: (...a: unknown[]) => mockRequest(...a) },
    signIn: jest.fn(),
    signOut: jest.fn(),
  }),
}));
jest.mock('../src/device', () => ({ newId: () => `key-${++mockId}` }));

let qc: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={qc}>{children}</QueryClientProvider>
);
beforeEach(async () => {
  [mockGet, mockRequest].forEach((m) => m.mockReset());
  mockId = 0;
  mockMe = { userId: 'u-1', roles: [], permissions: undefined };
  qc = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retryDelay: 0 } } });
  await setLanguage('en');
});

const emp = (over: Partial<Employee> = {}): Employee => ({
  id: 'e-1',
  code: 'EMP-1',
  branchId: 'b-1',
  branchName: 'Main',
  name: 'Sita Devi',
  designation: 'Cashier',
  department: null,
  joinDate: '2026-01-05',
  exitDate: null,
  exitReason: null,
  status: 'ACTIVE',
  employmentType: 'PERMANENT',
  mobile: '9876543210',
  email: null,
  address: null,
  emergencyName: null,
  emergencyMobile: null,
  userId: null,
  geoConsent: false,
  version: 3,
  ...over,
});
const people = [
  emp(),
  emp({ id: 'e-2', code: 'EMP-2', name: 'Ravi Kumar', designation: 'Manager' }),
  emp({
    id: 'e-3',
    code: 'EMP-3',
    name: 'Asha Rao',
    designation: 'Cashier',
    branchId: 'b-2',
    branchName: 'North',
  }),
];
const route = (map: Record<string, unknown>) =>
  mockGet.mockImplementation(async (path: string) => {
    const v = map[path];
    if (v instanceof Error) throw v;
    if (v === undefined) throw new Error(`unexpected GET ${path}`);
    return v;
  });
const base = {
  '/hr/employees': { items: people },
  '/hr/employees/e-1': emp(),
  '/branches': {
    items: [
      { id: 'b-1', name: 'Main' },
      { id: 'b-2', name: 'North' },
    ],
  },
};
const press = async (label: string) => fireEvent.press(await screen.findByLabelText(label));

describe('the staff list like the web', () => {
  test('the search reads the name, the code and the designation, in any case', () => {
    expect(filterEmployees(people, 'MANAGER', '').map((e) => e.id)).toEqual(['e-2']);
    expect(filterEmployees(people, 'emp-3', '').map((e) => e.id)).toEqual(['e-3']);
    expect(filterEmployees(people, 'devi', '').map((e) => e.id)).toEqual(['e-1']);
    expect(filterEmployees(people, '', 'Cashier').map((e) => e.id)).toEqual(['e-1', 'e-3']);
    expect(filterEmployees(people, 'asha', 'Manager')).toEqual([]);
  });
  test('the designations are the distinct ones of the loaded staff, sorted', () => {
    expect(designationsOf([...people, emp({ id: 'e-4', designation: null })])).toEqual([
      'Cashier',
      'Manager',
    ]);
  });
  test('typing a designation narrows the list and asks the server nothing new', async () => {
    route(base);
    await render(<EmployeesScreen />, { wrapper });
    expect(await screen.findByText('EMP-2 · Ravi Kumar')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Search by name, code or designation'), 'manager');
    expect(screen.queryByText('EMP-1 · Sita Devi')).toBeNull();
    expect(screen.getByText('EMP-2 · Ravi Kumar')).toBeTruthy();
    const listCalls = mockGet.mock.calls.filter((c) => c[0] === '/hr/employees');
    expect(listCalls).toHaveLength(1);
    expect(listCalls[0]![1].query).not.toHaveProperty('q');
  });
  test('the designation filter narrows to one designation', async () => {
    route(base);
    await render(<EmployeesScreen />, { wrapper });
    await screen.findByText('EMP-2 · Ravi Kumar');
    await press('Manager');
    expect(screen.queryByText('EMP-1 · Sita Devi')).toBeNull();
    expect(screen.getByText('EMP-2 · Ravi Kumar')).toBeTruthy();
  });
  test('with more than one branch, a branch filter goes to the server as branchId', async () => {
    route(base);
    await render(<EmployeesScreen />, { wrapper });
    await screen.findByText('EMP-2 · Ravi Kumar');
    await press('North');
    await waitFor(() =>
      expect(mockGet.mock.calls.some((c) => c[0] === '/hr/employees' && c[1].query.branchId === 'b-2')).toBe(
        true,
      ),
    );
  });
});

describe('delete an employee', () => {
  const openFirst = async () => {
    route(base);
    await render(<EmployeesScreen />, { wrapper });
    await screen.findByText('EMP-1 · Sita Devi');
    await fireEvent.press((await screen.findAllByLabelText('Open'))[0]!);
    await press('Delete employee');
  };

  test('it asks first with the web sentence; nothing is sent until confirmed', async () => {
    await openFirst();
    expect(
      screen.getByText(/EMP-1 Sita Devi will be removed\. Only an employee with no attendance/),
    ).toBeTruthy();
    expect(mockRequest).not.toHaveBeenCalled();
    mockRequest.mockResolvedValue(null);
    await press('Delete employee');
    await waitFor(() => expect(mockRequest).toHaveBeenCalledTimes(1));
    const [method, path, o] = mockRequest.mock.calls[0] as [
      string,
      string,
      { idempotencyKey: string; body?: unknown },
    ];
    expect([method, path]).toEqual(['DELETE', '/hr/employees/e-1']);
    expect(o.idempotencyKey).toBe('key-1');
    expect(o.body).toBeUndefined();
  });

  test('Cancel goes back to the profile and sends nothing', async () => {
    await openFirst();
    await press('Cancel');
    expect(mockRequest).not.toHaveBeenCalled();
    expect(await screen.findByLabelText('Edit employee')).toBeTruthy();
  });

  test('an employee who has attendance, leave or pay is refused by the server and the reference is shown', async () => {
    await openFirst();
    mockRequest.mockRejectedValue(
      new ApiError(409, { title: 'EMPLOYEE_HAS_RECORDS', correlationId: 'corr-37' }),
    );
    await press('Delete employee');
    expect(await screen.findByText(/corr-37/)).toBeTruthy();
    expect(screen.getByText(/will be removed/)).toBeTruthy();
  });
});

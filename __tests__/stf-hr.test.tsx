import type { ReactNode } from 'react';
import { Share } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '../src/api/errors';
import { i18n, setLanguage } from '../src/i18n';
import step4 from '../i18n-parts/step4.json';
import stf from '../i18n-parts/stf.json';
import EmployeesScreen from '../src/features/staff/EmployeesScreen';
import AttendanceRegisterScreen from '../src/features/staff/AttendanceRegisterScreen';
import SalaryScreen, { parseStructureLines } from '../src/features/staff/SalaryScreen';
import { monthRange, shiftMonth } from '../src/features/staff/api';

const mockGet = jest.fn();
const mockRequest = jest.fn();
const mockShare = jest.fn();
let mockMe: { userId: string; roles: string[]; permissions?: string[] };
let mockId = 0;
const mockClient = {
  get: (...a: unknown[]) => mockGet(...a),
  request: (...a: unknown[]) => mockRequest(...a),
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

let qc: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={qc}>{children}</QueryClientProvider>
);
const NETWORK = 'No network. Check your connection and try again.';

beforeAll(() => {
  for (const lang of ['en', 'hi', 'mr'] as const) {
    i18n.addResourceBundle(lang, 'translation', (step4 as Record<string, object>)[lang], true, true);
    i18n.addResourceBundle(lang, 'translation', (stf as Record<string, object>)[lang], true, true);
  }
});
beforeEach(async () => {
  [mockGet, mockRequest, mockShare].forEach((m) => m.mockReset());
  mockId = 0;
  mockMe = { userId: 'u-1', roles: [], permissions: undefined };
  qc = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retryDelay: 0 } } });
  await setLanguage('en');
  jest.spyOn(Share, 'share').mockImplementation((...a: unknown[]) => mockShare(...a));
});
afterEach(() => jest.restoreAllMocks());

const emp = (over: Record<string, unknown> = {}) => ({
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

function route(map: Record<string, unknown>) {
  mockGet.mockImplementation(async (path: string) => {
    const v = map[path];
    if (v instanceof Error) throw v;
    if (v === undefined) throw new Error(`unexpected GET ${path}`);
    return v;
  });
}

describe('helpers', () => {
  test('month range and shift', () => {
    expect(monthRange('2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(monthRange('2028-02').to).toBe('2028-02-29');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
  });
  test('salary structure lines', () => {
    expect(parseStructureLines('BASIC=15000; HRA=BASIC*0.4').lines).toEqual([
      { code: 'BASIC', calcType: 'FIXED', value: '15000' },
      { code: 'HRA', calcType: 'FORMULA', value: 'BASIC*0.4' },
    ]);
    expect(parseStructureLines('BASIC 15000').bad).toBe('BASIC 15000');
    expect(parseStructureLines('').bad).toBe('');
  });
  test('texts exist in English, Hindi and Marathi with the same keys', () => {
    const flat = (o: object, p = ''): string[] =>
      Object.entries(o).flatMap(([k, v]) =>
        typeof v === 'object' ? flat(v as object, `${p}${k}.`) : [`${p}${k}`],
      );
    const en = flat(stf.en);
    expect(flat(stf.hi)).toEqual(en);
    expect(flat(stf.mr)).toEqual(en);
  });
});

describe('employees', () => {
  test('lists staff and opens a profile with masked bank details', async () => {
    route({
      '/hr/employees': { items: [emp()] },
      '/hr/employees/e-1': emp({
        bank: { name: 'SBI', ifsc: 'SBIN0001234', holder: 'Sita', accountMasked: 'XXXXXX1234' },
      }),
    });
    await render(<EmployeesScreen />, { wrapper });
    expect(await screen.findByText('EMP-1 · Sita Devi')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Open'));
    expect(await screen.findByText('XXXXXX1234')).toBeTruthy();
    expect(screen.getByText('9876543210')).toBeTruthy();
    expect(screen.queryByText(/1234567890123/)).toBeNull();
  });

  test('empty, offline, denied, error with reference', async () => {
    route({ '/hr/employees': { items: [] } });
    const a = await render(<EmployeesScreen />, { wrapper });
    expect(await screen.findByText('No employees found.')).toBeTruthy();
    await a.unmount();

    route({ '/hr/employees': new ApiError(0, null) });
    const b = await render(<EmployeesScreen />, { wrapper });
    expect(await screen.findByText('No network. This cannot be loaded now.')).toBeTruthy();
    await b.unmount();

    route({ '/hr/employees': new ApiError(500, { title: 'BOOM', correlationId: 'c-77' }) });
    qc.clear();
    const c = await render(<EmployeesScreen />, { wrapper });
    expect(await screen.findByText(/c-77/)).toBeTruthy();
    await c.unmount();

    mockMe = { userId: 'u-1', roles: [], permissions: ['sales.view'] };
    await render(<EmployeesScreen />, { wrapper });
    expect(await screen.findByText('You do not have permission to see this.')).toBeTruthy();
    expect(mockGet).toHaveBeenCalledTimes(4); // the denied screen made no call; the offline one retried once
  });

  test('server 403 shows permission denied', async () => {
    route({ '/hr/employees': new ApiError(403, { title: 'FORBIDDEN' }) });
    await render(<EmployeesScreen />, { wrapper });
    expect(await screen.findByText('You do not have permission to see this.')).toBeTruthy();
  });

  test('add employee: one Idempotency-Key reused on retry, no tenant id', async () => {
    route({ '/hr/employees': { items: [] }, '/branches': { items: [{ id: 'b-1', name: 'Main' }] } });
    mockRequest.mockRejectedValueOnce(new ApiError(0, null)).mockResolvedValue(emp());
    await render(<EmployeesScreen />, { wrapper });
    await screen.findByText('No employees found.');
    await fireEvent.press(screen.getByLabelText('Add employee'));
    await fireEvent.changeText(await screen.findByLabelText('Name'), 'Sita Devi');
    await fireEvent.press(await screen.findByLabelText('Main'));
    expect(
      (screen.getByLabelText('Save') as { props: { accessibilityState?: { disabled?: boolean } } }).props
        .accessibilityState?.disabled,
    ).toBeFalsy();
    await fireEvent.press(screen.getByLabelText('Save'));
    expect(await screen.findByText(NETWORK)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Save'));
    await waitFor(() => expect(mockRequest).toHaveBeenCalledTimes(2));
    const [m1, p1, o1] = mockRequest.mock.calls[0] as [
      string,
      string,
      { body: Record<string, unknown>; idempotencyKey: string },
    ];
    const [, , o2] = mockRequest.mock.calls[1] as [string, string, { body: unknown; idempotencyKey: string }];
    expect([m1, p1]).toEqual(['POST', '/hr/employees']);
    expect(o1.idempotencyKey).toBe(o2.idempotencyKey);
    expect(o1.body).toMatchObject({ name: 'Sita Devi', branchId: 'b-1', employmentType: 'PERMANENT' });
    expect(JSON.stringify(o1.body)).not.toMatch(/tenant/i);
  });

  test('edit sends If-Match version and only after a changed body gets a new key', async () => {
    route({
      '/hr/employees': { items: [emp()] },
      '/hr/employees/e-1': emp(),
      '/branches': { items: [{ id: 'b-1', name: 'Main' }] },
    });
    mockRequest.mockResolvedValue(emp({ version: 4 }));
    await render(<EmployeesScreen />, { wrapper });
    await fireEvent.press(await screen.findByLabelText('Open'));
    await fireEvent.press(await screen.findByLabelText('Edit employee'));
    await fireEvent.changeText(await screen.findByLabelText('Designation'), 'Manager');
    await fireEvent.press(screen.getByLabelText('Save'));
    await waitFor(() => expect(mockRequest).toHaveBeenCalledTimes(1));
    const [m, p, o] = mockRequest.mock.calls[0] as [
      string,
      string,
      { version: number; body: Record<string, unknown> },
    ];
    expect([m, p, o.version]).toEqual(['PATCH', '/hr/employees/e-1', 3]);
    expect(o.body.designation).toBe('Manager');
  });

  test('exit needs a reason and sends the version', async () => {
    route({ '/hr/employees': { items: [emp()] }, '/hr/employees/e-1': emp() });
    mockRequest.mockResolvedValue(emp({ status: 'EXITED' }));
    await render(<EmployeesScreen />, { wrapper });
    await fireEvent.press(await screen.findByLabelText('Open'));
    await fireEvent.press(await screen.findByLabelText('Record exit'));
    await fireEvent.changeText(await screen.findByLabelText('Reason'), 'ab');
    expect(await screen.findByText('Write at least 3 letters.')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Reason'), 'Moved away');
    await fireEvent.press(screen.getByLabelText('Record exit', { exact: true }));
    await waitFor(() => expect(mockRequest).toHaveBeenCalled());
    const call = mockRequest.mock.calls[0] as [
      string,
      string,
      { version: number; body: Record<string, unknown> },
    ];
    expect(call[1]).toBe('/hr/employees/e-1/exit');
    expect(call[2].version).toBe(3);
    expect(call[2].body.reason).toBe('Moved away');
  });
});

describe('attendance register', () => {
  const sheet = {
    period: '2026-11',
    days: ['2026-11-01', '2026-11-02'],
    rows: [
      {
        employeeId: 'e-1',
        code: 'EMP-1',
        name: 'Sita Devi',
        days: { '2026-11-01': 'P', '2026-11-02': 'A' },
        present: 1,
        half: 0,
        leave: 0,
        absent: 1,
        weeklyOff: 0,
        unmarked: 0,
      },
    ],
  };
  const att = {
    items: [
      {
        id: 'a-1',
        employeeId: 'e-1',
        employeeCode: 'EMP-1',
        employeeName: 'Sita Devi',
        date: '2026-11-02',
        checkIn: null,
        checkOut: null,
        method: 'MANUAL',
        status: 'ABSENT',
        workedMinutes: null,
        flag: null,
        correctionReason: null,
      },
    ],
  };

  test('shows the month sheet and shares the CSV', async () => {
    mockGet.mockImplementation(async (path: string, o: { query: Record<string, string> }) =>
      o.query.format === 'csv'
        ? { fileName: 'attendance-2026-11.csv', content: 'a,b' }
        : path === '/hr/attendance/register'
          ? sheet
          : att,
    );
    mockShare.mockResolvedValue({});
    await render(<AttendanceRegisterScreen />, { wrapper });
    expect(await screen.findByText('EMP-1 · Sita Devi')).toBeTruthy();
    expect(screen.getByText('P A')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Share register as CSV'));
    expect(await screen.findByText('Shared.')).toBeTruthy();
    expect(mockShare).toHaveBeenCalledWith({ title: 'attendance-2026-11.csv', message: 'a,b' });
  });

  test('corrects a day with a reason and one key', async () => {
    mockGet.mockImplementation(async (path: string) => (path === '/hr/attendance/register' ? sheet : att));
    mockRequest.mockResolvedValue({});
    await render(<AttendanceRegisterScreen />, { wrapper });
    await fireEvent.press(await screen.findByLabelText('Open days and correct'));
    await fireEvent.press(await screen.findByLabelText('Correct'));
    await fireEvent.press(await screen.findByLabelText('Present'));
    await fireEvent.changeText(screen.getByLabelText('Reason'), 'Forgot to punch');
    await fireEvent.press(screen.getByLabelText('Save'));
    await waitFor(() => expect(mockRequest).toHaveBeenCalledTimes(1));
    const [m, p, o] = mockRequest.mock.calls[0] as [
      string,
      string,
      { body: Record<string, unknown>; idempotencyKey: string },
    ];
    expect([m, p]).toEqual(['POST', '/hr/attendance/mark']);
    expect(o.body).toEqual({
      employeeId: 'e-1',
      date: '2026-11-02',
      status: 'PRESENT',
      reason: 'Forgot to punch',
    });
    expect(o.idempotencyKey).toMatch(/^key-/);
  });

  test('empty, offline and denied', async () => {
    mockGet.mockResolvedValue({ period: '2026-11', days: [], rows: [] });
    const a = await render(<AttendanceRegisterScreen />, { wrapper });
    expect(await screen.findByText('No employees for this month.')).toBeTruthy();
    await a.unmount();
    mockGet.mockRejectedValue(new ApiError(0, null));
    qc.clear();
    const b = await render(<AttendanceRegisterScreen />, { wrapper });
    expect(await screen.findByText('No network. This cannot be loaded now.')).toBeTruthy();
    await b.unmount();
    mockMe = { userId: 'u-1', roles: [], permissions: ['sales.view'] };
    await render(<AttendanceRegisterScreen />, { wrapper });
    expect(await screen.findByText('You do not have permission to see this.')).toBeTruthy();
  });

  test('Hindi', async () => {
    await setLanguage('hi');
    mockGet.mockResolvedValue({ period: '2026-11', days: [], rows: [] });
    await render(<AttendanceRegisterScreen />, { wrapper });
    expect(await screen.findByText('इस महीने कोई कर्मचारी नहीं।')).toBeTruthy();
  });
});

describe('salary setup', () => {
  test('creates a pay head with one key and shows structures', async () => {
    route({
      '/hr/salary-components': {
        items: [{ id: 'c-1', code: 'BASIC', name: 'Basic', kind: 'EARNING', active: true }],
      },
      '/hr/salary-structures': {
        items: [
          {
            id: 's-1',
            name: 'Std',
            active: true,
            version: 1,
            lines: [{ code: 'BASIC', calcType: 'FIXED', value: '15000' }],
          },
        ],
      },
    });
    mockRequest.mockResolvedValue({});
    await render(<SalaryScreen />, { wrapper });
    expect(await screen.findByText('BASIC · Basic')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('New pay head'));
    await fireEvent.changeText(screen.getByLabelText('Code'), 'hra');
    await fireEvent.changeText(screen.getByLabelText('Name'), 'House rent');
    await fireEvent.press(screen.getByLabelText('Save'));
    await waitFor(() => expect(mockRequest).toHaveBeenCalledTimes(1));
    const o = (mockRequest.mock.calls[0] as [string, string, { body: unknown }])[2];
    expect(o.body).toEqual({ code: 'HRA', name: 'House rent', kind: 'EARNING' });
    await fireEvent.press(screen.getByLabelText('Structures'));
    expect(await screen.findByText('Std')).toBeTruthy();
    expect(screen.getByText('BASIC: 15000')).toBeTruthy();
  });

  test('denied without salary permissions', async () => {
    mockMe = { userId: 'u-1', roles: [], permissions: ['sales.view'] };
    await render(<SalaryScreen />, { wrapper });
    expect(await screen.findByText('You do not have permission to see this.')).toBeTruthy();
    expect(mockGet).not.toHaveBeenCalled();
  });
});

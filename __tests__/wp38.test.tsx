import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '../src/api/errors';
import { setLanguage } from '../src/i18n';
import PayrollScreen, { filterRuns, monthOk, payrollSummary } from '../src/features/staff/PayrollScreen';
import type { Run } from '../src/features/staff/api';

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

const run = (over: Partial<Run> = {}): Run => ({
  id: 'r-1',
  runNo: 'PR-0001',
  period: '2026-10',
  branchId: null,
  status: 'DRAFT',
  employeeCount: 4,
  grossTotal: '20000.10',
  deductionTotal: '1000.00',
  netTotal: '19000.20',
  advanceTotal: '0.00',
  incentiveTotal: '0.00',
  exceptions: [],
  reopenCount: 0,
  version: 1,
  ...over,
});
const runs = [
  run(),
  run({
    id: 'r-2',
    runNo: 'PR-0002',
    period: '2026-09',
    status: 'APPROVED',
    branchId: 'b-2',
    exceptions: [{ code: 'X', message: 'm' } as never],
  }),
  run({
    id: 'r-3',
    runNo: 'PR-0003',
    period: '2026-08',
    status: 'REVERSED',
    employeeCount: 9,
    grossTotal: '99999.00',
    netTotal: '88888.00',
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
  '/hr/payroll-runs': { items: runs },
  '/branches': {
    items: [
      { id: 'b-1', name: 'Main' },
      { id: 'b-2', name: 'North' },
    ],
  },
};
const press = async (label: string) => fireEvent.press(await screen.findByLabelText(label));

describe('the payroll list like the web', () => {
  test('the cards add money as decimals and leave a reversed run out of what was paid', () => {
    expect(payrollSummary(runs)).toEqual({
      runs: 3,
      employees: 8,
      gross: '40000.20',
      net: '38000.40',
      drafts: 1,
      toReview: 1,
    });
    expect(payrollSummary([])).toMatchObject({ runs: 0, gross: '0.00', net: '0.00' });
  });
  test('search by run number, month or status; filters by status, month and branch', () => {
    const f = { q: '', status: '', month: '', branch: '' };
    expect(filterRuns(runs, { ...f, q: 'pr-0002' }).map((r) => r.id)).toEqual(['r-2']);
    expect(filterRuns(runs, { ...f, q: '2026-08' }).map((r) => r.id)).toEqual(['r-3']);
    expect(filterRuns(runs, { ...f, q: 'draft' }).map((r) => r.id)).toEqual(['r-1']);
    expect(filterRuns(runs, { ...f, status: 'APPROVED' }).map((r) => r.id)).toEqual(['r-2']);
    expect(filterRuns(runs, { ...f, month: '2026-10' }).map((r) => r.id)).toEqual(['r-1']);
    expect(filterRuns(runs, { ...f, branch: 'b-2' }).map((r) => r.id)).toEqual(['r-2']);
  });
  test('a month is empty or YYYY-MM', () => {
    expect(monthOk('')).toBe(true);
    expect(monthOk('2026-11')).toBe(true);
    expect(monthOk('2026-13')).toBe(false);
    expect(monthOk('11/2026')).toBe(false);
  });
  test('the screen shows the cards and filters the rows', async () => {
    route(base);
    await render(<PayrollScreen />, { wrapper });
    expect(await screen.findByText('Payroll runs')).toBeTruthy();
    expect(screen.getByText('Employees paid')).toBeTruthy();
    expect(screen.getByText('Draft runs')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Search by run number, month or status'), 'PR-0002');
    expect(screen.queryByText('2026-10 · PR-0001')).toBeNull();
    expect(screen.getByText('2026-09 · PR-0002')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Search by run number, month or status'), 'zzz');
    expect(screen.getByText('No run matches the search and filters.')).toBeTruthy();
  });
  test('a wrong month is refused on the field', async () => {
    route(base);
    await render(<PayrollScreen />, { wrapper });
    await fireEvent.changeText(await screen.findByLabelText('Month (YYYY-MM)'), '2026-13');
    expect(screen.getByText('Write the month like 2026-11.')).toBeTruthy();
  });
});

describe('edit and delete a draft run', () => {
  test('only a draft run can be edited or deleted', async () => {
    route(base);
    await render(<PayrollScreen />, { wrapper });
    await screen.findByText('2026-10 · PR-0001');
    expect(screen.getByLabelText('Edit PR-0001').props.accessibilityState.disabled).toBe(false);
    expect(screen.getByLabelText('Edit PR-0002').props.accessibilityState.disabled).toBe(true);
    expect(screen.getByLabelText('Delete PR-0002').props.accessibilityState.disabled).toBe(true);
  });

  test('Edit changes the month with PATCH and one Idempotency-Key', async () => {
    route(base);
    mockRequest.mockResolvedValue(run({ period: '2026-09' }));
    await render(<PayrollScreen />, { wrapper });
    await press('Edit PR-0001');
    expect(screen.getByText(/Payslips already drawn are cleared/)).toBeTruthy();
    await press('Previous month');
    await press('Save run');
    await waitFor(() => expect(mockRequest).toHaveBeenCalledTimes(1));
    const [m, p, o] = mockRequest.mock.calls[0] as [
      string,
      string,
      { body: unknown; idempotencyKey: string },
    ];
    expect([m, p]).toEqual(['PATCH', '/hr/payroll-runs/r-1']);
    expect(o.body).toEqual({ period: '2026-09' });
    expect(o.idempotencyKey).toBe('key-1');
    expect(await screen.findByText('Run updated.')).toBeTruthy();
  });

  test('Delete asks with the web sentence first; nothing is sent until confirmed', async () => {
    route(base);
    mockRequest.mockResolvedValue(null);
    await render(<PayrollScreen />, { wrapper });
    await press('Delete PR-0001');
    expect(
      screen.getByText(
        'The draft run for 2026-10 and its draft payslips will be removed. This cannot be undone.',
      ),
    ).toBeTruthy();
    expect(mockRequest).not.toHaveBeenCalled();
    await press('Delete run');
    await waitFor(() => expect(mockRequest).toHaveBeenCalledTimes(1));
    const [m, p, o] = mockRequest.mock.calls[0] as [
      string,
      string,
      { idempotencyKey: string; body?: unknown },
    ];
    expect([m, p]).toEqual(['DELETE', '/hr/payroll-runs/r-1']);
    expect(o.idempotencyKey).toBe('key-1');
    expect(o.body).toBeUndefined();
    expect(await screen.findByText('Run deleted.')).toBeTruthy();
  });

  test('Cancel sends nothing; a server refusal shows the reference', async () => {
    route(base);
    await render(<PayrollScreen />, { wrapper });
    await press('Delete PR-0001');
    await press('Cancel');
    expect(mockRequest).not.toHaveBeenCalled();
    await press('Delete PR-0001');
    mockRequest.mockRejectedValue(new ApiError(409, { title: 'RUN_NOT_DRAFT', correlationId: 'corr-38' }));
    await press('Delete run');
    expect(await screen.findByText(/corr-38/)).toBeTruthy();
  });

  test('without hr.payroll.prepare (approve only) there are no Edit or Delete buttons', async () => {
    mockMe = { userId: 'u-1', roles: [], permissions: ['hr.payroll.approve'] };
    route(base);
    await render(<PayrollScreen />, { wrapper });
    await screen.findByText('2026-10 · PR-0001');
    expect(screen.queryByLabelText('Edit PR-0001')).toBeNull();
    expect(screen.queryByLabelText('Delete PR-0001')).toBeNull();
  });
});

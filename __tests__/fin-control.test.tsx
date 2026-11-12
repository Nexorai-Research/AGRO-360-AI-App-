import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import parts from '../i18n-parts/fin.json';
import { i18n, setLanguage } from '../src/i18n';
import { ApiError } from '../src/api/errors';
import ControlScreen from '../src/features/finance/ControlScreen';

const mockGet = jest.fn();
const mockPost = jest.fn();
let mockMe: { userId: string; roles: string[]; permissions?: string[] };
let mockId = 0;
jest.mock('../src/auth/AuthProvider', () => ({
  useAuth: () => ({ status: 'signedIn', me: mockMe, client: { get: (...a: unknown[]) => mockGet(...a), post: (...a: unknown[]) => mockPost(...a) } }),
}));
jest.mock('../src/device', () => ({ newId: () => `key-${++mockId}` }));

let qc: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
const ALL = ['finance.account.view', 'finance.period.lock', 'finance.period.reopen', 'finance.budget.manage', 'finance.budget.approve', 'finance.exception.manage'];
const period = (o: Record<string, unknown>) => ({ id: 'p1', label: 'Oct 2026', startDate: '2026-10-01', endDate: '2026-10-31', status: 'OPEN', journals: 14, canReopen: false, ...o });
const year = { id: 'y1', label: '2026-27', startDate: '2026-04-01', endDate: '2027-03-31', status: 'OPEN', periods: [period({ id: 'p0', label: 'Sep 2026', status: 'LOCKED', canReopen: true }), period({})] };
const budget = (o: Record<string, unknown> = {}) => ({ id: 'bg1', name: 'Annual budget', fyLabel: '2026-27', version: 2, status: 'DRAFT', total: '240000.00', lineCount: 12, ...o });
const exc = (o: Record<string, unknown> = {}) => ({ id: 'x1', exceptionNo: 'EXC-1', code: 'AR_MISMATCH', severity: 'HIGH', title: 'Receivables differ from customer ledger', status: 'OPEN', raisedAt: '2026-11-10T05:00:00Z', resolution: null, ...o });
const base: Record<string, unknown> = {
  '/finance/periods': { items: [year] },
  '/finance/budgets': { items: [budget()] },
  '/finance/budgets/bg1': { ...budget(), lines: [{ accountCode: '6100', accountName: 'Electricity', month: '2026-04-01', amount: '20000.00' }] },
  '/reports/budget-variance': { from: '2026-04-01', to: '2026-11-12', rows: [{ code: '6100', name: 'Electricity', budget: '160000.00', actual: '170000.50', variance: '-10000.50', variancePct: '-6.25' }] },
  '/finance/exceptions': { items: [exc()] },
};
const answers = (o: Record<string, unknown> = {}) =>
  mockGet.mockImplementation(async (path: string) => {
    const v = path in o ? o[path] : base[path];
    if (v instanceof Error) throw v;
    return v;
  });
const press = async (label: string, i = 0) => fireEvent.press((await screen.findAllByLabelText(label))[i]!);
const type = async (label: string, text: string) => fireEvent.changeText(await screen.findByLabelText(label), text);

beforeAll(() => {
  for (const lg of ['en', 'hi', 'mr'] as const) i18n.addResourceBundle(lg, 'translation', parts[lg], true, true);
});
beforeEach(async () => {
  [mockGet, mockPost].forEach((m) => m.mockReset());
  mockId = 0;
  mockMe = { userId: 'u1', roles: [], permissions: ALL };
  qc = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retryDelay: 0 } } });
  await setLanguage('en');
  answers();
});

describe('periods', () => {
  test('lists months with status and entries', async () => {
    await render(<ControlScreen />, { wrapper });
    expect(await screen.findByText('Financial year 2026-27')).toBeTruthy();
    expect(screen.getByText('Oct 2026 (14 entries)')).toBeTruthy();
  });
  test('lock needs a reason of 10 characters and sends it', async () => {
    await render(<ControlScreen />, { wrapper });
    await press('Lock Oct 2026');
    await type('Reason (at least 10 characters)', 'short');
    expect(screen.getByLabelText('Lock the month').props.accessibilityState?.disabled).toBe(true);
    await type('Reason (at least 10 characters)', 'Month closed after review');
    mockPost.mockResolvedValue({});
    await press('Lock the month');
    await waitFor(() => expect(mockPost).toHaveBeenCalled());
    expect(mockPost.mock.calls[0]![0]).toBe('/finance/periods/p1/lock');
    expect(mockPost.mock.calls[0]![1].body).toEqual({ reason: 'Month closed after review' });
    expect(mockPost.mock.calls[0]![1].idempotencyKey).toBe('key-1');
  });
  test('only the latest locked month offers Reopen, with a reason', async () => {
    await render(<ControlScreen />, { wrapper });
    await press('Reopen Sep 2026');
    await type('Reason (at least 10 characters)', 'Missed a bill for September');
    mockPost.mockResolvedValue({});
    await press('Reopen the month');
    await waitFor(() => expect(mockPost.mock.calls[0]![0]).toBe('/finance/periods/p0/unlock'));
  });
  test('without the lock or reopen permission no buttons', async () => {
    mockMe = { userId: 'u1', roles: [], permissions: ['finance.account.view'] };
    await render(<ControlScreen />, { wrapper });
    await screen.findByText('Financial year 2026-27');
    expect(screen.queryByLabelText('Lock Oct 2026')).toBeNull();
    expect(screen.queryByLabelText('Reopen Sep 2026')).toBeNull();
  });
  test('a server refusal (period already locked) shows a reference', async () => {
    await render(<ControlScreen />, { wrapper });
    await press('Lock Oct 2026');
    await type('Reason (at least 10 characters)', 'Month closed after review');
    mockPost.mockRejectedValue(new ApiError(409, { title: 'PERIOD_LOCKED', correlationId: 'corr-pl' }));
    await press('Lock the month');
    expect(await screen.findByText(/corr-pl/)).toBeTruthy();
  });
  test('error, offline and no permission', async () => {
    answers({ '/finance/periods': new ApiError(500, { title: 'BOOM', correlationId: 'corr-c1' }) });
    await render(<ControlScreen />, { wrapper });
    expect(await screen.findByText(/corr-c1/)).toBeTruthy();
  });
  test('offline', async () => {
    answers({ '/finance/periods': new ApiError(0, null) });
    await render(<ControlScreen />, { wrapper });
    expect(await screen.findByText('No network. Check your connection and try again.')).toBeTruthy();
  });
  test('denied', async () => {
    mockMe = { userId: 'u1', roles: [], permissions: [] };
    await render(<ControlScreen />, { wrapper });
    expect(await screen.findByText('You do not have permission to see this.')).toBeTruthy();
  });
});

describe('budgets', () => {
  const openBudgets = async () => {
    await render(<ControlScreen />, { wrapper });
    await press('Budgets');
    await screen.findByText('Annual budget · 2026-27 v2');
  };
  test('lists with total in rupees and submits a draft', async () => {
    await openBudgets();
    expect(screen.getByText('₹2,40,000.00')).toBeTruthy();
    mockPost.mockResolvedValue({});
    await press('Submit');
    await waitFor(() => expect(mockPost.mock.calls[0]![0]).toBe('/finance/budgets/bg1/submit'));
  });
  test('approve and reject belong to the approver', async () => {
    answers({ '/finance/budgets': { items: [budget({ status: 'PENDING_APPROVAL' })] } });
    await openBudgets();
    mockPost.mockResolvedValue({});
    await press('Reject');
    await type('Reason for rejecting', 'Too high');
    await press('Reject', 1);
    await waitFor(() => expect(mockPost.mock.calls[0]![0]).toBe('/finance/budgets/bg1/reject'));
    expect(mockPost.mock.calls[0]![1].body).toEqual({ note: 'Too high' });
  });
  test('an approved budget shows against actual with the variance', async () => {
    answers({ '/finance/budgets': { items: [budget({ status: 'APPROVED' })] } });
    await openBudgets();
    await press('View Annual budget');
    expect(await screen.findByText('-₹10,000.50')).toBeTruthy();
    expect(mockGet.mock.calls.find((c) => c[0] === '/reports/budget-variance')![1].query.fyLabel).toBe('2026-27');
  });
  test('a draft budget shows its lines', async () => {
    await openBudgets();
    await press('View Annual budget');
    expect(await screen.findByText('6100 Electricity 2026-04')).toBeTruthy();
  });
  test('new version of an approved budget', async () => {
    answers({ '/finance/budgets': { items: [budget({ status: 'APPROVED' })] } });
    await openBudgets();
    mockPost.mockResolvedValue({});
    await press('New version');
    await waitFor(() => expect(mockPost.mock.calls[0]![0]).toBe('/finance/budgets/revise'));
    expect(mockPost.mock.calls[0]![1].body).toEqual({ fyLabel: '2026-27' });
  });
  test('empty', async () => {
    answers({ '/finance/budgets': { items: [] } });
    await render(<ControlScreen />, { wrapper });
    await press('Budgets');
    expect(await screen.findByText(/No budgets yet/)).toBeTruthy();
  });
});

describe('checks', () => {
  const openChecks = async () => {
    await render(<ControlScreen />, { wrapper });
    await press('Checks');
    await screen.findByText('EXC-1 · Receivables differ from customer ledger');
  };
  test('lists open checks and acknowledges one', async () => {
    await openChecks();
    mockPost.mockResolvedValue({});
    await press('Acknowledge EXC-1');
    await waitFor(() => expect(mockPost.mock.calls[0]![0]).toBe('/finance/exceptions/x1/acknowledge'));
  });
  test('resolve needs a written resolution', async () => {
    await openChecks();
    await press('Resolve EXC-1');
    expect(screen.getByLabelText('Mark resolved').props.accessibilityState?.disabled).toBe(true);
    await type('What was done to fix it', 'Posted the missing receipt');
    mockPost.mockResolvedValue({});
    await press('Mark resolved');
    await waitFor(() => expect(mockPost.mock.calls[0]![1].body).toEqual({ resolution: 'Posted the missing receipt' }));
  });
  test('run the checks now', async () => {
    await openChecks();
    mockPost.mockResolvedValue({});
    await press('Run the checks now');
    await waitFor(() => expect(mockPost.mock.calls[0]![0]).toBe('/finance/exceptions/run-checks'));
  });
  test('without the manage permission there are no actions', async () => {
    mockMe = { userId: 'u1', roles: [], permissions: ['finance.account.view'] };
    await openChecks();
    expect(screen.queryByLabelText('Run the checks now')).toBeNull();
    expect(screen.queryByLabelText('Acknowledge EXC-1')).toBeNull();
  });
  test('Hindi title', async () => {
    await setLanguage('hi');
    await render(<ControlScreen />, { wrapper });
    expect(await screen.findByText('अवधि, बजट और जाँच')).toBeTruthy();
  });
});

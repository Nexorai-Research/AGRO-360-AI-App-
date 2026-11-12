import type { ReactNode } from 'react';
import { Share } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '../src/api/errors';
import { i18n, setLanguage } from '../src/i18n';
import step4 from '../i18n-parts/step4.json';
import stf from '../i18n-parts/stf.json';
import PayrollScreen from '../src/features/staff/PayrollScreen';
import AdvanceDeskScreen from '../src/features/staff/AdvanceDeskScreen';
import FieldReviewScreen from '../src/features/staff/FieldReviewScreen';
import IncentivesScreen, { isRate } from '../src/features/staff/IncentivesScreen';

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

const slip = (over: Record<string, unknown> = {}) => ({
  id: 'p-1',
  slipNo: 'PS-1',
  employeeCode: 'EMP-1',
  employeeName: 'Sita Devi',
  paidDays: '26.00',
  unpaidDays: '0.00',
  gross: '20000.00',
  totalDeductions: '1000.00',
  incentive: '0.00',
  advanceRecovery: '500.00',
  adjustment: '0.00',
  adjustmentReason: null,
  net: '18500.00',
  paidAmount: '0.00',
  status: 'GENERATED',
  warnings: [],
  ...over,
});
const run = (over: Record<string, unknown> = {}) => ({
  id: 'r-1',
  runNo: 'PR-1',
  period: '2026-10',
  status: 'CALCULATED',
  employeeCount: 1,
  grossTotal: '20000.00',
  deductionTotal: '1000.00',
  netTotal: '18500.00',
  advanceTotal: '500.00',
  incentiveTotal: '0.00',
  exceptions: [{ code: 'NO_BANK', message: 'No bank account', employeeCode: 'EMP-1' }],
  reopenCount: 0,
  version: 1,
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
const lastReq = (i = 0) =>
  mockRequest.mock.calls[i] as [
    string,
    string,
    { body?: Record<string, unknown>; idempotencyKey: string; version?: number },
  ];

describe('payroll', () => {
  test('lists runs and opens one: totals, exceptions and slips in rupees', async () => {
    route({ '/hr/payroll-runs': { items: [run()] }, '/hr/payroll-runs/r-1': { ...run(), slips: [slip()] } });
    await render(<PayrollScreen />, { wrapper });
    expect(await screen.findByText('2026-10 · PR-1')).toBeTruthy();
    expect(screen.getByText('1 to review')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Open'));
    expect(await screen.findByText('EMP-1: No bank account')).toBeTruthy();
    expect(screen.getAllByText('₹18,500.00').length).toBeGreaterThan(0);
    expect(screen.getAllByText('₹500.00').length).toBeGreaterThan(0);
  });

  test('calculate and approve send POST with their own keys', async () => {
    route({ '/hr/payroll-runs': { items: [run()] }, '/hr/payroll-runs/r-1': { ...run(), slips: [slip()] } });
    mockRequest.mockResolvedValue(run());
    await render(<PayrollScreen />, { wrapper });
    await fireEvent.press(await screen.findByLabelText('Open'));
    await fireEvent.press(await screen.findByLabelText('Calculate'));
    await waitFor(() => expect(mockRequest).toHaveBeenCalledTimes(1));
    await fireEvent.press(await screen.findByLabelText('Approve and post'));
    await waitFor(() => expect(mockRequest).toHaveBeenCalledTimes(2));
    expect(lastReq(0)[0]).toBe('POST');
    expect(mockRequest.mock.calls.map((c) => c[1])).toEqual([
      '/hr/payroll-runs/r-1/calculate',
      '/hr/payroll-runs/r-1/approve',
    ]);
    expect(lastReq(0)[2].idempotencyKey).not.toBe(lastReq(1)[2].idempotencyKey);
  });

  test('a lost answer on approve retries with the same key', async () => {
    route({ '/hr/payroll-runs': { items: [run()] }, '/hr/payroll-runs/r-1': { ...run(), slips: [] } });
    mockRequest.mockRejectedValueOnce(new ApiError(0, null)).mockResolvedValue(run({ status: 'APPROVED' }));
    await render(<PayrollScreen />, { wrapper });
    await fireEvent.press(await screen.findByLabelText('Open'));
    await fireEvent.press(await screen.findByLabelText('Approve and post'));
    expect(await screen.findByText(NETWORK)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Approve and post'));
    await waitFor(() => expect(mockRequest).toHaveBeenCalledTimes(2));
    expect(lastReq(0)[2].idempotencyKey).toBe(lastReq(1)[2].idempotencyKey);
  });

  test('server refusal (approver is the preparer) is shown with its reference', async () => {
    route({ '/hr/payroll-runs': { items: [run()] }, '/hr/payroll-runs/r-1': { ...run(), slips: [] } });
    mockRequest.mockRejectedValue(new ApiError(409, { title: 'SELF_APPROVAL', correlationId: 'c-55' }));
    await render(<PayrollScreen />, { wrapper });
    await fireEvent.press(await screen.findByLabelText('Open'));
    await fireEvent.press(await screen.findByLabelText('Approve and post'));
    expect(await screen.findByText(/c-55/)).toBeTruthy();
  });

  test('adjust needs a signed amount and a reason', async () => {
    route({ '/hr/payroll-runs': { items: [run()] }, '/hr/payroll-runs/r-1': { ...run(), slips: [slip()] } });
    mockRequest.mockResolvedValue({});
    await render(<PayrollScreen />, { wrapper });
    await fireEvent.press(await screen.findByLabelText('Open'));
    await fireEvent.press(await screen.findByLabelText('Adjust'));
    await fireEvent.changeText(screen.getByLabelText('Amount (+ or -)'), '-250.50');
    await fireEvent.changeText(screen.getByLabelText('Reason'), 'Late fine');
    await fireEvent.press(screen.getByLabelText('Save'));
    await waitFor(() => expect(mockRequest).toHaveBeenCalledTimes(1));
    expect(lastReq()[1]).toBe('/hr/payroll-runs/r-1/payslips/p-1/adjust');
    expect(lastReq().at(2)).toMatchObject({ body: { adjustment: '-250.50', reason: 'Late fine' } });
  });

  test('pay a slip: amount defaults to the due amount, cannot exceed it', async () => {
    const approved = run({ status: 'APPROVED', exceptions: [] });
    route({
      '/hr/payroll-runs': { items: [approved] },
      '/hr/payroll-runs/r-1': { ...approved, slips: [slip({ paidAmount: '8500.00' })] },
    });
    mockRequest.mockResolvedValue({});
    await render(<PayrollScreen />, { wrapper });
    await fireEvent.press(await screen.findByLabelText('Open'));
    await fireEvent.press(await screen.findByLabelText('Pay'));
    expect(await screen.findByText('A part payment is fine. Due now: ₹10,000.00')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Amount (rupees)'), '10000.01');
    expect(await screen.findByText('More than is due.')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Amount (rupees)'), '4000');
    await fireEvent.press(screen.getByLabelText('Record payment'));
    await waitFor(() => expect(mockRequest).toHaveBeenCalledTimes(1));
    expect(lastReq()[1]).toBe('/hr/payslips/p-1/payments');
    expect(lastReq()[2].body).toMatchObject({ amount: '4000', mode: 'BANK_TRANSFER' });
  });

  test('bank file is shared as text, never logged', async () => {
    const approved = run({ status: 'APPROVED', exceptions: [] });
    route({
      '/hr/payroll-runs': { items: [approved] },
      '/hr/payroll-runs/r-1': { ...approved, slips: [] },
      '/hr/payroll-runs/r-1/bank-file': { fileName: 'salary-r-1.csv', csv: 'name,ifsc\nSita,SBIN' },
    });
    mockShare.mockResolvedValue({});
    await render(<PayrollScreen />, { wrapper });
    await fireEvent.press(await screen.findByLabelText('Open'));
    await fireEvent.press(await screen.findByLabelText('Share bank file (CSV)'));
    expect(await screen.findByText('Shared.')).toBeTruthy();
    expect(mockShare).toHaveBeenCalledWith({ title: 'salary-r-1.csv', message: 'name,ifsc\nSita,SBIN' });
  });

  test('new run uses the picked month', async () => {
    route({
      '/hr/payroll-runs': { items: [] },
      '/hr/payroll-runs/r-9': { ...run({ id: 'r-9' }), slips: [] },
    });
    mockRequest.mockResolvedValue(run({ id: 'r-9' }));
    await render(<PayrollScreen />, { wrapper });
    expect(await screen.findByText('No payroll runs yet.')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('New payroll run'));
    await fireEvent.press(screen.getByLabelText('Previous month'));
    await fireEvent.press(screen.getByLabelText('Create run'));
    await waitFor(() => expect(mockRequest).toHaveBeenCalledTimes(1));
    expect(lastReq()[1]).toBe('/hr/payroll-runs');
    expect(lastReq()[2].body?.period).toMatch(/^\d{4}-\d{2}$/);
  });

  test('offline, denied, Marathi', async () => {
    route({ '/hr/payroll-runs': new ApiError(0, null) });
    const a = await render(<PayrollScreen />, { wrapper });
    expect(
      await screen.findByText('No network. This cannot be loaded now.', {}, { timeout: 3000 }),
    ).toBeTruthy();
    await a.unmount();
    mockMe = { userId: 'u-1', roles: [], permissions: ['sales.view'] };
    const b = await render(<PayrollScreen />, { wrapper });
    expect(await screen.findByText('You do not have permission to see this.')).toBeTruthy();
    await b.unmount();
    mockMe = { userId: 'u-1', roles: [], permissions: undefined };
    await setLanguage('mr');
    route({ '/hr/payroll-runs': { items: [] } });
    qc.clear();
    await render(<PayrollScreen />, { wrapper });
    expect(await screen.findByText('अजून पगार रन नाहीत.')).toBeTruthy();
  });
});

describe('advances desk', () => {
  const adv = (over: Record<string, unknown> = {}) => ({
    id: 'a-1',
    advanceNo: 'ADV-1',
    employeeName: 'Sita Devi',
    amount: '6000.00',
    issuedOn: '2026-11-01',
    installments: 3,
    installmentAmount: '2000.00',
    startPeriod: '2026-12',
    recovered: '0.00',
    balance: '6000.00',
    status: 'PENDING',
    reason: null,
    ...over,
  });
  const desk = (items: unknown[]) => ({ items, summary: { openCount: 1, outstanding: '6000.00' } });

  test('approves a pending advance', async () => {
    route({ '/hr/advances': desk([adv()]) });
    mockRequest.mockResolvedValue({});
    await render(<AdvanceDeskScreen />, { wrapper });
    expect(await screen.findByText('ADV-1 · Sita Devi')).toBeTruthy();
    expect(screen.getByText('Waiting for approval')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Approve and pay out'));
    await waitFor(() => expect(mockRequest).toHaveBeenCalledTimes(1));
    expect(lastReq()[1]).toBe('/hr/advances/a-1/approve');
  });

  test('approve button is hidden without the approval permission', async () => {
    mockMe = { userId: 'u-1', roles: [], permissions: ['hr.advance.manage'] };
    route({ '/hr/advances': desk([adv()]) });
    await render(<AdvanceDeskScreen />, { wrapper });
    await screen.findByText('ADV-1 · Sita Devi');
    expect(screen.queryByLabelText('Approve and pay out')).toBeNull();
  });

  test('early repayment cannot exceed the balance; amount sent as a decimal string', async () => {
    route({ '/hr/advances': desk([adv({ status: 'OPEN', balance: '4000.00', recovered: '2000.00' })]) });
    mockRequest.mockResolvedValue({});
    await render(<AdvanceDeskScreen />, { wrapper });
    await fireEvent.press(await screen.findByLabelText('Repay early'));
    await fireEvent.changeText(screen.getByLabelText('Amount received'), '4000.01');
    expect(await screen.findByText('More than the balance.')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Amount received'), '1500');
    await fireEvent.press(screen.getByLabelText('Record repayment'));
    await waitFor(() => expect(mockRequest).toHaveBeenCalledTimes(1));
    expect(lastReq()[1]).toBe('/hr/advances/a-1/repay');
    expect(lastReq()[2].body).toMatchObject({ amount: '1500.00' });
  });

  test('shows the recoveries ledger; empty and error states', async () => {
    route({
      '/hr/advances': desk([adv({ status: 'OPEN' })]),
      '/hr/advances/a-1': adv({
        recoveries: [{ id: 'x', amount: '2000.00', kind: 'PAYROLL', recoveredOn: '2026-12-31', note: null }],
      }),
    });
    await render(<AdvanceDeskScreen />, { wrapper });
    await fireEvent.press(await screen.findByLabelText('Show recoveries'));
    expect(await screen.findByText('₹2,000.00')).toBeTruthy();
  });

  test('error shows the reference; empty list', async () => {
    route({ '/hr/advances': new ApiError(500, { title: 'BOOM', correlationId: 'c-31' }) });
    const a = await render(<AdvanceDeskScreen />, { wrapper });
    expect(await screen.findByText(/c-31/)).toBeTruthy();
    await a.unmount();
    qc.clear();
    route({ '/hr/advances': desk([]) });
    await render(<AdvanceDeskScreen />, { wrapper });
    expect(await screen.findByText('No advances.')).toBeTruthy();
  });
});

describe('field team review', () => {
  const base = {
    '/hr/field-visits/summary': {
      from: 'a',
      to: 'b',
      rows: [
        {
          employeeId: 'e-1',
          employeeName: 'Ravi',
          planned: 5,
          visited: 3,
          missed: 1,
          visits: 4,
          unplanned: 1,
          adherencePct: '60.00',
        },
      ],
    },
    '/hr/beat-plans': {
      items: [
        {
          id: 'b-1',
          employeeId: 'e-1',
          employeeName: 'Ravi',
          planDate: '2026-11-13',
          village: 'Rampur',
          purpose: null,
          status: 'PLANNED',
        },
      ],
    },
    '/hr/field-visits': {
      items: [
        {
          id: 'v-1',
          employeeName: 'Ravi',
          village: 'Rampur',
          visitedAt: '2026-11-11T05:00:00Z',
          outcome: 'ORDER',
          notes: null,
        },
      ],
    },
  };

  test('shows planned against actual, beats and visits; cancels a plan', async () => {
    route(base);
    mockRequest.mockResolvedValue({});
    await render(<FieldReviewScreen />, { wrapper });
    expect(await screen.findByText('60.00%')).toBeTruthy();
    expect(await screen.findByText(/13 Nov 2026 · Ravi/)).toBeTruthy();
    expect(screen.getByText('Rampur · Order received')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Cancel plan'));
    await waitFor(() => expect(mockRequest).toHaveBeenCalledTimes(1));
    expect(lastReq()[1]).toBe('/hr/beat-plans/b-1/cancel');
  });

  test('plans a visit for an officer', async () => {
    route({ ...base, '/hr/employees': { items: [{ id: 'e-1', code: 'EMP-1', name: 'Ravi' }] } });
    mockRequest.mockResolvedValue({});
    await render(<FieldReviewScreen />, { wrapper });
    await fireEvent.press(await screen.findByLabelText('Plan a visit for an officer'));
    await fireEvent.press(await screen.findByLabelText('EMP-1 Ravi'));
    await fireEvent.changeText(screen.getByLabelText('Village'), 'Sonpur');
    await fireEvent.press(screen.getByLabelText('Save'));
    await waitFor(() => expect(mockRequest).toHaveBeenCalledTimes(1));
    expect(lastReq()[1]).toBe('/hr/beat-plans');
    expect(lastReq()[2].body).toMatchObject({ employeeId: 'e-1', village: 'Sonpur' });
  });

  test('denied without hr.field.manage; offline', async () => {
    mockMe = { userId: 'u-1', roles: [], permissions: ['hr.field.self'] };
    const a = await render(<FieldReviewScreen />, { wrapper });
    expect(await screen.findByText('You do not have permission to see this.')).toBeTruthy();
    await a.unmount();
    mockMe = { userId: 'u-1', roles: [], permissions: undefined };
    route({ ...base, '/hr/field-visits/summary': new ApiError(0, null) });
    await render(<FieldReviewScreen />, { wrapper });
    expect(
      await screen.findByText('No network. This cannot be loaded now.', {}, { timeout: 3000 }),
    ).toBeTruthy();
  });
});

describe('incentives and performance', () => {
  test('rate check', () => {
    expect(isRate('2.5')).toBe(true);
    expect(isRate('0')).toBe(false);
    expect(isRate('100.0001')).toBe(false);
    expect(isRate('100')).toBe(true);
  });

  test('creates a rule and retires one', async () => {
    route({
      '/hr/incentive-rules': {
        items: [
          {
            id: 'i-1',
            code: 'S1',
            name: 'Sales 1',
            basis: 'SALES',
            ratePct: '1.5000',
            effectiveFrom: '2026-01-01',
            status: 'ACTIVE',
          },
        ],
      },
    });
    mockRequest.mockResolvedValue({});
    await render(<IncentivesScreen />, { wrapper });
    expect(await screen.findByText('S1 · Sales 1')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Retire rule'));
    await waitFor(() => expect(mockRequest).toHaveBeenCalledTimes(1));
    expect(lastReq()[1]).toBe('/hr/incentive-rules/i-1/retire');
    await fireEvent.press(screen.getByLabelText('New rule'));
    await fireEvent.changeText(screen.getByLabelText('Code'), 'c2');
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Collections');
    await fireEvent.press(screen.getByLabelText('Collections'));
    await fireEvent.changeText(screen.getByLabelText('Percent (0 to 100)'), '0.5');
    await fireEvent.press(screen.getByLabelText('Save'));
    await waitFor(() => expect(mockRequest).toHaveBeenCalledTimes(2));
    expect(lastReq(1)[2].body).toMatchObject({ code: 'C2', basis: 'COLLECTION', ratePct: '0.5' });
  });

  test('month tab previews without saving and approves drafts', async () => {
    route({
      '/hr/incentive-rules': { items: [] },
      '/hr/incentives': {
        items: [
          {
            id: 'c-1',
            employeeName: 'Ravi',
            employeeCode: 'EMP-2',
            ruleCode: 'S1',
            status: 'DRAFT',
            result: { amount: '1200.00', netBase: '80000.00' },
          },
        ],
      },
    });
    mockRequest.mockResolvedValue({
      rows: [{ employeeName: 'Ravi', ruleCode: 'S1', result: { amount: '999.00' } }],
    });
    await render(<IncentivesScreen />, { wrapper });
    await fireEvent.press(await screen.findByLabelText('Month'));
    expect(await screen.findByText('₹1,200.00')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Preview (saves nothing)'));
    expect(await screen.findByText('₹999.00')).toBeTruthy();
    expect(lastReq()[2].body).toMatchObject({ save: false });
    await fireEvent.press(screen.getByLabelText('Approve all drafts'));
    await waitFor(() => expect(mockRequest).toHaveBeenCalledTimes(2));
    expect(lastReq(1)[1]).toBe('/hr/incentives/approve');
  });

  test('performance report and denied state', async () => {
    mockMe = { userId: 'u-1', roles: [], permissions: ['hr.performance.view'] };
    route({
      '/hr/performance': {
        rows: [
          {
            employeeId: 'e-1',
            code: 'EMP-2',
            name: 'Ravi',
            netSales: '80000.00',
            salesCount: 40,
            collections: '5000.00',
            presentDays: '24.00',
            visitsPlanned: 10,
            visitsDone: 8,
            incentive: '1200.00',
          },
        ],
        totals: { netSales: '80000.00', collections: '5000.00', incentive: '1200.00' },
      },
    });
    const a = await render(<IncentivesScreen />, { wrapper });
    expect(await screen.findByText('EMP-2 · Ravi')).toBeTruthy();
    expect(screen.getByText('8 / 10')).toBeTruthy();
    await a.unmount();
    mockMe = { userId: 'u-1', roles: [], permissions: ['sales.view'] };
    await render(<IncentivesScreen />, { wrapper });
    expect(await screen.findByText('You do not have permission to see this.')).toBeTruthy();
  });
});

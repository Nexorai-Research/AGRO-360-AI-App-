import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '../src/api/errors';
import { i18n, setLanguage } from '../src/i18n';
import parts from '../i18n-parts/step4.json';
import LeaveScreen from '../src/features/hr/LeaveScreen';
import PayslipsScreen from '../src/features/hr/PayslipsScreen';
import VisitsScreen from '../src/features/hr/VisitsScreen';
import AdvancesScreen from '../src/features/hr/AdvancesScreen';
import { checkAmount, checkInstallments, checkLeave, checkVisit, isPeriod } from '../src/features/hr/logic';

const mockGet = jest.fn();
const mockPost = jest.fn();
let mockMe: { userId: string; roles: string[]; permissions?: string[] };
let mockId = 0;
const mockClient = { get: (...a: unknown[]) => mockGet(...a), post: (...a: unknown[]) => mockPost(...a) };
jest.mock('../src/auth/AuthProvider', () => ({
  useAuth: () => ({ status: 'signedIn', me: mockMe, client: mockClient, signIn: jest.fn(), signOut: jest.fn() }),
}));
jest.mock('../src/device', () => ({ newId: () => `key-${++mockId}` }));

let qc: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
const NETWORK = 'No network. Check your connection and try again.';

beforeAll(() => {
  for (const lang of ['en', 'hi', 'mr'] as const)
    i18n.addResourceBundle(lang, 'translation', (parts as Record<string, object>)[lang], true, true);
});
beforeEach(async () => {
  [mockGet, mockPost].forEach((m) => m.mockReset());
  mockId = 0;
  mockMe = { userId: 'u-1', roles: [], permissions: undefined };
  qc = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retryDelay: 0 } } });
  await setLanguage('en');
});

const lv = {
  id: 'l-1', requestNo: 'LV-1', employeeName: 'Sita', leaveType: 'Casual', fromDate: '2026-11-12', toDate: '2026-11-13',
  halfDay: false, days: '2.00', unpaidDays: '0.00', reason: null, status: 'SUBMITTED', decisionNote: null,
};

describe('helpers', () => {
  test('amount is a decimal string', () => {
    expect(checkAmount('5000')).toBeNull();
    expect(checkAmount('2500.50')).toBeNull();
    expect(checkAmount('')).toBe('required');
    expect(checkAmount('1.234')).toBe('format');
    expect(checkAmount('-5')).toBe('format');
    expect(checkAmount('0.00')).toBe('zero');
    expect(checkAmount('10000000.01')).toBe('max');
    expect(checkAmount('10000000')).toBeNull();
  });
  test('installments, period, leave, visit', () => {
    expect(checkInstallments('60')).toBe(true);
    expect(checkInstallments('61')).toBe(false);
    expect(checkInstallments('0')).toBe(false);
    expect(isPeriod('2026-13')).toBe(false);
    expect(isPeriod('2026-11')).toBe(true);
    expect(checkLeave({ typeId: 't', from: '2026-11-05', to: '2026-11-04', half: false })).toBe('order');
    expect(checkLeave({ typeId: 't', from: '2026-12-30', to: '2027-01-02', half: false })).toBe('year');
    expect(checkLeave({ typeId: 't', from: '2026-11-05', to: '2026-11-06', half: true })).toBe('half');
    expect(checkLeave({ typeId: 't', from: '2026-02-30', to: '2026-03-01', half: false })).toBe('from');
    expect(checkVisit({ village: ' ', beatId: '', outcome: 'ORDER' })).toBe('place');
    expect(checkVisit({ village: 'Wadi', beatId: '', outcome: '' })).toBe('outcome');
  });
  test('the three languages have the same keys', () => {
    const p = parts as Record<string, Record<string, Record<string, string>>>;
    for (const ns of Object.keys(p.en!)) {
      expect(Object.keys(p.hi![ns]!).sort()).toEqual(Object.keys(p.en![ns]!).sort());
      expect(Object.keys(p.mr![ns]!).sort()).toEqual(Object.keys(p.en![ns]!).sort());
    }
  });
});

describe('leave', () => {
  const route = () =>
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/hr/leaves') return { items: [lv] };
      if (path === '/hr/leave-balances') return { items: [{ leaveTypeId: 't-1', name: 'Casual', remaining: '8.00', quota: '12.00' }] };
      if (path === '/hr/leave-types') return { items: [{ id: 't-1', code: 'CL', name: 'Casual', active: true }] };
      return { items: [] };
    });

  test('lists requests and balances', async () => {
    route();
    await render(<LeaveScreen />, { wrapper });
    expect(await screen.findByText('LV-1 · Casual')).toBeTruthy();
    expect(await screen.findByText('8.00 of 12.00 days left')).toBeTruthy();
  });
  test('empty', async () => {
    mockGet.mockResolvedValue({ items: [] });
    await render(<LeaveScreen />, { wrapper });
    expect(await screen.findByText('No leave requests yet.')).toBeTruthy();
  });
  test('offline', async () => {
    mockGet.mockRejectedValue(new ApiError(0, null));
    await render(<LeaveScreen />, { wrapper });
    expect(await screen.findByText('No network. Leave cannot be loaded now.', {}, { timeout: 3000 })).toBeTruthy();
  });
  test('server error shows reference', async () => {
    mockGet.mockRejectedValue(new ApiError(500, { title: 'BOOM', correlationId: 'c-9' }));
    await render(<LeaveScreen />, { wrapper });
    expect(await screen.findByText(/c-9/)).toBeTruthy();
  });
  test('no permission: nothing called', async () => {
    mockMe = { userId: 'u-1', roles: [], permissions: [] };
    await render(<LeaveScreen />, { wrapper });
    expect(await screen.findByText('You do not have permission to see leave.')).toBeTruthy();
    expect(mockGet).not.toHaveBeenCalled();
  });
  test('approve and team tab are hidden without hr.leave.approve', async () => {
    mockMe = { userId: 'u-1', roles: [], permissions: ['hr.leave.self'] };
    route();
    await render(<LeaveScreen />, { wrapper });
    await screen.findByText('LV-1 · Casual');
    expect(screen.queryByLabelText('Approve')).toBeNull();
    expect(screen.queryByLabelText('Team leave')).toBeNull();
  });
  test('apply: bad dates block sending; lost answer retries with the same key; a different request gets a new key', async () => {
    route();
    await render(<LeaveScreen />, { wrapper });
    await screen.findByText('LV-1 · Casual');
    await fireEvent.press(screen.getByLabelText('Apply for leave'));
    await fireEvent.press((await screen.findAllByLabelText('Casual'))[0]!);
    await fireEvent.changeText(screen.getByLabelText('From date'), '2026-11-20');
    await fireEvent.changeText(screen.getByLabelText('To date'), '2026-11-19');
    expect(screen.getByText('The to date is before the from date.')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Send request'));
    expect(mockPost).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText('To date'), '2026-11-21');
    let first = true;
    mockPost.mockImplementation(async () => {
      if (first) {
        first = false;
        throw new ApiError(0, null);
      }
      return lv;
    });
    await fireEvent.press(screen.getByLabelText('Send request'));
    await screen.findByText(NETWORK);
    await fireEvent.press(screen.getByLabelText('Send request'));
    expect(await screen.findByText('Leave request sent.')).toBeTruthy();
    expect(mockPost.mock.calls.map((c) => c[1].idempotencyKey)).toEqual(['key-1', 'key-1']);
    expect(mockPost.mock.calls[0]![0]).toBe('/hr/leaves');
    expect(mockPost.mock.calls[0]![1].body).toMatchObject({ leaveTypeId: 't-1', fromDate: '2026-11-20', toDate: '2026-11-21', halfDay: false });
    expect(mockPost.mock.calls[0]![1].body).not.toHaveProperty('tenantId');

    await fireEvent.press(screen.getByLabelText('Apply for leave'));
    await fireEvent.press((await screen.findAllByLabelText('Casual'))[0]!);
    await fireEvent.changeText(screen.getByLabelText('From date'), '2026-12-01');
    await fireEvent.changeText(screen.getByLabelText('To date'), '2026-12-02');
    await fireEvent.press(screen.getByLabelText('Send request'));
    await screen.findByText('Leave request sent.');
    expect(mockPost.mock.calls[2]![1].idempotencyKey).toBe('key-2');
  });
  test('approver: rejection needs a reason; the call carries one key', async () => {
    mockMe = { userId: 'u-1', roles: [], permissions: ['hr.leave.self', 'hr.leave.approve'] };
    route();
    mockPost.mockResolvedValue(lv);
    await render(<LeaveScreen />, { wrapper });
    await screen.findByText('LV-1 · Casual');
    await fireEvent.press(screen.getByLabelText('Team leave'));
    await fireEvent.press(await screen.findByLabelText('Reject'));
    await fireEvent.changeText(screen.getByLabelText('Reason for rejecting'), 'ab');
    await fireEvent.press(screen.getByLabelText('Reject request'));
    expect(mockPost).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText('Reason for rejecting'), 'no cover');
    await fireEvent.press(screen.getByLabelText('Reject request'));
    expect(await screen.findByText('Leave LV-1 rejected.')).toBeTruthy();
    expect(mockPost.mock.calls[0]![0]).toBe('/hr/leaves/l-1/reject');
    expect(mockPost.mock.calls[0]![1].body).toEqual({ note: 'no cover' });
    expect(mockPost.mock.calls[0]![1].idempotencyKey).toBe('key-1');
  });
});

describe('payslips', () => {
  const slip = {
    id: 'p-1', slipNo: 'PS-1', period: '2026-10', employeeName: 'Sita', designation: null, workingDays: '26.00', paidDays: '25.00',
    unpaidDays: '1.00', earnings: [{ code: 'BASIC', name: 'Basic', amount: '25000.00' }], deductions: [{ code: 'PF', name: 'PF', amount: '1800.00' }],
    incentive: '0.00', advanceRecovery: '2000.00', adjustment: '0.00', gross: '25000.00', totalDeductions: '3800.00', net: '1221200.50',
    paidAmount: '0.00', status: 'PUBLISHED',
  };
  test('shows net pay in rupees with Indian grouping and opens details', async () => {
    mockGet.mockResolvedValue({ items: [slip] });
    await render(<PayslipsScreen />, { wrapper });
    expect(await screen.findByText('₹12,21,200.50')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Oct 2026'));
    expect(await screen.findByText('- ₹2,000.00')).toBeTruthy();
  });
  test('empty', async () => {
    mockGet.mockResolvedValue({ items: [] });
    await render(<PayslipsScreen />, { wrapper });
    expect(await screen.findByText('No payslip has been published for you yet.')).toBeTruthy();
  });
  test('offline', async () => {
    mockGet.mockRejectedValue(new ApiError(0, null));
    await render(<PayslipsScreen />, { wrapper });
    expect(await screen.findByText('No network. Payslips cannot be loaded now.', {}, { timeout: 3000 })).toBeTruthy();
  });
  test('server 403 shows denied', async () => {
    mockGet.mockRejectedValue(new ApiError(403, { title: 'FORBIDDEN' }));
    await render(<PayslipsScreen />, { wrapper });
    expect(await screen.findByText('You do not have permission to see payslips.')).toBeTruthy();
  });
  test('no permission', async () => {
    mockMe = { userId: 'u-1', roles: [], permissions: [] };
    await render(<PayslipsScreen />, { wrapper });
    expect(await screen.findByText('You do not have permission to see payslips.')).toBeTruthy();
    expect(mockGet).not.toHaveBeenCalled();
  });
  test('Hindi', async () => {
    await setLanguage('hi');
    mockGet.mockResolvedValue({ items: [] });
    await render(<PayslipsScreen />, { wrapper });
    expect(await screen.findByText('आपके लिए अभी कोई वेतन पर्ची जारी नहीं हुई है।')).toBeTruthy();
  });
});

describe('visits', () => {
  const route = () =>
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/hr/beat-plans') return { items: [{ id: 'b-1', employeeName: 'Sita', planDate: '2026-11-12', village: 'Wadi', purpose: null, status: 'PLANNED' }] };
      return { items: [] };
    });
  test('lists beats and empty visits', async () => {
    route();
    await render(<VisitsScreen />, { wrapper });
    expect(await screen.findByText('No visits recorded in the last 7 days.')).toBeTruthy();
    expect(screen.getAllByText('Wadi').length).toBeGreaterThan(0);
  });
  test('record visit: needs a place; retry keeps the key and offlineRef', async () => {
    route();
    await render(<VisitsScreen />, { wrapper });
    await fireEvent.press(await screen.findByLabelText('Record a visit'));
    await fireEvent.press(screen.getByLabelText('Order received'));
    expect(screen.getByLabelText('Save visit').props.accessibilityState?.disabled).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Village'), 'Kasba');
    let first = true;
    mockPost.mockImplementation(async () => {
      if (first) {
        first = false;
        throw new ApiError(0, null);
      }
      return {};
    });
    await fireEvent.press(screen.getByLabelText('Save visit'));
    await screen.findByText(NETWORK);
    await fireEvent.press(screen.getByLabelText('Save visit'));
    expect(await screen.findByText('Visit saved.')).toBeTruthy();
    const [p, o] = mockPost.mock.calls[0]!;
    expect(p).toBe('/hr/field-visits');
    expect(o.body).toMatchObject({ village: 'Kasba', outcome: 'ORDER', offlineRef: 'key-1' });
    expect(mockPost.mock.calls.map((c) => c[1].idempotencyKey)).toEqual(['key-1', 'key-1']);
  });
  test('changing the visit makes a new key', async () => {
    route();
    mockPost.mockRejectedValue(new ApiError(0, null));
    await render(<VisitsScreen />, { wrapper });
    await fireEvent.press(await screen.findByLabelText('Record a visit'));
    await fireEvent.press(screen.getByLabelText('Order received'));
    await fireEvent.changeText(screen.getByLabelText('Village'), 'A');
    await fireEvent.press(screen.getByLabelText('Save visit'));
    await screen.findByText(NETWORK);
    await fireEvent.changeText(screen.getByLabelText('Village'), 'B');
    await fireEvent.press(screen.getByLabelText('Save visit'));
    await screen.findByText(NETWORK);
    expect(mockPost.mock.calls.map((c) => c[1].idempotencyKey)).toEqual(['key-1', 'key-2']);
  });
  test('denied', async () => {
    mockMe = { userId: 'u-1', roles: [], permissions: [] };
    await render(<VisitsScreen />, { wrapper });
    expect(await screen.findByText('You do not have permission to see field visits.')).toBeTruthy();
    expect(mockGet).not.toHaveBeenCalled();
  });
  test('offline', async () => {
    mockGet.mockRejectedValue(new ApiError(0, null));
    await render(<VisitsScreen />, { wrapper });
    expect(await screen.findByText('No network. Visits cannot be loaded now.', {}, { timeout: 3000 })).toBeTruthy();
  });
});

describe('advances', () => {
  const adv = {
    id: 'a-1', advanceNo: 'ADV-1', employeeName: 'Sita', amount: '12000.00', issuedOn: '2026-11-01', installments: 4,
    installmentAmount: '3000.00', startPeriod: '2026-12', recovered: '3000.00', balance: '9000.00', status: 'APPROVED', reason: null,
  };
  const route = () =>
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/hr/advances') return { items: [adv], summary: { openCount: 1, outstanding: '9000.00' } };
      if (path === '/hr/me') return { id: 'e-1', code: 'E1', name: 'Sita' };
      return {};
    });
  test('lists with money from strings', async () => {
    route();
    await render(<AdvancesScreen />, { wrapper });
    expect(await screen.findByText('ADV-1 · ₹12,000.00')).toBeTruthy();
    expect(screen.getAllByText('₹9,000.00').length).toBeGreaterThan(0);
  });
  test('empty', async () => {
    mockGet.mockResolvedValue({ items: [], summary: { openCount: 0, outstanding: '0.00' } });
    await render(<AdvancesScreen />, { wrapper });
    expect(await screen.findByText('No advances.')).toBeTruthy();
  });
  test('no permission hides the request button and calls nothing', async () => {
    mockMe = { userId: 'u-1', roles: [], permissions: ['hr.leave.self'] };
    await render(<AdvancesScreen />, { wrapper });
    expect(await screen.findByText('You do not have permission to see advances.')).toBeTruthy();
    expect(screen.queryByLabelText('Request an advance')).toBeNull();
    expect(mockGet).not.toHaveBeenCalled();
  });
  test('offline', async () => {
    mockGet.mockRejectedValue(new ApiError(0, null));
    await render(<AdvancesScreen />, { wrapper });
    expect(await screen.findByText('No network. Advances cannot be loaded now.', {}, { timeout: 3000 })).toBeTruthy();
  });
  test('request: bad amount refused; valid sends a decimal string with a stable key', async () => {
    route();
    await render(<AdvancesScreen />, { wrapper });
    await fireEvent.press(await screen.findByLabelText('Request an advance'));
    await fireEvent.changeText(screen.getByLabelText('Amount (rupees)'), '12.345');
    expect(await screen.findByText(/at most 2 decimals/)).toBeTruthy();
    expect(mockPost).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText('Amount (rupees)'), '5000.5');
    expect(await screen.findByText('About ₹5,000.50 a month')).toBeTruthy();
    let first = true;
    mockPost.mockImplementation(async () => {
      if (first) {
        first = false;
        throw new ApiError(0, null);
      }
      return adv;
    });
    await fireEvent.press(screen.getByLabelText('Send request'));
    await screen.findByText(NETWORK);
    await fireEvent.press(screen.getByLabelText('Send request'));
    expect(await screen.findByText('Advance request sent.')).toBeTruthy();
    const [p, o] = mockPost.mock.calls[0]!;
    expect(p).toBe('/hr/advances');
    expect(o.body).toMatchObject({ employeeId: 'e-1', amount: '5000.50', installments: 1 });
    expect(typeof o.body.amount).toBe('string');
    expect(mockPost.mock.calls.map((c) => c[1].idempotencyKey)).toEqual(['key-1', 'key-1']);
  });
});

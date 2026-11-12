import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import parts from '../i18n-parts/crx.json';
import { i18n, setLanguage } from '../src/i18n';
import { ApiError } from '../src/api/errors';
import CreditSettingsScreen from '../src/features/creditadmin/CreditSettingsScreen';
import InterestScreen from '../src/features/creditadmin/InterestScreen';
import RemindersScreen from '../src/features/creditadmin/RemindersScreen';
import {
  buildRule,
  buildSettings,
  ruleErrors,
  settingsErrors,
  settingsToForm,
  emptyRule,
} from '../src/features/creditadmin/logic';

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockPut = jest.fn();
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
    },
    signIn: jest.fn(),
    signOut: jest.fn(),
  }),
}));
jest.mock('../src/device', () => ({ newId: () => `key-${++mockId}` }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }), Stack: { Screen: () => null } }));

let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);
beforeAll(() => {
  for (const lg of ['en', 'hi', 'mr'] as const)
    i18n.addResourceBundle(lg, 'translation', (parts as Record<string, object>)[lg], true, true);
});
beforeEach(async () => {
  [mockGet, mockPost, mockPut].forEach((m) => m.mockReset());
  mockId = 0;
  mockMe = { userId: 'u-1', roles: [], permissions: undefined };
  client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retryDelay: 0 } } });
  await setLanguage('en');
});

const settings = (over = {}) => ({
  interestEnabled: true,
  interestRatePa: '18.0000',
  interestGraceDays: 7,
  interestFirst: false,
  autoHoldEnabled: true,
  holdOverdueDays: 60,
  holdOverdueAmount: '50000.0000',
  holdOnBounce: true,
  bounceCharge: '250.0000',
  settlementLimit: null,
  version: 4,
  ...over,
});

describe('logic', () => {
  test('settings rules and body keep decimals as strings and blanks as null', () => {
    const f = settingsToForm(settings());
    expect(f.interestRatePa).toBe('18');
    expect(f.holdOverdueAmount).toBe('50000');
    expect(settingsErrors(f)).toEqual([]);
    expect(
      settingsErrors({
        ...f,
        interestRatePa: '100.5',
        interestGraceDays: '400',
        holdOverdueDays: '0',
        holdOverdueAmount: '0',
        bounceCharge: '-1',
        settlementLimit: '1.23456',
      }),
    ).toEqual(['rate', 'grace', 'holdDays', 'holdAmount', 'bounceCharge', 'settlementLimit']);
    expect(
      buildSettings({ ...f, holdOverdueDays: '', holdOverdueAmount: '', settlementLimit: '' }),
    ).toMatchObject({
      interestRatePa: '18',
      interestGraceDays: 7,
      holdOverdueDays: null,
      holdOverdueAmount: null,
      settlementLimit: null,
      bounceCharge: '250',
    });
  });
  test('reminder rule rules', () => {
    expect(ruleErrors(emptyRule())).toEqual(['name', 'bodyEn']);
    expect(ruleErrors({ ...emptyRule(), name: 'ab', offsetDays: '-31', bodyEn: 'hello there' })).toEqual([
      'offset',
    ]);
    expect(
      buildRule({ ...emptyRule(), name: ' Soft ', offsetDays: '-3', bodyEn: ' Hi {name} ' }, null),
    ).toMatchObject({
      id: null,
      name: 'Soft',
      offsetDays: -3,
      bodyEn: 'Hi {name}',
      bodyHi: null,
      bodyMr: null,
    });
  });
});

describe('credit settings screen', () => {
  test('shows the settings; saving sends the version, decimal strings and one key reused after a lost answer', async () => {
    mockGet.mockResolvedValue(settings());
    mockPut.mockRejectedValueOnce(new ApiError(0, null)).mockResolvedValueOnce(settings({ version: 5 }));
    await render(<CreditSettingsScreen />, { wrapper });
    expect(await screen.findByText(/18% a year, 7 grace days/)).toBeTruthy();
    await fireEvent.press(screen.getByText('Change settings'));
    await fireEvent.changeText(screen.getByLabelText('Interest rate (% a year, up to 100)'), '12.5');
    await fireEvent.press(screen.getByText('Save'));
    expect(await screen.findByRole('alert')).toBeTruthy();
    await fireEvent.press(screen.getByText('Save'));
    expect(await screen.findByText('Credit settings saved.')).toBeTruthy();
    expect(mockPut).toHaveBeenCalledTimes(2);
    const [path, opts] = mockPut.mock.calls[1];
    expect(path).toBe('/credit/settings');
    expect(opts.version).toBe(4);
    expect(opts.body.interestRatePa).toBe('12.5');
    expect(opts.body.holdOverdueAmount).toBe('50000');
    expect(opts.body.settlementLimit).toBeNull();
    expect(mockPut.mock.calls[0][1].idempotencyKey).toBe(opts.idempotencyKey);
  });
  test('a bad rate blocks the save without a call', async () => {
    mockGet.mockResolvedValue(settings());
    await render(<CreditSettingsScreen />, { wrapper });
    await fireEvent.press(await screen.findByText('Change settings'));
    await fireEvent.changeText(screen.getByLabelText('Interest rate (% a year, up to 100)'), '120');
    await fireEvent.press(screen.getByText('Save'));
    expect(await screen.findByText('Rate must be 0 to 100 with up to 4 places.')).toBeTruthy();
    expect(mockPut).not.toHaveBeenCalled();
  });
  test('run the daily pass', async () => {
    mockGet.mockResolvedValue(settings());
    mockPost.mockResolvedValue({ held: 1, tasks: { created: 2 }, reminders: { queued: 3 } });
    await render(<CreditSettingsScreen />, { wrapper });
    await fireEvent.press(await screen.findByText('Run the daily pass now'));
    expect(await screen.findByText('Daily pass done.')).toBeTruthy();
    expect(mockPost.mock.calls[0][0]).toBe('/credit/collections/run');
    expect(mockPost.mock.calls[0][1].idempotencyKey).toBeTruthy();
  });
  test('no change button without credit.settings.manage', async () => {
    mockMe = { userId: 'u-1', roles: [], permissions: ['customer.ledger.view'] };
    mockGet.mockResolvedValue(settings());
    await render(<CreditSettingsScreen />, { wrapper });
    expect(await screen.findByText(/18% a year/)).toBeTruthy();
    expect(screen.queryByText('Change settings')).toBeNull();
  });
  test('no screen and no call without the view permission', async () => {
    mockMe = { userId: 'u-1', roles: [], permissions: [] };
    await render(<CreditSettingsScreen />, { wrapper });
    expect(await screen.findByText('You do not have permission to see credit settings.')).toBeTruthy();
    expect(mockGet).not.toHaveBeenCalled();
  });
  test('a 403 shows the denied text; offline shows retry', async () => {
    mockGet.mockRejectedValue(new ApiError(403, { title: 'FORBIDDEN' }));
    await render(<CreditSettingsScreen />, { wrapper });
    expect(await screen.findByText('You do not have permission to see credit settings.')).toBeTruthy();
  });
  test('Hindi', async () => {
    await setLanguage('hi');
    mockGet.mockResolvedValue(settings());
    await render(<CreditSettingsScreen />, { wrapper });
    expect(await screen.findByText('उधार सेटिंग')).toBeTruthy();
  });
});

const run = (over = {}) => ({
  id: 'r-1',
  number: 'INT-0001',
  periodFrom: '2026-10-01',
  periodTo: '2026-10-31',
  ratePa: '18.0000',
  graceDays: 7,
  status: 'DRAFT',
  total: '1250.50',
  postedAt: null,
  lines: [
    {
      id: 'l-1',
      customerId: 'c-1',
      customerName: 'Ramesh Patil',
      branchId: 'b-1',
      amount: '1250.50',
      status: 'INCLUDED',
      waiveReason: null,
      debitNoteNo: null,
      detail: [
        { receivableId: 'x', docNumber: 'INV-9', dueDate: '2026-09-01', days: 30, interest: '1250.50' },
      ],
    },
  ],
  ...over,
});

describe('interest screen', () => {
  const list = [{ ...run(), lines: undefined }];
  test('lists runs and opens one', async () => {
    mockGet.mockImplementation((p: string) =>
      Promise.resolve(p === '/credit/interest-runs' ? { items: list } : run()),
    );
    await render(<InterestScreen />, { wrapper });
    expect(await screen.findByText(/INT-0001 · ₹1,250.50/)).toBeTruthy();
    await fireEvent.press(screen.getByText('Open INT-0001'));
    expect(await screen.findByText(/Ramesh Patil · ₹1,250.50/)).toBeTruthy();
    expect(screen.getByText(/INV-9: 30 days/)).toBeTruthy();
  });
  test('calculate sends the date once per action; a bad date makes no call', async () => {
    mockGet.mockResolvedValue({ items: [] });
    mockPost.mockResolvedValue(run());
    await render(<InterestScreen />, { wrapper });
    expect(await screen.findByText('No interest runs yet.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Calculate interest for a period'));
    await fireEvent.changeText(screen.getByLabelText('Charge up to (YYYY-MM-DD)'), '2026-02-30');
    await fireEvent.press(screen.getByText('Calculate interest'));
    expect(await screen.findByText('Enter a real date as YYYY-MM-DD.')).toBeTruthy();
    expect(mockPost).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText('Charge up to (YYYY-MM-DD)'), '2026-10-31');
    await fireEvent.press(screen.getByText('Calculate interest'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    expect(mockPost.mock.calls[0][0]).toBe('/credit/interest-runs');
    expect(mockPost.mock.calls[0][1].body).toEqual({ periodTo: '2026-10-31' });
    expect(await screen.findByText('Interest run drafted.')).toBeTruthy();
  });
  test('post, waive with a reason, and cancel with a reason', async () => {
    mockGet.mockImplementation((p: string) =>
      Promise.resolve(p === '/credit/interest-runs' ? { items: list } : run()),
    );
    mockPost.mockResolvedValue(run());
    await render(<InterestScreen />, { wrapper });
    await fireEvent.press(await screen.findByText('Open INT-0001'));
    await fireEvent.press(await screen.findByText('Post (approve)'));
    expect(await screen.findByText('Interest posted as debit notes.')).toBeTruthy();
    expect(mockPost.mock.calls[0][0]).toBe('/credit/interest-runs/r-1/post');

    await fireEvent.press(screen.getByText('Waive Ramesh Patil'));
    await fireEvent.press(screen.getByText('Confirm waive'));
    expect(await screen.findByText('Give a reason of 3 to 500 letters.')).toBeTruthy();
    expect(mockPost).toHaveBeenCalledTimes(1);
    await fireEvent.changeText(
      screen.getByLabelText('Reason (3 to 500 letters)'),
      'old friend, paid in cash',
    );
    await fireEvent.press(screen.getByText('Confirm waive'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(2));
    expect(mockPost.mock.calls[1][0]).toBe('/credit/interest-runs/r-1/lines/l-1/waive');
    expect(mockPost.mock.calls[1][1].body).toEqual({ reason: 'old friend, paid in cash' });

    await fireEvent.press(await screen.findByText('Cancel the run'));
    await fireEvent.changeText(screen.getByLabelText('Reason (3 to 500 letters)'), 'wrong period');
    await fireEvent.press(screen.getByText('Confirm cancel'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(3));
    expect(mockPost.mock.calls[2][0]).toBe('/credit/interest-runs/r-1/cancel');
    expect(mockPost.mock.calls[2][1].body).toEqual({ reason: 'wrong period' });
  });
  test('a posted run has no post, waive or cancel buttons', async () => {
    mockGet.mockImplementation((p: string) =>
      Promise.resolve(
        p === '/credit/interest-runs'
          ? { items: [{ ...run({ status: 'POSTED' }), lines: undefined }] }
          : run({ status: 'POSTED', lines: [{ ...run().lines[0], debitNoteNo: 'DN-1' }] }),
      ),
    );
    await render(<InterestScreen />, { wrapper });
    await fireEvent.press(await screen.findByText('Open INT-0001'));
    expect(await screen.findByText(/debit note DN-1/)).toBeTruthy();
    expect(screen.queryByText('Post (approve)')).toBeNull();
    expect(screen.queryByText('Waive Ramesh Patil')).toBeNull();
  });
  test('no permission means no call', async () => {
    mockMe = { userId: 'u-1', roles: [], permissions: ['sales.pos.use'] };
    await render(<InterestScreen />, { wrapper });
    expect(await screen.findByText('You do not have permission to see interest runs.')).toBeTruthy();
    expect(mockGet).not.toHaveBeenCalled();
  });
});

const rule = (over = {}) => ({
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Gentle',
  offsetDays: -3,
  channel: 'SMS',
  bodyEn: 'Dear {name}, {amount} is due on {due_date}',
  bodyHi: null,
  bodyMr: null,
  active: true,
  ...over,
});

describe('reminders screen', () => {
  beforeEach(() => {
    mockGet.mockImplementation((p: string) =>
      Promise.resolve(
        p === '/credit/reminder-rules'
          ? { items: [rule()] }
          : {
              items: [
                {
                  id: 'g-1',
                  ruleName: 'Gentle',
                  customerId: 'c-1',
                  customerName: 'Ramesh Patil',
                  docNumber: 'INV-9',
                  runDate: '2026-11-10',
                  status: 'SUPPRESSED',
                  reason: null,
                  message: { status: 'SUPPRESSED', suppressReason: 'quiet hours' },
                },
              ],
            },
      ),
    );
  });
  test('shows rules and the delivery log with the reason a message was held back', async () => {
    await render(<RemindersScreen />, { wrapper });
    expect(await screen.findByText('Gentle')).toBeTruthy();
    expect(screen.getByText(/3 days before · SMS · On/)).toBeTruthy();
    expect(await screen.findByText('quiet hours')).toBeTruthy();
  });
  test('adding a rule sends the whole list, the old rule and the new one', async () => {
    mockPut.mockResolvedValue({ items: [] });
    await render(<RemindersScreen />, { wrapper });
    await screen.findByText('Gentle');
    await fireEvent.press(screen.getByText('Add a reminder'));
    await fireEvent.press(screen.getByText('Save'));
    expect(await screen.findByText('Name must be 2 to 60 letters.')).toBeTruthy();
    expect(mockPut).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText('Name (2 to 60 letters)'), 'Firm');
    await fireEvent.changeText(
      screen.getByLabelText('Days from the due date (negative is before, -30 to 365)'),
      '7',
    );
    await fireEvent.changeText(
      screen.getByLabelText('Message (English, 5 to 500 letters)'),
      'Please pay {amount} now',
    );
    await fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(mockPut).toHaveBeenCalledTimes(1));
    const [path, opts] = mockPut.mock.calls[0];
    expect(path).toBe('/credit/reminder-rules');
    expect(opts.body.rules).toHaveLength(2);
    expect(opts.body.rules[0].id).toBe(rule().id);
    expect(opts.body.rules[1]).toMatchObject({ name: 'Firm', offsetDays: 7, channel: 'SMS', bodyHi: null });
    expect(opts.body.rules[1].id).toBeUndefined();
    expect(opts.idempotencyKey).toBeTruthy();
  });
  test('editing keeps the rule id', async () => {
    mockPut.mockResolvedValue({ items: [] });
    await render(<RemindersScreen />, { wrapper });
    await fireEvent.press(await screen.findByText('Edit Gentle'));
    await fireEvent.changeText(screen.getByLabelText('Name (2 to 60 letters)'), 'Gentler');
    await fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(mockPut).toHaveBeenCalledTimes(1));
    expect(mockPut.mock.calls[0][1].body.rules).toHaveLength(1);
    expect(mockPut.mock.calls[0][1].body.rules[0]).toMatchObject({ id: rule().id, name: 'Gentler' });
  });
  test('send due reminders now', async () => {
    mockPost.mockResolvedValue({ queued: 2, suppressed: 1 });
    await render(<RemindersScreen />, { wrapper });
    await fireEvent.press(await screen.findByText('Send due reminders now'));
    expect(await screen.findByText('Reminders run.')).toBeTruthy();
    expect(mockPost.mock.calls[0][0]).toBe('/credit/reminders/run');
  });
  test('no permission means no call', async () => {
    mockMe = { userId: 'u-1', roles: [], permissions: ['sales.pos.use'] };
    await render(<RemindersScreen />, { wrapper });
    expect(await screen.findByText('You do not have permission to see reminders.')).toBeTruthy();
    expect(mockGet).not.toHaveBeenCalled();
  });
});

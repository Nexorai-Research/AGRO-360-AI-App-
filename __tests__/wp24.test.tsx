import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setLanguage } from '../src/i18n';
import {
  DayEndBanner,
  DayEndSchedules,
  dueSchedules,
  scheduleError,
  validPostpone,
} from '../src/features/pos/DayEndSchedules';
import type { DayEndSchedule } from '../src/features/pos/api-more';

const mockGet = jest.fn();
const mockPut = jest.fn();
const mockPost = jest.fn();
let mockMe: { userId: string; tenantId: string; roles: string[]; permissions?: string[] };
let mockId = 0;
jest.mock('../src/auth/AuthProvider', () => ({
  useAuth: () => ({
    status: 'signedIn',
    me: mockMe,
    client: {
      get: (...a: unknown[]) => mockGet(...a),
      put: (...a: unknown[]) => mockPut(...a),
      post: (...a: unknown[]) => mockPost(...a),
    },
  }),
}));
jest.mock('../src/device', () => ({ newId: () => `key-${++mockId}` }));

const NOW = Date.parse('2026-11-21T15:00:00.000Z');
const sched = (o: Partial<DayEndSchedule> = {}): DayEndSchedule => ({
  branchId: 'b-1',
  branchName: 'Main branch',
  enabled: true,
  closeTime: '21:00',
  reminderMinutes: 15,
  autoClose: true,
  postponedUntil: null,
  lastResult: null,
  businessDate: '2026-11-21',
  closedToday: false,
  closeAt: new Date(NOW + 10 * 60000).toISOString(),
  ...o,
});

let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);
beforeEach(async () => {
  [mockGet, mockPut, mockPost].forEach((m) => m.mockReset());
  mockId = 0;
  mockMe = { userId: 'u-1', tenantId: 't-1', roles: [], permissions: ['pos.dayend'] };
  client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retryDelay: 0 } } });
  await setLanguage('en');
});

describe('rules like the server', () => {
  test('time like 21:00 and a reminder of 0 to 240', () => {
    expect(scheduleError({ closeTime: '21:00', reminderMinutes: '15' })).toBeNull();
    expect(scheduleError({ closeTime: '21:00', reminderMinutes: '' })).toBeNull();
    expect(scheduleError({ closeTime: '9pm', reminderMinutes: '15' })).toBe('time');
    expect(scheduleError({ closeTime: '24:00', reminderMinutes: '15' })).toBe('time');
    expect(scheduleError({ closeTime: '21:00', reminderMinutes: '241' })).toBe('reminder');
    expect(scheduleError({ closeTime: '21:00', reminderMinutes: '-5' })).toBe('reminder');
  });
  test('postpone is 5 to 240 whole minutes', () => {
    expect(validPostpone('30')).toBe(true);
    expect(validPostpone('5')).toBe(true);
    expect(validPostpone('4')).toBe(false);
    expect(validPostpone('241')).toBe(false);
    expect(validPostpone('2.5')).toBe(false);
  });
  test('a branch is reminded only when on, not closed, and inside its window', () => {
    expect(dueSchedules([sched()], NOW)).toHaveLength(1);
    expect(dueSchedules([sched({ enabled: false })], NOW)).toHaveLength(0);
    expect(dueSchedules([sched({ closedToday: true })], NOW)).toHaveLength(0);
    expect(dueSchedules([sched({ closeAt: new Date(NOW + 60 * 60000).toISOString() })], NOW)).toHaveLength(0);
    expect(dueSchedules([sched({ closeAt: new Date(NOW - 60000).toISOString() })], NOW)).toHaveLength(1);
  });
});

describe('the schedules card', () => {
  test('lists the branches from the server', async () => {
    mockGet.mockResolvedValue({ items: [sched(), sched({ branchId: 'b-2', branchName: 'Godown', enabled: false })] });
    await render(<DayEndSchedules />, { wrapper });
    expect(await screen.findByText('Main branch')).toBeTruthy();
    expect(screen.getByText('Godown')).toBeTruthy();
    expect(screen.getByText('Automatic day-end is off')).toBeTruthy();
    expect(mockGet.mock.calls[0][0]).toBe('/pos/day-end-schedules');
  });

  test('without pos.dayend nothing is shown and nothing is asked', async () => {
    mockMe.permissions = ['pos.shift'];
    await render(<DayEndSchedules />, { wrapper });
    expect(screen.queryByText('Automatic day-end')).toBeNull();
    expect(mockGet).not.toHaveBeenCalled();
  });

  test('edit sends the body the server expects, with an Idempotency-Key', async () => {
    mockGet.mockResolvedValue({ items: [sched()] });
    mockPut.mockResolvedValue(sched({ closeTime: '20:30' }));
    await render(<DayEndSchedules />, { wrapper });
    await fireEvent.press(await screen.findByText('Edit'));
    await fireEvent.changeText(screen.getByLabelText('Closing time (India time), like 21:00'), '20:30');
    await fireEvent.press(screen.getByText('Only reminds'));
    await fireEvent.press(screen.getByText('Save schedule'));
    await waitFor(() => expect(mockPut).toHaveBeenCalledTimes(1));
    expect(mockPut.mock.calls[0][0]).toBe('/pos/day-end-schedules/b-1');
    expect(mockPut.mock.calls[0][1]).toEqual({
      body: { enabled: true, closeTime: '20:30', reminderMinutes: 15, autoClose: false },
      idempotencyKey: 'key-1',
    });
    expect(await screen.findByText('Day-end schedule saved.')).toBeTruthy();
  });

  test('a bad time is stopped before it is sent', async () => {
    mockGet.mockResolvedValue({ items: [sched()] });
    await render(<DayEndSchedules />, { wrapper });
    await fireEvent.press(await screen.findByText('Edit'));
    await fireEvent.changeText(screen.getByLabelText('Closing time (India time), like 21:00'), '9pm');
    expect(screen.getByText('Enter a time like 21:00.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Save schedule'));
    expect(mockPut).not.toHaveBeenCalled();
  });

  test('postpone sends the minutes; it is off when the schedule is off or the day is closed', async () => {
    mockGet.mockResolvedValue({
      items: [sched(), sched({ branchId: 'b-2', branchName: 'Godown', closedToday: true })],
    });
    mockPost.mockResolvedValue(sched());
    await render(<DayEndSchedules />, { wrapper });
    await screen.findByText('Main branch');
    const buttons = screen.getAllByText('Postpone');
    expect(buttons).toHaveLength(2);
    await fireEvent.press(buttons[1]!); // Godown: closed today, disabled
    expect(screen.queryByText('Postpone by (minutes)')).toBeNull();
    await fireEvent.press(buttons[0]!);
    await fireEvent.changeText(screen.getByLabelText('Postpone by (minutes)'), '45');
    await fireEvent.press(screen.getAllByText('Postpone')[0]!);
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    expect(mockPost.mock.calls[0][0]).toBe('/pos/day-end-schedules/b-1/postpone');
    expect(mockPost.mock.calls[0][1]).toEqual({ body: { minutes: 45 }, idempotencyKey: 'key-1' });
  });

  test('a server refusal is shown, not hidden', async () => {
    mockGet.mockResolvedValue({ items: [sched()] });
    const { ApiError } = jest.requireActual('../src/api/errors');
    mockPut.mockRejectedValue(new ApiError(409, { title: 'DAY_ALREADY_CLOSED' }, 'corr-1'));
    await render(<DayEndSchedules />, { wrapper });
    await fireEvent.press(await screen.findByText('Edit'));
    await fireEvent.press(screen.getByText('Save schedule'));
    await waitFor(() => expect(mockPut).toHaveBeenCalled());
    expect(await screen.findByRole('alert')).toBeTruthy();
  });

  test('a network failure on loading says so', async () => {
    const { ApiError } = jest.requireActual('../src/api/errors');
    mockGet.mockRejectedValue(new ApiError(0, null, 'corr-2'));
    await render(<DayEndSchedules />, { wrapper });
    expect(await screen.findByText(/internet|network|offline/i)).toBeTruthy();
  });
});

describe('the countdown banner', () => {
  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(NOW);
  });
  afterEach(() => jest.restoreAllMocks());

  test('shows the minutes left and Postpone 30 min sends 30', async () => {
    mockGet.mockResolvedValue({ items: [sched()] });
    mockPost.mockResolvedValue(sched());
    await render(<DayEndBanner />, { wrapper });
    expect(await screen.findByText(/Day-end for Main branch at 21:00 - 10 minutes left/)).toBeTruthy();
    await fireEvent.press(screen.getByText('Postpone 30 min'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    expect(mockPost.mock.calls[0][1]).toEqual({ body: { minutes: 30 }, idempotencyKey: 'key-1' });
  });

  test('shows nothing outside the reminder window', async () => {
    mockGet.mockResolvedValue({ items: [sched({ closeAt: new Date(NOW + 120 * 60000).toISOString() })] });
    await render(<DayEndBanner />, { wrapper });
    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

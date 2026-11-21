import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setLanguage } from '../src/i18n';
import ShiftsScreen from '../src/features/pos/ShiftsScreen';
import {
  postponeError,
  reminderOf,
  scheduleError,
  type DaySchedule,
} from '../src/features/pos/dayend-schedule';

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
  }),
}));
jest.mock('../src/device', () => ({ newId: () => `key-${++mockId}` }));

let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

const sched = (over: Partial<DaySchedule> = {}): DaySchedule => ({
  branchId: 'b-1',
  branchName: 'Main shop',
  enabled: true,
  closeTime: '21:00',
  reminderMinutes: 15,
  autoClose: true,
  postponedUntil: null,
  lastResult: null,
  businessDate: '2026-11-21',
  closedToday: false,
  closeAt: new Date(Date.now() + 10 * 60_000).toISOString(),
  ...over,
});

beforeEach(async () => {
  [mockGet, mockPost, mockPut].forEach((m) => m.mockReset());
  mockId = 0;
  mockMe = { userId: 'u-1', roles: [], permissions: ['pos.shift', 'pos.dayend'] };
  client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retryDelay: 0 } } });
  await setLanguage('en');
});

describe('rules like the web and the server', () => {
  test('the reminder starts reminderMinutes before closing and never for a closed or switched-off branch', () => {
    const now = Date.now();
    expect(reminderOf(sched({ closeAt: new Date(now + 20 * 60_000).toISOString() }), now)).toBeNull();
    expect(reminderOf(sched(), now)?.kind).toBe('left');
    expect(reminderOf(sched({ closeAt: new Date(now - 60_000).toISOString() }), now)?.kind).toBe('pastAuto');
    expect(
      reminderOf(sched({ autoClose: false, closeAt: new Date(now - 60_000).toISOString() }), now)?.kind,
    ).toBe('pastRemind');
    expect(
      reminderOf(sched({ postponedUntil: new Date(now + 30 * 60_000).toISOString() }), now)?.kind,
    ).toBe('held');
    expect(reminderOf(sched({ closedToday: true }), now)).toBeNull();
    expect(reminderOf(sched({ enabled: false }), now)).toBeNull();
  });
  test('a time like 21:00, a reminder of 0 to 240 and a postpone of 5 to 240 minutes', () => {
    expect(scheduleError('21:00', '15')).toBeNull();
    expect(scheduleError('24:00', '15')).toBe('time');
    expect(scheduleError('9:30', '15')).toBe('time');
    expect(scheduleError('21:00', '241')).toBe('reminder');
    expect(scheduleError('21:00', '')).toBe('reminder');
    expect(postponeError('30')).toBe(false);
    expect(postponeError('4')).toBe(true);
    expect(postponeError('241')).toBe(true);
  });
});

describe('automatic day-end on the shifts screen', () => {
  const show = () => render(<ShiftsScreen />, { wrapper });
  beforeEach(() => {
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/pos/day-end-schedules') return { items: [sched()] };
      if (path === '/pos/day-end')
        return {
          items: [
            {
              id: 'd-1',
              business_date: '2026-11-20',
              source: 'AUTO',
              note: null,
              summary: { sales: '1000.00', invoices: '4', cash_difference: '0.00' },
            },
          ],
        };
      return { items: [] };
    });
  });

  test('shows the countdown notice, the schedule and "closed automatically" on a closed day', async () => {
    await show();
    expect(await screen.findByText(/Day-end for Main shop at 21:00 - \d+ minutes? left/)).toBeTruthy();
    expect(screen.getByText('Automatic day-end')).toBeTruthy();
    expect(screen.getByText(/On, closing at 21:00 \(closes by itself\)/)).toBeTruthy();
    expect(await screen.findByText(/Closed automatically · /)).toBeTruthy();
  });

  test('Postpone 30 min posts the minutes with an Idempotency-Key', async () => {
    mockPost.mockResolvedValue(sched());
    await show();
    await fireEvent.press(await screen.findByLabelText('Postpone 30 min'));
    await waitFor(() => expect(mockPost).toHaveBeenCalled());
    const [path, opts] = mockPost.mock.calls[0] as [string, { body: unknown; idempotencyKey: string }];
    expect(path).toBe('/pos/day-end-schedules/b-1/postpone');
    expect(opts.body).toEqual({ minutes: 30 });
    expect(opts.idempotencyKey).toBe('key-1');
    expect(await screen.findByText('Day-end postponed by 30 minutes.')).toBeTruthy();
  });

  test('saving the schedule sends the four fields; a wrong time blocks the button', async () => {
    mockPut.mockResolvedValue(sched());
    await show();
    await fireEvent.press(await screen.findByLabelText('Schedule'));
    await fireEvent.changeText(screen.getByLabelText('Closing time (India time, like 21:00)'), '25:99');
    expect(screen.getByText('Write a time like 21:00.')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Closing time (India time, like 21:00)'), '20:30');
    await fireEvent.changeText(screen.getByLabelText('Start the reminder this many minutes before'), '10');
    await fireEvent.press(screen.getByLabelText('Only remind (a manager closes it)'));
    await fireEvent.press(screen.getByLabelText('Save schedule'));
    await waitFor(() => expect(mockPut).toHaveBeenCalled());
    const [path, opts] = mockPut.mock.calls[0] as [string, { body: unknown; idempotencyKey: string }];
    expect(path).toBe('/pos/day-end-schedules/b-1');
    expect(opts.body).toEqual({ enabled: true, closeTime: '20:30', reminderMinutes: 10, autoClose: false });
    expect(opts.idempotencyKey).toBe('key-1');
    expect(await screen.findByText('Day-end schedule saved.')).toBeTruthy();
  });

  test('without pos.dayend nothing is asked from the schedule routes', async () => {
    mockMe = { userId: 'u-1', roles: [], permissions: ['pos.shift'] };
    await show();
    await screen.findByText('Shifts and day-end');
    expect(mockGet.mock.calls.some((c) => c[0] === '/pos/day-end-schedules')).toBe(false);
    expect(screen.queryByText('Automatic day-end')).toBeNull();
  });

  test('a failing schedule route never hides the shifts', async () => {
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/pos/day-end-schedules') throw new Error('boom');
      return { items: [] };
    });
    await show();
    expect(await screen.findByText('Shifts and day-end')).toBeTruthy();
    expect(screen.queryByText('Automatic day-end')).toBeNull();
  });
});

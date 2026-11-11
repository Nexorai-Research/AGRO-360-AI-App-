import type { ReactNode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '../src/api/errors';
import { setLanguage } from '../src/i18n';
import AttendanceScreen from '../src/features/attendance/AttendanceScreen';
import { daysBefore, formatWorked, type AttendanceRecord, type TodayAttendance } from '../src/features/attendance/api';

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockGetFix = jest.fn();
let mockMe: { userId: string; roles: string[]; permissions?: string[] } | null;
let mockIdCounter = 0;

jest.mock('../src/auth/AuthProvider', () => ({
  useAuth: () => ({ status: 'signedIn', me: mockMe, client: { get: mockGet, post: mockPost }, signIn: jest.fn(), signOut: jest.fn() }),
}));
jest.mock('../src/device', () => ({ newId: () => `key-${++mockIdCounter}` }));
jest.mock('../src/features/attendance/location', () => ({ getFix: (...a: unknown[]) => mockGetFix(...a) }));

const record = (over: Partial<AttendanceRecord> = {}): AttendanceRecord => ({
  id: 'a-1',
  employeeId: 'e-1',
  employeeCode: 'E001',
  employeeName: 'Asha',
  date: '2026-11-11',
  checkIn: '2026-11-11T04:00:00.000Z',
  checkOut: null,
  method: 'MOBILE',
  status: 'PRESENT',
  workedMinutes: null,
  autoClosed: false,
  flag: null,
  outsideFence: false,
  correctionReason: null,
  hasLocation: false,
  ...over,
});

const todayOf = (over: Partial<TodayAttendance> = {}): TodayAttendance => ({
  employeeId: 'e-1',
  date: '2026-11-11',
  record: null,
  geoConsent: false,
  geoCaptureAllowed: false,
  ...over,
});

/** Routes GETs by path. */
function serve(today: TodayAttendance | Error, mine: AttendanceRecord[] = []) {
  mockGet.mockImplementation(async (path: string) => {
    if (path === '/hr/attendance/today') {
      if (today instanceof Error) throw today;
      return today;
    }
    if (path === '/hr/attendance/mine') return { items: mine };
    throw new Error(`unexpected GET ${path}`);
  });
}

let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
const show = () => render(<AttendanceScreen />, { wrapper });
const network = () => new ApiError(0, null);
const postsTo = (path: string) => mockPost.mock.calls.filter((c) => c[0] === path);

beforeEach(async () => {
  mockGet.mockReset();
  mockPost.mockReset();
  mockGetFix.mockReset();
  mockGetFix.mockResolvedValue({ lat: 19.076, lng: 72.8777 });
  mockIdCounter = 0;
  mockMe = { userId: 'u-1', roles: ['STAFF'], permissions: ['hr.attendance.self'] };
  client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retryDelay: 0 } } });
  await setLanguage('en');
});

describe('attendance: today and punching', () => {
  it('shows a loading state, then "not checked in" with a Check in button and an empty history', async () => {
    serve(todayOf());
    await show();
    expect(await screen.findAllByText('Loading...')).not.toHaveLength(0);
    expect(await screen.findByText('You have not checked in today.')).toBeTruthy();
    expect(screen.getByLabelText('Check in')).toBeTruthy();
    expect(await screen.findByText('No attendance recorded in the last 30 days.')).toBeTruthy();
    expect(mockGet).toHaveBeenCalledWith('/hr/attendance/mine', expect.objectContaining({ query: { from: '2026-10-12', to: '2026-11-11' } }));
  });

  it('checks in with a MOBILE method and no location when the franchise does not allow location', async () => {
    serve(todayOf());
    mockPost.mockResolvedValue({ ...record(), locationIgnored: false });
    await show();
    await fireEvent.press(await screen.findByLabelText('Check in'));
    await waitFor(() => expect(screen.getByLabelText('Check out')).toBeTruthy());
    expect(mockPost).toHaveBeenCalledWith('/hr/attendance/check-in', { body: { method: 'MOBILE' }, idempotencyKey: 'key-1' });
    expect(mockGetFix).not.toHaveBeenCalled();
  });

  it('after check in shows the time and a Check out button; check out then shows the day as done', async () => {
    serve(todayOf({ record: record() }));
    mockPost.mockResolvedValue({ ...record({ checkOut: '2026-11-11T12:30:00.000Z', workedMinutes: 510 }), locationIgnored: false });
    await show();
    expect(await screen.findByText(/Checked in at/)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Check out'));
    expect(await screen.findByText(/Worked 8:30 h/)).toBeTruthy();
    expect(screen.getByLabelText('Done for today')).toBeTruthy();
    expect(mockPost).toHaveBeenCalledWith('/hr/attendance/check-out', { body: { method: 'MOBILE' }, idempotencyKey: 'key-1' });
  });

  it('lists the recent days with times, worked hours and the outside-fence and auto-closed notes', async () => {
    serve(todayOf(), [
      record({ id: 'a-2', date: '2026-11-10', checkOut: '2026-11-10T12:00:00.000Z', workedMinutes: 480, outsideFence: true }),
      record({ id: 'a-3', date: '2026-11-09', status: 'HALF_DAY', autoClosed: true, workedMinutes: 200 }),
    ]);
    await show();
    expect(await screen.findByText('2026-11-10')).toBeTruthy();
    expect(screen.getByText('2026-11-09')).toBeTruthy();
    expect(screen.getByText('8:00 h', { exact: false })).toBeTruthy();
    expect(screen.getByText('Half day')).toBeTruthy();
    expect(screen.getByText('Outside the branch area (recorded, not blocked)')).toBeTruthy();
    expect(screen.getByText('Closed automatically')).toBeTruthy();
  });

  it('translates a server refusal and refreshes the day when it says you already checked in', async () => {
    serve(todayOf());
    mockPost.mockRejectedValue(new ApiError(422, { title: 'ALREADY_CHECKED_IN', correlationId: 'c-1' }));
    await show();
    await fireEvent.press(await screen.findByLabelText('Check in'));
    expect(await screen.findByText('You have already checked in today.')).toBeTruthy();
    await waitFor(() => expect(mockGet.mock.calls.filter((c) => c[0] === '/hr/attendance/today').length).toBeGreaterThan(1));
    // a refusal is final: the next tap is a new action with a new key
    mockPost.mockResolvedValue({ ...record(), locationIgnored: false });
    await fireEvent.press(screen.getByLabelText('Check in'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(2));
    expect(mockPost.mock.calls[1]?.[1].idempotencyKey).toBe('key-2');
  });
});

describe('attendance: idempotency', () => {
  it('reuses the same Idempotency-Key and the same body (location too) when a check in is retried after a network failure', async () => {
    serve(todayOf({ geoCaptureAllowed: true, geoConsent: true }));
    mockPost.mockRejectedValueOnce(network());
    await show();
    await fireEvent.press(await screen.findByLabelText('Check in'));
    expect(await screen.findByText(/nothing was sent/)).toBeTruthy();

    // the second fix would be different; the retry must still send the first body
    mockGetFix.mockResolvedValue({ lat: 1.5, lng: 2.5 });
    mockPost.mockResolvedValueOnce({ ...record(), locationIgnored: false });
    await fireEvent.press(await screen.findByLabelText('Try again'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(2));

    const [first, second] = mockPost.mock.calls;
    expect(first?.[1].idempotencyKey).toBe('key-1');
    expect(second?.[1].idempotencyKey).toBe('key-1');
    expect(second?.[1].body).toEqual(first?.[1].body);
    expect(second?.[1].body).toEqual({ method: 'MOBILE', lat: 19.076, lng: 72.8777 });
    expect(mockGetFix).toHaveBeenCalledTimes(1);
  });

  it('uses a fresh key for the next action once the first one has succeeded', async () => {
    serve(todayOf());
    mockPost.mockResolvedValueOnce({ ...record(), locationIgnored: false });
    mockPost.mockResolvedValueOnce({ ...record({ checkOut: '2026-11-11T12:00:00.000Z', workedMinutes: 480 }), locationIgnored: false });
    await show();
    await fireEvent.press(await screen.findByLabelText('Check in'));
    await fireEvent.press(await screen.findByLabelText('Check out'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(2));
    expect(mockPost.mock.calls.map((c) => c[1].idempotencyKey)).toEqual(['key-1', 'key-2']);
  });
});

describe('attendance: location consent', () => {
  it('does not ask for any location before the employee agrees, and explains why', async () => {
    serve(todayOf({ geoCaptureAllowed: true, geoConsent: false }));
    mockPost.mockResolvedValue({ ...record(), locationIgnored: true });
    await show();
    expect(await screen.findByText('Share your location?')).toBeTruthy();
    expect(screen.getByText(/only at the moment you check in and check out/)).toBeTruthy();
    expect(mockGetFix).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByLabelText('Check in'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    expect(mockPost.mock.calls[0]?.[1].body).toEqual({ method: 'MOBILE' }); // no consent: no coordinates
    expect(mockGetFix).not.toHaveBeenCalled();
    expect(await screen.findByText('Your location was not saved because location sharing is off.')).toBeTruthy();
  });

  it('saves the consent with its own key, refreshes the day, and then punches with a location', async () => {
    let consented = false;
    mockGet.mockImplementation(async (path: string) =>
      path === '/hr/attendance/today' ? todayOf({ geoCaptureAllowed: true, geoConsent: consented }) : { items: [] },
    );
    mockPost.mockImplementation(async (path: string) => {
      if (path === '/hr/me/geo-consent') {
        consented = true;
        return {};
      }
      return { ...record(), locationIgnored: false };
    });
    await show();
    await fireEvent.press(await screen.findByLabelText('Allow'));
    expect(await screen.findByText('Location is shared at check in and out.')).toBeTruthy();
    expect(postsTo('/hr/me/geo-consent')[0]?.[1]).toEqual({ body: { consent: true }, idempotencyKey: 'key-1' });

    await fireEvent.press(screen.getByLabelText('Check in'));
    await waitFor(() => expect(postsTo('/hr/attendance/check-in')).toHaveLength(1));
    expect(postsTo('/hr/attendance/check-in')[0]?.[1].body).toEqual({ method: 'MOBILE', lat: 19.076, lng: 72.8777 });
  });

  it('"Not now" hides the card and punching still works without a location', async () => {
    serve(todayOf({ geoCaptureAllowed: true, geoConsent: false }));
    mockPost.mockResolvedValue({ ...record(), locationIgnored: false });
    await show();
    await fireEvent.press(await screen.findByLabelText('Not now'));
    expect(screen.queryByText('Share your location?')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Check in'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    expect(mockPost.mock.calls[0]?.[1].body).toEqual({ method: 'MOBILE' });
  });

  it('with consent on, a phone that refuses the location permission still checks in, without coordinates', async () => {
    serve(todayOf({ geoCaptureAllowed: true, geoConsent: true }));
    mockGetFix.mockResolvedValue(null);
    mockPost.mockResolvedValue({ ...record(), locationIgnored: false });
    await show();
    await fireEvent.press(await screen.findByLabelText('Check in'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    expect(mockGetFix).toHaveBeenCalledTimes(1);
    expect(mockPost.mock.calls[0]?.[1].body).toEqual({ method: 'MOBILE' });
  });

  it('lets the employee stop sharing, and shows no location card at all when the franchise does not allow it', async () => {
    serve(todayOf({ geoCaptureAllowed: true, geoConsent: true }));
    mockPost.mockResolvedValue({});
    const first = await show();
    await fireEvent.press(await screen.findByLabelText('Stop sharing'));
    await waitFor(() => expect(postsTo('/hr/me/geo-consent')[0]?.[1].body).toEqual({ consent: false }));
    await first.unmount();

    client.clear();
    serve(todayOf({ geoCaptureAllowed: false, geoConsent: false }));
    await show();
    await screen.findByText('You have not checked in today.');
    expect(screen.queryByText('Share your location?')).toBeNull();
    expect(screen.queryByLabelText('Stop sharing')).toBeNull();
  });
});

describe('attendance: offline, errors and permission', () => {
  it('shows a clear offline message with Try again, and no punch button, when today cannot be loaded for lack of network', async () => {
    serve(network());
    await show();
    expect(await screen.findByText(/No connection\. Check in and check out need the internet/)).toBeTruthy();
    expect(screen.queryByLabelText('Check in')).toBeNull();
    serve(todayOf());
    await fireEvent.press(screen.getByLabelText('Try again'));
    expect(await screen.findByLabelText('Check in')).toBeTruthy();
  });

  it('keeps showing the saved day when a refresh fails offline, and switches the punch button off', async () => {
    serve(todayOf());
    await show();
    await screen.findByLabelText('Check in');
    serve(network());
    await act(async () => {
      await screen.getByTestId('attendance-list').props.refreshControl.props.onRefresh();
    });
    await waitFor(() => expect(screen.getByText(/Showing saved data from/)).toBeTruthy());
    expect(screen.getByText('You have not checked in today.')).toBeTruthy();
    expect(screen.getByLabelText('Check in').props.accessibilityState?.disabled).toBe(true);
  });

  it('shows the offline message when the punch itself fails for lack of network, and nothing is saved locally', async () => {
    serve(todayOf());
    mockPost.mockRejectedValue(network());
    await show();
    await fireEvent.press(await screen.findByLabelText('Check in'));
    expect(await screen.findByText(/nothing was sent/)).toBeTruthy();
    expect(screen.getByLabelText('Try again')).toBeTruthy();
  });

  it('shows a translated error with the reference for an unknown server error', async () => {
    serve(todayOf());
    mockPost.mockRejectedValue(new ApiError(500, { title: 'INTERNAL', correlationId: 'corr-7' }));
    await show();
    await fireEvent.press(await screen.findByLabelText('Check in'));
    expect(await screen.findByText('Something went wrong. Code INTERNAL, reference corr-7.')).toBeTruthy();
  });

  it('shows "not allowed" and calls nothing when the user lacks hr.attendance.self', async () => {
    mockMe = { userId: 'u-2', roles: ['VIEWER'], permissions: ['reports.sales'] };
    await show();
    expect(await screen.findByText(/Your login cannot mark attendance/)).toBeTruthy();
    expect(mockGet).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Check in')).toBeNull();
  });

  it('shows "not allowed" when the server answers 403 (for example a login not linked to an employee)', async () => {
    serve(new ApiError(403, { title: 'FORBIDDEN' }));
    await show();
    expect(await screen.findByText(/Your login cannot mark attendance/)).toBeTruthy();
  });

  it('shows the screen in Hindi', async () => {
    await setLanguage('hi');
    serve(todayOf());
    await show();
    expect(await screen.findByText('मेरी उपस्थिति')).toBeTruthy();
    expect(await screen.findByLabelText('चेक इन')).toBeTruthy();
  });

  it('shows the screen in Marathi', async () => {
    await setLanguage('mr');
    serve(todayOf());
    await show();
    expect(await screen.findByText('माझी उपस्थिती')).toBeTruthy();
    expect(await screen.findByLabelText('चेक इन')).toBeTruthy();
  });
});

describe('attendance helpers', () => {
  it('subtracts days on the calendar date, across month and year ends', () => {
    expect(daysBefore('2026-11-11', 30)).toBe('2026-10-12');
    expect(daysBefore('2026-01-05', 10)).toBe('2025-12-26');
    expect(daysBefore('2024-03-01', 1)).toBe('2024-02-29');
  });

  it('formats minutes as hours and minutes', () => {
    expect(formatWorked(510)).toBe('8:30');
    expect(formatWorked(65)).toBe('1:05');
    expect(formatWorked(null)).toBe('');
  });
});

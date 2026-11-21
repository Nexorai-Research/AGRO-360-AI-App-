import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import { setLanguage } from '../src/i18n';
import {
  FLUSH_MS,
  TELEMETRY_OFF_KEY,
  flushTelemetry,
  pendingEvents,
  reportError,
  screenOf,
  setTelemetryOff,
  startTelemetry,
  stopTelemetry,
  telemetryOff,
  telemetryOn,
  trackAction,
  trackScreen,
} from '../src/telemetry/telemetry';
import { TelemetrySwitch } from '../src/telemetry/TelemetrySwitch';
import { useTelemetry } from '../src/telemetry/useTelemetry';
import type { ApiClient } from '../src/api/client';

const mockPost = jest.fn();
let mockMe: { userId: string; roles: string[] } = { userId: 'u-1', roles: ['owner'] };
let mockId = 0;
jest.mock('../src/device', () => ({ newId: () => `id-${++mockId}` }));
jest.mock('../src/auth/AuthProvider', () => ({
  useAuth: () => ({ status: 'signedIn', me: mockMe, client: mockClient }),
}));
const mockClient = { post: (...a: unknown[]) => mockPost(...a) };
let mockPath = '/customers/7';
jest.mock('expo-router', () => ({ usePathname: () => mockPath }));
jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    getItemAsync: jest.fn((k: string) => Promise.resolve(store.get(k) ?? null)),
    setItemAsync: jest.fn((k: string, v: string) => Promise.resolve(void store.set(k, v))),
    __store: store,
  };
});

const client = { post: (...a: unknown[]) => mockPost(...a) } as unknown as ApiClient;
beforeEach(async () => {
  stopTelemetry();
  mockPost.mockReset();
  mockId = 0;
  mockMe = { userId: 'u-1', roles: ['owner'] };
  (SecureStore as unknown as { __store: Map<string, string> }).__store.clear();
  await setLanguage('en');
});
afterAll(() => stopTelemetry());

describe('telemetry like the web', () => {
  test('the screen name never carries an id or a query', () => {
    expect(screenOf('/')).toBe('/home');
    expect(screenOf('/customers/0190-abc?tab=ledger')).toBe('/customers');
    expect(screenOf('/pos')).toBe('/pos');
  });

  test('nothing is collected before start', () => {
    trackScreen('/pos', 100);
    expect(telemetryOn()).toBe(false);
    expect(pendingEvents()).toHaveLength(0);
  });

  test('screens, slow screens, actions and errors are sent as a mobile batch with an Idempotency-Key', async () => {
    mockPost.mockResolvedValue({ accepted: 4 });
    startTelemetry(client);
    trackScreen('/customers/42', 300);
    trackScreen('/reports', 3000);
    trackAction('report exported');
    reportError(new Error('boom'), 'script');
    await flushTelemetry();
    expect(mockPost).toHaveBeenCalledTimes(1);
    const [path, opts] = mockPost.mock.calls[0];
    expect(path).toBe('/observability/events');
    expect(opts.idempotencyKey).toMatch(/^id-/);
    const ev = opts.body.events;
    expect(ev.map((e: { type: string }) => e.type)).toEqual(['PAGE_VIEW', 'SLOW', 'ACTION', 'ERROR']);
    expect(ev[0]).toMatchObject({ route: '/customers', durationMs: 300, surface: 'MOBILE' });
    expect(ev[2]).toMatchObject({ route: '/reports', message: 'report exported' });
    expect(ev[3].message).toBe('script: boom');
    expect(ev.every((e: { session: string }) => e.session === ev[0].session && e.session.length > 0)).toBe(
      true,
    );
    expect(pendingEvents()).toHaveLength(0);
  });

  test('flushes on its own every eight seconds', async () => {
    jest.useFakeTimers();
    mockPost.mockResolvedValue({});
    startTelemetry(client);
    trackScreen('/pos', 10);
    jest.advanceTimersByTime(FLUSH_MS);
    jest.useRealTimers();
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
  });

  test('at most ten errors a minute', () => {
    startTelemetry(client);
    for (let i = 0; i < 15; i++) reportError('loop', 'promise');
    expect(pendingEvents()).toHaveLength(10);
  });

  test('stops by itself after five failed sends in a row', async () => {
    mockPost.mockRejectedValue(new Error('offline'));
    startTelemetry(client);
    for (let i = 0; i < 5; i++) {
      trackScreen('/pos', 10);
      await flushTelemetry();
    }
    expect(telemetryOn()).toBe(false);
    trackScreen('/pos', 10);
    expect(pendingEvents()).toHaveLength(0);
  });
});

function Probe() {
  useTelemetry();
  return null;
}
describe('the app wiring', () => {
  test('a franchise user is reported and the opened screen is tracked', async () => {
    await render(<Probe />);
    await waitFor(() => expect(telemetryOn()).toBe(true));
    mockPath = '/pos';
    await screen.rerender(<Probe />);
    await waitFor(() =>
      expect(pendingEvents().some((e) => e.route === '/pos' && e.type === 'PAGE_VIEW')).toBe(true),
    );
  });
  test('a platform operator is never reported', async () => {
    mockMe = { userId: 'op', roles: ['platform_support'] };
    await render(<Probe />);
    await new Promise((r) => setTimeout(r, 20));
    expect(telemetryOn()).toBe(false);
  });
  test('switched off on this phone: not started', async () => {
    await setTelemetryOff(true);
    await render(<Probe />);
    await new Promise((r) => setTimeout(r, 20));
    expect(telemetryOn()).toBe(false);
  });
});

describe('the off switch on the profile card', () => {
  test('on by default; off stops reporting at once and is remembered', async () => {
    startTelemetry(client);
    trackScreen('/pos', 10);
    await render(<TelemetrySwitch />);
    expect(screen.getByText('Share app usage with my franchise')).toBeTruthy();
    expect(screen.getByTestId('telemetry-switch').props.value).toBe(true);
    await fireEvent(screen.getByTestId('telemetry-switch'), 'valueChange', false);
    expect(telemetryOn()).toBe(false);
    expect(pendingEvents()).toHaveLength(0);
    await waitFor(async () => expect(await telemetryOff()).toBe(true));
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(TELEMETRY_OFF_KEY, '1');
    expect(screen.getByText('Off: this phone sends no usage.')).toBeTruthy();
  });

  test('a saved off shows off; switching on starts again', async () => {
    await setTelemetryOff(true);
    await render(<TelemetrySwitch />);
    await waitFor(() => expect(screen.getByTestId('telemetry-switch').props.value).toBe(false));
    await fireEvent(screen.getByTestId('telemetry-switch'), 'valueChange', true);
    expect(telemetryOn()).toBe(true);
    expect(await telemetryOff()).toBe(false);
  });

  test('not shown to a platform operator, who is never reported', async () => {
    mockMe = { userId: 'op', roles: ['platform_admin'] };
    await render(<TelemetrySwitch />);
    expect(screen.queryByTestId('telemetry-switch')).toBeNull();
  });

  test('Hindi text', async () => {
    await setLanguage('hi');
    await render(<TelemetrySwitch />);
    expect(screen.getByText('ऐप उपयोग की जानकारी मेरी फ्रैंचाइज़ी को भेजें')).toBeTruthy();
  });
});

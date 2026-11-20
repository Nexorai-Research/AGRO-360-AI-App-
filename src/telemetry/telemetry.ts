import { AppState, type NativeEventSubscription } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import type { ApiClient } from '@/api/client';
import { newId } from '@/device';

// Web parity phase 13: usage telemetry, copied from apps/web/src/telemetry.js. Reports which screens a person opens, how long they took
// to appear and the script errors they hit, so a franchise administrator can see how the application is really used (the
// observability screens). The server takes the person and the franchise from the sign-in token, never from what is sent here.
// Nothing typed by the user is sent: only the screen's name (no id, no query), a short error text, a duration and a random visit id.
// Reporting is best effort and silent: it never shows an error, never blocks a screen, and stops by itself when the API is unreachable.
// The user can switch it off on the profile card (owner decision, 19 November 2026).

export const TELEMETRY_OFF_KEY = 'agro360.telemetry.off';
export const FLUSH_MS = 8000;
const MAX_QUEUE = 60;
const BATCH = 50;
export const SLOW_SCREEN_MS = 2500;
const MAX_ERRORS_PER_MINUTE = 10;
const MAX_FAILURES = 5;

export interface ClientEvent {
  type: 'PAGE_VIEW' | 'ACTION' | 'ERROR' | 'SLOW';
  route: string;
  durationMs?: number;
  message?: string;
  surface: 'MOBILE';
  session: string;
  at: string;
}

let queue: ClientEvent[] = [];
let timer: ReturnType<typeof setInterval> | null = null;
let api: ApiClient | null = null;
let failures = 0;
let errorWindow = { at: 0, n: 0 };
let session = '';
let lastRoute = '/home';
let appState: NativeEventSubscription | null = null;

export const telemetryOn = () => api !== null;
/** For tests: what is waiting to be sent. */
export const pendingEvents = (): readonly ClientEvent[] => queue;

/** The screen of a path without any id or query: `/customers/123?x=1` is `/customers`, the home screen is `/home`. */
export const screenOf = (path: string) => `/${path.replace(/^\/+/, '').split(/[/?#]/)[0] || 'home'}`;

function push(e: Omit<ClientEvent, 'surface' | 'session' | 'at'>) {
  if (!api) return;
  if (queue.length >= MAX_QUEUE) queue.shift();
  queue.push({ ...e, surface: 'MOBILE', session, at: new Date().toISOString() });
}

/** Sends what is waiting (at most 50 events). Dropped, not retried forever: after five failures in a row reporting stops until the next start. */
export async function flushTelemetry(): Promise<void> {
  const c = api;
  if (!c || queue.length === 0) return;
  const events = queue.splice(0, BATCH);
  try {
    await c.post('/observability/events', { body: { events }, idempotencyKey: newId() });
    failures = 0;
  } catch {
    if (++failures >= MAX_FAILURES) stopTelemetry();
  }
}

/** A screen finished appearing (or failed to). `ms` is the time from opening it to its content. */
export function trackScreen(path: string, ms: number, failed = false) {
  const slow = ms >= SLOW_SCREEN_MS;
  lastRoute = screenOf(path);
  push({
    type: failed ? 'ERROR' : slow ? 'SLOW' : 'PAGE_VIEW',
    route: lastRoute,
    durationMs: Math.max(0, Math.round(ms)),
    message: failed ? 'screen failed to load' : slow ? 'screen was slow to appear' : undefined,
  });
}

/** A named thing worth knowing about (for example a report exported). Keep the name generic: no customer names, no amounts. */
export function trackAction(name: string, route = lastRoute) {
  push({ type: 'ACTION', route, message: String(name).slice(0, 80) });
}

/** A script error. At most ten a minute, so an error in a loop cannot flood the report. */
export function reportError(message: unknown, where: string) {
  const now = Date.now();
  if (now - errorWindow.at > 60_000) errorWindow = { at: now, n: 0 };
  if (++errorWindow.n > MAX_ERRORS_PER_MINUTE) return;
  const text = message instanceof Error ? message.message : String(message ?? 'error');
  push({ type: 'ERROR', route: lastRoute, message: `${where}: ${text.slice(0, 200)}` });
}

// Script errors and lost promises reach reportError from the app's single global handler (src/errors/global.ts).

/** Starts reporting for the signed-in franchise user. Calling it again does nothing. */
export function startTelemetry(client: ApiClient) {
  if (api) return;
  api = client;
  failures = 0;
  errorWindow = { at: 0, n: 0 };
  session = newId().replace(/-/g, '').slice(0, 24);
  timer = setInterval(() => void flushTelemetry(), FLUSH_MS);
  appState = AppState.addEventListener('change', (s) => {
    if (s !== 'active') void flushTelemetry();
  });
}

/** Stops reporting and forgets what was waiting (sign-out, switched off, or the API kept failing). */
export function stopTelemetry() {
  api = null;
  queue = [];
  if (timer) clearInterval(timer);
  timer = null;
  appState?.remove();
  appState = null;
}

/** The user's choice: true when usage reporting is switched off on this phone. */
export async function telemetryOff(): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(TELEMETRY_OFF_KEY)) === '1';
  } catch {
    return false;
  }
}
export async function setTelemetryOff(off: boolean): Promise<void> {
  if (off) stopTelemetry();
  try {
    await SecureStore.setItemAsync(TELEMETRY_OFF_KEY, off ? '1' : '0');
  } catch {
    // a preference that could not be saved only means the choice is asked again next time
  }
}

import { flushTelemetry, reportError } from '@/telemetry/telemetry';

// The app's standard handling of failures that nothing else caught (20 November 2026), in three layers:
//  1. A server call that fails becomes an ApiError with a translated message and a reference code (src/api/errors.ts); each screen
//     shows it with Retry (StateView, Notice). Network loss is its own state ("offline"), never a crash.
//  2. A screen that throws while drawing is caught by ScreenErrorBoundary (src/ui/ScreenErrorBoundary.tsx): only that screen shows
//     "could not be shown" with Try again / Go back; the menu and the rest of the app keep working.
//  3. Anything else (an error in a button handler or a timer, a promise nobody waited for) arrives here: it is kept in a short list
//     for support and sent with the usage report when that is on; the default behaviour of the platform is kept.
// No personal data is recorded: only the program's own error message, cut short.

export interface CaughtError {
  at: string;
  where: 'script' | 'promise';
  fatal: boolean;
  message: string;
}
const MAX = 20;
let recent: CaughtError[] = [];
let installed = false;

/** The last errors caught here (newest first), for a support screen or a test. */
export const recentErrors = (): readonly CaughtError[] => recent;
export const clearRecentErrors = () => (recent = []);

export function recordError(e: unknown, where: CaughtError['where'], fatal = false) {
  const message = (e instanceof Error ? e.message : String(e ?? 'error')).slice(0, 200);
  recent = [{ at: new Date().toISOString(), where, fatal, message }, ...recent].slice(0, MAX);
  reportError(e, where);
}

interface ErrorUtilsLike {
  getGlobalHandler: () => (e: unknown, fatal?: boolean) => void;
  setGlobalHandler: (h: (e: unknown, fatal?: boolean) => void) => void;
}
interface HermesLike {
  enablePromiseRejectionTracker?: (o: {
    allRejections: boolean;
    onUnhandled: (id: number, e: unknown) => void;
  }) => void;
}

/** Installs the handlers once, at start. Safe to call again. */
export function installGlobalErrorHandling() {
  if (installed) return;
  installed = true;
  const eu = (globalThis as { ErrorUtils?: ErrorUtilsLike }).ErrorUtils;
  if (eu) {
    const previous = eu.getGlobalHandler();
    eu.setGlobalHandler((e, fatal) => {
      recordError(e, 'script', !!fatal);
      if (fatal) void flushTelemetry(); // the app is about to stop: send what is waiting first
      previous(e, fatal);
    });
  }
  const hermes = (globalThis as { HermesInternal?: HermesLike }).HermesInternal;
  hermes?.enablePromiseRejectionTracker?.({
    allRejections: true,
    onUnhandled: (_id, e) => recordError(e, 'promise'),
  });
}

import { Text } from 'react-native';
import { Stack } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';
import { fireEvent } from '@testing-library/react-native';
import { setLanguage } from '../src/i18n';
import { ScreenErrorFallback } from '../src/ui/ScreenErrorBoundary';
import { dec, formatINR } from '../src/money';
import { shortDate } from '../src/features/hr/logic';
import { formatQty } from '../src/features/stock/format';
import { fmtDate } from '../src/features/customers/ui';
import {
  clearRecentErrors,
  installGlobalErrorHandling,
  recentErrors,
  recordError,
} from '../src/errors/global';

beforeEach(async () => {
  await setLanguage('en');
  clearRecentErrors();
});

describe('a screen that breaks while drawing', () => {
  let broken = true; // React draws a failing screen twice in development, so the test decides when it works again
  function Flaky() {
    if (broken) throw new Error("Cannot read property 'netSales' of undefined");
    return <Text>Sales report</Text>;
  }

  test('shows "could not be shown" for that screen only, and Try again draws it again', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    broken = true;
    const r = await renderRouter(
      {
        _layout: () => (
          <Stack screenOptions={{ headerShown: false }} unstable_screenErrorBoundary={ScreenErrorFallback} />
        ),
        index: () => <Text>home</Text>,
        reports: Flaky,
      },
      { initialUrl: '/reports' },
    );
    expect(await r.findByText('This screen could not be shown')).toBeTruthy();
    expect(r.getByText("For support: Cannot read property 'netSales' of undefined")).toBeTruthy();
    expect(recentErrors()[0]).toMatchObject({
      where: 'script',
      message: "Cannot read property 'netSales' of undefined",
    });
    broken = false;
    await fireEvent.press(r.getByText('Try again'));
    expect(await r.findByText('Sales report')).toBeTruthy();
  });
});

describe('values shown on screen never break it', () => {
  test('a missing or broken amount shows "–"; arithmetic stays strict', () => {
    expect(formatINR('1234567.5')).toBe('₹12,34,567.50');
    expect(formatINR(undefined)).toBe('–');
    expect(formatINR(null)).toBe('–');
    expect(formatINR('abc')).toBe('–');
    expect(formatINR('')).toBe('–');
    expect(() => dec(undefined as unknown as string)).toThrow(); // a wrong amount is never hidden inside a calculation
  });
  test('dates and quantities', () => {
    expect(shortDate(undefined)).toBe('–');
    expect(shortDate('2026-11-03')).toBe('3 Nov 2026');
    expect(fmtDate(null)).toBe('–');
    expect(fmtDate('2026-11-03')).toBe('03-11-2026');
    expect(formatQty('x1')).toBe('-');
    expect(formatQty('12.500000')).toBe('12.5');
  });
});

describe('errors nothing else caught', () => {
  test('are kept for support, newest first, cut short, at most 20', () => {
    for (let i = 0; i < 25; i++) recordError(new Error(`e${i}`), 'promise');
    recordError('x'.repeat(500), 'script', true);
    const list = recentErrors();
    expect(list).toHaveLength(20);
    expect(list[0]).toMatchObject({ where: 'script', fatal: true });
    expect(list[0]!.message).toHaveLength(200);
    expect(list[1]!.message).toBe('e24');
  });
  test('the global handler records the error and still calls the platform handler', () => {
    const previous = jest.fn();
    let installed: ((e: unknown, fatal?: boolean) => void) | null = null;
    (globalThis as { ErrorUtils?: unknown }).ErrorUtils = {
      getGlobalHandler: () => previous,
      setGlobalHandler: (h: (e: unknown, fatal?: boolean) => void) => (installed = h),
    };
    installGlobalErrorHandling();
    installed!(new Error('button handler failed'), false);
    expect(recentErrors()[0]).toMatchObject({
      where: 'script',
      fatal: false,
      message: 'button handler failed',
    });
    expect(previous).toHaveBeenCalledWith(expect.any(Error), false);
  });
});

describe('a selected row is never matched by a missing id', () => {
  test('the old "open?.id === b.id" was true for a row without an id while nothing was open', () => {
    const open = null as { id: string; release: boolean } | null;
    const b = { id: undefined as unknown as string };
    expect(open?.id === b.id).toBe(true); // the bug that broke the batches screen
    expect(!!(open && open.id === b.id)).toBe(false); // the form now used in 11 screens
  });
});

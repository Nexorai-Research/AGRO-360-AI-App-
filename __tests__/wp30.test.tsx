import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { i18n, setLanguage } from '../src/i18n';
import { todayIST } from '../src/features/collections/receipt';
import { addDays } from '../src/features/platform/obs-period';
import { bulkTaxErrors, type BulkTaxForm } from '../src/features/stk/Parity2';
import { ValuationScreen } from '../src/features/stk/InventoryScreens';
import {
  incidentForm,
  registrationForm,
  sampleForm,
  seedLotForm,
} from '../src/features/compliance/cmp-forms';
import { exportErrors } from '../src/features/finance/fx-logic';
import { checkVoucher, type VoucherDraft } from '../src/features/finance/logic';

const mockGet = jest.fn();
let mockMe: { userId: string; roles: string[]; permissions?: string[] };
jest.mock('../src/auth/AuthProvider', () => ({
  useAuth: () => ({ status: 'signedIn', me: mockMe, client: { get: (...a: unknown[]) => mockGet(...a) } }),
}));
jest.mock('../src/device', () => ({ newId: () => 'key-1' }));
jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({}), router: { push: jest.fn() } }));

let qc: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={qc}>{children}</QueryClientProvider>
);
beforeEach(async () => {
  mockGet.mockReset();
  mockMe = { userId: 'u-1', roles: [], permissions: undefined };
  qc = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retryDelay: 0 } } });
  await setLanguage('en');
});

const today = todayIST();
const tomorrow = addDays(today, 1);
const yesterday = addDays(today, -1);

describe('date rules like the web', () => {
  test('bulk tax update: the new mapping applies from today, not the past and not the future', () => {
    const f: BulkTaxForm = {
      effectiveFrom: today,
      categoryId: '',
      fromHsn: '3102',
      hsnCode: '310210',
      taxCode: '',
      hsnConfirmed: false,
      dryRun: true,
    };
    expect(bulkTaxErrors(f, today)).toEqual([]);
    expect(bulkTaxErrors({ ...f, effectiveFrom: tomorrow }, today)).toEqual(['today']);
    expect(bulkTaxErrors({ ...f, effectiveFrom: yesterday }, today)).toEqual(['today']);
    expect(bulkTaxErrors({ ...f, effectiveFrom: '2026-02-30' }, today)).toEqual(['date']);
  });

  test('seed lot: the test date has happened; Valid to is not before the test date', () => {
    const check = seedLotForm.check!;
    expect(check({ testDate: yesterday, validTo: tomorrow })).toBeNull();
    expect(check({ testDate: today, validTo: today })).toBeNull();
    expect(check({ testDate: tomorrow, validTo: addDays(today, 30) })).toBe('testFuture');
    expect(check({ testDate: today, validTo: yesterday })).toBe('validBefore');
  });
  test('product registration: the issue date has happened; Valid to may be in the future but not before the issue date', () => {
    const check = registrationForm.check!;
    expect(check({ validFrom: yesterday, validTo: addDays(today, 365) })).toBeNull();
    expect(check({ validFrom: tomorrow, validTo: addDays(today, 365) })).toBe('issueFuture');
    expect(check({ validFrom: today, validTo: yesterday })).toBe('validBefore');
  });
  test('safety incident and sample: the date has happened', () => {
    expect(incidentForm.check!({ occurredOn: today })).toBeNull();
    expect(incidentForm.check!({ occurredOn: tomorrow })).toBe('incidentFuture');
    expect(sampleForm.check!({ takenOn: yesterday })).toBeNull();
    expect(sampleForm.check!({ takenOn: tomorrow })).toBe('sampleFuture');
  });
  test('accounting export: neither date in the future, From not after To', () => {
    expect(exportErrors(yesterday, today, today)).toEqual([]);
    expect(exportErrors(today, tomorrow, today)).toEqual(['to']);
    expect(exportErrors(tomorrow, tomorrow, today)).toEqual(['from', 'to']);
    expect(exportErrors(today, yesterday, today)).toEqual(['to']);
  });
  test('a voucher is dated today or earlier', () => {
    const v: VoucherDraft = {
      kind: 'CONTRA',
      date: today,
      narration: 'Cash to bank',
      branchId: '',
      ref: '',
      lines: [],
      bankAccountId: '',
      fromAccountId: 'a',
      toAccountId: 'b',
      amount: '100.00',
    };
    expect(checkVoucher(v, today)).toBeNull();
    expect(checkVoucher({ ...v, date: tomorrow }, today)).toBe('future');
    expect(checkVoucher({ ...v, date: 'x' }, today)).toBe('date');
  });
});

describe('stock valuation date', () => {
  test('a date in the future is refused on the field and not sent', async () => {
    mockGet.mockResolvedValue({ asOn: today, totalValue: '0.00', totalQty: '0', valuedBy: 'WAC', rows: [] });
    await render(<ValuationScreen />, { wrapper });
    await fireEvent.changeText(await screen.findByLabelText('As on date (blank = today)'), tomorrow);
    expect(await screen.findByText('The valuation date cannot be in the future.')).toBeTruthy();
    expect(mockGet.mock.calls.some((c) => c[1]?.query?.asOn === tomorrow)).toBe(false);
  });
  test('today and earlier dates are asked for', async () => {
    mockGet.mockResolvedValue({
      asOn: yesterday,
      totalValue: '0.00',
      totalQty: '0',
      valuedBy: 'WAC',
      rows: [],
    });
    await render(<ValuationScreen />, { wrapper });
    await fireEvent.changeText(await screen.findByLabelText('As on date (blank = today)'), yesterday);
    expect(screen.queryByText('The valuation date cannot be in the future.')).toBeNull();
  });
  test('the texts exist in the three languages', () => {
    for (const l of ['en', 'hi', 'mr']) {
      for (const k of [
        'wp30.valuationFuture',
        'wp30.exportFrom',
        'cmp.fv.testFuture',
        'cmp.fv.validBefore',
        'fin.vouchers.err_future',
      ])
        expect(i18n.getFixedT(l)(k)).not.toBe(k);
    }
  });
});

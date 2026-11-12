import type { ApiClient } from '@/api/client';

// Shapes copied by hand from the backend: modules/finance/src/application/{reports,chart,vouchers}.ts and apps/api/src/finance.controller.ts.
// View only: nothing here writes. Money arrives as decimal strings.
export const ACCOUNT_PERM = {
  reports: 'reports.financial',
  accounts: 'finance.account.view',
} as const;

export interface JournalRow {
  id: string;
  date: string;
  sourceType: string;
  purpose: string;
  narration: string | null;
  voucherNo: string | null;
  voucherKind: string | null;
  debit: string;
  credit: string;
}
export interface DayBook {
  from: string;
  to: string;
  journals: JournalRow[];
  totals: { debit: string; credit: string };
  balanced: boolean;
}

export interface TrialRow {
  accountId: string;
  code: string;
  name: string;
  groupName: string | null;
  closingDr: string;
  closingCr: string;
}
export interface TrialBalance {
  to: string;
  rows: TrialRow[];
  totals: { closingDr: string; closingCr: string };
  balanced: boolean;
}

export interface LedgerAccount {
  id: string;
  code: string;
  name: string;
  type: string;
  groupName: string | null;
  cashBank: 'CASH' | 'BANK' | null;
  active: boolean;
  /** debit minus credit over all postings; positive is a debit balance. */
  balance?: string;
}

export const fetchDayBook = (c: ApiClient, from: string, to: string, signal?: AbortSignal) =>
  c.get<DayBook>('/reports/day-book', { query: { from, to, limit: 200 }, signal });
export const fetchTrialBalance = (c: ApiClient, asOn: string, signal?: AbortSignal) =>
  c.get<TrialBalance>('/reports/trial-balance', { query: { asOn }, signal });
export const fetchLedgers = (c: ApiClient, signal?: AbortSignal) =>
  c.get<{ items: LedgerAccount[] }>('/finance/accounts', {
    query: { balances: 'true', active: 'true' },
    signal,
  });

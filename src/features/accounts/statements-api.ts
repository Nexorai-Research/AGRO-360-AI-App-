import type { ApiClient } from '@/api/client';

// Hand-copied from modules/finance/src/domain/finance.ts (ProfitLoss, BalanceSheet), application/reports.ts (cashBook) and
// apps/api/src/finance.controller.ts. Read only. Money arrives as decimal strings.
export const STATEMENT_PERM = 'reports.financial';
/** Web parity 11: branch-wise profit and the control-account reconciliation, as in the web's finance reports. */
export type StatementKind = 'pl' | 'bs' | 'cash' | 'bank' | 'branch' | 'recon';
export const STATEMENT_KINDS: StatementKind[] = ['pl', 'bs', 'cash', 'bank', 'branch', 'recon'];
/** The report path of each kind, for its CSV (`<path>.csv`). */
export const STATEMENT_PATH: Record<'pl' | 'bs' | 'cash' | 'bank', string> = {
  pl: '/reports/profit-loss',
  bs: '/reports/balance-sheet',
  cash: '/reports/cash-book',
  bank: '/reports/bank-book',
};

export interface PlLine {
  code: string;
  name: string;
  amount: string;
}
export interface PlSection {
  section: string;
  label: string;
  total: string;
  lines: PlLine[];
}
export interface ProfitLoss {
  sections: PlSection[];
  netSales: string;
  costOfSales: string;
  grossProfit: string;
  operatingExpenses: string;
  otherIncome: string;
  netProfit: string;
}
export interface ProfitLossReport {
  from: string | null;
  to: string;
  current: ProfitLoss;
  previous: (ProfitLoss & { from: string; to: string }) | null;
}
export interface BsLine {
  code: string;
  name: string;
  amount: string;
}
export interface BsSection {
  section: string;
  label: string;
  total: string;
  lines: BsLine[];
}
export interface BalanceSheet {
  asOn: string;
  assets: BsSection[];
  liabilities: BsSection[];
  equity: BsSection[];
  totalAssets: string;
  totalLiabilities: string;
  totalEquity: string;
  currentYearProfit: string;
  earlierYearsProfit: string;
  balanced: boolean;
}
export interface BookDay {
  date: string;
  opening: string;
  receipts: string;
  payments: string;
  closing: string;
  negative: boolean;
}
export interface BookAccount {
  accountId: string;
  code: string;
  name: string;
  opening: string;
  receipts: string;
  payments: string;
  closing: string;
  negative: boolean;
  days: BookDay[];
}
export interface Book {
  kind: string;
  from: string;
  to: string;
  accounts: BookAccount[];
}

/** Web parity 11: a branch filter and, for profit and loss, the comparison with the period before. */
export interface StatementFilter {
  branchId?: string;
  compare?: boolean;
}
export const statementQuery = (base: Record<string, string>, f: StatementFilter = {}) => ({
  ...base,
  ...(f.branchId ? { branchId: f.branchId } : {}),
  ...(f.compare ? { compare: 'true' } : {}),
});
export const fetchProfitLoss = (
  c: ApiClient,
  from: string,
  to: string,
  signal?: AbortSignal,
  f?: StatementFilter,
) => c.get<ProfitLossReport>('/reports/profit-loss', { query: statementQuery({ from, to }, f), signal });
export const fetchBalanceSheet = (c: ApiClient, asOn: string, signal?: AbortSignal, f?: StatementFilter) =>
  c.get<BalanceSheet>('/reports/balance-sheet', {
    query: statementQuery({ asOn }, { branchId: f?.branchId }),
    signal,
  });
export const fetchBook = (
  c: ApiClient,
  kind: 'cash' | 'bank',
  from: string,
  to: string,
  signal?: AbortSignal,
  f?: StatementFilter,
) =>
  c.get<Book>(`/reports/${kind}-book`, {
    query: statementQuery({ from, to }, { branchId: f?.branchId }),
    signal,
  });

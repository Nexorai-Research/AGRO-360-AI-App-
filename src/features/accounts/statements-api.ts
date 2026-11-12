import type { ApiClient } from '@/api/client';

// Hand-copied from modules/finance/src/domain/finance.ts (ProfitLoss, BalanceSheet), application/reports.ts (cashBook) and
// apps/api/src/finance.controller.ts. Read only. Money arrives as decimal strings.
export const STATEMENT_PERM = 'reports.financial';
export type StatementKind = 'pl' | 'bs' | 'cash' | 'bank';
export const STATEMENT_KINDS: StatementKind[] = ['pl', 'bs', 'cash', 'bank'];

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

export const fetchProfitLoss = (c: ApiClient, from: string, to: string, signal?: AbortSignal) =>
  c.get<ProfitLossReport>('/reports/profit-loss', { query: { from, to }, signal });
export const fetchBalanceSheet = (c: ApiClient, asOn: string, signal?: AbortSignal) =>
  c.get<BalanceSheet>('/reports/balance-sheet', { query: { asOn }, signal });
export const fetchBook = (
  c: ApiClient,
  kind: 'cash' | 'bank',
  from: string,
  to: string,
  signal?: AbortSignal,
) => c.get<Book>(`/reports/${kind}-book`, { query: { from, to }, signal });

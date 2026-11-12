import type { ApiClient } from '@/api/client';

// Shapes copied by hand from the backend: modules/reporting/src/application/*.ts and apps/api/src/reporting.controller.ts.
// Money, quantities and percentages are decimal strings. Every report is a GET with the same filters; ?format=csv gives the CSV text.
export type MoreKind = 'purchases' | 'customers' | 'staff' | 'branches' | 'seasonal' | 'saved';
export const MORE_KINDS: MoreKind[] = ['purchases', 'customers', 'staff', 'branches', 'seasonal', 'saved'];
export const MORE_NEEDS: Record<MoreKind, string> = {
  purchases: 'reports.purchase',
  customers: 'reports.sales',
  staff: 'reports.sales',
  branches: 'reports.financial',
  seasonal: 'reports.sales',
  saved: 'reports.sales',
};
const PATH: Record<Exclude<MoreKind, 'saved'>, string> = {
  purchases: '/reports/purchases/analysis',
  customers: '/reports/customers/analytics',
  staff: '/reports/staff/productivity',
  branches: '/reports/branches/comparison',
  seasonal: '/reports/seasonal',
};
export const PURCHASE_GROUPS = ['supplier', 'brand', 'product', 'category', 'month'] as const;
export const SEASON_GROUPS = ['category', 'product', 'brand', 'crop'] as const;
/** Reports that do not take a branch filter on the server. */
export const NO_BRANCH: MoreKind[] = ['branches'];
/** Reports that do not take a date range (the seasonal one compares whole seasons). */
export const NO_RANGE: MoreKind[] = ['seasonal', 'saved'];

export interface Filters {
  from: string;
  to: string;
  branchId: string;
  group: string;
}

export interface PurchaseAnalysis {
  groupBy: string;
  totals: { value: string; bills: number };
  previous: { value: string; changePct: string | null };
  rows: {
    key: string;
    label: string;
    quantity: string;
    value: string;
    tax: string;
    bills: number;
    avgRate: string | null;
    sharePct: string | null;
  }[];
  priceVariance: {
    key: string;
    label: string;
    minRate: string;
    maxRate: string;
    avgRate: string;
    spreadPct: string | null;
  }[];
}
export interface CustomerAnalytics {
  masked?: boolean;
  summary: {
    customers: number;
    newCustomers: number;
    newSharePct: string | null;
    returningCustomers: number;
    avgBillsPerCustomer: string | null;
    avgSpendPerCustomer: string | null;
    avgBillValue: string | null;
    walkInSales: string;
  };
  concentration: { top5SharePct: string | null; top10SharePct: string | null };
  top: {
    key: string;
    label: string;
    village: string | null;
    spend: string;
    bills: number;
    avgBill: string;
    lastPurchase: string | null;
  }[];
  villages: { key: string; label: string; customers: number; netSales: string; sharePct: string | null }[];
  crops: { key: string; label: string; netSales: string }[];
}
export interface StaffProductivity {
  rows: {
    key?: string;
    name: string;
    bills: number;
    netSales: string;
    avgBill: string | null;
    discountPct: string | null;
    returns: number;
    voids: number;
    shiftHours: string | null;
    billsPerHour: string | null;
  }[];
  notes?: string[];
}
export interface BranchComparison {
  totals: { netSales: string; purchases: string; receivables: string; collections: string; expenses: string };
  rows: {
    branch: string;
    rank: number;
    netSales: string;
    bills: number;
    marginPct: string | null;
    purchases: string;
    receivables: string;
    overdue: string;
    collections: string;
    expenses: string;
  }[];
  notes?: string[];
}
export interface Seasonal {
  seasonSettings: { assumption?: boolean };
  seasons: {
    name: string;
    isCurrent: boolean;
    totals: { year: number; value: string }[];
    changePct: string | null;
    rows: { key: string; years: { year: number; value: string }[]; changePct: string | null }[];
  }[];
}
export interface SavedView {
  id: string;
  name: string;
  dataset: string;
}
export interface SavedRun {
  view?: { name: string };
  columns: { key: string; label: string; type?: string }[];
  rows: Record<string, unknown>[];
  truncated?: boolean;
}

const query = (kind: MoreKind, f: Filters, extra: Record<string, string | number | undefined> = {}) => ({
  ...(NO_RANGE.includes(kind) ? {} : { from: f.from, to: f.to }),
  ...(NO_BRANCH.includes(kind) || f.branchId === '' ? {} : { branchId: f.branchId }),
  ...(kind === 'purchases' ? { groupBy: f.group, limit: 30 } : {}),
  ...(kind === 'seasonal' ? { by: f.group, years: 3 } : {}),
  ...(kind === 'customers' ? { limit: 20 } : {}),
  ...extra,
});

export const fetchReport = <T>(
  c: ApiClient,
  kind: Exclude<MoreKind, 'saved'>,
  f: Filters,
  signal?: AbortSignal,
) => c.get<T>(PATH[kind], { query: query(kind, f), signal });
/** The same report as CSV text (audited on the server). */
export const fetchReportCsv = (c: ApiClient, kind: Exclude<MoreKind, 'saved'>, f: Filters) =>
  c.get<string>(PATH[kind], { query: query(kind, f, { format: 'csv' }), as: 'text' });
export const fetchViews = (c: ApiClient, signal?: AbortSignal) =>
  c.get<{ items: SavedView[] }>('/reports/views', { signal });
/** Running a saved view is a POST that changes nothing; it still carries the key the client adds. */
export const runView = (c: ApiClient, id: string, idempotencyKey: string, format?: 'csv') =>
  c.post<SavedRun | string>(`/reports/views/${id}/run`, {
    idempotencyKey,
    ...(format ? { query: { format }, as: 'text' as const } : {}),
  });

import type { ApiClient } from '@/api/client';

// Shapes copied by hand from the backend: modules/reporting/src/application/{sales,finance,stock}.ts and apps/api/src/reporting.controller.ts.
// All money, quantities and percentages arrive as decimal strings. Every report here is read only (GET).
export const REPORT_PERM = {
  sales: 'reports.sales',
  financial: 'reports.financial',
  receivables: 'reports.receivables',
} as const;

export type ReportKind = 'sales' | 'profit' | 'collections' | 'tax' | 'losses' | 'register';
export const REPORT_NEEDS: Record<ReportKind, string> = {
  sales: REPORT_PERM.sales,
  profit: REPORT_PERM.financial,
  collections: REPORT_PERM.receivables,
  tax: REPORT_PERM.financial,
  losses: REPORT_PERM.financial,
  register: REPORT_PERM.sales,
};
/** The groupings the screen offers (the server supports more; these are the useful ones on a phone). */
export const REPORT_GROUPS: Record<ReportKind, string[]> = {
  sales: ['product', 'category', 'brand', 'village', 'month'],
  profit: ['product', 'brand', 'category'],
  collections: ['branch', 'village', 'customer'],
  tax: [],
  losses: ['product', 'category', 'reason', 'month'],
  register: [],
};

export interface Range {
  from: string;
  to: string;
}

export interface SalesRow {
  key: string;
  label: string;
  quantity: string;
  netSales: string;
  discount: string;
  bills: number | null;
  sharePct: string | null;
  /** null when the caller may not see margins. */
  margin: string | null;
  marginPct: string | null;
}
export interface SalesAnalysis {
  from: string;
  to: string;
  groupBy: string;
  rows: SalesRow[];
  truncated: boolean;
  totals: {
    quantity: string;
    netSales: string;
    discount: string;
    bills: number;
    avgBill: string | null;
    margin: string | null;
    marginPct: string | null;
  };
  previous: { from: string; to: string; netSales: string; changePct: string | null };
}

export interface ProfitRow {
  key: string;
  label: string;
  quantity: string;
  netSales: string;
  cost: string;
  margin: string;
  marginPct: string | null;
  discount: string;
}
export interface Profitability {
  from: string;
  to: string;
  groupBy: string;
  rows: ProfitRow[];
  totals: { netSales: string; cost: string; margin: string; marginPct: string | null };
  leakage: {
    belowCost: { key: string; label: string; quantity: string; loss: string }[];
    heavyDiscount: { key: string; label: string; discount: string; discountPct: string | null }[];
    returns: { returnedValue: string; marginLost: string };
  };
}

export interface CollectionRow {
  key: string;
  label: string;
  due: string;
  collected: string;
  adjusted: string;
  efficiencyPct: string | null;
  outstanding: string;
  documents: number;
}
export interface CollectionEfficiency {
  from: string;
  to: string;
  groupBy: string;
  rows: CollectionRow[];
  totals: { due: string; collected: string; adjusted: string; efficiencyPct: string | null };
  ageing: { notDue: string; days1to30: string; days31to60: string; days61to90: string; over90: string };
}

export interface TaxSummary {
  from: string;
  to: string;
  output: { ratePct: string; taxable: string; cgst: string; sgst: string; igst: string; tax: string }[];
  input: { ratePct: string; taxable: string; tax: string }[];
  months: { month: string; outputTax: string; inputTax: string; netPayable: string }[];
  totals: {
    outputTaxable: string;
    outputTax: string;
    inputTaxable: string;
    inputTax: string;
    netPayable: string;
  };
  notes: string[];
}

export interface LossRow {
  key: string;
  label: string;
  quantity: string;
  value: string;
  movements: number;
  sharePct: string | null;
}
export interface LossReport {
  from: string;
  to: string;
  groupBy: string;
  rows: LossRow[];
  truncated: boolean;
  totals: {
    lossValue: string;
    lossQuantity: string;
    returnedToSuppliers: string;
    netLoss: string;
    lossPctOfCostSold: string | null;
  };
  notes: string[];
}

export interface RegisterRow {
  kind: 'INVOICE' | 'BILL_OF_SUPPLY' | 'CREDIT_NOTE';
  id: string;
  number: string;
  date: string;
  customerName: string | null;
  status: string;
  taxable: string;
  cgst: string;
  sgst: string;
  igst: string;
  total: string;
}
/** Cancelled documents are listed but left out of the totals by the server; credit notes reduce them. */
export interface SalesRegister {
  rows: RegisterRow[];
  totals: { taxable: string; cgst: string; sgst: string; igst: string; total: string };
}

const LIMIT = 30;
export const fetchSales = (c: ApiClient, r: Range, groupBy: string, signal?: AbortSignal) =>
  c.get<SalesAnalysis>('/reports/sales/analysis', { query: { ...r, groupBy, limit: LIMIT }, signal });
export const fetchProfit = (c: ApiClient, r: Range, groupBy: string, signal?: AbortSignal) =>
  c.get<Profitability>('/reports/profitability', { query: { ...r, groupBy, limit: LIMIT }, signal });
export const fetchCollections = (c: ApiClient, r: Range, groupBy: string, signal?: AbortSignal) =>
  c.get<CollectionEfficiency>('/reports/collections/efficiency', {
    query: { ...r, groupBy, limit: LIMIT },
    signal,
  });
export const fetchTax = (c: ApiClient, r: Range, signal?: AbortSignal) =>
  c.get<TaxSummary>('/reports/tax/summary', { query: { ...r }, signal });
export const fetchLosses = (c: ApiClient, r: Range, groupBy: string, signal?: AbortSignal) =>
  c.get<LossReport>('/reports/losses', { query: { ...r, groupBy, limit: LIMIT }, signal });
/** The bill-by-bill register for the period. The server sends up to 5,000 rows of each kind; the screen shows the first REGISTER_ROWS. */
export const REGISTER_ROWS = 100;
export const fetchRegister = (c: ApiClient, r: Range, signal?: AbortSignal) =>
  c.get<SalesRegister>('/reports/sales-register', { query: { ...r }, signal });

/** YYYY-MM-DD minus n days on the calendar date alone. */
export function rangeOf(today: string, days: number): Range {
  const [y, m, d] = today.split('-').map(Number);
  const t = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
  t.setUTCDate(t.getUTCDate() - (days - 1));
  return { from: t.toISOString().slice(0, 10), to: today };
}

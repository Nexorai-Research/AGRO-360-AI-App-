import type { ApiClient } from '@/api/client';

// Shapes copied by hand from the backend: modules/compliance/src/{application/returns.ts,application/itc.ts,domain/returns.ts} and
// apps/api/src/compliance.controller.ts. View only: freezing a snapshot, GSTR-2B import and TDS are NOT in the app.
export const COMPLIANCE_PERM = 'compliance.gst.view';

interface Heads {
  igst: string;
  cgst: string;
  sgst: string;
}
export interface Gstr3b {
  period: string;
  from: string;
  to: string;
  outward: Heads & { taxable: string };
  exempt: { taxable: string };
  reverseCharge: Heads & { taxable: string };
  itc: { eligible: Heads; blocked: Heads; reversed: Heads; net: Heads };
  liability: Heads;
  payable: Heads & { total: string };
  creditCarried: Heads;
  matchesGstr1: boolean;
  notes: string[];
  snapshot: { version: number } | null;
}
export interface HsnRow {
  hsn: string;
  uqc: string;
  description: string;
  rate: string;
  qty: string;
  taxable: string;
  igst: string;
  cgst: string;
  sgst: string;
  value: string;
}
export interface HsnSummary {
  from: string;
  to: string;
  hsnDigits: number;
  rows: HsnRow[];
  totals: { taxable: string; tax: string; value: string };
}
export interface ItcBill {
  billId: string;
  number: string;
  supplierInvoiceNo: string;
  date: string;
  supplierName: string;
  tax: string;
  eligible: Heads;
  blocked: Heads;
  status: string; // ELIGIBLE | PARTLY_BLOCKED | BLOCKED | NO_GSTIN | NO_TAX
  reason: string | null;
}
export interface ItcRegister {
  period: string;
  rows: ItcBill[];
  totals: { tax: string; eligible: string; blocked: string };
}

export const fetchGstr3b = (c: ApiClient, period: string, signal?: AbortSignal) =>
  c.get<Gstr3b>('/gst/gstr3b', { query: { period }, signal });
export const fetchHsn = (c: ApiClient, from: string, to: string, signal?: AbortSignal) =>
  c.get<HsnSummary>('/gst/hsn-summary', { query: { from, to }, signal });
export const fetchItc = (c: ApiClient, period: string, signal?: AbortSignal) =>
  c.get<ItcRegister>('/gst/itc-register', { query: { period }, signal });

/** "2026-11" -> { from: "2026-11-01", to: "2026-11-30" }, on the calendar alone. */
export function monthRange(period: string): { from: string; to: string } {
  const [y, m] = period.split('-').map(Number);
  const last = new Date(Date.UTC(y ?? 1970, m ?? 1, 0)).getUTCDate();
  return { from: `${period}-01`, to: `${period}-${String(last).padStart(2, '0')}` };
}

/** The month before "YYYY-MM". */
export function previousMonth(period: string): string {
  const [y, m] = period.split('-').map(Number);
  const t = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 2, 1));
  return t.toISOString().slice(0, 7);
}

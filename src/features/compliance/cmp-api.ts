import type { ApiClient } from '@/api/client';

// Paths, bodies and permissions copied by hand from apps/api/src/compliance.controller.ts and compliance-agri.controller.ts.
// The app shows what the server computes. It never works out tax, and it sends no tenant id.

export type Kind = 'money' | 'date' | 'text' | 'status' | 'qty' | 'bool';
export interface Col {
  /** Dotted path into the row, for example "metrics.found". */
  k: string;
  kind?: Kind;
}
export type Row = Record<string, unknown>;
export interface RowAction {
  id: string;
  /** The write needs a reason typed first. */
  reason?: boolean;
  perm: string;
  show?: (row: Row) => boolean;
  path: (row: Row) => string;
  /** Sends the row version as If-Match. */
  versioned?: boolean;
  /** Asks "are you sure" before sending. */
  confirm?: boolean;
}
export type QueryKind = 'none' | 'period' | 'range' | 'openOnly';
export interface TabDef {
  id: string;
  perm: string;
  path: string;
  query: QueryKind;
  /** Where the rows are in the answer: "items" (default) or "rows". */
  itemsKey?: string;
  title: Col[];
  fields: Col[];
  actions?: RowAction[];
  /** A money total shown above the rows, taken from the answer. */
  total?: string;
}

export async function fetchRows(
  c: ApiClient,
  tab: TabDef,
  period: string,
  range: { from: string; to: string },
  signal?: AbortSignal,
): Promise<{ rows: Row[]; total: string | null }> {
  const query =
    tab.query === 'period'
      ? { period }
      : tab.query === 'range'
        ? { from: range.from, to: range.to }
        : tab.query === 'openOnly'
          ? { open: 'true' }
          : undefined;
  const r = await c.get<Record<string, unknown>>(tab.path, { query, signal });
  const list = Array.isArray(r) ? r : (r?.[tab.itemsKey ?? 'items'] ?? r?.rows ?? r?.items ?? []);
  const total = tab.total && r && typeof r[tab.total] === 'string' ? (r[tab.total] as string) : null;
  return { rows: Array.isArray(list) ? (list as Row[]) : [], total };
}

export function runRowAction(c: ApiClient, a: RowAction, row: Row, reason: string, key: string) {
  const version =
    typeof row.version === 'number' || typeof row.version === 'string' ? row.version : undefined;
  return c.post(a.path(row), {
    body: a.reason ? { reason: reason.trim() } : {},
    idempotencyKey: key,
    ...(a.versioned && version !== undefined ? { version } : {}),
  });
}

export function pick(row: Row, path: string): unknown {
  let v: unknown = row;
  for (const p of path.split('.')) {
    if (v === null || typeof v !== 'object') return undefined;
    v = (v as Row)[p];
  }
  return v;
}

/** "UNDER_REVIEW" -> "Under review". Used only when no translation exists. */
export function humanise(s: string): string {
  const t = s.replace(/[_-]+/g, ' ').toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// ---- GSTR-1 ------------------------------------------------------------------------------------------------------------------------------
export const GST_VIEW = 'compliance.gst.view';
export const GST_SNAPSHOT = 'compliance.gst.snapshot';

export interface Gstr1 {
  period: string;
  summary: { taxable: string; tax: string; invoices: number; notes: number };
  snapshot: { version: number; createdAt: string } | null;
  checks: { key: string; ok: boolean; expected: string; actual: string }[];
  warnings: { message: string }[];
  sections: {
    b2b: { ctin: string; name?: string | null; invoices: { value: string }[] }[];
    b2cl: { number: string; date: string; pos?: string | null; value: string }[];
    b2cs: {
      supply: string;
      pos?: string | null;
      rate: string;
      taxable: string;
      igst: string;
      cgst: string;
      sgst: string;
    }[];
    cdnr: { ctin: string; notes: { number: string; invoiceNumber: string; value: string }[] }[];
    cdnur: { number: string; invoiceNumber: string; value: string }[];
    exempt: { supply: string; registered: boolean; taxable: string }[];
    hsn: {
      hsn: string;
      uqc: string;
      description: string;
      qty: string;
      rate: string;
      taxable: string;
      igst: string;
      cgst: string;
      sgst: string;
    }[];
    docs: { kind: string; from: string; to: string; total: number; cancelled: number; net: number }[];
    amendments: { number: string; change: string; before?: string | null; after?: string | null }[];
  };
}
export const fetchGstr1 = (c: ApiClient, period: string, signal?: AbortSignal) =>
  c.get<Gstr1>('/gst/gstr1', { query: { period }, signal });
export const freezeReturn = (
  c: ApiClient,
  which: 'gstr1' | 'gstr3b',
  body: Record<string, unknown>,
  key: string,
) => c.post(`/gst/${which}/snapshot`, { body, idempotencyKey: key });

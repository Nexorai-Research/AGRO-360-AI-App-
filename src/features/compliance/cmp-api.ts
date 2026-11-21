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
  /** POST unless said otherwise (an RCM rule is switched with PATCH). */
  method?: 'post' | 'patch';
  /** A fixed body built from the row, instead of {}. With `reason` the typed reason is added to it. */
  body?: (row: Row) => Record<string, unknown>;
  /** A small form asked before sending (web parity 8): the body is built from what was typed. */
  fields?: FormField[];
  formBody?: (v: Values, row: Row) => Record<string, unknown>;
}

// ---- forms (web parity phase 8: the create and step dialogs of apps/web/src/pages/compliance-agri.js) ----
export type FieldKind =
  | 'text'
  | 'area'
  | 'date'
  | 'month'
  | 'num'
  | 'select'
  | 'check'
  | 'product'
  | 'batch'
  | 'manufacturer'
  | 'brand'
  | 'warehouse';
export interface FormField {
  /** The value key; the label is cmp.ff.<k>. */
  k: string;
  kind?: FieldKind;
  required?: boolean;
  /** Values of a select; the label of each is cmp.v.<VALUE>. */
  options?: string[];
  /** An option shown only with this permission. */
  optionPerm?: Record<string, string>;
  /** 'today', 'month' or a fixed first value. */
  init?: string;
  /** Shown only with this permission (like the web's ban fields). */
  perm?: string;
}
export type Values = Record<string, string | boolean>;
export interface FormDef {
  id: string;
  perm: string;
  path: string;
  fields: FormField[];
  body: (v: Values) => Record<string, unknown>;
  /** A check the web makes before sending; returns the key of the problem (cmp.fv.<key>) or null. */
  check?: (v: Values) => string | null;
  /** The answer carries a file to hand to the share sheet (the audit pack). */
  file?: boolean;
}
/** Text, or null when left blank (the web's textOrNull). */
export const tn = (v: Values, k: string): string | null => {
  const s = typeof v[k] === 'string' ? (v[k] as string).trim() : '';
  return s === '' ? null : s;
};
export const tx = (v: Values, k: string): string => (typeof v[k] === 'string' ? (v[k] as string).trim() : '');
/** A batch is picked as "skuId|batchId", like the web's batch select. */
export function splitBatch(v: string | boolean | undefined): {
  skuId: string | null;
  batchId: string | null;
} {
  const [skuId, batchId] = String(typeof v === 'string' ? v : '').split('|');
  return { skuId: skuId || null, batchId: batchId || null };
}
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const realDay = (s: string) => {
  if (!DAY.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};
/** The web form's own checks: required fields, real dates, months and numbers. Returns the keys of the bad fields. */
export function formErrors(
  fields: FormField[],
  v: Values,
  can: (p: string) => boolean = () => true,
): string[] {
  const bad: string[] = [];
  for (const f of fields) {
    if (f.perm && !can(f.perm)) continue;
    const x = v[f.k];
    const s = typeof x === 'string' ? x.trim() : '';
    if (f.kind === 'check') continue;
    if (f.required && s === '') bad.push(f.k);
    else if (s !== '' && f.kind === 'date' && !realDay(s)) bad.push(f.k);
    else if (s !== '' && f.kind === 'month' && !/^\d{4}-(0[1-9]|1[0-2])$/.test(s)) bad.push(f.k);
    else if (s !== '' && f.kind === 'num' && !/^\d{1,12}(\.\d{1,4})?$/.test(s)) bad.push(f.k);
  }
  return bad;
}
export function initialValues(fields: FormField[], today: string): Values {
  const v: Values = {};
  for (const f of fields) {
    if (f.kind === 'check') v[f.k] = false;
    else if (f.init === 'today') v[f.k] = today;
    else if (f.init === 'month') v[f.k] = today.slice(0, 7);
    else v[f.k] = f.init ?? (f.kind === 'select' && f.options?.[0] ? f.options[0] : '');
  }
  return v;
}
export const sendForm = (c: ApiClient, d: FormDef, v: Values, key: string) =>
  c.post<Record<string, unknown>>(d.path, { body: d.body(v), idempotencyKey: key });
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
  /** Add / run forms shown above the rows (web parity 8). */
  create?: FormDef[];
  /** Reshapes the rows (the rules tab lists every version of every rule, like the web). */
  rows?: (rows: Row[]) => Row[];
  /** A tab drawn by its own view instead of the row list. */
  view?: 'trace';
  /** "Open" on each row reads the record in full (web parity 11.4 / 11.5); `pick` shows one part of the answer. */
  detail?: { path: (row: Row) => string; pick?: string };
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
  const rows = Array.isArray(list) ? (list as Row[]) : [];
  return { rows: tab.rows ? tab.rows(rows) : rows, total };
}

export function runRowAction(
  c: ApiClient,
  a: RowAction,
  row: Row,
  reason: string,
  key: string,
  values: Values = {},
) {
  const version =
    typeof row.version === 'number' || typeof row.version === 'string' ? row.version : undefined;
  return c[a.method ?? 'post'](a.path(row), {
    body: a.formBody
      ? a.formBody(values, row)
      : { ...(a.body ? a.body(row) : {}), ...(a.reason ? { reason: reason.trim() } : {}) },
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

/** Web parity 3.3: the GSTR-1 file for the portal (apps/web compliance.js dl(format)). The answer carries the file as text. */
export const fetchGstr1Export = (c: ApiClient, period: string, format: 'json' | 'csv') =>
  c.get<{ fileName: string; mimeType: string; content: string }>('/gst/gstr1/export', {
    query: { period, format },
  });

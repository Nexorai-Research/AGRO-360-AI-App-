import { dec } from '@/money';
import { validDate, validOptionalDate } from '../collections/sal-logic';
import type { Flag, PrintTemplate, TaxKind } from './api';

// Same limits as the server (modules/org/src/domain/org.ts). Rates stay decimal strings.

export { validDate, validOptionalDate };
/** A reason for locking or deactivating is 10 to 500 letters. */
export const validReason = (v: string): boolean => v.trim().length >= 10 && v.trim().length <= 500;

export const nextDay = (iso: string): string => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};
export function yearErrors(start: string, end: string): ('start' | 'end')[] {
  const e: ('start' | 'end')[] = [];
  if (!validDate(start)) e.push('start');
  if (end.trim() !== '' && (!validDate(end) || (validDate(start) && end.trim() <= start.trim())))
    e.push('end');
  return e;
}

// ---- tax ----
export interface RateForm {
  code: string;
  name: string;
  kind: TaxKind;
  ratePct: string;
  effectiveFrom: string;
  reason: string;
}
export type RateError = 'code' | 'name' | 'rate' | 'date' | 'reason';
export function rateErrors(f: RateForm): RateError[] {
  const e: RateError[] = [];
  if (!/^[A-Z0-9_]{2,20}$/.test(f.code.trim().toUpperCase())) e.push('code');
  const n = f.name.trim().length;
  if (n < 2 || n > 80) e.push('name');
  const r = f.ratePct.trim();
  if (!/^(100(\.0{1,2})?|[0-9]{1,2}(\.[0-9]{1,2})?)$/.test(r) || (f.kind !== 'GST' && !dec(r).isZero()))
    e.push('rate');
  if (!validDate(f.effectiveFrom)) e.push('date');
  const rs = f.reason.trim().length;
  if (rs > 0 && (rs < 3 || rs > 500)) e.push('reason');
  return e;
}
export const buildRate = (f: RateForm) => ({
  code: f.code.trim().toUpperCase(),
  name: f.name.trim(),
  kind: f.kind,
  ratePct: f.ratePct.trim(),
  effectiveFrom: f.effectiveFrom.trim(),
  reason: f.reason.trim() || null,
});
export const validHsn = (v: string): boolean => /^(\d{4}|\d{6}|\d{8})$/.test(v.trim());

// ---- numbering ----
const GST_DOC_TYPES = ['TAX_INVOICE', 'BILL_OF_SUPPLY', 'CREDIT_NOTE', 'DEBIT_NOTE'];
export type SeriesError = 'prefix' | 'padding' | 'next' | 'length';
export function seriesErrors(
  docType: string,
  f: { prefix: string; padding: string; nextNumber: string },
): SeriesError[] {
  const e: SeriesError[] = [];
  const p = f.prefix.trim();
  if (!/^[A-Za-z0-9/-]{1,14}$/.test(p)) e.push('prefix');
  const pad = f.padding.trim();
  const padOk = /^\d+$/.test(pad) && Number(pad) >= 1 && Number(pad) <= 10;
  if (!padOk) e.push('padding');
  const nx = f.nextNumber.trim();
  if (!/^\d+$/.test(nx) || Number(nx) < 1 || Number(nx) > 2_000_000_000) e.push('next');
  if (padOk && !e.includes('prefix') && GST_DOC_TYPES.includes(docType) && p.length + Number(pad) > 16)
    e.push('length');
  return e;
}

// ---- print templates ----
export const NON_HIDEABLE: Record<string, Flag[]> = {
  TAX_INVOICE: ['showHsn', 'showLicenceNumbers'],
  CREDIT_NOTE: ['showHsn'],
  DEBIT_NOTE: ['showHsn'],
};
export interface TemplateForm {
  paper: PrintTemplate['paper'];
  flags: Record<Flag, boolean>;
  terms: string;
  footer: string;
}
export const templateToForm = (t: PrintTemplate): TemplateForm => ({
  paper: t.paper,
  flags: {
    showLogo: t.showLogo,
    showLicenceNumbers: t.showLicenceNumbers,
    showBatch: t.showBatch,
    showExpiry: t.showExpiry,
    showHsn: t.showHsn,
    showTerms: t.showTerms,
    showUpiQr: t.showUpiQr,
  },
  terms: t.terms ?? '',
  footer: t.footer ?? '',
});
export type TemplateError = 'terms' | 'footer';
export const templateErrors = (f: TemplateForm): TemplateError[] => [
  ...(f.terms.length > 2000 ? (['terms'] as const) : []),
  ...(f.footer.length > 500 ? (['footer'] as const) : []),
];
export const buildTemplate = (docType: string, f: TemplateForm) => ({
  docType,
  paper: f.paper,
  ...f.flags,
  terms: f.terms.trim() || null,
  footer: f.footer.trim() || null,
});

// ---- branches, warehouses, bins ----
export interface BranchForm {
  code: string;
  name: string;
  address: string;
  stateCode: string;
  gstin: string;
  phone: string;
  openingDate: string;
}
export type BranchError = 'code' | 'name' | 'address' | 'state' | 'gstin' | 'gstinState' | 'phone' | 'date';
export function branchErrors(f: BranchForm, creating: boolean): BranchError[] {
  const e: BranchError[] = [];
  if (creating && !/^[A-Z0-9]{2,10}$/.test(f.code.trim().toUpperCase())) e.push('code');
  const n = f.name.trim().length;
  if (n < 2 || n > 120) e.push('name');
  if (f.address.trim().length > 500) e.push('address');
  const st = f.stateCode.trim();
  if (st !== '' && !/^\d{2}$/.test(st)) e.push('state');
  const g = f.gstin.trim().toUpperCase();
  if (g !== '' && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(g)) e.push('gstin');
  else if (g !== '' && st !== '' && g.slice(0, 2) !== st) e.push('gstinState');
  const p = f.phone.trim();
  if (p !== '' && !/^[0-9+() -]{6,20}$/.test(p)) e.push('phone');
  if (!validOptionalDate(f.openingDate)) e.push('date');
  return e;
}
/** Only what changed is sent on an edit; a blank optional field becomes null (cleared). */
export function branchBody(f: BranchForm, orig: Partial<Record<keyof BranchForm, string | null>> | null) {
  const norm = (v: string) => v.trim();
  const out: Record<string, string | null> = {};
  const entries: [keyof BranchForm, string, boolean][] = [
    ['name', norm(f.name), false],
    ['address', norm(f.address), true],
    ['stateCode', norm(f.stateCode), true],
    ['gstin', norm(f.gstin).toUpperCase(), true],
    ['phone', norm(f.phone), true],
    ['openingDate', norm(f.openingDate), true],
  ];
  for (const [k, v, nullable] of entries) {
    if (orig && (orig[k] ?? '') === v) continue;
    if (!orig && nullable && v === '') continue;
    out[k] = nullable && v === '' ? null : v;
  }
  if (!orig) out.code = norm(f.code).toUpperCase();
  return out;
}

export interface WarehouseForm {
  branchId: string;
  code: string;
  name: string;
  kind: string;
}
export type WarehouseError = 'branch' | 'code' | 'name';
export function warehouseErrors(f: WarehouseForm, creating: boolean): WarehouseError[] {
  const e: WarehouseError[] = [];
  if (creating && f.branchId === '') e.push('branch');
  if (creating && !/^[A-Z0-9-]{2,20}$/.test(f.code.trim().toUpperCase())) e.push('code');
  const n = f.name.trim().length;
  if (n < 2 || n > 120) e.push('name');
  return e;
}
export type BinError = 'label' | 'rack' | 'shelf';
export function binErrors(f: { label: string; rack: string; shelf: string }): BinError[] {
  const e: BinError[] = [];
  const l = f.label.trim().length;
  if (l < 1 || l > 40) e.push('label');
  if (f.rack.trim().length > 40) e.push('rack');
  if (f.shelf.trim().length > 40) e.push('shelf');
  return e;
}

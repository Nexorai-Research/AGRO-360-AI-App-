import { dec } from '@/money';
import { validDate, validOptionalDate } from '../collections/sal-logic';
import type { Preference } from './plans-api';

// Same limits as the server (modules/customer/src/domain/{agri,crm,privacy}.ts). Areas and quantities stay decimal strings.
export { validDate, validOptionalDate };

const isDec = (v: string, dp: number, max: string): boolean => {
  const s = v.trim();
  return new RegExp(`^\\d+(\\.\\d{1,${dp}})?$`).test(s) && dec(s).gt(0) && dec(s).lte(max);
};
export const currentYear = (): string => String(new Date().getFullYear());

// ---- crop plan ----
export interface CropPlanForm {
  cropId: string;
  season: string;
  seasonYear: string;
  plotId: string;
  areaValue: string;
  areaUnit: string;
  sowingDate: string;
  intercrop: boolean;
}
export type CropPlanError = 'crop' | 'year' | 'area' | 'date';
export function cropPlanErrors(f: CropPlanForm): CropPlanError[] {
  const e: CropPlanError[] = [];
  if (f.cropId === '') e.push('crop');
  const y = f.seasonYear.trim();
  if (!/^\d{4}$/.test(y) || Number(y) < 2000 || Number(y) > 2100) e.push('year');
  if (!isDec(f.areaValue, 4, '1000000')) e.push('area');
  if (!validDate(f.sowingDate)) e.push('date');
  return e;
}
export const buildCropPlan = (f: CropPlanForm) => ({
  cropId: f.cropId,
  season: f.season,
  seasonYear: Number(f.seasonYear.trim()),
  ...(f.plotId ? { plotId: f.plotId } : {}),
  areaValue: f.areaValue.trim(),
  areaUnit: f.areaUnit,
  sowingDate: f.sowingDate.trim(),
  intercrop: f.intercrop,
});
export interface TransitionForm {
  date: string;
  yieldQty: string;
  yieldUnit: string;
  note: string;
}
export type TransitionError = 'date' | 'yield' | 'note';
export function transitionErrors(to: string, f: TransitionForm): TransitionError[] {
  const e: TransitionError[] = [];
  if (to === 'HARVESTED' && !validDate(f.date)) e.push('date');
  if (to !== 'HARVESTED' && !validOptionalDate(f.date)) e.push('date');
  const q = f.yieldQty.trim();
  if (q !== '' && !(/^\d+(\.\d{1,3})?$/.test(q) && dec(q).lte('999999999'))) e.push('yield');
  if (to === 'ABANDONED' && (f.note.trim().length < 1 || f.note.trim().length > 500)) e.push('note');
  return e;
}
export const buildTransition = (to: string, f: TransitionForm) => ({
  status: to,
  ...(f.date.trim() ? { date: f.date.trim() } : {}),
  ...(f.yieldQty.trim() ? { yieldQty: f.yieldQty.trim() } : {}),
  ...(f.yieldUnit.trim() ? { yieldUnit: f.yieldUnit.trim() } : {}),
  ...(f.note.trim() ? { note: f.note.trim() } : {}),
});

// ---- purchase plan (one line, like the web form) ----
export interface PurchasePlanForm {
  season: string;
  seasonYear: string;
  description: string;
  qty: string;
  neededBy: string;
}
export type PurchasePlanError = 'year' | 'item' | 'qty' | 'date';
export function purchasePlanErrors(f: PurchasePlanForm): PurchasePlanError[] {
  const e: PurchasePlanError[] = [];
  const y = f.seasonYear.trim();
  if (!/^\d{4}$/.test(y) || Number(y) < 2000 || Number(y) > 2100) e.push('year');
  const d = f.description.trim().length;
  if (d < 1 || d > 120) e.push('item');
  if (!isDec(f.qty, 3, '999999999')) e.push('qty');
  if (!validOptionalDate(f.neededBy)) e.push('date');
  return e;
}
export const buildPurchasePlan = (f: PurchasePlanForm) => ({
  season: f.season,
  seasonYear: Number(f.seasonYear.trim()),
  lines: [
    {
      description: f.description.trim(),
      qty: f.qty.trim(),
      ...(f.neededBy.trim() ? { neededBy: f.neededBy.trim() } : {}),
    },
  ],
});

// ---- service case ----
export interface CaseForm {
  kind: string;
  queryText: string;
  adviceText: string;
  adviceSource: string;
  adviceReference: string;
  followUpOn: string;
}
export type CaseError = 'query' | 'advice' | 'source' | 'reference' | 'date';
export function caseErrors(f: CaseForm): CaseError[] {
  const e: CaseError[] = [];
  const q = f.queryText.trim().length;
  if (q < 1 || q > 2000) e.push('query');
  if (f.adviceText.trim().length > 2000) e.push('advice');
  if (f.adviceText.trim() !== '') {
    if (f.adviceSource === '') e.push('source');
    if (f.adviceReference.trim() === '') e.push('reference');
  }
  if (f.adviceReference.trim().length > 200 && !e.includes('reference')) e.push('reference');
  if (!validOptionalDate(f.followUpOn)) e.push('date');
  return e;
}
export const buildCase = (f: CaseForm) => ({
  kind: f.kind,
  queryText: f.queryText.trim(),
  ...(f.adviceText.trim()
    ? {
        adviceText: f.adviceText.trim(),
        adviceSource: f.adviceSource,
        adviceReference: f.adviceReference.trim(),
      }
    : {}),
  ...(f.followUpOn.trim() ? { followUpOn: f.followUpOn.trim() } : {}),
});

// ---- contact ----
export interface ContactForm {
  name: string;
  phone: string;
  relation: string;
  isPrimary: boolean;
}
export type ContactError = 'name' | 'phone' | 'relation';
export function contactErrors(f: ContactForm): ContactError[] {
  const e: ContactError[] = [];
  const n = f.name.trim().length;
  if (n < 1 || n > 120) e.push('name');
  if (!/^[0-9]{10}$/.test(f.phone.trim())) e.push('phone');
  if (f.relation.trim().length > 40) e.push('relation');
  return e;
}
export const buildContact = (f: ContactForm) => ({
  name: f.name.trim(),
  phone: f.phone.trim(),
  isPrimary: f.isPrimary,
  ...(f.relation.trim() ? { relation: f.relation.trim() } : {}),
});

// ---- preferences ----
export interface PrefForm {
  channel: string;
  quietStart: string;
  quietEnd: string;
  maxPerWeek: string;
}
export const prefToForm = (p: Preference): PrefForm => ({
  channel: p.preferredChannel ?? '',
  quietStart: p.quietStart ?? '',
  quietEnd: p.quietEnd ?? '',
  maxPerWeek: p.maxPerWeek === null ? '' : String(p.maxPerWeek),
});
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
export type PrefError = 'start' | 'end' | 'quiet' | 'max';
export function prefErrors(f: PrefForm): PrefError[] {
  const e: PrefError[] = [];
  const s = f.quietStart.trim();
  const en = f.quietEnd.trim();
  if (s !== '' && !TIME_RE.test(s)) e.push('start');
  if (en !== '' && !TIME_RE.test(en)) e.push('end');
  if ((s === '') !== (en === '')) e.push('quiet');
  const m = f.maxPerWeek.trim();
  if (m !== '' && (!/^\d+$/.test(m) || Number(m) > 100)) e.push('max');
  return e;
}
/** Only what changed is sent; a blank becomes null (cleared). */
export function prefBody(f: PrefForm, orig: Preference) {
  const o = prefToForm(orig);
  const out: Record<string, string | number | null> = {};
  if (f.channel !== o.channel) out.preferredChannel = f.channel === '' ? null : f.channel;
  if (f.quietStart.trim() !== o.quietStart || f.quietEnd.trim() !== o.quietEnd) {
    out.quietStart = f.quietStart.trim() === '' ? null : f.quietStart.trim();
    out.quietEnd = f.quietEnd.trim() === '' ? null : f.quietEnd.trim();
  }
  if (f.maxPerWeek.trim() !== o.maxPerWeek)
    out.maxPerWeek = f.maxPerWeek.trim() === '' ? null : Number(f.maxPerWeek.trim());
  return out;
}

// ---- anonymise ----
export const anonymizeConfirmText = (code: string): string => `ANONYMIZE ${code}`;
export const validAnonymizeReason = (v: string): boolean => v.trim().length >= 3 && v.trim().length <= 500;

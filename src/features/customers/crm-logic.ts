import { dec } from '../../money';
import type { SegmentRule } from './crm-admin-api';

// Checks copy the server's rules (domain/agri.ts, domain/privacy.ts, domain/crm.ts). A failed check returns a key under cus.v.*;
// the server still decides.

export type Errors = Record<string, string>;
const PIN_RE = /^[1-9][0-9]{5}$/;

export const isDecimal = (s: string, dp: number) => new RegExp(`^[0-9]+(\\.[0-9]{1,${dp}})?$`).test(s.trim());
export const isWhole = (s: string, min: number, max: number) =>
  /^[0-9]+$/.test(s.trim()) && Number(s) >= min && Number(s) <= max;
const len = (s: string, min: number, max: number) => s.trim().length >= min && s.trim().length <= max;

export interface VillageDraft {
  stateCode: string;
  district: string;
  taluka: string;
  name: string;
  pin: string;
}
export const emptyVillage: VillageDraft = { stateCode: '27', district: '', taluka: '', name: '', pin: '' };

export function validateVillage(d: VillageDraft): Errors {
  const e: Errors = {};
  if (!/^[0-9]{2}$/.test(d.stateCode.trim())) e.stateCode = 'state';
  if (!len(d.district, 2, 80)) e.district = 'text2';
  if (!len(d.taluka, 2, 80)) e.taluka = 'text2';
  if (!len(d.name, 2, 80)) e.name = 'text2';
  if (d.pin.trim() && !PIN_RE.test(d.pin.trim())) e.pin = 'pin';
  return e;
}
/** Create sends what is filled. Edit sends only what changed; a cleared PIN is sent as null. */
export function villageBody(
  d: VillageDraft,
  cur?: { stateCode: string; district: string; taluka: string; name: string; pin: string | null },
) {
  const t = {
    stateCode: d.stateCode.trim(),
    district: d.district.trim(),
    taluka: d.taluka.trim(),
    name: d.name.trim(),
    pin: d.pin.trim(),
  };
  const out: Record<string, unknown> = {};
  if (!cur) {
    for (const [k, v] of Object.entries(t)) if (v !== '') out[k] = v;
    return out;
  }
  for (const k of ['stateCode', 'district', 'taluka', 'name'] as const) if (t[k] !== cur[k]) out[k] = t[k];
  if (t.pin !== (cur.pin ?? '')) out.pin = t.pin === '' ? null : t.pin;
  return out;
}

export function validateTier(d: {
  name: string;
  rank: string;
  minSpend: string;
  minInvoices: string;
  discountPct: string;
}): Errors {
  const e: Errors = {};
  if (!len(d.name, 2, 40)) e.name = 'text2';
  if (!isWhole(d.rank, 1, 20)) e.rank = 'rank';
  if (d.minSpend.trim() && !isDecimal(d.minSpend, 4)) e.minSpend = 'amount';
  if (d.minInvoices.trim() && !isWhole(d.minInvoices, 0, 100000)) e.minInvoices = 'whole';
  if (d.discountPct.trim() && (!isDecimal(d.discountPct, 2) || dec(d.discountPct).gt(100)))
    e.discountPct = 'percent';
  if (!d.minSpend.trim() && !d.minInvoices.trim()) e.minSpend = 'tierNeed';
  return e;
}
export function tierBody(d: {
  name: string;
  rank: string;
  minSpend: string;
  minInvoices: string;
  discountPct: string;
  benefits: string;
}) {
  const b: Record<string, unknown> = { name: d.name.trim(), rank: Number(d.rank) };
  if (d.minSpend.trim()) b.minSpend = d.minSpend.trim();
  if (d.minInvoices.trim()) b.minInvoices = Number(d.minInvoices);
  if (d.discountPct.trim()) b.discountPct = d.discountPct.trim();
  if (d.benefits.trim()) b.benefits = d.benefits.trim();
  return b;
}

// ---- segments -----------------------------------------------------------------------------------------------
type FieldType = 'text' | 'season' | 'number' | 'days' | 'language' | 'bool';
/** Fields a shop can type by hand. Fields that need an id (territory, category, product purchase) are not offered. */
export const SEGMENT_FIELDS: Record<string, { ops: string[]; type: FieldType }> = {
  crop: { ops: ['eq', 'in'], type: 'text' },
  season: { ops: ['eq'], type: 'season' },
  landAcres: { ops: ['gt', 'gte', 'lt', 'lte'], type: 'number' },
  village: { ops: ['eq', 'in'], type: 'text' },
  language: { ops: ['eq'], type: 'language' },
  lastPurchaseOlderThanDays: { ops: ['gt'], type: 'days' },
  purchaseValueGt: { ops: ['gt'], type: 'number' },
  outstandingGt: { ops: ['gt'], type: 'number' },
  creditHold: { ops: ['eq'], type: 'bool' },
};
export const SEASONS = ['KHARIF', 'RABI', 'ZAID', 'PERENNIAL'] as const;
export const LANG_CODES = ['en', 'hi', 'mr'] as const;

/** Turns what was typed into one rule, or an error key. The server wants a JSON number for amounts and areas in rules. */
export function buildRule(field: string, op: string, raw: string): { rule: SegmentRule } | { error: string } {
  const def = SEGMENT_FIELDS[field];
  if (!def || !def.ops.includes(op)) return { error: 'ruleOp' };
  const v = raw.trim();
  switch (def.type) {
    case 'text': {
      if (op === 'in') {
        const list = v
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        if (list.length === 0 || list.length > 100 || list.some((s) => s.length > 80))
          return { error: 'ruleValue' };
        return { rule: { field, op, value: list } };
      }
      return v.length >= 1 && v.length <= 80 ? { rule: { field, op, value: v } } : { error: 'ruleValue' };
    }
    case 'season':
      return (SEASONS as readonly string[]).includes(v.toUpperCase())
        ? { rule: { field, op, value: v.toUpperCase() } }
        : { error: 'ruleValue' };
    case 'language':
      return (LANG_CODES as readonly string[]).includes(v.toLowerCase())
        ? { rule: { field, op, value: v.toLowerCase() } }
        : { error: 'ruleValue' };
    case 'number':
      return isDecimal(v, 2) ? { rule: { field, op, value: dec(v).toNumber() } } : { error: 'ruleValue' };
    case 'days':
      return isWhole(v, 0, 3650) ? { rule: { field, op, value: Number(v) } } : { error: 'ruleValue' };
    case 'bool':
      return v === 'true' || v === 'false'
        ? { rule: { field, op, value: v === 'true' } }
        : { error: 'ruleValue' };
  }
}

// ---- cohorts ------------------------------------------------------------------------------------------------
/** Share of a month's new customers who bought again k months later, as a whole percent. */
export const retentionPct = (counts: number[], k: number, size: number) =>
  size > 0 ? Math.round(((counts[k] ?? 0) / size) * 100) : 0;

// ---- engagement forms ---------------------------------------------------------------------------------------
export const validPurposeCode = (s: string) => /^[A-Z][A-Z0-9_]{1,39}$/.test(s.trim());
export const validDate = (s: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s.trim())) return false;
  const d = new Date(`${s.trim()}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s.trim();
};
export function validateEvent(d: { title: string; startDate: string; endDate: string }): Errors {
  const e: Errors = {};
  if (!len(d.title, 2, 120)) e.title = 'text2';
  if (!validDate(d.startDate)) e.startDate = 'date';
  if (d.endDate.trim() && (!validDate(d.endDate) || d.endDate < d.startDate)) e.endDate = 'date';
  return e;
}
export function validateGreeting(d: {
  name: string;
  occasion: string;
  month: string;
  day: string;
  templateEn: string;
}): Errors {
  const e: Errors = {};
  if (!len(d.name, 2, 80)) e.name = 'text2';
  if (!len(d.templateEn, 2, 600)) e.templateEn = 'text2';
  if (d.occasion === 'DATE') {
    if (!isWhole(d.month, 1, 12)) e.month = 'month';
    if (!isWhole(d.day, 1, 31)) e.day = 'day';
  }
  return e;
}
export function validateCrop(d: { name: string; durationDays: string }): Errors {
  const e: Errors = {};
  if (!len(d.name, 2, 60)) e.name = 'text2';
  if (!isWhole(d.durationDays, 1, 730)) e.durationDays = 'days';
  return e;
}
/** Today in India time as YYYY-MM-DD, for "events from today". */
export const todayIST = (now = new Date()) =>
  new Date(now.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);

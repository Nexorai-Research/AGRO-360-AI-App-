// Draft, checks and request body for creating or editing a customer. The checks copy the server (modules/customer/src/domain/customer.ts);
// the server still decides. Money is not involved here. Empty optional fields are sent as null on edit so a field can be cleared.
export interface CustomerFull {
  id: string;
  code: string;
  name: string;
  mobile: string | null;
  altMobile: string | null;
  sharedMobile: boolean;
  village: string | null;
  taluka: string | null;
  district: string | null;
  stateCode: string | null;
  pin: string | null;
  categoryId: string | null;
  language: string;
  gstin: string | null;
  status: string;
  version: number;
}
export interface CategoryLite {
  id: string;
  name: string;
  status: string;
}

export const LANGS = ['en', 'hi', 'mr'] as const;
export interface CustomerDraft {
  name: string;
  mobile: string;
  altMobile: string;
  sharedMobile: boolean;
  village: string;
  taluka: string;
  district: string;
  stateCode: string;
  pin: string;
  categoryId: string;
  language: string;
  gstin: string;
}
export const emptyDraft: CustomerDraft = {
  name: '', mobile: '', altMobile: '', sharedMobile: false, village: '', taluka: '', district: '', stateCode: '', pin: '', categoryId: '', language: 'mr', gstin: '',
};
export const draftOf = (c: CustomerFull): CustomerDraft => ({
  name: c.name,
  mobile: c.mobile ?? '',
  altMobile: c.altMobile ?? '',
  sharedMobile: c.sharedMobile,
  village: c.village ?? '',
  taluka: c.taluka ?? '',
  district: c.district ?? '',
  stateCode: c.stateCode ?? '',
  pin: c.pin ?? '',
  categoryId: c.categoryId ?? '',
  language: c.language,
  gstin: c.gstin ?? '',
});

export type FieldKey = keyof CustomerDraft;
export type DraftErrors = Partial<Record<FieldKey, 'required' | 'name' | 'mobile' | 'pin' | 'state' | 'gstin' | 'gstinState' | 'long'>>;

const MOBILE = /^[6-9]\d{9}$/;
const GSTIN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export function validateDraft(d: CustomerDraft): DraftErrors {
  const e: DraftErrors = {};
  const name = d.name.trim();
  if (!name) e.name = 'required';
  else if (name.length < 2 || name.length > 120) e.name = 'name';
  if (!d.mobile.trim()) e.mobile = 'required';
  else if (!MOBILE.test(d.mobile.trim())) e.mobile = 'mobile';
  if (d.altMobile.trim() && !MOBILE.test(d.altMobile.trim())) e.altMobile = 'mobile';
  for (const k of ['village', 'taluka', 'district'] as const) if (d[k].trim().length > 80) e[k] = 'long';
  if (d.stateCode.trim() && !/^[0-9]{2}$/.test(d.stateCode.trim())) e.stateCode = 'state';
  if (d.pin.trim() && !/^[0-9]{6}$/.test(d.pin.trim())) e.pin = 'pin';
  const g = d.gstin.trim().toUpperCase();
  if (g) {
    if (!GSTIN.test(g)) e.gstin = 'gstin';
    else if (d.stateCode.trim() && g.slice(0, 2) !== d.stateCode.trim()) e.gstin = 'gstinState';
  }
  return e;
}

const NULLABLE = ['altMobile', 'village', 'taluka', 'district', 'stateCode', 'pin', 'categoryId', 'gstin'] as const;
const val = (d: CustomerDraft, k: FieldKey): string | boolean => {
  const v = d[k];
  if (typeof v === 'boolean') return v;
  return k === 'gstin' ? v.trim().toUpperCase() : v.trim();
};

/** Create: only what was filled. Edit: only what changed against the saved customer; a cleared optional field goes as null. */
export function toBody(d: CustomerDraft, original: CustomerFull | null): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  const base = original ? draftOf(original) : null;
  for (const k of Object.keys(d) as FieldKey[]) {
    const now = val(d, k);
    if (base) {
      if (now === val(base, k)) continue;
      body[k] = now === '' && (NULLABLE as readonly string[]).includes(k) ? null : now;
    } else if (typeof now === 'boolean') {
      if (now) body[k] = true;
    } else if (now !== '') body[k] = now;
  }
  return body;
}

/** Edit with nothing changed has nothing to send. */
export const isChanged = (body: Record<string, unknown>) => Object.keys(body).length > 0;

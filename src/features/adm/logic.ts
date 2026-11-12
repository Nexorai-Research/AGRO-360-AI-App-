// Pure helpers for the adm screens. No network, no React.

export const validPolicyNumbers = (minLength: string, historyCount: string) => {
  const m = Number(minLength);
  const h = Number(historyCount);
  return {
    minLength: /^\d+$/.test(minLength) && m >= 8 && m <= 64,
    historyCount: /^\d+$/.test(historyCount) && h >= 3 && h <= 24,
  };
};
export const validIncidentTitle = (v: string) => v.trim().length >= 5 && v.trim().length <= 200;
export const validNote = (v: string) => v.trim().length >= 1 && v.trim().length <= 2000;
export const validDeviceName = (v: string) => v.trim().length >= 2 && v.trim().length <= 80;
export const validDeviceReason = (v: string) => v.trim().length >= 5 && v.trim().length <= 300;
/** Unlock and 2FA reset need a reason of 10 to 500 characters. */
export const validUserReason = (v: string) => v.trim().length >= 10 && v.trim().length <= 500;

export const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
export const PAN_RE = /^[A-Z]{5}\d{4}[A-Z]$/;
export const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
export const VPA_RE = /^[A-Za-z0-9._-]{2,}@[A-Za-z0-9]{2,}$/;
export const validEmail = (v: string) => v === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

export interface CompanyErrors {
  legalName?: true;
  gstin?: true;
  pan?: true;
  bankIfsc?: true;
  contactEmail?: true;
}
/** Light checks only; the server is the judge. Empty optional values are fine (they are sent as null). */
export function companyErrors(v: Record<string, string>): CompanyErrors {
  const e: CompanyErrors = {};
  if ((v.legalName ?? '').trim().length < 2) e.legalName = true;
  const g = (v.gstin ?? '').trim().toUpperCase();
  if (g && !GSTIN_RE.test(g)) e.gstin = true;
  const p = (v.pan ?? '').trim().toUpperCase();
  if (p && !PAN_RE.test(p)) e.pan = true;
  const i = (v.bankIfsc ?? '').trim().toUpperCase();
  if (i && !IFSC_RE.test(i)) e.bankIfsc = true;
  if (!validEmail((v.contactEmail ?? '').trim())) e.contactEmail = true;
  return e;
}
/** Only fields that differ are sent. Optional fields that were emptied go as null. */
export function companyPatch(
  orig: Record<string, string | null>,
  v: Record<string, string>,
): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const [k, raw] of Object.entries(v)) {
    const val = k === 'gstin' || k === 'pan' || k === 'bankIfsc' ? raw.trim().toUpperCase() : raw.trim();
    const was = orig[k] ?? '';
    if (val === was) continue;
    out[k] = k === 'legalName' ? val : val === '' ? null : val;
  }
  return out;
}

export const validIsoDate = (v: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
};

/** The three app languages. The server keeps a label per language code. */
export const LABEL_LANGS = ['en', 'hi', 'mr'] as const;
export type LabelLang = (typeof LABEL_LANGS)[number];
export type LabelDraft = Record<LabelLang, string>;
export const draftOf = (labels: Record<string, string>): LabelDraft => ({
  en: labels.en ?? '',
  hi: labels.hi ?? '',
  mr: labels.mr ?? '',
});
/** Empty labels are dropped; labels for other language codes the server already holds are kept. */
export function mergeLabels(base: Record<string, string>, edited: LabelDraft): Record<string, string> {
  const out: Record<string, string> = { ...base };
  for (const l of LABEL_LANGS) {
    const v = edited[l].trim();
    if (v) out[l] = v;
    else delete out[l];
  }
  return out;
}

import { dec, type Amount } from '@/money';
import type { ReceiptBody } from './api';

export interface ReceiptDraft {
  customerId: string;
  branchId: string;
  modeCode: string;
  amount: string;
  reference: string;
  chequeNo: string;
  chequeBank: string;
  chequeDate: string;
}

export const emptyDraft: ReceiptDraft = {
  customerId: '',
  branchId: '',
  modeCode: '',
  amount: '',
  reference: '',
  chequeNo: '',
  chequeBank: '',
  chequeDate: '',
};

export type DraftField = keyof ReceiptDraft;
/** Error ids map to i18n keys `collections.v.<id>`. */
export type DraftErrors = Partial<Record<DraftField, 'required' | 'amountFormat' | 'amountPositive' | 'amountTooBig' | 'chequeDate'>>;

const MAX = '999999999999'; // same limit as the server (parseReceipt)
const AMOUNT_RE = /^\d+(\.\d{1,2})?$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Today in India (the server dates a receipt in Asia/Kolkata and refuses a future date). */
export function todayIST(now: number = Date.now()): string {
  return new Date(now + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}

/** Money is checked as a decimal string, never as a float: at most 2 decimals, more than zero, within the server limit. */
export function validateAmount(raw: string): DraftErrors['amount'] | null {
  const v = raw.trim();
  if (v === '') return 'required';
  if (!AMOUNT_RE.test(v)) return 'amountFormat';
  const d = dec(v);
  if (!d.gt(0)) return 'amountPositive';
  if (d.gt(MAX)) return 'amountTooBig';
  return null;
}

export function validateDraft(d: ReceiptDraft): DraftErrors {
  const e: DraftErrors = {};
  if (!d.customerId) e.customerId = 'required';
  if (!d.branchId) e.branchId = 'required';
  if (!d.modeCode) e.modeCode = 'required';
  const a = validateAmount(d.amount);
  if (a) e.amount = a;
  if (d.modeCode === 'CHEQUE') {
    if (!d.chequeNo.trim()) e.chequeNo = 'required';
    if (!d.chequeBank.trim()) e.chequeBank = 'required';
    if (!d.chequeDate.trim()) e.chequeDate = 'required';
    else if (!DATE_RE.test(d.chequeDate.trim())) e.chequeDate = 'chequeDate';
  }
  return e;
}

/** Builds the request body. Blank optional boxes are left out; cheque fields go only with a cheque. */
export function toBody(d: ReceiptDraft, receiptDate: string): ReceiptBody {
  const body: ReceiptBody = {
    customerId: d.customerId,
    branchId: d.branchId,
    receiptDate,
    modeCode: d.modeCode,
    amount: dec(d.amount.trim()).toFixed(2) as Amount,
  };
  if (d.reference.trim()) body.reference = d.reference.trim();
  if (d.modeCode === 'CHEQUE') {
    body.chequeNo = d.chequeNo.trim();
    body.chequeBank = d.chequeBank.trim();
    body.chequeDate = d.chequeDate.trim();
  }
  return body;
}

/**
 * One Idempotency-Key per user action. The same key is handed out again while the body of the request is unchanged (a retry after a
 * timeout or a lost answer must never make a second receipt). When the user edits the form the body changes, which is a new action and
 * gets a new key. After a success the key is dropped.
 */
export function createKeyKeeper(newId: () => string) {
  let key: string | null = null;
  let fingerprint = '';
  return {
    keyFor(body: ReceiptBody): string {
      const fp = JSON.stringify(body);
      if (key === null || fp !== fingerprint) {
        key = newId();
        fingerprint = fp;
      }
      return key;
    },
    reset() {
      key = null;
      fingerprint = '';
    },
  };
}

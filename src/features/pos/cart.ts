import { dec } from '@/money';
import type { InvoiceBody, LineBody, ProductLite, TenderBody } from './api';

export interface CartLine {
  skuId: string;
  code: string;
  name: string;
  warehouseId: string;
  qty: string;
  /** Left blank = the server uses the price list. */
  unitPrice: string;
  discountPct: string;
}

export interface Cart {
  branchId: string;
  customerId: string;
  billDiscountPct: string;
  lines: CartLine[];
}

export const emptyCart: Cart = { branchId: '', customerId: '', billDiscountPct: '', lines: [] };

// Same rule as the money form: at most 3 decimals for a quantity, 2 for a price, more than zero, checked as strings.
const QTY_RE = /^\d+(\.\d{1,3})?$/;
const PRICE_RE = /^\d+(\.\d{1,2})?$/;
const PCT_RE = /^\d+(\.\d{1,2})?$/;

export type LineError = 'qty' | 'price' | 'discount';

export function lineError(l: CartLine): LineError | null {
  if (!QTY_RE.test(l.qty.trim()) || !dec(l.qty.trim()).gt(0)) return 'qty';
  if (l.unitPrice.trim() !== '' && !PRICE_RE.test(l.unitPrice.trim())) return 'price';
  if (l.discountPct.trim() !== '') {
    if (!PCT_RE.test(l.discountPct.trim()) || dec(l.discountPct.trim()).gt(100)) return 'discount';
  }
  return null;
}

/** First line with a problem (index and kind), or null when the cart can be priced. */
export function firstCartError(c: Cart): { index: number; error: LineError } | null {
  for (let i = 0; i < c.lines.length; i++) {
    const e = lineError(c.lines[i]!);
    if (e) return { index: i, error: e };
  }
  return null;
}

/** The same product added twice adds to the same line, as at a counter. */
export function addProduct(c: Cart, p: ProductLite, warehouseId: string): Cart {
  const i = c.lines.findIndex((l) => l.skuId === p.id && l.warehouseId === warehouseId);
  if (i >= 0) {
    const lines = c.lines.slice();
    lines[i] = { ...lines[i]!, qty: dec(lines[i]!.qty || '0').plus(1).toString() };
    return { ...c, lines };
  }
  const line: CartLine = {
    skuId: p.id,
    code: p.code,
    name: p.name,
    warehouseId,
    qty: '1',
    unitPrice: '',
    discountPct: '',
  };
  return { ...c, lines: [...c.lines, line] };
}

export function patchLine(c: Cart, index: number, patch: Partial<CartLine>): Cart {
  const lines = c.lines.slice();
  lines[index] = { ...lines[index]!, ...patch };
  return { ...c, lines };
}
export function removeLine(c: Cart, index: number): Cart {
  return { ...c, lines: c.lines.filter((_, i) => i !== index) };
}

/** Blank optional boxes are left out of the body. No tenant id is ever sent. */
export function toInvoiceBody(c: Cart, invoiceDate: string, tenders?: TenderBody[]): InvoiceBody {
  const lines: LineBody[] = c.lines.map((l) => ({
    skuId: l.skuId,
    warehouseId: l.warehouseId,
    qty: l.qty.trim(),
    ...(l.unitPrice.trim() ? { unitPrice: l.unitPrice.trim() } : {}),
    ...(l.discountPct.trim() ? { discountPct: l.discountPct.trim() } : {}),
  }));
  const body: InvoiceBody = {
    branchId: c.branchId,
    invoiceDate,
    ...(c.customerId ? { customerId: c.customerId } : {}),
    ...(c.billDiscountPct.trim() ? { billDiscountPct: c.billDiscountPct.trim() } : {}),
    lines,
  };
  if (tenders) body.tenders = tenders;
  return body;
}

export type TenderInputs = Record<string, string>;

/**
 * Turns the amounts typed per mode into tenders. Blank or zero boxes are dropped. A reference goes only with a non-cash mode.
 * Cash may be more than the total (the rest is change); other modes are applied exactly.
 */
export function toTenders(inputs: TenderInputs, reference: string): TenderBody[] {
  const out: TenderBody[] = [];
  for (const [mode, raw] of Object.entries(inputs)) {
    const v = raw.trim();
    if (v === '' || !PRICE_RE.test(v) || !dec(v).gt(0)) continue;
    out.push({ mode, amount: dec(v).toFixed(2), ...(mode !== 'CASH' && reference.trim() ? { reference: reference.trim() } : {}) });
  }
  return out;
}

export type PayCheck = 'ok' | 'none' | 'short';

/**
 * A walk-in sale must be paid in full. A registered customer may leave the rest on credit (the server checks the credit limit).
 * Money is compared as decimals.
 */
export function checkPayment(total: string, tenders: TenderBody[], hasCustomer: boolean): PayCheck {
  const paid = tenders.reduce((s, t) => s.plus(t.amount), dec(0));
  if (paid.lte(0) && !hasCustomer) return 'none';
  if (!hasCustomer && paid.lt(total)) return 'short';
  return 'ok';
}

/** Cash above what is still due is change. */
export function changeFor(total: string, tenders: TenderBody[]): string {
  const paid = tenders.reduce((s, t) => s.plus(t.amount), dec(0));
  const cash = tenders.filter((t) => t.mode === 'CASH').reduce((s, t) => s.plus(t.amount), dec(0));
  const over = paid.minus(total);
  if (over.lte(0)) return '0.00';
  return (over.gt(cash) ? cash : over).toFixed(2);
}

/**
 * One Idempotency-Key per bill. The same key is handed out again while the request body is unchanged (a retry after a lost answer
 * must never make a second invoice). If the cart or the payment changes, it is a new action and gets a new key.
 */
export function createKeyKeeper(newId: () => string) {
  let key: string | null = null;
  let fingerprint = '';
  return {
    keyFor(body: InvoiceBody): string {
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

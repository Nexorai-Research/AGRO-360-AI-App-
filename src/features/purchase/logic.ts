import { dec } from '@/money';
import type { Amount } from '@/money';
import type { GrnBody, GrnLineBody, OrderBody, OrderDetail, OrderLine, OrderLineBody } from './api';

// Pure checks and body builders. Same limits as the server (modules/procurement/src/domain/procurement.ts): quantity up to 6 places and above 0,
// rate up to 4 places, discount 0..100 with 4 places, reason at least 5 characters. Everything is compared as Decimal, never as float.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const QTY_RE = /^\d+(\.\d{1,6})?$/;
const RATE_RE = /^\d+(\.\d{1,4})?$/;

export const REJECT_REASONS = ['DAMAGED', 'SHORT_EXPIRY', 'WRONG_ITEM', 'QUALITY', 'OTHER'] as const;

export const todayIST = (now: number = Date.now()): string =>
  new Date(now + 5.5 * 3600 * 1000).toISOString().slice(0, 10);

export const validDate = (v: string): boolean => {
  if (!DATE_RE.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
};

export const validQty = (v: string): boolean => QTY_RE.test(v.trim()) && dec(v.trim()).gt(0);
export const validQtyOrZero = (v: string): boolean => QTY_RE.test(v.trim());
export const validRate = (v: string): boolean => RATE_RE.test(v.trim());
export const validPct = (v: string): boolean => RATE_RE.test(v.trim()) && dec(v.trim()).lte(100);
export const validReason = (v: string): boolean => v.trim().length >= 5;

// ---- purchase order form
export interface OrderLineDraft {
  skuId: string;
  label: string;
  qty: string;
  rate: string;
  discountPct: string;
}
export interface OrderDraft {
  supplierId: string;
  branchId: string;
  warehouseId: string;
  orderDate: string;
  expectedDate: string;
  notes: string;
  lines: OrderLineDraft[];
}
export type OrderError =
  'supplier' | 'branch' | 'warehouse' | 'date' | 'expected' | 'noLines' | 'qty' | 'rate' | 'discount';

export function orderErrors(d: OrderDraft, today: string = todayIST()): OrderError[] {
  const e: OrderError[] = [];
  if (!d.supplierId) e.push('supplier');
  if (!d.branchId) e.push('branch');
  if (!d.warehouseId) e.push('warehouse');
  if (!validDate(d.orderDate) || d.orderDate > today) e.push('date');
  if (
    d.expectedDate.trim() !== '' &&
    (!validDate(d.expectedDate.trim()) || d.expectedDate.trim() < d.orderDate)
  )
    e.push('expected');
  if (d.lines.length === 0) e.push('noLines');
  if (d.lines.some((l) => !validQty(l.qty))) e.push('qty');
  if (d.lines.some((l) => !validRate(l.rate))) e.push('rate');
  if (d.lines.some((l) => l.discountPct.trim() !== '' && !validPct(l.discountPct))) e.push('discount');
  return e;
}

/** Blank optional fields are left out of the body. */
export function buildOrderBody(d: OrderDraft): OrderBody {
  return {
    supplierId: d.supplierId,
    branchId: d.branchId,
    warehouseId: d.warehouseId,
    orderDate: d.orderDate,
    ...(d.expectedDate.trim() ? { expectedDate: d.expectedDate.trim() } : {}),
    ...(d.notes.trim() ? { notes: d.notes.trim() } : {}),
    lines: d.lines.map((l): OrderLineBody => ({
      skuId: l.skuId,
      qty: l.qty.trim(),
      rate: l.rate.trim(),
      ...(l.discountPct.trim() ? { discountPct: l.discountPct.trim() } : {}),
    })),
  };
}

/** A hint for the screen only: quantity x rate less discount, before GST. The server works out the real totals. */
export function lineEstimate(l: Pick<OrderLineDraft, 'qty' | 'rate' | 'discountPct'>): Amount | null {
  if (!validQty(l.qty) || !validRate(l.rate)) return null;
  const pct =
    l.discountPct.trim() === '' ? dec(0) : validPct(l.discountPct) ? dec(l.discountPct.trim()) : null;
  if (pct === null) return null;
  return dec(l.qty.trim()).times(l.rate.trim()).times(dec(100).minus(pct)).div(100).toFixed(2);
}
export function orderEstimate(lines: OrderLineDraft[]): Amount {
  return lines.reduce((t, l) => t.plus(lineEstimate(l) ?? '0'), dec(0)).toFixed(2);
}

// ---- which buttons an order may show
export const RECEIVABLE = ['APPROVED', 'SENT', 'PART_RECEIVED'];
export const CANCELLABLE = ['DRAFT', 'SUBMITTED', 'REJECTED', 'APPROVED', 'SENT'];

export interface OrderActions {
  submit: boolean;
  approve: boolean;
  reject: boolean;
  ownOrder: boolean;
  receive: boolean;
  cancel: boolean;
}
/** Maker-checker: the person who raised the order cannot approve it, so no button is offered that can only answer 403. */
export function orderActions(
  o: { status: string; createdBy: string },
  userId: string,
  can: (p: string) => boolean,
): OrderActions {
  const canApprove = can('purchase.order.approve') && o.status === 'SUBMITTED';
  const own = o.createdBy === userId;
  return {
    submit: o.status === 'DRAFT' && can('purchase.order.create'),
    approve: canApprove && !own,
    reject: canApprove,
    ownOrder: canApprove && own,
    receive: RECEIVABLE.includes(o.status) && can('purchase.grn.create'),
    cancel: CANCELLABLE.includes(o.status) && can('purchase.order.create'),
  };
}

// ---- goods receipt
export interface ReceiveLineDraft {
  poLineId: string;
  skuId: string;
  label: string;
  pending: string;
  received: string;
  rejected: string;
  reason: string;
  batchNo: string;
  mfgDate: string;
  expiryDate: string;
}
export interface ReceiveDraft {
  receiptDate: string;
  challanNo: string;
  rejectWarehouseId: string;
  lines: ReceiveLineDraft[];
}
export type ReceiveError =
  'date' | 'noLines' | 'qty' | 'rejected' | 'reason' | 'mfg' | 'expiry' | 'dateOrder';

export function receiveLinesInUse(d: ReceiveDraft): ReceiveLineDraft[] {
  return d.lines.filter((l) => l.received.trim() !== '' && l.received.trim() !== '0');
}

export function receiveErrors(d: ReceiveDraft, today: string = todayIST()): ReceiveError[] {
  const e = new Set<ReceiveError>();
  if (!validDate(d.receiptDate) || d.receiptDate > today) e.add('date');
  const used = receiveLinesInUse(d);
  if (used.length === 0) e.add('noLines');
  for (const l of used) {
    if (!validQty(l.received)) {
      e.add('qty');
      continue;
    }
    const rej = l.rejected.trim() === '' ? '0' : l.rejected.trim();
    if (!validQtyOrZero(rej) || dec(rej).gt(l.received.trim())) e.add('rejected');
    else if (dec(rej).gt(0) && !l.reason) e.add('reason');
    if (l.mfgDate.trim() !== '' && !validDate(l.mfgDate.trim())) e.add('mfg');
    if (l.expiryDate.trim() !== '' && !validDate(l.expiryDate.trim())) e.add('expiry');
    if (
      validDate(l.mfgDate.trim()) &&
      validDate(l.expiryDate.trim()) &&
      l.expiryDate.trim() < l.mfgDate.trim()
    )
      e.add('dateOrder');
  }
  return [...e];
}

/** Received more than the order still waits for. The server saves such a receipt as a draft that a manager must approve. */
export const isOverReceipt = (l: Pick<ReceiveLineDraft, 'received' | 'pending'>): boolean =>
  validQty(l.received) && dec(l.received.trim()).gt(l.pending);

export function buildGrnBody(poId: string, d: ReceiveDraft): GrnBody {
  return {
    poId,
    receiptDate: d.receiptDate,
    ...(d.challanNo.trim() ? { challanNo: d.challanNo.trim() } : {}),
    ...(d.rejectWarehouseId ? { rejectWarehouseId: d.rejectWarehouseId } : {}),
    lines: receiveLinesInUse(d).map((l): GrnLineBody => {
      const rej = l.rejected.trim();
      return {
        poLineId: l.poLineId,
        receivedQty: l.received.trim(),
        ...(rej !== '' && dec(rej).gt(0) ? { rejectedQty: rej, rejectReason: l.reason } : {}),
        ...(l.batchNo.trim() ? { batchNo: l.batchNo.trim() } : {}),
        ...(l.mfgDate.trim() ? { mfgDate: l.mfgDate.trim() } : {}),
        ...(l.expiryDate.trim() ? { expiryDate: l.expiryDate.trim() } : {}),
      };
    }),
  };
}

export function receiveDraftFor(o: OrderDetail): ReceiveDraft {
  const pending = (l: OrderLine) => dec(l.pendingQty).gt(0);
  return {
    receiptDate: todayIST(),
    challanNo: '',
    rejectWarehouseId: '',
    lines: o.lines.filter(pending).map((l) => ({
      poLineId: l.id,
      skuId: l.skuId,
      label: `${l.skuCode} ${l.skuName}`,
      pending: dec(l.pendingQty).toString(),
      received: '',
      rejected: '',
      reason: '',
      batchNo: '',
      mfgDate: '',
      expiryDate: '',
    })),
  };
}

/** A scan counts one unit on the line of the scanned product. Added as decimals. Returns null when the order has no such line. */
export function countScan(d: ReceiveDraft, skuId: string): ReceiveDraft | null {
  const i = d.lines.findIndex((l) => l.skuId === skuId);
  if (i < 0) return null;
  return {
    ...d,
    lines: d.lines.map((l, j) =>
      j === i
        ? {
            ...l,
            received: dec(validQtyOrZero(l.received) && l.received.trim() !== '' ? l.received.trim() : 0)
              .plus(1)
              .toString(),
          }
        : l,
    ),
  };
}

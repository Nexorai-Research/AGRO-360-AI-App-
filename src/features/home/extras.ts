import type { ApiClient } from '@/api/client';
import { dec, type Amount } from '@/money';
import { rangeOf } from '../reports/api';

// The extra dashboard sections of the web home (payment mix, latest bills, expiring batches, needs attention, insights, sales goal).
// Every number is worked out here from lists the server sends, with Decimal; nothing is a float. The server decides what the user may see.

export const EXTRA_PERM = {
  sales: 'sales.view',
  reports: 'reports.sales',
  stock: 'inventory.view',
  customer: 'customer.view',
  po: 'purchase.order.approve',
} as const;

const DIGITAL = /(upi|card|bank|neft|rtgs|imps|wallet|online|qr|cheque)/i;
const arr = <T>(x: unknown): T[] =>
  x !== null && typeof x === 'object' && Array.isArray((x as { items?: unknown }).items)
    ? (x as { items: T[] }).items
    : [];

// ---- seven days of sales ------------------------------------------------------------------------------------------------
export interface RegisterLite {
  status?: string;
  date?: string;
  total?: string;
  creditAmount?: string;
  paymentModes?: string;
}
export interface DayTotal {
  day: string;
  total: Amount;
  count: number;
}
export interface Weekly {
  days: DayTotal[];
  mix: { cash: Amount; digital: Amount; credit: Amount };
  total: Amount;
  bills: number;
}

/** The last 7 days (today last) from the sales register rows; cancelled bills are left out; credit is what was not paid at the counter. */
export function weeklyFrom(rows: RegisterLite[], today: string): Weekly {
  const first = rangeOf(today, 7).from;
  const days: DayTotal[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(`${first}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    days.push({ day: d.toISOString().slice(0, 10), total: '0', count: 0 });
  }
  let cash = dec(0);
  let digital = dec(0);
  let credit = dec(0);
  for (const r of rows) {
    if (r.status && r.status !== 'FINALIZED') continue;
    const slot = days.find((d) => d.day === String(r.date ?? '').slice(0, 10));
    if (!slot || !r.total) continue;
    const total = dec(r.total);
    slot.total = dec(slot.total).plus(total).toFixed(2);
    slot.count += 1;
    const cr = dec(r.creditAmount ?? '0');
    const credited = cr.gt(total) ? total : cr;
    credit = credit.plus(credited);
    if (DIGITAL.test(String(r.paymentModes ?? ''))) digital = digital.plus(total.minus(credited));
    else cash = cash.plus(total.minus(credited));
  }
  return {
    days,
    mix: { cash: cash.toFixed(2), digital: digital.toFixed(2), credit: credit.toFixed(2) },
    total: cash.plus(digital).plus(credit).toFixed(2),
    bills: days.reduce((a, d) => a + d.count, 0),
  };
}

/** Share of one amount in a total, as a whole-number percent string. Layout only. */
export const sharePct = (part: Amount, total: Amount): string =>
  dec(total).isZero() ? '0' : dec(part).div(total).times(100).toFixed(0);

export const fetchWeekly = async (c: ApiClient, today: string, signal?: AbortSignal) => {
  const r = rangeOf(today, 7);
  const res = await c.get<{ rows?: RegisterLite[] }>('/reports/sales-register', { query: { ...r }, signal });
  return weeklyFrom(res?.rows ?? [], today);
};

// ---- latest bills -------------------------------------------------------------------------------------------------------
export interface BillLite {
  id: string;
  number: string;
  invoiceDate: string;
  customerName: string | null;
  total: Amount;
  creditAmount: Amount;
  status?: string;
}
export const fetchLatestBills = async (c: ApiClient, signal?: AbortSignal) =>
  arr<BillLite>(await c.get('/sales/invoices', { query: { limit: 6 }, signal })).slice(0, 6);
/** For "needs attention": recent bills left on credit (the last 100 bills). */
export const fetchCreditBills = async (c: ApiClient, signal?: AbortSignal) =>
  arr<BillLite>(await c.get('/sales/invoices', { query: { limit: 100 }, signal })).filter((b) =>
    dec(b.creditAmount ?? '0').gt(0),
  ).length;

// ---- expiring batches ---------------------------------------------------------------------------------------------------
export interface BatchLite {
  skuName: string;
  batchNo: string | null;
  onHand: string;
  daysToExpiry: number | null;
  value: string | null;
}
export const fetchExpiring = async (c: ApiClient, signal?: AbortSignal) =>
  arr<BatchLite>(await c.get('/inventory/batches', { query: { expiringWithinDays: 60, limit: 200 }, signal }))
    .filter((b) => b.daysToExpiry !== null && b.daysToExpiry !== undefined && dec(b.onHand ?? '0').gt(0))
    .sort((a, b) => (a.daysToExpiry ?? 0) - (b.daysToExpiry ?? 0));
export const expiryTone = (days: number): 'hot' | 'warm' | 'calm' =>
  days <= 15 ? 'hot' : days <= 30 ? 'warm' : 'calm';
export const riskOf = (rows: BatchLite[]): Amount =>
  rows.reduce((a, b) => a.plus(b.value ?? '0'), dec(0)).toFixed(2);

// ---- needs attention ----------------------------------------------------------------------------------------------------
export interface AttentionCount {
  id: 'po' | 'complaints' | 'alerts' | 'credit';
  count: number | null;
}
export const fetchApprovals = async (c: ApiClient, signal?: AbortSignal) =>
  arr(await c.get('/procurement/purchase-orders/approvals', { signal })).length;
export const fetchComplaints = async (c: ApiClient, signal?: AbortSignal) =>
  arr(await c.get('/complaints', { query: { status: 'OPEN', limit: 200 }, signal })).length;
export const fetchAlerts = async (c: ApiClient, signal?: AbortSignal) => {
  const r = await c.get<{ items?: unknown[]; total?: number }>('/alerts', {
    query: { status: 'OPEN', limit: 100 },
    signal,
  });
  return typeof r?.total === 'number' ? r.total : (r?.items ?? []).length;
};

// ---- insights -----------------------------------------------------------------------------------------------------------
export interface Insight {
  id: string;
  tone: 'good' | 'warn' | 'bad';
  params: Record<string, string | number>;
}
/** Plain-language lines from the same numbers. `day` is already formatted by the caller. */
export function insightsFrom(
  w: Weekly | undefined,
  expiring: BatchLite[] | undefined,
  poWaiting: number | null,
  dayName: (iso: string) => string,
): Insight[] {
  const out: Insight[] = [];
  if (w && !dec(w.total).isZero()) {
    const best = [...w.days].sort((a, b) => dec(b.total).comparedTo(a.total))[0]!;
    out.push({
      id: 'bestDay',
      tone: 'good',
      params: { day: dayName(best.day), amount: best.total, count: best.count },
    });
    const share = Number(sharePct(w.mix.credit, w.total));
    if (share >= 1)
      out.push({
        id: 'creditShare',
        tone: share > 40 ? 'bad' : 'warn',
        params: { pct: share, amount: w.mix.credit },
      });
    const today = w.days[6]!;
    const others = w.days.slice(0, 6).filter((d) => d.count > 0);
    const otherBills = others.reduce((a, d) => a + d.count, 0);
    if (today.count > 0 && otherBills > 0) {
      const avgToday = dec(today.total).div(today.count);
      const avgWeek = others.reduce((a, d) => a.plus(d.total), dec(0)).div(otherBills);
      if (!avgWeek.isZero()) {
        const diff = avgToday.div(avgWeek).minus(1).times(100).toDecimalPlaces(0);
        if (diff.abs().gte(5))
          out.push({
            id: diff.gt(0) ? 'avgAbove' : 'avgBelow',
            tone: diff.gt(0) ? 'good' : 'warn',
            params: { amount: avgToday.toFixed(2), pct: diff.abs().toString() },
          });
      }
    }
  }
  if (expiring) {
    out.push(
      expiring.length === 0
        ? { id: 'noExpiry', tone: 'good', params: {} }
        : { id: 'expiry', tone: 'bad', params: { count: expiring.length, amount: riskOf(expiring) } },
    );
  }
  if (poWaiting !== null && poWaiting > 0)
    out.push({ id: 'poWaiting', tone: 'warn', params: { count: poWaiting } });
  return out;
}

// ---- sales goal ---------------------------------------------------------------------------------------------------------
export const GOAL_KEY = 'agro360.dailyGoal';
export const DEFAULT_GOAL = '25000';
/** A goal is a whole number of rupees from 1,000 to 10,00,00,000. */
export const validGoal = (v: string): boolean =>
  /^\d{4,9}$/.test(v.trim()) && Number(v) >= 1000 && Number(v) <= 100000000;

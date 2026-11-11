import type { ApiClient } from '@/api/client';
import type { Amount } from '@/money';

// Shapes copied by hand from the backend (no OpenAPI file exists yet):
//   modules/credit/src/application/credit.ts   (AgingRow, ReceiptView, receivablesAging, createReceipt)
//   modules/credit/src/application/collections.ts (TaskView)
//   modules/credit/src/domain/credit.ts        (parseReceipt: the accepted body)
// Backend M09 UC-164 (receive payment), UC-167 (aging) and UC-169 (follow-up tasks) are marked DONE there.

/** Permissions are only used to hide things. The server checks every call again. */
export const PERM = {
  aging: 'reports.receivables',
  tasks: 'credit.followup',
  receipt: 'receipt.create',
} as const;

export const AGING_BUCKETS = ['NOT_DUE', '0-30', '31-60', '61-90', '91-180', '180+'] as const;
export type AgingBucket = (typeof AGING_BUCKETS)[number];

export interface AgingRow {
  customerId: string;
  customerName: string;
  buckets: Record<string, Amount>;
  total: Amount;
  onAccount: Amount;
}

export interface AgingReport {
  asOn: string;
  rows: AgingRow[];
  totals: Record<string, Amount>;
}

export interface CollectionTask {
  id: string;
  customerId: string;
  customerName: string;
  mobile: string | null;
  village: string | null;
  branchId: string;
  assignedTo: string | null;
  taskDate: string;
  overdueAmount: Amount;
  oldestDays: number;
  status: 'OPEN' | 'DONE';
  outcome: string | null;
  note: string | null;
}

export interface PaymentMode {
  code: string;
  enabled: boolean;
}

export interface Branch {
  id: string;
  name: string;
}

export interface CustomerLite {
  id: string;
  name: string;
  mobile?: string | null;
  village?: string | null;
}

/** What POST /receipts accepts. Blank optional fields must be left out, so a cash receipt never carries an empty cheque date. */
export interface ReceiptBody {
  customerId: string;
  branchId: string;
  receiptDate: string;
  modeCode: string;
  amount: Amount;
  reference?: string;
  chequeNo?: string;
  chequeBank?: string;
  chequeDate?: string;
}

export interface ReceiptView {
  id: string;
  number: string;
  customerId: string;
  branchId: string;
  receiptDate: string;
  modeCode: string;
  reference: string | null;
  amount: Amount;
  allocated: Amount;
  onAccount: Amount;
  status: 'ACTIVE' | 'VOID';
}

export const agingKey = (userId: string) => ['collections', 'aging', userId] as const;
export const tasksKey = (userId: string) => ['collections', 'tasks', userId] as const;
export const modesKey = (userId: string) => ['collections', 'modes', userId] as const;
export const branchesKey = (userId: string) => ['collections', 'branches', userId] as const;
export const customersKey = (userId: string, q: string) => ['collections', 'customers', userId, q] as const;

export const fetchAging = (c: ApiClient, signal?: AbortSignal) => c.get<AgingReport>('/reports/receivables/aging', { signal });

export async function fetchOpenTasks(c: ApiClient, signal?: AbortSignal): Promise<CollectionTask[]> {
  const r = await c.get<{ items: CollectionTask[] }>('/credit/tasks', { query: { status: 'OPEN', limit: 200 }, signal });
  return r.items;
}

/** Only modes the franchise has switched on. A receipt can never be "on credit", the server refuses it. */
export async function fetchReceiptModes(c: ApiClient, signal?: AbortSignal): Promise<PaymentMode[]> {
  const r = await c.get<{ items: PaymentMode[] }>('/settings/payment-modes', { signal });
  return r.items.filter((m) => m.enabled && m.code !== 'CREDIT');
}

export async function fetchBranches(c: ApiClient, signal?: AbortSignal): Promise<Branch[]> {
  const r = await c.get<{ items: Branch[] }>('/branches', { query: { status: 'ACTIVE' }, signal });
  return r.items;
}

export async function searchCustomers(c: ApiClient, q: string, signal?: AbortSignal): Promise<CustomerLite[]> {
  const r = await c.get<{ items: CustomerLite[] }>('/customers', { query: { q, status: 'ACTIVE', limit: 20 }, signal });
  return r.items;
}

/** A money movement: online only. The caller owns the key so that a retry of the same action reuses it. */
export const postReceipt = (c: ApiClient, body: ReceiptBody, idempotencyKey: string) =>
  c.post<ReceiptView>('/receipts', { body, idempotencyKey });

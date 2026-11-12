import type { ApiClient } from '@/api/client';
import type { Amount } from '@/money';

// Shapes copied by hand from the backend (no OpenAPI file exists yet):
//   apps/api/src/collections.controller.ts, apps/api/src/sales.controller.ts
//   modules/credit/src/application/{cheques,collections,writeoff,credit}.ts  modules/credit/src/domain/{collections,credit}.ts

export const SPERM = {
  ledger: 'customer.ledger.view',
  cheque: 'receipt.cheque',
  allocate: 'receipt.allocate',
  limit: 'credit.limit.manage',
  hold: 'credit.hold',
  assign: 'credit.followup.assign',
  receivables: 'reports.receivables',
  writeoff: 'credit.writeoff',
  writeoffApprove: 'credit.writeoff.approve',
  settlement: 'credit.settlement',
} as const;

export const skey = (userId: string, what: string, extra = '') => ['sal', what, userId, extra] as const;
const items = async <T>(p: Promise<{ items: T[] }>): Promise<T[]> => (await p).items;

// ---- cheques -----------------------------------------------------------------------------------------------------
export type ChequeStatus = 'RECEIVED' | 'DEPOSITED' | 'CLEARED' | 'BOUNCED';
export interface Cheque {
  id: string;
  receiptNumber: string;
  customerName: string;
  chequeNo: string;
  bank: string;
  chequeDate: string;
  amount: Amount;
  status: ChequeStatus;
  postDated: boolean;
  readyToDeposit: boolean;
  depositedOn: string | null;
  clearedOn: string | null;
  bouncedOn: string | null;
  bounceReason: string | null;
  bounceCharge: Amount;
}
export const fetchCheques = (c: ApiClient, status: string, signal?: AbortSignal) =>
  items<Cheque>(c.get('/cheques', { query: { limit: 100, status: status || undefined }, signal }));
export const chequeStep = (c: ApiClient, id: string, step: 'deposit' | 'clear', date: string, key: string) =>
  c.post<unknown>(`/cheques/${id}/${step}`, { body: date ? { date } : {}, idempotencyKey: key });
export const bounceCheque = (
  c: ApiClient,
  id: string,
  body: { reason: string; date?: string; charge?: Amount },
  key: string,
) => c.post<unknown>(`/cheques/${id}/bounce`, { body, idempotencyKey: key });

// ---- receipts ----------------------------------------------------------------------------------------------------
export interface ReceiptDetail {
  id: string;
  number: string;
  customerId: string;
  receiptDate: string;
  modeCode: string;
  reference: string | null;
  amount: Amount;
  allocated: Amount;
  onAccount: Amount;
  status: 'ACTIVE' | 'VOID';
  cheque: { id: string; status: string; chequeNo: string; bank: string; chequeDate: string } | null;
  allocations: { receivableId: string; docNumber: string | null; amount: Amount }[];
}
export const fetchReceiptDetail = (c: ApiClient, id: string, signal?: AbortSignal) =>
  c.get<ReceiptDetail>(`/receipts/${id}`, { signal });
/** No list in the body: the server applies the money to the oldest dues first. */
export const allocateReceipt = (c: ApiClient, id: string, key: string) =>
  c.post<ReceiptDetail>(`/receipts/${id}/allocate`, { body: {}, idempotencyKey: key });
export const unallocateReceipt = (c: ApiClient, id: string, key: string) =>
  c.post<ReceiptDetail>(`/receipts/${id}/unallocate`, { body: {}, idempotencyKey: key });

// ---- credit account ----------------------------------------------------------------------------------------------
export interface CreditAccount {
  customerId: string;
  creditLimit: Amount;
  seasonLimit: Amount | null;
  hold: boolean;
  holdReason: string | null;
  outstanding: Amount;
  available: Amount;
  version: number;
}
export interface CreditReview {
  account: CreditAccount;
  guarantors: { id: string; name: string | null; relationship: string }[];
}
export const fetchCredit = (c: ApiClient, customerId: string, signal?: AbortSignal) =>
  c.get<CreditReview>(`/customers/${encodeURIComponent(customerId)}/credit`, { signal });
export const setCreditLimit = (
  c: ApiClient,
  customerId: string,
  creditLimit: Amount,
  reason: string,
  version: number,
  key: string,
) =>
  c.put<unknown>(`/customers/${encodeURIComponent(customerId)}/credit-limit`, {
    body: { creditLimit, ...(reason ? { reason } : {}) },
    version,
    idempotencyKey: key,
  });
export const creditHold = (c: ApiClient, customerId: string, hold: boolean, reason: string, key: string) =>
  c.post<unknown>(`/customers/${encodeURIComponent(customerId)}/${hold ? 'credit-hold' : 'credit-release'}`, {
    body: { reason },
    idempotencyKey: key,
  });

// ---- team tasks --------------------------------------------------------------------------------------------------
export interface TeamTask {
  id: string;
  customerName: string;
  village: string | null;
  assignedTo: string | null;
  overdueAmount: Amount;
  oldestDays: number;
  status: 'OPEN' | 'DONE';
}
export interface EfficiencyRow {
  assignedTo: string | null;
  open: number;
  done: number;
  paid: number;
  promise: number;
  notReachable: number;
  dispute: number;
  resolutionRate: string;
}
export interface StaffUser {
  id: string;
  fullName?: string | null;
  username?: string;
}
export const fetchTeamTasks = (c: ApiClient, signal?: AbortSignal) =>
  items<TeamTask>(c.get('/credit/tasks', { query: { status: 'OPEN', limit: 200 }, signal }));
export const fetchEfficiency = (c: ApiClient, signal?: AbortSignal) =>
  c.get<{ from: string; to: string; rows: EfficiencyRow[] }>('/credit/tasks/efficiency', { signal });
export const fetchStaff = (c: ApiClient, signal?: AbortSignal) =>
  items<StaffUser>(c.get('/users', { signal }));
export const generateTasks = (c: ApiClient, key: string) =>
  c.post<unknown>('/credit/tasks/generate', { body: {}, idempotencyKey: key });
export const assignTask = (c: ApiClient, id: string, assignedTo: string | null, key: string) =>
  c.post<unknown>(`/credit/tasks/${id}/assign`, { body: { assignedTo }, idempotencyKey: key });

// ---- write-offs and settlements ----------------------------------------------------------------------------------
export interface WriteOff {
  id: string;
  number: string;
  customerName: string;
  amount: Amount;
  reason: string;
  status: 'PROPOSED' | 'APPROVED' | 'REJECTED';
  recovered: Amount;
}
export interface Settlement {
  id: string;
  number: string;
  customerName: string;
  discount: Amount;
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
}
export const fetchWriteOffs = (c: ApiClient, signal?: AbortSignal) =>
  c.get<{ items: WriteOff[]; totals: { proposed: Amount; approved: Amount; recovered: Amount } }>(
    '/credit/write-offs',
    { signal },
  );
export const fetchSettlements = (c: ApiClient, signal?: AbortSignal) =>
  items<Settlement>(c.get('/credit/settlements', { signal }));
export const proposeWriteOff = (
  c: ApiClient,
  body: { customerId: string; amount: Amount; reason: string; evidence: string },
  key: string,
) => c.post<unknown>('/credit/write-offs', { body, idempotencyKey: key });
export const proposeSettlement = (c: ApiClient, body: { customerId: string; reason: string }, key: string) =>
  c.post<unknown>('/credit/settlements', { body, idempotencyKey: key });
export const decide = (
  c: ApiClient,
  kind: 'write-offs' | 'settlements',
  id: string,
  what: 'approve' | 'reject',
  note: string,
  key: string,
) => c.post<unknown>(`/credit/${kind}/${id}/${what}`, { body: note ? { note } : {}, idempotencyKey: key });
export const recoverWriteOff = (
  c: ApiClient,
  id: string,
  body: { amount: Amount; modeCode: string; recoveryDate: string; reference?: string },
  key: string,
) => c.post<unknown>(`/credit/write-offs/${id}/recover`, { body, idempotencyKey: key });

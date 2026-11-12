import type { ApiClient } from '@/api/client';

// Shapes copied by hand from the backend (no OpenAPI file exists yet):
//   apps/api/src/crm.controller.ts                 (routes and permissions)
//   modules/customer/src/application/complaints.ts (ComplaintView)
//   modules/customer/src/domain/crm.ts             (parseComplaint, parseComplaintTransition, COMPLAINT_NEXT)

export const PERM = {
  view: 'customer.view',
  create: 'customer.complaint',
  resolve: 'customer.complaint.resolve',
} as const;

export const CATEGORIES = [
  'PRODUCT_QUALITY',
  'GERMINATION',
  'EFFICACY',
  'SERVICE',
  'DELIVERY',
  'PRICING',
  'OTHER',
] as const;
export const SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export const STATUSES = ['OPEN', 'IN_PROGRESS', 'ESCALATED_SUPPLIER', 'RESOLVED', 'CLOSED'] as const;
export const RESOLUTIONS = ['REPLACEMENT', 'CREDIT_NOTE', 'ADVICE', 'REFUND', 'OTHER'] as const;
export type Status = (typeof STATUSES)[number];

export interface Complaint {
  id: string;
  ticketNo: string;
  customerId: string;
  customerName: string | null;
  category: string;
  severity: string;
  description: string;
  batchNo: string | null;
  invoiceNumber: string | null;
  status: Status;
  slaDueAt: string;
  overdue: boolean;
  resolutionType: string | null;
  resolutionText: string | null;
  createdAt: string;
  version: number;
}

export interface ComplaintBody {
  customerId: string;
  category: string;
  severity: string;
  description: string;
  batchNo?: string;
}
export interface TransitionBody {
  to: Status;
  text?: string;
  resolutionType?: string;
}

export const key = (userId: string, what: string, extra = '') => ['complaints', what, userId, extra] as const;

export async function fetchComplaints(c: ApiClient, p: { open: boolean; q: string }, signal?: AbortSignal) {
  const r = await c.get<{ items: Complaint[] }>('/complaints', {
    query: { open: p.open ? 'true' : undefined, q: p.q.trim() || undefined, limit: 100 },
    signal,
  });
  return r.items;
}
export const getComplaint = (c: ApiClient, id: string, signal?: AbortSignal) =>
  c.get<Complaint>(`/complaints/${encodeURIComponent(id)}`, { signal });

export const createComplaint = (c: ApiClient, body: ComplaintBody, idempotencyKey: string) =>
  c.post<Complaint>('/complaints', { body, idempotencyKey });
/** The version read earlier goes as If-Match, so two people cannot move the same ticket at once. */
export const transitionComplaint = (
  c: ApiClient,
  x: Complaint,
  body: TransitionBody,
  idempotencyKey: string,
) => c.post<Complaint>(`/complaints/${x.id}/transition`, { body, version: x.version, idempotencyKey });
export const commentComplaint = (c: ApiClient, id: string, text: string, idempotencyKey: string) =>
  c.post<unknown>(`/complaints/${id}/comments`, { body: { text }, idempotencyKey });

import type { ComplaintBody, Status, TransitionBody } from './api';

// Same rules as the server (modules/customer/src/domain/crm.ts).
export const NEXT: Record<Status, readonly Status[]> = {
  OPEN: ['IN_PROGRESS', 'ESCALATED_SUPPLIER', 'RESOLVED'],
  IN_PROGRESS: ['ESCALATED_SUPPLIER', 'RESOLVED'],
  ESCALATED_SUPPLIER: ['IN_PROGRESS', 'RESOLVED'],
  RESOLVED: ['CLOSED', 'IN_PROGRESS'],
  CLOSED: ['IN_PROGRESS'],
};

export interface ComplaintDraft {
  customerId: string;
  category: string;
  severity: string;
  description: string;
  batchNo: string;
}
export type ComplaintError = 'customer' | 'category' | 'description' | 'batch';

export function complaintErrors(d: ComplaintDraft): ComplaintError[] {
  const e: ComplaintError[] = [];
  if (!d.customerId) e.push('customer');
  if (!d.category) e.push('category');
  const len = d.description.trim().length;
  if (len < 3 || len > 2000) e.push('description');
  if (d.batchNo.trim().length > 60) e.push('batch');
  return e;
}

export function buildComplaintBody(d: ComplaintDraft): ComplaintBody {
  return {
    customerId: d.customerId,
    category: d.category,
    severity: d.severity || 'MEDIUM',
    description: d.description.trim(),
    ...(d.batchNo.trim() ? { batchNo: d.batchNo.trim() } : {}),
  };
}

/** Resolving or closing needs the resolution text. */
export const needsText = (to: Status): boolean => to === 'RESOLVED' || to === 'CLOSED';

export function transitionError(to: Status, text: string): 'text' | null {
  return needsText(to) && (text.trim() === '' || text.trim().length > 2000) ? 'text' : null;
}

export function buildTransition(to: Status, text: string, resolutionType: string): TransitionBody {
  return {
    to,
    ...(text.trim() ? { text: text.trim() } : {}),
    ...(to === 'RESOLVED' && resolutionType ? { resolutionType } : {}),
  };
}

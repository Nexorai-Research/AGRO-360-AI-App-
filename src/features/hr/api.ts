import type { ApiClient } from '@/api/client';

// Shapes copied by hand from the backend: modules/hr/src/application/{leave,field,advances,payslips,employees}.ts and apps/api/src/hr.controller.ts.
// Money and day counts are decimal strings; the app never turns them into floats.
export const HR_PERM = {
  leaveSelf: 'hr.leave.self',
  leaveApprove: 'hr.leave.approve',
  fieldSelf: 'hr.field.self',
  fieldManage: 'hr.field.manage',
  advance: 'hr.advance.manage',
  payslip: 'hr.payslip.self',
  attendanceSelf: 'hr.attendance.self',
} as const;

export const hrKey = (userId: string, ...rest: string[]) => ['hr', userId, ...rest] as const;

// ---- me ---------------------------------------------------------------------------------------------------------------
export interface MyEmployee {
  id: string;
  code: string;
  name: string;
}
export const fetchMe = (c: ApiClient, signal?: AbortSignal) => c.get<MyEmployee>('/hr/me', { signal });

// ---- leave ------------------------------------------------------------------------------------------------------------
export interface LeaveType {
  id: string;
  code: string;
  name: string;
  yearlyQuota: string;
  paid: boolean;
  active: boolean;
}
export interface LeaveBalance {
  leaveTypeId: string;
  code: string;
  name: string;
  paid: boolean;
  year: number;
  quota: string;
  used: string;
  remaining: string;
}
export interface LeaveRequest {
  id: string;
  requestNo: string;
  employeeName: string;
  leaveType: string;
  fromDate: string;
  toDate: string;
  halfDay: boolean;
  days: string;
  unpaidDays: string;
  reason: string | null;
  status: string; // SUBMITTED | APPROVED | REJECTED | CANCELLED
  decisionNote: string | null;
}
export interface ApplyLeaveBody {
  leaveTypeId: string;
  fromDate: string;
  toDate: string;
  halfDay: boolean;
  reason?: string;
}

export const fetchLeaveTypes = (c: ApiClient, signal?: AbortSignal) =>
  c.get<{ items: LeaveType[] }>('/hr/leave-types', { signal });
export const fetchBalances = (c: ApiClient, year: number, signal?: AbortSignal) =>
  c.get<{ items: LeaveBalance[] }>('/hr/leave-balances', { query: { year }, signal });
/** `mine` true: only my requests. An approver (hr.leave.approve) otherwise gets the requests of the branches in scope. */
export const fetchLeaves = (c: ApiClient, mine: boolean, signal?: AbortSignal) =>
  c.get<{ items: LeaveRequest[] }>('/hr/leaves', { query: { mine: mine ? 'true' : undefined }, signal });
export const applyLeave = (c: ApiClient, body: ApplyLeaveBody, idempotencyKey: string) =>
  c.post<LeaveRequest>('/hr/leaves', { body, idempotencyKey });
export const cancelLeave = (c: ApiClient, id: string, idempotencyKey: string) =>
  c.post<LeaveRequest>(`/hr/leaves/${id}/cancel`, { idempotencyKey });
export const decideLeave = (
  c: ApiClient,
  id: string,
  decision: 'approve' | 'reject',
  note: string,
  idempotencyKey: string,
) => c.post<LeaveRequest>(`/hr/leaves/${id}/${decision}`, { body: note ? { note } : {}, idempotencyKey });

// ---- payslips ---------------------------------------------------------------------------------------------------------
export interface PayslipLine {
  code: string;
  name: string;
  amount: string;
}
export interface Payslip {
  id: string;
  slipNo: string;
  period: string; // YYYY-MM
  employeeName: string;
  designation: string | null;
  workingDays: string;
  paidDays: string;
  unpaidDays: string;
  earnings: PayslipLine[];
  deductions: (PayslipLine & { memo?: boolean })[];
  incentive: string;
  advanceRecovery: string;
  adjustment: string;
  gross: string;
  totalDeductions: string;
  net: string;
  paidAmount: string;
  status: string;
}
export const fetchPayslips = (c: ApiClient, signal?: AbortSignal) =>
  c.get<{ items: Payslip[] }>('/hr/payslips', { signal });
export const fetchPayslip = (c: ApiClient, id: string, signal?: AbortSignal) =>
  c.get<Payslip>(`/hr/payslips/${id}`, { signal });

// ---- beat plans and field visits --------------------------------------------------------------------------------------
export interface Beat {
  id: string;
  employeeName: string;
  planDate: string;
  village: string | null;
  purpose: string | null;
  status: string; // PLANNED | VISITED | MISSED | CANCELLED
}
export interface Visit {
  id: string;
  employeeName: string;
  beatPlanId: string | null;
  village: string | null;
  visitedAt: string;
  outcome: string;
  notes: string | null;
}
export const VISIT_OUTCOMES = ['COMPLETED', 'NOT_AVAILABLE', 'FOLLOW_UP', 'ORDER', 'COMPLAINT'] as const;
export type VisitOutcome = (typeof VISIT_OUTCOMES)[number];

export interface VisitBody {
  village?: string;
  beatPlanId?: string;
  outcome: VisitOutcome;
  notes?: string;
  /** The device's own reference: the server stores a repeated one once. Same value as the Idempotency-Key of the action. */
  offlineRef: string;
}
export interface BeatBody {
  planDate: string;
  village?: string;
  purpose?: string;
}
export const fetchBeats = (c: ApiClient, from: string, signal?: AbortSignal) =>
  c.get<{ items: Beat[] }>('/hr/beat-plans', { query: { from }, signal });
export const fetchVisits = (c: ApiClient, from: string, to: string, signal?: AbortSignal) =>
  c.get<{ items: Visit[] }>('/hr/field-visits', { query: { from, to }, signal });
export const createBeat = (c: ApiClient, body: BeatBody, idempotencyKey: string) =>
  c.post<Beat>('/hr/beat-plans', { body, idempotencyKey });
export const cancelBeat = (c: ApiClient, id: string, idempotencyKey: string) =>
  c.post<Beat>(`/hr/beat-plans/${id}/cancel`, { idempotencyKey });
export const recordVisit = (c: ApiClient, body: VisitBody, idempotencyKey: string) =>
  c.post<Visit & { locationIgnored: boolean; replay: boolean }>('/hr/field-visits', { body, idempotencyKey });

// ---- advances ---------------------------------------------------------------------------------------------------------
export interface Advance {
  id: string;
  advanceNo: string;
  employeeName: string;
  amount: string;
  issuedOn: string;
  installments: number;
  installmentAmount: string;
  startPeriod: string;
  recovered: string;
  balance: string;
  status: string;
  reason: string | null;
}
export interface AdvanceList {
  items: Advance[];
  summary: { openCount: number; outstanding: string };
}
export interface AdvanceBody {
  employeeId: string;
  amount: string;
  installments: number;
  startPeriod: string;
  reason?: string;
}
export const fetchAdvances = (c: ApiClient, signal?: AbortSignal) =>
  c.get<AdvanceList>('/hr/advances', { signal });
export const requestAdvance = (c: ApiClient, body: AdvanceBody, idempotencyKey: string) =>
  c.post<Advance>('/hr/advances', { body, idempotencyKey });

import type { ApiClient } from '@/api/client';

// Shapes copied by hand from the backend: modules/hr/src/application/*.ts and apps/api/src/hr.controller.ts.
// Money and day counts are decimal strings and stay strings. Salary and bank data are sent by the server only to people who hold hr.salary.view.
export const P = {
  employee: 'hr.employee.manage',
  attView: 'hr.attendance.view',
  attManage: 'hr.attendance.manage',
  salaryView: 'hr.salary.view',
  salaryManage: 'hr.salary.manage',
  prepare: 'hr.payroll.prepare',
  approve: 'hr.payroll.approve',
  pay: 'hr.payroll.pay',
  advance: 'hr.advance.manage',
  fieldManage: 'hr.field.manage',
  fieldSelf: 'hr.field.self',
  incentive: 'hr.incentive.manage',
  performance: 'hr.performance.view',
} as const;

export const stfKey = (userId: string, ...rest: string[]) => ['stf', userId, ...rest] as const;

/** First and last day of a YYYY-MM month, on the calendar alone. */
export function monthRange(period: string): { from: string; to: string } {
  const [y, m] = period.split('-').map(Number);
  const last = new Date(Date.UTC(y ?? 1970, m ?? 1, 0)).getUTCDate();
  return { from: `${period}-01`, to: `${period}-${String(last).padStart(2, '0')}` };
}
export function shiftMonth(period: string, by: number): string {
  const [y, m] = period.split('-').map(Number);
  const d = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1 + by, 1));
  return d.toISOString().slice(0, 7);
}

// ---- employees --------------------------------------------------------------------------------------------------------
export const EMPLOYMENT = ['PERMANENT', 'CONTRACT', 'DAILY_WAGE'] as const;
export interface Employee {
  id: string;
  code: string;
  branchId: string;
  branchName: string | null;
  name: string;
  designation: string | null;
  department: string | null;
  joinDate: string;
  exitDate: string | null;
  exitReason: string | null;
  status: 'ACTIVE' | 'ON_LEAVE' | 'EXITED';
  employmentType: string;
  mobile: string | null;
  email: string | null;
  address: string | null;
  emergencyName: string | null;
  emergencyMobile: string | null;
  userId: string | null;
  geoConsent: boolean;
  version: number;
  idProofType?: string | null;
  idProofMasked?: string | null;
  bank?: { name: string | null; ifsc: string | null; holder: string | null; accountMasked: string | null };
}
export interface BranchLite {
  id: string;
  name: string;
  status?: string;
}
export interface EmployeeBody {
  name?: string;
  branchId?: string;
  designation?: string | null;
  department?: string | null;
  joinDate?: string;
  employmentType?: string;
  mobile?: string | null;
  email?: string | null;
  address?: string | null;
  emergencyName?: string | null;
  emergencyMobile?: string | null;
  bankName?: string;
  bankIfsc?: string;
  bankHolder?: string;
  bankAccountNumber?: string;
}
export const fetchBranches = async (c: ApiClient, signal?: AbortSignal) =>
  (await c.get<{ items: BranchLite[] }>('/branches', { signal })).items.filter(
    (b) => b.status === undefined || b.status === 'ACTIVE',
  );
export const fetchEmployees = (
  c: ApiClient,
  f: { q?: string; status?: string; branchId?: string },
  signal?: AbortSignal,
) => c.get<{ items: Employee[] }>('/hr/employees', { query: { ...f, limit: 200 }, signal });
export const fetchEmployee = (c: ApiClient, id: string, signal?: AbortSignal) =>
  c.get<Employee>(`/hr/employees/${id}`, { signal });

// ---- attendance -------------------------------------------------------------------------------------------------------
export interface SheetRow {
  employeeId: string;
  code: string;
  name: string;
  days: Record<string, string>;
  present: number;
  half: number;
  leave: number;
  absent: number;
  weeklyOff: number;
  unmarked: number;
}
export interface Sheet {
  period: string;
  days: string[];
  rows: SheetRow[];
}
export interface AttendanceDay {
  id: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  date: string;
  checkIn: string | null;
  checkOut: string | null;
  method: string;
  status: string;
  workedMinutes: number | null;
  flag: string | null;
  correctionReason: string | null;
}
export const ATT_STATUS = ['PRESENT', 'ABSENT', 'HALF_DAY', 'LEAVE'] as const;
export const fetchSheet = (c: ApiClient, period: string, signal?: AbortSignal) =>
  c.get<Sheet>('/hr/attendance/register', { query: { period }, signal });
export const fetchSheetCsv = (c: ApiClient, period: string) =>
  c.get<{ fileName: string; content: string }>('/hr/attendance/register', {
    query: { period, format: 'csv' },
  });
export const fetchAttendanceDays = (
  c: ApiClient,
  q: { from: string; to: string; employeeId?: string },
  signal?: AbortSignal,
) => c.get<{ items: AttendanceDay[] }>('/hr/attendance', { query: q, signal });

// ---- payroll ----------------------------------------------------------------------------------------------------------
export interface RunException {
  code: string;
  message: string;
  employeeCode?: string;
}
export interface Run {
  id: string;
  runNo: string;
  period: string;
  status: 'DRAFT' | 'CALCULATED' | 'APPROVED' | 'PAID' | 'REVERSED';
  employeeCount: number;
  grossTotal: string;
  deductionTotal: string;
  netTotal: string;
  advanceTotal: string;
  incentiveTotal: string;
  exceptions: RunException[];
  reopenCount: number;
  version: number;
}
export interface Slip {
  id: string;
  slipNo: string;
  employeeCode: string;
  employeeName: string;
  paidDays: string;
  unpaidDays: string;
  gross: string;
  totalDeductions: string;
  incentive: string;
  advanceRecovery: string;
  adjustment: string;
  adjustmentReason: string | null;
  net: string;
  paidAmount: string;
  status: string;
  warnings: { code: string; message: string }[];
}
export type RunDetail = Run & { slips?: Slip[] };
export const PAY_MODES = ['BANK_TRANSFER', 'CASH', 'UPI', 'CHEQUE'] as const;
export const fetchRuns = (c: ApiClient, signal?: AbortSignal) =>
  c.get<{ items: Run[] }>('/hr/payroll-runs', { signal });
export const fetchRun = (c: ApiClient, id: string, signal?: AbortSignal) =>
  c.get<RunDetail>(`/hr/payroll-runs/${id}`, { signal });
export const fetchBankFile = (c: ApiClient, id: string) =>
  c.get<{ fileName: string; csv?: string; content?: string }>(`/hr/payroll-runs/${id}/bank-file`);

// ---- salary -----------------------------------------------------------------------------------------------------------
export interface Component {
  id: string;
  code: string;
  name: string;
  kind: 'EARNING' | 'DEDUCTION';
  active: boolean;
}
export interface StructureLine {
  code: string;
  name?: string;
  calcType: 'FIXED' | 'PERCENT' | 'FORMULA';
  value: string;
}
export interface Structure {
  id: string;
  name: string;
  active: boolean;
  version: number;
  lines: StructureLine[];
}
export const fetchComponents = (c: ApiClient, signal?: AbortSignal) =>
  c.get<{ items: Component[] }>('/hr/salary-components', { signal });
export const fetchStructures = (c: ApiClient, signal?: AbortSignal) =>
  c.get<{ items: Structure[] }>('/hr/salary-structures', { signal });

// ---- advances ---------------------------------------------------------------------------------------------------------
export interface AdvanceRow {
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
  status: string; // PENDING | OPEN | RECOVERING | CLOSED | CANCELLED
  reason: string | null;
  recoveries?: { id: string; amount: string; kind: string; recoveredOn: string; note: string | null }[];
}
export interface AdvanceDesk {
  items: AdvanceRow[];
  summary: { openCount: number; outstanding: string };
}
export const fetchAdvanceDesk = (c: ApiClient, signal?: AbortSignal) =>
  c.get<AdvanceDesk>('/hr/advances', { signal });
export const fetchAdvanceLedger = (c: ApiClient, id: string, signal?: AbortSignal) =>
  c.get<AdvanceRow>(`/hr/advances/${id}`, { signal });

// ---- field work -------------------------------------------------------------------------------------------------------
export interface BeatRow {
  id: string;
  employeeId: string;
  employeeName: string;
  planDate: string;
  village: string | null;
  purpose: string | null;
  status: string;
}
export interface VisitRow {
  id: string;
  employeeName: string;
  village: string | null;
  visitedAt: string;
  outcome: string;
  notes: string | null;
}
export interface FieldSummaryRow {
  employeeId: string;
  employeeName: string;
  planned: number;
  visited: number;
  missed: number;
  visits: number;
  unplanned: number;
  adherencePct: string;
}
export const fetchBeatsRange = (c: ApiClient, q: { from: string; to: string }, signal?: AbortSignal) =>
  c.get<{ items: BeatRow[] }>('/hr/beat-plans', { query: q, signal });
export const fetchVisitsRange = (c: ApiClient, q: { from: string; to: string }, signal?: AbortSignal) =>
  c.get<{ items: VisitRow[] }>('/hr/field-visits', { query: q, signal });
export const fetchFieldSummary = (c: ApiClient, q: { from: string; to: string }, signal?: AbortSignal) =>
  c.get<{ from: string; to: string; rows: FieldSummaryRow[] }>('/hr/field-visits/summary', {
    query: q,
    signal,
  });

// ---- incentives and performance ---------------------------------------------------------------------------------------
export interface IncentiveRule {
  id: string;
  code: string;
  name: string;
  basis: 'SALES' | 'COLLECTION';
  ratePct: string | null;
  effectiveFrom: string;
  status: 'ACTIVE' | 'RETIRED';
}
export interface IncentiveRow {
  id?: string;
  employeeName: string;
  employeeCode?: string;
  ruleCode: string;
  status?: string;
  result: { amount: string; netBase?: string };
}
export interface PerformanceRow {
  employeeId: string;
  code: string;
  name: string;
  netSales: string;
  salesCount: number;
  collections: string;
  presentDays: string;
  visitsPlanned: number;
  visitsDone: number;
  incentive: string;
}
export const fetchRules = (c: ApiClient, signal?: AbortSignal) =>
  c.get<{ items: IncentiveRule[] }>('/hr/incentive-rules', { signal });
export const fetchIncentives = (c: ApiClient, period: string, signal?: AbortSignal) =>
  c.get<{ items: IncentiveRow[] }>('/hr/incentives', { query: { period }, signal });
export const fetchPerformance = (c: ApiClient, r: { from: string; to: string }, signal?: AbortSignal) =>
  c.get<{ rows: PerformanceRow[]; totals: { netSales: string; collections: string; incentive: string } }>(
    '/hr/performance',
    {
      query: r,
      signal,
    },
  );

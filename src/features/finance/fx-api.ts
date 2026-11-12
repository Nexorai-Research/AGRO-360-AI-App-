import type { ApiClient } from '@/api/client';
import type { Amount } from '@/money';

// Shapes copied by hand from the backend (no OpenAPI file yet): apps/api/src/{finance,finance-ops}.controller.ts,
// modules/finance/src/domain/{finance,finance-b}.ts and modules/finance/src/application/{yearend,export,expenses}.ts.

export const XP = {
  view: 'finance.account.view',
  settings: 'finance.settings.manage',
  opening: 'finance.opening.manage',
  yearEnd: 'finance.yearend.close',
  exportRun: 'finance.export.run',
  inter: 'finance.intercompany.manage',
  expCreate: 'finance.expense.create',
  reports: 'reports.financial',
} as const;

export const xkey = (userId: string, what: string, extra = '') => ['sal', 'fx', what, userId, extra] as const;

export interface FinSettings {
  journalApprovalAmount: Amount | null;
  cashPaymentLimit: Amount | null;
  requireCostCentre: boolean;
  attachmentRequiredAbove: Amount | null;
  expenseBasis: 'CASH' | 'ACCRUAL';
  expenseApprovalAmount: Amount | null;
  version: number;
}
export const fetchFinSettings = (c: ApiClient, signal?: AbortSignal) =>
  c.get<FinSettings>('/finance/settings', { signal });
export const saveFinSettings = (c: ApiClient, version: number, body: unknown, idempotencyKey: string) =>
  c.put<FinSettings>('/finance/settings', { version, body, idempotencyKey });

export interface AccountRef {
  id: string;
  code: string;
  name: string;
  type: string;
  isControl?: boolean;
  isOpeningPlug?: boolean;
  cashBank?: boolean;
  active?: boolean;
}
export const fetchAccountRefs = async (c: ApiClient, signal?: AbortSignal) =>
  (await c.get<{ items: AccountRef[] }>('/finance/accounts', { signal })).items;
export const fetchBranchRefs = async (c: ApiClient, signal?: AbortSignal) =>
  (await c.get<{ items: { id: string; name: string }[] }>('/branches', { signal })).items;

export interface OpeningView {
  voucher: {
    id: string;
    voucherNo: string;
    voucherDate: string;
    lines: { accountCode: string; accountName: string; debit: Amount; credit: Amount }[];
  } | null;
  locked?: boolean;
}
export const fetchOpening = (c: ApiClient, signal?: AbortSignal) =>
  c.get<OpeningView>('/finance/opening-balances', { signal });
export const saveOpening = (
  c: ApiClient,
  body: { asOn: string; lines: { accountId: string; debit?: Amount; credit?: Amount }[] },
  idempotencyKey: string,
) => c.post<unknown>('/finance/opening-balances', { body, idempotencyKey });
export const reverseVoucher = (c: ApiClient, voucherId: string, reason: string, idempotencyKey: string) =>
  c.post<unknown>(`/finance/vouchers/${encodeURIComponent(voucherId)}/reverse`, {
    body: { reason },
    idempotencyKey,
  });

export interface YearRef {
  id: string;
  label: string;
  status: string;
}
export interface YearEnd {
  fyId: string;
  fyLabel: string;
  startDate: string;
  endDate: string;
  status: string;
  closed: { closedOn: string; netProfit: Amount; nextFyLabel: string | null } | null;
  checks: { key: string; label: string; ok: boolean; blocking: boolean; detail: string }[];
  canClose: boolean;
}
export const fetchYearRefs = async (c: ApiClient, signal?: AbortSignal) =>
  (await c.get<{ items: YearRef[] }>('/finance/periods', { signal })).items;
export const fetchYearEnd = (c: ApiClient, fyId: string, signal?: AbortSignal) =>
  c.get<YearEnd>(`/finance/year-end/${encodeURIComponent(fyId)}`, { signal });
export const closeYear = (c: ApiClient, fyId: string, reason: string, idempotencyKey: string) =>
  c.post<unknown>(`/finance/year-end/${encodeURIComponent(fyId)}/close`, {
    body: { reason },
    idempotencyKey,
  });

export interface MappingRow {
  accountId: string;
  code: string;
  name: string;
  externalName: string | null;
}
export interface ExportRow {
  id: string;
  createdAt: string;
  format: string;
  from: string;
  to: string;
  rowCount: number;
}
export interface ExportResult {
  id: string;
  replay: boolean;
  rowCount: number;
  fileName: string;
  contentType: string;
  content: string;
  unmappedAccounts: string[];
}
export const fetchMappings = async (c: ApiClient, signal?: AbortSignal) =>
  (await c.get<{ items: MappingRow[] }>('/finance/export/mappings', { signal })).items;
export const fetchExports = async (c: ApiClient, signal?: AbortSignal) =>
  (await c.get<{ items: ExportRow[] }>('/finance/export/history', { signal })).items;
export const saveMappings = (
  c: ApiClient,
  items: { accountId: string; externalCode: string; externalName: string }[],
  idempotencyKey: string,
) => c.put<unknown>('/finance/export/mappings', { body: { items }, idempotencyKey });
export const runExport = (
  c: ApiClient,
  body: { format: string; from: string; to: string },
  idempotencyKey: string,
) => c.post<ExportResult>('/finance/export', { body, idempotencyKey });

export interface Intercompany {
  id: string;
  txnNo: string;
  date: string;
  fromBranch: string;
  toBranch: string;
  amount: Amount;
  description: string;
}
export const fetchInter = async (c: ApiClient, signal?: AbortSignal) =>
  (await c.get<{ items: Intercompany[] }>('/finance/intercompany', { signal })).items;
export const postInter = (c: ApiClient, body: unknown, idempotencyKey: string) =>
  c.post<unknown>('/finance/intercompany', { body, idempotencyKey });

export interface Template {
  id: string;
  name: string;
  payee: string;
  amount: Amount;
  dayOfMonth: number;
  nextDate: string;
  active: boolean;
  version: number;
}
export const fetchTemplates = async (c: ApiClient, signal?: AbortSignal) =>
  (await c.get<{ items: Template[] }>('/finance/expense-templates', { signal })).items;
export const createTemplate = (c: ApiClient, body: unknown, idempotencyKey: string) =>
  c.post<Template>('/finance/expense-templates', { body, idempotencyKey });
export const setTemplateActive = (c: ApiClient, t: Template, active: boolean, idempotencyKey: string) =>
  c.patch<Template>(`/finance/expense-templates/${encodeURIComponent(t.id)}`, {
    version: t.version,
    body: { active },
    idempotencyKey,
  });
export const generateDrafts = (c: ApiClient, idempotencyKey: string) =>
  c.post<{ created: number }>('/finance/expense-templates/generate', { body: {}, idempotencyKey });

export interface ExpenseReport {
  from: string;
  to: string;
  total: Amount;
  rows: { code: string; name: string; count: number; amount: Amount; tax: Amount }[];
}
export const fetchExpenseReport = (c: ApiClient, signal?: AbortSignal) =>
  c.get<ExpenseReport>('/reports/expenses', { signal });

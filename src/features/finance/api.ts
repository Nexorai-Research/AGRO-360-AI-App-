import type { ApiClient } from '@/api/client';

// Shapes copied by hand from modules/finance/src/application/* and apps/api/src/finance*.controller.ts.
// Money arrives and leaves as decimal strings. The app never sends a tenant id.
export const FP = {
  view: 'finance.account.view',
  reports: 'reports.financial',
  manage: 'finance.account.manage',
  voucherCreate: 'finance.voucher.create',
  voucherApprove: 'finance.voucher.approve',
  voucherReverse: 'finance.voucher.reverse',
  bankManage: 'finance.bank.manage',
  bankRec: 'finance.bankrec.manage',
  expCreate: 'finance.expense.create',
  expApprove: 'finance.expense.approve',
  expPay: 'finance.expense.pay',
  petty: 'finance.pettycash.manage',
  periodLock: 'finance.period.lock',
  periodReopen: 'finance.period.reopen',
  budgetManage: 'finance.budget.manage',
  budgetApprove: 'finance.budget.approve',
  exception: 'finance.exception.manage',
} as const;

export interface Items<T> {
  items: T[];
}
export interface Branch {
  id: string;
  name: string;
}

export interface Account {
  id: string;
  code: string;
  name: string;
  type: string;
  groupId: string | null;
  groupName: string | null;
  isControl: boolean;
  isSystem: boolean;
  cashBank: 'CASH' | 'BANK' | null;
  isOpeningPlug: boolean;
  active: boolean;
  description: string | null;
  version: number;
  balance?: string;
}
export interface Group {
  id: string;
  code: string;
  name: string;
  type: string;
  parentId: string | null;
}

export type VoucherKind = 'JOURNAL' | 'PAYMENT' | 'RECEIPT' | 'CONTRA';
export interface VoucherLine {
  lineNo: number;
  accountId: string;
  accountCode: string;
  accountName: string;
  debit: string;
  credit: string;
  narration: string | null;
}
export interface Voucher {
  id: string;
  voucherNo: string;
  kind: string;
  status: string;
  voucherDate: string;
  narration: string;
  total: string;
  journalId: string | null;
  createdBy: string | null;
  decisionNote: string | null;
  reverseReason: string | null;
  version: number;
  needsApproval: boolean;
  lines?: VoucherLine[];
  warnings?: string[];
}
export interface JournalRow {
  id: string;
  date: string;
  sourceType: string;
  purpose: string;
  narration: string | null;
  voucherNo: string | null;
  debit: string;
  credit: string;
}
export interface JournalDetail extends JournalRow {
  lines?: { accountCode: string; accountName: string; debit: string; credit: string }[];
}

export interface LedgerEntry {
  journalId: string;
  date: string;
  voucherNo: string | null;
  sourceType: string;
  narration: string | null;
  purpose: string;
  debit: string;
  credit: string;
  running: string;
}
export interface GeneralLedger {
  from: string | null;
  to: string;
  opening: string;
  closing: string;
  entries: LedgerEntry[];
  truncated?: boolean;
}

export interface Expense {
  id: string;
  expenseNo: string;
  expenseDate: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  payee: string;
  amount: string;
  taxAmount: string;
  inputTaxEligible: boolean;
  total: string;
  documentNo: string | null;
  status: string;
  needsApproval: boolean;
  decisionNote: string | null;
  reverseReason: string | null;
  version: number;
  warnings?: string[];
}

export interface BankAccount {
  id: string;
  accountId: string;
  ledgerCode: string;
  ledgerName: string;
  bankName: string;
  branchName: string | null;
  ifsc: string;
  holderName: string;
  accountNumberMasked: string;
  upiVpa: string | null;
  active: boolean;
  balance: string;
  version: number;
}
export interface BankLine {
  id: string;
  date: string;
  narration: string;
  reference: string | null;
  withdrawal: string;
  deposit: string;
  status: string;
  suggestedJournalLineId: string | null;
}
export interface BookEntry {
  journalLineId: string;
  date: string;
  direction: string;
  amount: string;
  narration: string;
  voucherNo: string | null;
}
export interface Rec {
  bankAccountId: string;
  asOn: string;
  bookBalance: string;
  statementBalance: string | null;
  unmatchedBook: BookEntry[];
  depositsInTransit: string;
  outstandingPayments: string;
  bankOnlyDeposits: string;
  bankOnlyWithdrawals: string;
  adjustedBank: string | null;
  adjustedBook: string;
  difference: string | null;
  reconciled: boolean;
  signed: { signedAt: string; statementBalance: string } | null;
}

export interface Fund {
  id: string;
  branchId: string;
  branchName: string;
  ledgerCode: string;
  floatAmount: string;
  custodian: string;
  balance: string;
  toReplenish: string;
  active: boolean;
  version: number;
  lastCount: { countedOn: string; difference: string; status: string } | null;
}
export interface Count {
  id: string;
  countedOn: string;
  countedAmount: string;
  bookAmount: string;
  difference: string;
  status: string;
  note: string | null;
}

export interface Period {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
  status: string;
  journals: number;
  canReopen: boolean;
}
export interface Year {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
  status: string;
  periods: Period[];
}

export interface Budget {
  id: string;
  name: string;
  fyLabel: string;
  version: number;
  status: string;
  total: string;
  lineCount: number;
  lines?: { accountCode: string; accountName: string; month: string; amount: string }[];
}
export interface VarianceRow {
  code: string;
  name: string;
  budget: string;
  actual: string;
  variance: string;
  variancePct: string | null;
}
export interface Variance {
  from: string;
  to: string;
  rows: VarianceRow[];
}

export interface Exception {
  id: string;
  exceptionNo: string;
  code: string;
  severity: string;
  title: string;
  status: string;
  raisedAt: string;
  resolution: string | null;
}
export interface CostCentre {
  id: string;
  code: string;
  name: string;
  active: boolean;
  version: number;
}

const W = (key: string, body?: unknown, version?: number) => ({
  idempotencyKey: key,
  body: body === undefined ? {} : body,
  ...(version === undefined ? {} : { version }),
});

export const listBranches = (c: ApiClient, s?: AbortSignal) => c.get<Items<Branch>>('/branches', { signal: s });
export const listAccounts = (c: ApiClient, balances: boolean, s?: AbortSignal) =>
  c.get<Items<Account>>('/finance/accounts', { query: balances ? { balances: 'true' } : {}, signal: s });
export const listGroups = (c: ApiClient, s?: AbortSignal) => c.get<Items<Group>>('/finance/account-groups', { signal: s });
export const createAccount = (c: ApiClient, key: string, b: { code: string; name: string; type: string; groupId?: string; description?: string }) =>
  c.post<Account>('/finance/accounts', W(key, b));
export const patchAccount = (c: ApiClient, key: string, a: Account, b: Record<string, unknown>) =>
  c.patch<Account>(`/finance/accounts/${a.id}`, W(key, b, a.version));
export const createGroup = (c: ApiClient, key: string, b: { code: string; name: string; parentId: string }) =>
  c.post<Group>('/finance/account-groups', W(key, b));
export const generalLedger = (c: ApiClient, accountId: string, from: string, to: string, s?: AbortSignal) =>
  c.get<GeneralLedger>('/reports/general-ledger', { query: { accountId, from, to }, signal: s });
export const listCostCentres = (c: ApiClient, s?: AbortSignal) => c.get<Items<CostCentre>>('/finance/cost-centres', { signal: s });

export const listVouchers = (c: ApiClient, q: { kind?: string; status?: string }, s?: AbortSignal) =>
  c.get<Items<Voucher>>('/finance/vouchers', { query: { ...q, limit: 100 }, signal: s });
export const getVoucher = (c: ApiClient, id: string, s?: AbortSignal) => c.get<Voucher>(`/finance/vouchers/${id}`, { signal: s });
export const createVoucher = (c: ApiClient, key: string, kind: VoucherKind, body: unknown) =>
  c.post<Voucher>(`/finance/vouchers/${kind.toLowerCase()}`, W(key, body));
export const voucherStep = (c: ApiClient, key: string, id: string, step: 'post' | 'submit' | 'approve' | 'cancel') =>
  c.post<Voucher>(`/finance/vouchers/${id}/${step}`, W(key));
export const voucherReject = (c: ApiClient, key: string, id: string, note: string) =>
  c.post<Voucher>(`/finance/vouchers/${id}/reject`, W(key, { note }));
export const voucherReverse = (c: ApiClient, key: string, id: string, reason: string) =>
  c.post<Voucher>(`/finance/vouchers/${id}/reverse`, W(key, { reason }));
export const listJournals = (c: ApiClient, from: string, to: string, s?: AbortSignal) =>
  c.get<Items<JournalRow>>('/finance/journals', { query: { from, to, limit: 100 }, signal: s });
export const getJournal = (c: ApiClient, id: string, s?: AbortSignal) => c.get<JournalDetail>(`/finance/journals/${id}`, { signal: s });

export const listExpenses = (c: ApiClient, status: string, s?: AbortSignal) =>
  c.get<Items<Expense>>('/finance/expenses', { query: { status, limit: 100 }, signal: s });
export const getExpense = (c: ApiClient, id: string, s?: AbortSignal) => c.get<Expense>(`/finance/expenses/${id}`, { signal: s });
export const createExpense = (c: ApiClient, key: string, body: unknown) => c.post<Expense>('/finance/expenses', W(key, body));
export const expenseStep = (c: ApiClient, key: string, id: string, step: 'submit' | 'approve') =>
  c.post<Expense>(`/finance/expenses/${id}/${step}`, W(key));
export const expenseReject = (c: ApiClient, key: string, id: string, note: string) =>
  c.post<Expense>(`/finance/expenses/${id}/reject`, W(key, { note }));
export const expensePay = (c: ApiClient, key: string, id: string, paymentAccountId: string, paidOn: string) =>
  c.post<Expense>(`/finance/expenses/${id}/pay`, W(key, { paymentAccountId, paidOn }));
export const expenseReverse = (c: ApiClient, key: string, id: string, reason: string) =>
  c.post<Expense>(`/finance/expenses/${id}/reverse`, W(key, { reason }));

export const listBanks = (c: ApiClient, s?: AbortSignal) => c.get<Items<BankAccount>>('/finance/bank-accounts', { signal: s });
export const createBank = (c: ApiClient, key: string, body: unknown) => c.post<BankAccount>('/finance/bank-accounts', W(key, body));
export const patchBank = (c: ApiClient, key: string, b: BankAccount, body: unknown) =>
  c.patch<BankAccount>(`/finance/bank-accounts/${b.id}`, W(key, body, b.version));
export const listBankLines = (c: ApiClient, bankAccountId: string, status: string, s?: AbortSignal) =>
  c.get<Items<BankLine>>('/finance/bank-statements/lines', { query: { bankAccountId, status, limit: 100 }, signal: s });
export const getRec = (c: ApiClient, bankAccountId: string, asOn: string, s?: AbortSignal) =>
  c.get<Rec>(`/finance/bank-reconciliation/${bankAccountId}`, { query: { asOn }, signal: s });
export const autoMatch = (c: ApiClient, key: string, bankAccountId: string) =>
  c.post<{ autoMatched: number; suggested: number; unmatched: number }>(`/finance/bank-statements/${bankAccountId}/auto-match`, W(key));
export const lineStep = (c: ApiClient, key: string, lineId: string, step: 'accept' | 'unmatch') =>
  c.post<unknown>(`/finance/bank-lines/${lineId}/${step}`, W(key));
export const lineMatch = (c: ApiClient, key: string, lineId: string, journalLineId: string) =>
  c.post<unknown>(`/finance/bank-lines/${lineId}/match`, W(key, { journalLineId }));
export const signRec = (c: ApiClient, key: string, bankAccountId: string, asOn: string, statementBalance: string) =>
  c.post<{ refused?: string }>(`/finance/bank-reconciliation/${bankAccountId}/sign`, W(key, { asOn, statementBalance }));

export const listFunds = (c: ApiClient, s?: AbortSignal) => c.get<Items<Fund>>('/finance/petty-cash', { signal: s });
export const createFund = (c: ApiClient, key: string, body: unknown) => c.post<Fund>('/finance/petty-cash', W(key, body));
export const fundExpense = (c: ApiClient, key: string, id: string, body: unknown) =>
  c.post<unknown>(`/finance/petty-cash/${id}/expense`, W(key, body));
export const fundReplenish = (c: ApiClient, key: string, id: string, body: unknown) =>
  c.post<unknown>(`/finance/petty-cash/${id}/replenish`, W(key, body));
export const fundCount = (c: ApiClient, key: string, id: string, body: unknown) => c.post<Count>(`/finance/petty-cash/${id}/count`, W(key, body));
export const listCounts = (c: ApiClient, id: string, s?: AbortSignal) => c.get<Items<Count>>(`/finance/petty-cash/${id}/counts`, { signal: s });
export const countApprove = (c: ApiClient, key: string, id: string) => c.post<unknown>(`/finance/petty-cash/counts/${id}/approve`, W(key));
export const countReject = (c: ApiClient, key: string, id: string, note: string) =>
  c.post<unknown>(`/finance/petty-cash/counts/${id}/reject`, W(key, { note }));

export const listPeriods = (c: ApiClient, s?: AbortSignal) => c.get<Items<Year>>('/finance/periods', { signal: s });
export const periodStep = (c: ApiClient, key: string, id: string, step: 'lock' | 'unlock', reason: string) =>
  c.post<unknown>(`/finance/periods/${id}/${step}`, W(key, { reason }));

export const listBudgets = (c: ApiClient, s?: AbortSignal) => c.get<Items<Budget>>('/finance/budgets', { signal: s });
export const getBudget = (c: ApiClient, id: string, s?: AbortSignal) => c.get<Budget>(`/finance/budgets/${id}`, { signal: s });
export const budgetStep = (c: ApiClient, key: string, id: string, step: 'submit' | 'approve') =>
  c.post<unknown>(`/finance/budgets/${id}/${step}`, W(key));
export const budgetReject = (c: ApiClient, key: string, id: string, note: string) =>
  c.post<unknown>(`/finance/budgets/${id}/reject`, W(key, { note }));
export const budgetRevise = (c: ApiClient, key: string, fyLabel: string) => c.post<unknown>('/finance/budgets/revise', W(key, { fyLabel }));
export const budgetVariance = (c: ApiClient, fyLabel: string, s?: AbortSignal) =>
  c.get<Variance>('/reports/budget-variance', { query: { fyLabel }, signal: s });

export const listExceptions = (c: ApiClient, status: string, s?: AbortSignal) =>
  c.get<Items<Exception>>('/finance/exceptions', { query: { status }, signal: s });
export const runChecks = (c: ApiClient, key: string) => c.post<unknown>('/finance/exceptions/run-checks', W(key));
export const exceptionAck = (c: ApiClient, key: string, id: string) => c.post<unknown>(`/finance/exceptions/${id}/acknowledge`, W(key));
export const exceptionResolve = (c: ApiClient, key: string, id: string, resolution: string) =>
  c.post<unknown>(`/finance/exceptions/${id}/resolve`, W(key, { resolution }));

import type { ApiClient } from '@/api/client';

// ---- Group 5: saved report drafts (UC-379), health score, branch comparison (UC-386), expansion simulator (G14) ----
export interface ReportDraftRow {
  id: string;
  report: string;
  title: string;
  currentVersion: number;
  updatedAt: string;
  current: { paragraphs: string[]; source: string };
}
export const fetchReportDrafts = async (c: ApiClient, signal?: AbortSignal) =>
  (await c.get<{ items: ReportDraftRow[] }>('/ai/reports/drafts', { signal })).items;

export interface HealthComponent {
  key: string;
  label: string;
  max: number;
  points: number | null;
  available: boolean;
  explanation: string;
}
export interface Health {
  score: number | null;
  band: 'HEALTHY' | 'WATCH' | 'AT_RISK' | null;
  complete: boolean;
  asOf: string;
  components: HealthComponent[];
}
export const fetchHealthScore = (c: ApiClient, branch: string, signal?: AbortSignal) =>
  c.get<Health>('/ai/health-score', { query: { branch: branch || undefined }, signal });

export interface BranchView {
  branchId: string;
  branchName: string;
  onHand: number;
  free: number;
  dailyDemand: number;
  coverDays: number | null;
  status: 'SHORT' | 'OK' | 'SURPLUS' | 'NO_DEMAND';
}
export interface Transfer {
  fromBranchId: string;
  fromBranchName: string;
  toBranchId: string;
  toBranchName: string;
  quantity: number;
  reason: string;
  cost?: { perUnit: number | null; total: number | null } | null;
}
export interface TransferPlan {
  state: 'OK' | 'INSUFFICIENT_DATA';
  reason: string | null;
  branches: BranchView[];
  transfers: Transfer[];
  costPerUnit?: number | null;
  note?: string;
  asOf: string;
}
export const fetchTransferPlan = (c: ApiClient, product: string, signal?: AbortSignal) =>
  c.get<TransferPlan>('/ai/branches/transfer-plan', { query: { product }, signal });

export interface ExpansionInputs {
  investment: number;
  monthlyFixedCost: number;
  matureMonthlySales: number;
  rampPct: number[];
  grossMarginPct?: number;
  workingCapitalDays: number;
}
export interface ExpansionRunView {
  breakEvenMonth: number | null;
  paybackMonth: number | null;
  cumulativeCash24: number;
  peakFunding: number;
  totalSales: number;
}
export interface ExpansionResult {
  label: string;
  inputs: ExpansionInputs;
  marginSource: 'FRANCHISE_HISTORY' | 'ENTERED';
  base: ExpansionRunView;
  sensitivity: ({ label: string; direction: string } & ExpansionRunView)[];
  notes: string[];
  fingerprint: string;
}
/** The server wants JSON numbers for these assumptions (they are the person's own what-if figures, not ledger money). */
export const simulateExpansion = (c: ApiClient, body: ExpansionInputs, idempotencyKey: string) =>
  c.post<ExpansionResult>('/ai/expansion/simulate', { body, idempotencyKey });
export const saveExpansion = (c: ApiClient, name: string, inputs: ExpansionInputs, idempotencyKey: string) =>
  c.post<{ id: string }>('/ai/expansion/scenarios', { body: { name, inputs }, idempotencyKey });
export interface ExpansionSaved {
  id: string;
  name: string;
  inputs: ExpansionInputs;
  result?: ExpansionResult;
}
export const fetchExpansions = async (c: ApiClient, signal?: AbortSignal) =>
  (await c.get<{ items: ExpansionSaved[] }>('/ai/expansion/scenarios', { signal })).items;
export const deleteExpansion = (c: ApiClient, id: string, idempotencyKey: string) =>
  c.delete<unknown>(`/ai/expansion/scenarios/${id}`, { idempotencyKey });

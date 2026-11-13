import type { ApiClient } from '@/api/client';
import { akey } from './api';

// Risk register and cases (UC-385, 389), data quality (UC-381), quota and evaluation (UC-270), approval policy (UC-383),
// feedback and outcome on a suggestion (UC-382, 388), decision log (UC-390). Shapes copied by hand from
// apps/api/src/{ai-insights,ai-ops,ai-forecast,ai-actions,ai}.controller.ts and modules/ai/src/application/{governance,recommendations}.ts.
export { akey };

export const P = {
  view: 'ai.recommendation.view',
  decide: 'ai.recommendation.decide',
  govern: 'ai.governance.manage',
  audit: 'ai.audit.view',
  use: 'ai.assistant.use',
  inventory: 'inventory.view',
} as const;

// ---- risk register -------------------------------------------------------------------------------------------------------------
export type RiskStatus = 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED' | 'DISMISSED';
export interface RiskSignal {
  id: string;
  kind: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  subjectRef: string;
  branchId: string | null;
  title: string;
  detail: Record<string, unknown>;
  status: RiskStatus;
  assignee: string | null;
  dueDate: string | null;
  resolutionNote: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
}
export interface RiskNote {
  id: string;
  actorId: string;
  note: string;
  createdAt: string;
}
export const fetchRisks = (c: ApiClient, status: string, signal?: AbortSignal) =>
  c.get<{ summary: { open: Record<string, number>; total: number }; items: RiskSignal[] }>('/ai/risks', {
    query: { status: status || undefined, limit: 100 },
    signal,
  });
export const fetchRisk = (c: ApiClient, id: string, signal?: AbortSignal) =>
  c.get<RiskSignal & { notes: RiskNote[] }>(`/ai/risks/${id}`, { signal });
export const fetchRiskEvidence = async (c: ApiClient, id: string, signal?: AbortSignal) =>
  (
    await c.get<{
      items: { id?: string; note?: string; ref?: string; label?: string; createdAt?: string }[];
    }>(`/ai/risks/${id}/evidence`, { signal })
  ).items;
export const scanRisks = (c: ApiClient, branch: string | undefined, idempotencyKey: string) =>
  c.post<{ created: number; refreshed: number; found: number }>('/ai/risks/scan', {
    body: branch ? { branch } : {},
    idempotencyKey,
  });
export const addRiskNote = (c: ApiClient, id: string, note: string, idempotencyKey: string) =>
  c.post<RiskNote>(`/ai/risks/${id}/notes`, { body: { note }, idempotencyKey });
export const setRiskStatus = (
  c: ApiClient,
  id: string,
  body: { status: 'ACKNOWLEDGED' | 'RESOLVED' | 'DISMISSED'; note?: string },
  idempotencyKey: string,
) => c.post<RiskSignal>(`/ai/risks/${id}/status`, { body, idempotencyKey });
export const reopenRisk = (c: ApiClient, id: string, note: string, idempotencyKey: string) =>
  c.post<RiskSignal>(`/ai/risks/${id}/reopen`, { body: { note }, idempotencyKey });
export const assignRisk = (c: ApiClient, id: string, body: { dueDate: string }, idempotencyKey: string) =>
  c.post<RiskSignal>(`/ai/risks/${id}/assign`, { body, idempotencyKey });

// ---- data quality ----------------------------------------------------------------------------------------------------------------
export interface QualitySource {
  source: string;
  state: string;
  score: number | null;
  band: 'GOOD' | 'FAIR' | 'POOR' | null;
  checked: number;
  reason: string | null;
  issues?: { code?: string; label?: string; count?: number }[];
}
export interface QualityDashboard {
  overall: number | null;
  sources: QualitySource[];
  branches: { branchId?: string; branch?: string; name?: string; score: number | null; products?: number }[];
  notScanned: string[];
  note: string;
}
export const fetchQuality = (c: ApiClient, signal?: AbortSignal) =>
  c.get<QualityDashboard>('/ai/data-quality/dashboard', { signal });

// ---- quota and evaluation --------------------------------------------------------------------------------------------------------
export interface Quota {
  effectiveQuota: number;
  limitedBy: string;
  franchiseQuota: number;
  planQuota: number | null;
  used: number;
  remaining: number;
  note: string;
}
export const fetchQuota = (c: ApiClient, signal?: AbortSignal) => c.get<Quota>('/ai/quota', { signal });
export interface EvaluationReport {
  generatedAt: string;
  days: number;
  modelVersion: string;
  accuracyTrend: { branchId: string; branch: string; points: unknown[] }[];
  comparisons: unknown[];
  promotions: unknown[];
  methodsInForce: unknown[];
  driftCases: unknown[];
  usage: { used: number; quota: number; settings: { enabled: boolean; monthlyQuota: number } };
}
export const fetchEvaluation = (c: ApiClient, days: number, signal?: AbortSignal) =>
  c.get<EvaluationReport>('/ai/evaluation/report', { query: { days }, signal });

// ---- approval policy and action settings -----------------------------------------------------------------------------------------
export interface Policy {
  action: string;
  requireDistinctActor: boolean;
  ttlMinutes: number;
  ownerAboveQty: number | null;
  requireSecondApprover: boolean;
  secondApproverAbove: number | null;
  version: number;
  isDefault: boolean;
}
export const fetchPolicies = async (c: ApiClient, signal?: AbortSignal) =>
  (await c.get<{ items: Policy[] }>('/ai/policies', { signal })).items;
export type PolicyEdit = Partial<
  Pick<
    Policy,
    'requireDistinctActor' | 'ttlMinutes' | 'ownerAboveQty' | 'requireSecondApprover' | 'secondApproverAbove'
  >
>;
/** `version` goes as If-Match. */
export const savePolicy = (
  c: ApiClient,
  action: string,
  version: number,
  body: PolicyEdit,
  idempotencyKey: string,
) => c.put<Policy>(`/ai/policies/${action}`, { body, version, idempotencyKey });
export interface ActionSetting {
  reorderBudget: number | null;
  transferCostPerUnit: number | null;
  version: number;
}
export const fetchActionSetting = (c: ApiClient, signal?: AbortSignal) =>
  c.get<ActionSetting>('/ai/action-settings', { signal });
export const saveActionSetting = (
  c: ApiClient,
  version: number,
  body: { reorderBudget?: number | null; transferCostPerUnit?: number | null },
  idempotencyKey: string,
) => c.put<ActionSetting>('/ai/action-settings', { body, version, idempotencyKey });

// ---- feedback and outcome on a suggestion ----------------------------------------------------------------------------------------
export const VERDICTS = ['HELPFUL', 'NOT_HELPFUL', 'WRONG', 'ALREADY_KNEW'] as const;
export type Verdict = (typeof VERDICTS)[number];
export const sendFeedback = (
  c: ApiClient,
  id: string,
  body: { verdict: Verdict; note?: string },
  idempotencyKey: string,
) =>
  c.post<{ recommendationId: string; verdict: string }>(`/ai/recommendations/${id}/feedback`, {
    body,
    idempotencyKey,
  });
export interface Outcome {
  receivedQty: number;
  stockedOut: boolean;
  source: 'STOCK_LEDGER' | 'ENTERED_BY_REVIEWER';
  [k: string]: unknown;
}
export const measureOutcome = (
  c: ApiClient,
  id: string,
  body: { receivedQty?: number },
  idempotencyKey: string,
) => c.post<Outcome>(`/ai/recommendations/${id}/outcome`, { body, idempotencyKey });

// ---- decision log ----------------------------------------------------------------------------------------------------------------
export interface LogRow {
  id: string;
  tool: string;
  tool_version?: string | null;
  outcome: string;
  summary: string | null;
  model_version: string | null;
  created_at: string;
}
export const fetchAuditLog = async (
  c: ApiClient,
  f: { tool?: string; outcome?: string },
  signal?: AbortSignal,
) =>
  (
    await c.get<{ items: LogRow[] }>('/ai/audit', {
      query: { tool: f.tool || undefined, outcome: f.outcome || undefined, limit: 50 },
      signal,
    })
  ).items;
export const fetchAuditSummary = async (c: ApiClient, signal?: AbortSignal) =>
  (
    await c.get<{ items: { tool: string; model: string | null; outcome: string; calls: number }[] }>(
      '/ai/audit/summary',
      { signal },
    )
  ).items;

import type { ApiClient } from '@/api/client';

// Shapes copied by hand from apps/api/src/{ai-ocr,ai-staff,ai-analytics,ai-agro}.controller.ts and modules/ai/src/{domain,application}.
// Figures from the AI engines (acres, units, rupees of spend) are plain numbers on the wire; the app shows them and does no arithmetic on them.

export const G4P = {
  bill: 'purchase.bill.create',
  label: 'product.create',
  shelf: 'inventory.view',
  countDraft: 'inventory.adjust.create',
  expert: 'ai.governance.manage',
} as const;

// ---- UC-266 supplier bill and UC-G09 label: file in, fields out, a person checks ----------------------------------------------
export interface OcrField {
  value: string | null;
  confidence: number;
}
export interface OcrIssue {
  field: string;
  severity: 'ERROR' | 'WARN';
  code: string;
  message: string;
}
export interface OcrDocument {
  id: string;
  kind: 'PURCHASE_BILL' | 'LABEL' | 'CLASSIFY';
  status: 'REVIEW' | 'CONFIRMED' | 'REJECTED';
  filename: string;
  provider: string;
  retainUntil: string;
  extracted: { fields: Record<string, OcrField>; lines: Record<string, OcrField>[] };
  validation: { issues: OcrIssue[]; lowConfidence: string[]; ok: boolean };
  version: number;
}
/** `contentBase64` is a PDF, PNG or JPEG up to 4 MB. The same file again returns the earlier document with `duplicate: true`. */
export const uploadOcr = (
  c: ApiClient,
  kind: 'PURCHASE_BILL' | 'LABEL',
  body: { branchId: string; filename: string; contentBase64: string },
  idempotencyKey: string,
) =>
  c.post<{ duplicate: boolean; document: OcrDocument }>(
    kind === 'PURCHASE_BILL' ? '/ai/ocr/purchase-bill' : '/ai/ocr/label',
    {
      body,
      idempotencyKey,
    },
  );
export const confirmLabel = (c: ApiClient, id: string, expectedVersion: number, idempotencyKey: string) =>
  c.post<{ document: OcrDocument; productDraft: Record<string, unknown> }>(
    `/ai/ocr/documents/${id}/confirm`,
    {
      body: { expectedVersion },
      idempotencyKey,
    },
  );
export const rejectOcr = (c: ApiClient, id: string, expectedVersion: number, idempotencyKey: string) =>
  c.post<OcrDocument>(`/ai/ocr/documents/${id}/reject`, { body: { expectedVersion }, idempotencyKey });

// ---- UC-G16 shelf photo ---------------------------------------------------------------------------------------------------
export interface ShelfRow {
  skuId: string | null;
  name: string;
  estimated: number | null;
  confidence: number | null;
  systemQty: number | null;
  variance: number | null;
  flag: 'MATCH' | 'SHORT' | 'OVER' | 'LOW_CONFIDENCE' | 'NOT_SEEN' | 'UNMATCHED';
}
export interface ShelfCheck {
  id: string;
  warehouseId: string;
  rows: ShelfRow[];
  countId: string | null;
  countCandidates: string[];
  note?: string;
  dropped?: number;
}
export interface WarehouseRef {
  id: string;
  branchId: string;
  name: string;
  status?: string;
}
export const fetchWarehouses = async (c: ApiClient, signal?: AbortSignal) =>
  (await c.get<{ items: WarehouseRef[] }>('/warehouses', { signal })).items.filter(
    (w) => w.status === undefined || w.status === 'ACTIVE',
  );
export const createShelfCheck = (
  c: ApiClient,
  body: { warehouseId: string; image: string; mediaType: string },
  idempotencyKey: string,
) => c.post<ShelfCheck>('/ai/shelf-check', { body, idempotencyKey });
export const openCountDraft = (c: ApiClient, id: string, idempotencyKey: string) =>
  c.post<unknown>(`/ai/shelf-check/${id}/count-draft`, { idempotencyKey });

// ---- UC-G11 villages, UC-G12 crop map and shortage -----------------------------------------------------------------------
export interface VillageTrend {
  village: string;
  customers: number;
  bills: number;
  spend: number;
  overdue: number;
  changePct: number | null;
  trend: 'RISING' | 'STEADY' | 'FALLING' | 'INSUFFICIENT_DATA';
  demand: { season: string; category: string; value: number; sharePct: number }[];
  explanation: string;
}
export interface VillageReport {
  asOf: string;
  state: 'OK' | 'INSUFFICIENT_DATA';
  reason: string | null;
  villages: VillageTrend[];
  suppressedVillages: number;
  rule: string;
}
export const fetchVillages = (c: ApiClient, branch: string, signal?: AbortSignal) =>
  c.get<VillageReport>('/ai/villages/trends', { query: { branch: branch || undefined }, signal });

export interface HeatReport {
  asOf: string;
  state: 'OK' | 'INSUFFICIENT_DATA';
  reason: string | null;
  crops: string[];
  rows: {
    village: string;
    totalAcres: number;
    cells: { crop: string; acres: number; plans: number; intensity: number }[];
  }[];
  suppressedVillages: number;
  rule: string;
}
export const fetchHeatmap = (c: ApiClient, branch: string, signal?: AbortSignal) =>
  c.get<HeatReport>('/ai/crops/heatmap', { query: { branch: branch || undefined }, signal });
export interface ShortageReport {
  asOf: string;
  state: 'OK' | 'NO_FACTORS' | 'INSUFFICIENT_DATA';
  reason: string | null;
  horizonDays: number;
  leadDays: number;
  rows: {
    product: string | null;
    branch: string | null;
    demand: number;
    onHand: number;
    onOrder: number;
    gap: number;
    shortBeforeArrival: number;
    status: 'SHORT' | 'COVERED';
    explanation: string;
  }[];
  unassignedPlans?: number;
}
export const fetchShortage = (
  c: ApiClient,
  p: { branch: string; horizonDays: number; leadDays: number },
  signal?: AbortSignal,
) =>
  c.get<ShortageReport>('/ai/crops/shortage', {
    query: { branch: p.branch || undefined, horizonDays: p.horizonDays, leadDays: p.leadDays },
    signal,
  });

// ---- crop doctor cases and the expert's answer ---------------------------------------------------------------------------
export interface AgroCase {
  id: string;
  crop: string;
  stage: string | null;
  symptomsText: string | null;
  via: 'PHOTO' | 'TEXT';
  outcome: string;
  escalation: 'NONE' | 'REQUESTED' | 'ANSWERED';
  escalatedNote: string | null;
  expertAnswer: string | null;
  createdAt: string;
}
export const fetchCases = async (c: ApiClient, escalation: string, signal?: AbortSignal) =>
  (
    await c.get<{ items: AgroCase[] }>('/ai/agro/cases', {
      query: { escalation: escalation || undefined },
      signal,
    })
  ).items;
export const answerCase = (c: ApiClient, id: string, answer: string, idempotencyKey: string) =>
  c.post<AgroCase>(`/ai/agro/cases/${id}/answer`, { body: { answer }, idempotencyKey });

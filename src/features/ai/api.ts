import type { ApiClient } from '@/api/client';

// Shapes copied by hand from the backend (no OpenAPI file yet): apps/api/src/assistant.controller.ts,
// apps/api/src/assistant-core.ts and apps/api/src/ai-insights.controller.ts, modules/ai/src/domain/digest.ts.

export const AP = {
  /** The chat itself needs only a signed-in person; the server decides what its tools may read. */
  digest: 'ai.assistant.use',
} as const;

export const akey = (userId: string, what: string, extra = '') => ['ai', what, userId, extra] as const;

export interface Block {
  type: string;
  [k: string]: unknown;
}
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string | Block[];
}
export interface ChatAnswer {
  content: Block[];
  stopReason: string;
  modelVersion?: string;
  promptVersion?: string;
}

/** One turn with the model. The caller owns the key so that a retry of the same turn reuses it. */
export const sendChat = (
  c: ApiClient,
  body: { messages: ChatMessage[]; today: string; lang: string },
  idempotencyKey: string,
  signal?: AbortSignal,
) => c.post<ChatAnswer>('/assistant/chat', { body, idempotencyKey, signal });

export type Severity = 'HIGH' | 'MEDIUM' | 'LOW';
export interface DigestItem {
  kind: string;
  severity: Severity;
  title: string;
  detail: string;
  subjectRef: string;
  branchId: string | null;
  link: string;
  dedupeKey: string;
}
export interface DigestView {
  date: string;
  branchId: string | null;
  branches?: number;
  counts: Record<Severity, number>;
  total: number;
  summary: string;
  items: DigestItem[];
  notScanned: string[];
  snoozed: number;
}
export const fetchDigest = (c: ApiClient, branch: string, signal?: AbortSignal) =>
  c.get<DigestView>('/ai/digest', { query: { branch: branch || undefined }, signal });
export const fetchBranchRefs = async (c: ApiClient, signal?: AbortSignal) =>
  (await c.get<{ items: { id: string; name: string; status?: string }[] }>('/branches', { signal })).items;

export const snoozeItem = (
  c: ApiClient,
  body: { dedupeKey: string; days: number; reason: string },
  idempotencyKey: string,
) => c.post<unknown>('/ai/digest/snooze', { body, idempotencyKey });

// ---- Stock and buying advice (UC-251 forecast, UC-252 season plan) ----------------------------------------------------------
// Forecast figures are statistics from the server (units, not ledger money): the app only shows them and does no arithmetic on them.
export const AI_INV = 'inventory.view';

export interface WeekForecast {
  week: number;
  from: string;
  to: string;
  value: number;
  low: number | null;
  high: number | null;
}
export interface ProductForecast {
  state: 'OK' | 'INSUFFICIENT_DATA';
  reason: string | null;
  method: string;
  wape: number | null;
  folds: number;
  weeks: WeekForecast[];
  total: number | null;
  totalLow: number | null;
  totalHigh: number | null;
}
export interface ForecastRow {
  skuId: string;
  skuName: string;
  onHand: number;
  forecast: ProductForecast;
  adopted: { method: string; promotionId: string; fellBackToBaseline: boolean } | null;
}
export interface ForecastTable {
  asOf: string;
  branchId: string;
  weeks: number;
  items: ForecastRow[];
  summary: { products: number; forecast: number; insufficientData: number };
  note: string;
}
export const fetchForecastTable = (
  c: ApiClient,
  p: { branch: string; weeks: number; limit: number },
  signal?: AbortSignal,
) =>
  c.get<ForecastTable>('/ai/forecast/table', {
    query: { branch: p.branch || undefined, weeks: p.weeks, limit: p.limit },
    signal,
  });

export interface SeasonLine {
  skuId: string;
  skuName: string;
  state: 'OK' | 'INSUFFICIENT_DATA';
  reason: string | null;
  windowFrom: string | null;
  windowTo: string | null;
  lastYearUnits: number | null;
  growth: number | null;
  expected: number | null;
  low: number | null;
  high: number | null;
  toBuy: number | null;
  orderBy: string | null;
  assumptions: string[];
}
export interface SeasonCatalogue {
  asOf: string;
  branchId: string;
  window: { startInWeeks: number; weeks: number };
  season: {
    name?: string;
    assumption?: string;
    custom?: boolean;
    startInWeeks?: number;
    weeks?: number;
  } | null;
  products: number;
  planned: number;
  notPlanned: number;
  buy: { skuId: string; skuName: string; toBuy: number; orderBy: string | null }[];
  totalUnitsToBuy: number;
  earliestOrderBy: string | null;
  unplanned: { skuId: string; skuName: string; reason: string }[];
  lines: SeasonLine[];
}
export const fetchSeasonCatalogue = (
  c: ApiClient,
  p: { branch: string; startInWeeks: number; weeks: number; top: number },
  signal?: AbortSignal,
) =>
  c.get<SeasonCatalogue>('/ai/planning/season/catalogue', {
    query: { branch: p.branch || undefined, startInWeeks: p.startInWeeks, weeks: p.weeks, top: p.top },
    signal,
  });

// ---- Reorder basket (UC-253) and recommendations with approval (UC-269) ------------------------------------------------------
// Basket money and quantities are plain numbers on the wire (statistics and estimates); the app shows them and does no arithmetic on them.
export const AI_PUR = 'purchase.view';
export const AI_DECIDE = 'ai.recommendation.decide';
export const AI_VIEW = 'ai.recommendation.view';

export interface BasketLine {
  skuId: string;
  skuName: string;
  quantity: number;
  unitCost: number | null;
  daysOfCover: number | null;
  fundedQty: number;
  cost: number | null;
  status: 'FUNDED' | 'TRIMMED' | 'UNFUNDED' | 'COST_UNKNOWN';
  shortfallQty: number;
  shortfallValue: number | null;
  note: string;
  supplier: {
    state: string;
    reason: string | null;
    chosen: { supplierName: string; lastRate: number | null; leadDays: number | null; why: string } | null;
  };
  shelf: { state: string; quantity: number; sellableBeforeExpiry: number | null; note: string };
  forecast: { stockoutDate: string | null; onHand: number; onOrder: number; leadTimeDays: number };
}
export interface BasketView {
  branchId: string;
  asOf: string;
  horizonDays: number;
  basket: {
    budget: number | null;
    wantedValue: number;
    fundedValue: number;
    shortfallValue: number;
    unknownCost: number;
    note: string;
  };
  lines: BasketLine[];
  skipped: { skuId: string; skuName: string; reason: string }[];
  assumptions: string[];
}
export const fetchBasket = (c: ApiClient, branch: string, signal?: AbortSignal) =>
  c.get<BasketView>('/ai/reorder/basket', { query: { branch }, signal });
export const proposeBasket = (c: ApiClient, branch: string, idempotencyKey: string) =>
  c.post<{ created?: unknown[]; items?: unknown[] }>('/ai/reorder/basket', {
    body: { branch },
    idempotencyKey,
  });

export interface Recommendation {
  id: string;
  branchId: string | null;
  kind: string;
  tier: string;
  status: string;
  subjectRef: string;
  payload: Record<string, unknown>;
  payloadHash: string;
  evidence: unknown[];
  confidence: number | null;
  expiresAt: string;
  domainRef: string | null;
  rejectReason: string | null;
  createdAt: string;
  version: number;
}
export const REC_STATUS = ['PRESENTED', 'ACCEPTED', 'OUTCOME_PENDING', 'REJECTED', 'EXPIRED'] as const;
export const fetchRecommendations = async (c: ApiClient, status: string, signal?: AbortSignal) =>
  (await c.get<{ items: Recommendation[] }>('/ai/recommendations', { query: { status, limit: 100 }, signal }))
    .items;

export interface ActionDetail {
  recommendation: Recommendation;
  approval: {
    action: string;
    label: string;
    draftIn: string;
    tier: string;
    size: number;
    sizeUnit: string;
    needsSecondApprover: boolean;
    approvedBy: string[];
    youMayApprove: boolean;
    whyNot: string | null;
  };
}
export const fetchAction = (c: ApiClient, id: string, signal?: AbortSignal) =>
  c.get<ActionDetail>(`/ai/actions/${id}`, { signal });

export interface DryRun {
  wouldCreate: string;
  checks: { name: string; ok: boolean; detail: string; hard?: boolean }[];
  allPass: boolean;
  writes: 'NONE';
}
export const dryRunAction = (c: ApiClient, id: string, idempotencyKey: string) =>
  c.post<DryRun>(`/ai/actions/${id}/dry-run`, { idempotencyKey });
export interface Approval {
  token: string;
  expiresAt: string;
  payloadHash: string;
  recommendationId: string;
  awaitingSecondApprover?: boolean;
  message?: string;
}
export const approveAction = (c: ApiClient, id: string, payloadHash: string, idempotencyKey: string) =>
  c.post<Approval>(`/ai/actions/${id}/approve`, { body: { payloadHash }, idempotencyKey });
export const executeAction = (c: ApiClient, id: string, approvalToken: string, idempotencyKey: string) =>
  c.post<Recommendation>(`/ai/actions/${id}/execute`, { body: { approvalToken }, idempotencyKey });
export const rejectRecommendation = (c: ApiClient, id: string, reason: string, idempotencyKey: string) =>
  c.post<Recommendation>(`/ai/recommendations/${id}/reject`, { body: { reason }, idempotencyKey });

// ---- Expiry plan (UC-263), supplier price view (UC-376), budget scenario (UC-378) --------------------------------------------
export interface ExpiryItem {
  skuId: string;
  skuName: string;
  batchId: string;
  batchNo: string;
  branchId: string;
  expiryDate: string;
  daysLeft: number;
  qty: number;
  expectedSold: number;
  atRiskQty: number;
  atRiskValue: number | null;
  severity: 'EXPIRED' | 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
  action: string;
  discountPct: number | null;
  note: string;
  currentPrice: string | null;
  discountedPrice: string | null;
  marginPct: number | null;
  locked: boolean;
  transfer: { toBranchId: string; toBranchName: string; quantity: number; note: string } | null;
  returnNote: string | null;
  purchaseReturn: { billNumber: string | null; supplierName: string; quantity: string } | null;
}
export interface ExpiryPlan {
  asOf: string;
  items: ExpiryItem[];
  floorMarginPct: number | null;
  costKnown: boolean;
  assumptions: string[];
}
export const fetchExpiryPlan = (
  c: ApiClient,
  p: { branch: string; withinDays: number },
  signal?: AbortSignal,
) =>
  c.get<ExpiryPlan>('/ai/stock/expiry-plan', {
    query: { branch: p.branch || undefined, withinDays: p.withinDays },
    signal,
  });
/** kind: discount | transfer | return. One batch of one branch becomes a recommendation; nothing is changed until a person approves it. */
export const proposeExpiry = (
  c: ApiClient,
  kind: 'discount' | 'transfer' | 'return',
  body: { batch: string; branch: string },
  idempotencyKey: string,
) => c.post<Recommendation>(`/ai/recommendations/expiry-${kind}`, { body, idempotencyKey });

export interface SupplierRow {
  supplierId: string;
  supplierName: string;
  lines: number;
  flagged: number;
  flaggedShare: number;
  avgDeviationPct: number;
  products: number;
}
export interface SupplierView {
  state: 'OK' | 'INSUFFICIENT_DATA';
  reason: string | null;
  judgedLines: number;
  skippedLines: number;
  items: SupplierRow[];
  days: number;
}
export const fetchSupplierView = (c: ApiClient, days: number, signal?: AbortSignal) =>
  c.get<SupplierView>('/ai/anomalies/suppliers', { query: { days }, signal });

export interface BudgetLineView {
  recommendationId: string;
  skuId: string;
  skuName: string;
  wantedQty: number;
  fundedQty: number;
  unitCost: number | null;
  cost: number;
  marginPct: number | null;
  daysOfCover: number | null;
  status: 'FUNDED' | 'PARTIAL' | 'NOT_FUNDED' | 'NOT_PRICED' | 'NOT_NEEDED';
  risk: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';
  riskNote: string;
}
export interface BudgetResult {
  limit: {
    budget: number | null;
    cashHeadroom: number | null;
    applied: number;
    bindingLimit: 'BUDGET' | 'CASH';
  };
  wanted: number;
  funded: number;
  remaining: number;
  lines: BudgetLineView[];
  notFunded: BudgetLineView[];
  assumptions: string[];
  writes: 'NONE';
}
export const runBudgetScenario = (
  c: ApiClient,
  body: { budget?: number; useCash?: boolean; priceChangePct?: number },
  idempotencyKey: string,
) => c.post<BudgetResult>('/ai/scenarios/budget', { body, idempotencyKey });

// ---- Forecast checks (UC-372 explain, UC-373 accuracy, UC-374 drift, UC-375 seasonal anomaly, UC-387 champion-challenger) --------
export interface ProductRef {
  id: string;
  name: string;
  code?: string;
}
export async function searchAiProducts(c: ApiClient, q: string, signal?: AbortSignal): Promise<ProductRef[]> {
  const r = await c.get<{ items: ProductRef[] }>('/products', { query: { q: q.trim(), limit: 20 }, signal });
  return r.items;
}

export interface Accuracy {
  state: 'OK' | 'INSUFFICIENT_DATA';
  reason: string | null;
  folds: number;
  wape: number | null;
  naiveWape: number | null;
  bias: number | null;
  beatsNaive: boolean | null;
  method: string | null;
}
export interface Drift {
  state: 'OK' | 'INSUFFICIENT_DATA';
  reason: string | null;
  drifted: boolean;
  recentWape: number | null;
  referenceWape: number | null;
  action: 'NONE' | 'REVIEW_MODEL';
}
export interface SeasonalAnomaly {
  state: 'OK' | 'INSUFFICIENT_DATA';
  reason: string | null;
  anomaly: boolean;
  ratio: number | null;
  direction: 'ABOVE' | 'BELOW' | null;
  current: number | null;
  lastYear: number | null;
  detail: string;
}
export interface Explained {
  state: string;
  reason: string | null;
  explanation: { summary: string; drivers: { name: string; detail: string }[]; caveats: string[] } | null;
}
export interface MethodScore {
  id: string;
  label: string;
  role: 'CHAMPION' | 'CHALLENGER';
  folds: number;
  wape: number | null;
  bias: number | null;
}
export interface Comparison {
  state: 'OK' | 'INSUFFICIENT_DATA';
  reason: string | null;
  folds: number;
  scores: MethodScore[];
  decision: 'KEEP' | 'REVIEW_CHALLENGER' | null;
  best: string | null;
  note: string;
}
const pq = (product: string, branch: string) => ({ product, branch: branch || undefined });
export const fetchExplain = (c: ApiClient, p: string, b: string, signal?: AbortSignal) =>
  c.get<Explained>('/ai/forecast/explain', { query: pq(p, b), signal });
export const fetchAccuracy = (c: ApiClient, p: string, b: string, signal?: AbortSignal) =>
  c.get<{ accuracy: Accuracy }>('/ai/forecast/accuracy', { query: pq(p, b), signal });
export const fetchDrift = (c: ApiClient, p: string, b: string, signal?: AbortSignal) =>
  c.get<{ drift: Drift }>('/ai/forecast/drift', { query: pq(p, b), signal });
export const fetchSeasonalAnomaly = (c: ApiClient, p: string, b: string, signal?: AbortSignal) =>
  c.get<SeasonalAnomaly>('/ai/anomalies/seasonal', { query: pq(p, b), signal });
export const fetchCompareGbm = (c: ApiClient, p: string, b: string, signal?: AbortSignal) =>
  c.get<{ comparison: Comparison }>('/ai/forecast/compare/gbm', { query: pq(p, b), signal });
export const saveCompareGbm = (
  c: ApiClient,
  body: { product: string; branch: string },
  idempotencyKey: string,
) => c.post<unknown>('/ai/forecast/compare/gbm/save', { body, idempotencyKey });

export interface BranchAccuracy {
  products: number;
  measured: number;
  wape: number | null;
  naiveWape: number | null;
  beatsNaivePct: number | null;
  worst: { skuId: string; skuName: string; wape: number }[];
  notMeasured: number;
}
export interface AccuracyOverview {
  asOf: string;
  branchId: string;
  summary: BranchAccuracy;
  drifted: { skuId: string; skuName: string; drift: Drift }[];
  history: {
    takenOn: string;
    products: number;
    wape: number | null;
    naiveWape: number | null;
    beatsNaivePct: number | null;
  }[];
}
/** save=false: only looking must not store a daily snapshot. */
export const fetchAccuracyOverview = (c: ApiClient, branch: string, signal?: AbortSignal) =>
  c.get<AccuracyOverview>('/ai/forecast/overview', { query: { branch, save: 'false' }, signal });
export const runDriftScan = (c: ApiClient, branch: string, idempotencyKey: string) =>
  c.post<{ scanned: number; drifting: number }>('/ai/forecast/drift-scan', {
    body: { branch },
    idempotencyKey,
  });

// ---- Customers and money (UC-258 credit risk, UC-259 collection plan, UC-260 inactive, UC-377 cash flow, UC-262 pricing, UC-267 marketing) ----
// Rupee figures in these answers are plain numbers (estimates from the AI engines); the app shows them with `rupee()` and does no arithmetic on them.
export const AI_REC = 'reports.receivables';
export const AI_FIN = 'reports.financial';
export const AI_CUST = 'customer.view';

export interface CreditRisk {
  customerId: string;
  label: string;
  state: 'OK' | 'INSUFFICIENT_DATA';
  score: number | null;
  band: 'LOW' | 'MEDIUM' | 'HIGH' | null;
  factors: { name: string; points: number; detail: string }[];
  reason: string | null;
}
export const fetchCreditRisk = async (c: ApiClient, signal?: AbortSignal) =>
  (await c.get<{ items: CreditRisk[] }>('/ai/customers/credit-risk', { signal })).items;

export interface CollectionRow {
  rank: number;
  customerId: string;
  label: string;
  overdue: number;
  oldestOverdueDays: number;
  priority: number;
  why: string;
  followUp: { state: 'NONE' | 'TASK_OPEN' | 'PROMISE_PENDING' | 'BOTH'; note: string } | null;
  bestDay: {
    state: 'OK' | 'INSUFFICIENT_DATA';
    reason: string | null;
    weekday: string | null;
    receipts: number;
  } | null;
  channel: { state: 'OK' | 'NO_PREFERENCE' | 'BLOCKED'; channel: string | null; reason: string } | null;
  channelNote: string | null;
}
export const fetchCollectionPlan = async (c: ApiClient, signal?: AbortSignal) =>
  (await c.get<{ items: CollectionRow[] }>('/ai/customers/collection-plan', { signal })).items;

export interface ChurnRow {
  customerId: string;
  label: string;
  state: 'INACTIVE' | 'AT_RISK';
  reason: string;
  daysSincePurchase: number | null;
  spendChangePct: number | null;
}
export const fetchChurn = async (c: ApiClient, signal?: AbortSignal) =>
  (await c.get<{ items: ChurnRow[] }>('/ai/customers/churn', { signal })).items;

export interface CashOutlook {
  state: 'OK' | 'INSUFFICIENT_DATA';
  reason: string | null;
  cashAndBank: number | null;
  horizons: {
    days: 7 | 14 | 30;
    inflow: number;
    outflow: number;
    projected: number;
    status: 'OK' | 'BELOW_BUFFER' | 'SHORTFALL';
  }[];
  firstProblemDays: 7 | 14 | 30 | null;
  severity: 'HIGH' | 'MEDIUM' | 'NONE' | null;
  assumptions: string[];
  payroll: { included: boolean; reason: string | null };
  tax: { included: boolean; reason: string | null };
  asOf: string;
}
export const fetchCashOutlook = (c: ApiClient, signal?: AbortSignal) =>
  c.get<CashOutlook>('/ai/cashflow/outlook', { signal });

export interface PriceAdvice {
  categoryId: string | null;
  category: string;
  price: string;
  source: string;
  suggestion: {
    state: 'OK' | 'INSUFFICIENT_DATA';
    reason: string | null;
    note: string;
    currentPrice: number;
    suggestedPrice: number | null;
    currentMarginPct: number | null;
    suggestedMarginPct: number | null;
    floorPrice: number | null;
    mrp: number | null;
    mustFix: boolean;
    assumptions: string[];
  };
}
export const fetchPriceAdvice = (c: ApiClient, product: string, branch: string, signal?: AbortSignal) =>
  c.get<{ items: PriceAdvice[]; note?: string; assumptions?: string[] }>('/ai/pricing/categories', {
    query: { product, branch },
    signal,
  });
export const proposePriceRevision = (
  c: ApiClient,
  body: { product: string; branch: string; customerCategory?: string },
  idempotencyKey: string,
) => c.post<Recommendation>('/ai/recommendations/price-revision', { body, idempotencyKey });

export interface MarketingTemplates {
  languages: string[];
  channels: { channel: string; limit: number }[];
  templates: { code: string; label: string; needs: ('product' | 'price')[] }[];
  sending: string;
}
export const fetchMarketingTemplates = (c: ApiClient, signal?: AbortSignal) =>
  c.get<MarketingTemplates>('/ai/marketing/templates', { signal });
export interface MarketingPreview {
  text: string;
  template: string;
  language: string;
  channel: string;
  shop: string;
  product: { id: string; name: string } | null;
  price: string | null;
  length: number;
  limit: number;
  problems: unknown[];
  polish: { state: string; message: string };
  notes: string[];
}
export const previewMarketing = (
  c: ApiClient,
  body: { template: string; language: string; channel: string; branch: string; product?: string },
  idempotencyKey: string,
) => c.post<MarketingPreview>('/ai/marketing/preview', { body, idempotencyKey });

// ---- Farming advice (UC-254 crop doctor, UC-255 products for a problem, UC-256 advisory, UC-257 weather) ----------------------
export interface AgroStatus {
  approved: number;
  photoConfigured: boolean;
  disclaimer: string;
  message: string | null;
}
export const fetchAgroStatus = (c: ApiClient, signal?: AbortSignal) =>
  c.get<AgroStatus>('/ai/agro/status', { signal });

export interface AgroCandidate {
  knowledgeId: string;
  kind: string;
  crop: string;
  names: { en: string | null; hi: string | null; mr: string | null };
  symptoms: string | null;
  control: {
    cultural: string | null;
    biological: string | null;
    chemical: string | null;
    ingredients: string[];
    dose: { text: string; source: string; sourceRef: string } | null;
  };
  source: { name: string; ref: string };
  confidence?: number;
  level?: 'high' | 'medium' | 'low';
  basis?: string;
}
export interface Diagnosis {
  case: { id: string };
  outcome: 'MATCHED' | 'NOT_SURE' | 'NO_KNOWLEDGE' | 'POOR_IMAGE' | 'NOT_CROP';
  message: string;
  escalated: boolean;
  candidates: AgroCandidate[];
  source: string;
  disclaimer: string;
  verify: string;
}
/** `image.data` is the base64 of a JPEG, PNG or WebP photo up to 3 MB. The server checks the real file type, not the name. */
export const diagnose = (
  c: ApiClient,
  body: { crop: string; stage?: string; symptoms?: string; branch?: string; image?: { data: string } },
  idempotencyKey: string,
) => c.post<Diagnosis>('/ai/agro/diagnose', { body, idempotencyKey });
export const escalateCase = (c: ApiClient, id: string, note: string, idempotencyKey: string) =>
  c.post<unknown>(`/ai/agro/cases/${id}/escalate`, { body: { note }, idempotencyKey });

export interface ProblemProducts {
  problem: AgroCandidate;
  branchId: string;
  products: { skuId: string; code: string; name: string; matchedIngredients: string[]; stockQty: number }[];
  excluded: { code: string; name: string; reason: string }[];
  staffOnly: string;
  note: string | null;
  disclaimer: string;
}
export const fetchProblemProducts = (
  c: ApiClient,
  id: string,
  branch: string,
  caseId: string,
  signal?: AbortSignal,
) =>
  c.get<ProblemProducts>(`/ai/agro/knowledge/${id}/products`, {
    query: { branch, case: caseId || undefined },
    signal,
  });

export const AGRO_SEASONS = ['KHARIF', 'RABI', 'ZAID'] as const;
export interface Advisory {
  crop: string;
  stage: string | null;
  season: string | null;
  sections: {
    title: string;
    items: { text: string; source: string; sourceRef: string; stage: string | null }[];
  }[];
  weatherNote: string | null;
  empty: boolean;
  disclaimer: string;
  message: string | null;
}
export const fetchAdvisory = (
  c: ApiClient,
  p: { crop: string; stage: string; season: string; branch: string },
  signal?: AbortSignal,
) =>
  c.get<Advisory>('/ai/agro/advisory', {
    query: {
      crop: p.crop.trim(),
      stage: p.stage.trim() || undefined,
      season: p.season || undefined,
      branch: p.branch || undefined,
    },
    signal,
  });

export interface WeatherAlert {
  code: string;
  severity: string;
  title: string;
  detail: string;
  advisory: string;
}
export interface WeatherView {
  location: { id: string; branchId: string; name: string } | null;
  source: string | null;
  fetchedAt: string | null;
  ageMinutes: number | null;
  stale: boolean;
  evaluation: {
    covered: boolean;
    summary: { rainMm: number; maxTempC: number; minTempC: number; maxWindKmh: number } | null;
    alerts: WeatherAlert[];
  } | null;
  unavailable: string | null;
}
export const fetchWeather = (c: ApiClient, signal?: AbortSignal) =>
  c.get<{ items: WeatherView[]; providerConfigured: boolean }>('/ai/weather/overview', { signal });

// ---- Reports by question (UC-250, 379, 380) and strategy (UC-268) ------------------------------------------------------------
export interface ReportAnswer {
  state: 'ANSWERED' | 'NEEDS_CLARIFICATION' | 'UNSUPPORTED';
  plan: { report: string | null; label: string | null; understood: string[] } | null;
  followUp: boolean;
  message: string | null;
  options: { id: string; label: string }[];
  ask: { kind: string; text: string; candidates: { id: string; label: string; hint?: string }[] }[];
  resolved: { kind: string; id: string; label: string }[];
  filters: { branchId?: string; productId?: string; customerId?: string };
  /** Opaque: sent back as `previous` so a short follow-up changes this report. */
  memory: unknown;
  summary: { title: string; paragraphs: string[]; figures?: unknown } | null;
  table: { groupBy: string; rows: { label: string; value: number; sharePct: number | null }[]; truncated: boolean } | null;
  saved?: { id: string } | null;
}
export interface ReportAsk {
  question?: string;
  previous?: unknown;
  filters?: { branchId?: string; productId?: string; customerId?: string };
}
export const runReport = (c: ApiClient, body: ReportAsk, idempotencyKey: string) =>
  c.post<ReportAnswer>('/ai/reports/run', { body, idempotencyKey });
export const saveReportDraft = (c: ApiClient, body: ReportAsk, idempotencyKey: string) =>
  c.post<ReportAnswer>('/ai/reports/drafts', { body, idempotencyKey });

export interface StrategyFinding {
  area: 'GROWTH' | 'MARGIN' | 'STOCK' | 'COLLECTIONS';
  status: string;
  finding: string;
  action: string;
}
export interface StoredStrategy {
  id: string;
  kind: 'MONTHLY' | 'QUARTERLY';
  periodLabel: string;
  payloadHash: string;
  status: 'DRAFT' | 'APPROVED' | 'REJECTED';
  decisionNote: string | null;
  content: {
    notice: string;
    findings: StrategyFinding[];
    targets: { name: string; value: number; unit: 'rupees' | 'percent'; formula: string }[];
    roadmap: { focus: { area: string; why: string }[]; milestones: { month: number; salesTarget: number }[] } | null;
    notAvailable: string[];
  };
}
export const AI_STRATEGY = 'reports.financial';
export const fetchStrategies = async (c: ApiClient, signal?: AbortSignal) =>
  (await c.get<{ items: StoredStrategy[] }>('/ai/strategy', { signal })).items;
export const generateStrategy = (c: ApiClient, body: { kind: 'MONTHLY' | 'QUARTERLY'; branch?: string }, idempotencyKey: string) =>
  c.post<{ state: string; reason: string | null; kept?: boolean; note?: string | null; strategy: StoredStrategy | null }>('/ai/strategy/generate', {
    body,
    idempotencyKey,
  });
export const decideStrategy = (
  c: ApiClient,
  id: string,
  body: { decision: 'APPROVE' | 'REJECT'; payloadHash: string; note?: string },
  idempotencyKey: string,
) => c.post<StoredStrategy>(`/ai/strategy/${id}/decide`, { body, idempotencyKey });

export interface HealthScore {
  score: number | null;
  complete: boolean;
  asOf: string;
  components: { name?: string; label?: string; points?: number; max?: number; explanation?: string; reason?: string | null }[];
}
export const fetchHealth = (c: ApiClient, branch: string, signal?: AbortSignal) =>
  c.get<HealthScore>('/ai/health-score', { query: { branch: branch || undefined }, signal });

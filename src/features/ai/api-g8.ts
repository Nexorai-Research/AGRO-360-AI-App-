import type { ApiClient } from '@/api/client';

// Shapes copied by hand from apps/api/src/{ai-search,ai-staff,ai-ocr}.controller.ts and modules/ai (training, voice, ocr).
export const G8 = {
  assistant: 'ai.assistant.use',
  productView: 'product.view',
  documents: 'org.document.manage',
} as const;
export const gkey = (userId: string, what: string, extra = '') => ['ai-g8', what, userId, extra] as const;

// ---- UC-264 smart product search ----
export interface SearchHit {
  id: string;
  code: string;
  name: string;
  localName: string | null;
  brand: string | null;
  category: string | null;
  score: number;
  because: string[];
}
export interface SearchResult {
  query: string;
  method: string;
  items: SearchHit[];
}
export const searchProducts = (c: ApiClient, q: string, signal?: AbortSignal) =>
  c.get<SearchResult>('/ai/search/products', { query: { q: q.trim(), limit: 20 }, signal });

// ---- UC-265 voice (the words are typed or dictated into the keyboard; the app has no speech package) ----
export type VoiceLang = 'en' | 'hi' | 'mr';
export interface VoiceCart {
  intent: 'cart';
  customer: { query: string; confidence: number } | null;
  lines: {
    productQuery: string;
    qty: number;
    unit: string | null;
    qtyAssumed: boolean;
    confidence: number;
  }[];
  warnings: string[];
  draftOnly: boolean;
  note: string;
}
export interface VoiceSearch {
  intent: 'search';
  query: string;
  draftOnly: boolean;
  note: string;
}
export const parseVoice = (
  c: ApiClient,
  body: { transcript: string; lang: VoiceLang; intent: 'cart' | 'search' },
  idempotencyKey: string,
) => c.post<VoiceCart | VoiceSearch>('/ai/voice/parse', { body, idempotencyKey });

// ---- G10 document classification ----
export const DOC_CLASSES = [
  'PURCHASE_INVOICE',
  'DELIVERY_CHALLAN',
  'LICENCE',
  'GST_CERTIFICATE',
  'KYC',
  'OTHER',
] as const;
export type DocClass = (typeof DOC_CLASSES)[number];
export interface ClassifyDoc {
  id: string;
  status: 'REVIEW' | 'CONFIRMED' | 'REJECTED';
  filename: string;
  version: number;
  suggestion: {
    category?: string;
    confidence?: number;
    reason?: string;
    source?: string;
    note?: string;
  } | null;
  result: { category?: string; filedAs?: string } | null;
}
export const classifyFile = (
  c: ApiClient,
  body: { branchId: string; filename: string; contentBase64: string },
  idempotencyKey: string,
) => c.post<{ duplicate: boolean; document: ClassifyDoc }>('/ai/ocr/classify', { body, idempotencyKey });
export const confirmClassify = (
  c: ApiClient,
  id: string,
  body: { expectedVersion: number; category: DocClass; title?: string },
  idempotencyKey: string,
) => c.post<{ document: ClassifyDoc }>(`/ai/ocr/documents/${id}/confirm`, { body, idempotencyKey });

// ---- G13 training ----
export interface TrainingItem {
  id: string;
  title: string;
  category: string;
  source: string;
  version: number;
  body: string;
  status: 'ACTIVE' | 'RETIRED';
}
export const fetchTrainingItems = async (c: ApiClient, signal?: AbortSignal) =>
  (await c.get<{ items: TrainingItem[] }>('/ai/training/items', { signal })).items;
export interface TrainingAnswer {
  question: string;
  found: boolean;
  message: string;
  passages: { itemId: string; title: string; source: string; version: number; text: string; score: number }[];
  summary: string | null;
  summaryNote: string | null;
}
export const askTraining = (c: ApiClient, q: string, signal?: AbortSignal) =>
  c.get<TrainingAnswer>('/ai/training/ask', { query: { q: q.trim() }, signal });
export interface Quiz {
  itemId: string;
  title: string;
  version: number;
  questions: { id: number; prompt: string; options: string[] }[];
  message: string | null;
}
export const fetchQuiz = (c: ApiClient, id: string, signal?: AbortSignal) =>
  c.get<Quiz>(`/ai/training/items/${id}/quiz`, { signal });
export interface Completion {
  id: string;
  itemId: string;
  title: string;
  itemVersion: number;
  score: number;
  total: number;
  passed: boolean;
  completedAt: string;
}
export const submitQuiz = (
  c: ApiClient,
  id: string,
  answers: { id: number; option: number }[],
  idempotencyKey: string,
) => c.post<Completion>(`/ai/training/items/${id}/quiz`, { body: { answers }, idempotencyKey });
export const fetchCompletions = async (c: ApiClient, signal?: AbortSignal) =>
  (await c.get<{ items: Completion[] }>('/ai/training/completions', { signal })).items;

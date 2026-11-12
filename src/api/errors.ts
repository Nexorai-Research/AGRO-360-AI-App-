export interface FieldError {
  field: string;
  message: string;
}

/** Backend problem body: { type, title: CODE, status, detail, correlationId, errors? } */
export interface Problem {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  correlationId?: string;
  errors?: FieldError[];
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly correlationId?: string;
  readonly fields: FieldError[];

  constructor(status: number, body: Problem | null, correlationId?: string) {
    super(body?.detail ?? body?.title ?? `request failed (${status})`);
    this.name = 'ApiError';
    this.status = status;
    this.code = body?.title ?? (status === 0 ? 'NETWORK' : `HTTP_${status}`);
    this.correlationId = body?.correlationId ?? correlationId;
    this.fields = Array.isArray(body?.errors) ? body.errors : [];
  }
}

/** Stable backend codes the app shows as translated text. Anything else gets the generic message plus the correlation id. */
const KNOWN = new Set([
  'NETWORK',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'FRESH_AUTH_REQUIRED',
  'NOT_FOUND',
  'VALIDATION',
  'VALIDATION_FAILED',
  'VERSION_CONFLICT',
  'PRICE_LOCKED',
  'STOCK_FROZEN',
  'CREDIT_LIMIT_EXCEEDED',
  'INSUFFICIENT_STOCK',
  'BATCH_REQUIRED',
  'EXPIRY_REQUIRED',
  'EMPLOYEE_EXITED',
  'ALREADY_CHECKED_IN',
  'NOT_CHECKED_IN',
  'ALREADY_CHECKED_OUT',
  'SHIFT_CLOSED',
  'SHIFT_ALREADY_OPEN',
  'OPEN_SHIFTS',
  'DAY_ALREADY_CLOSED',
  'CASH_DIFFERENCE_NEEDS_APPROVAL',
  'DUPLICATE_MOBILE',
  'APPROVAL_REQUIRED',
  'STALE_VERSION',
]);

export interface ErrorMessage {
  key: string;
  params: { code: string; correlationId?: string };
}

export function errorMessage(e: unknown): ErrorMessage {
  if (e instanceof ApiError) {
    const code =
      e.status === 401 ? 'UNAUTHENTICATED' : e.status === 403 && !KNOWN.has(e.code) ? 'FORBIDDEN' : e.code;
    const params = { code: e.code, correlationId: e.correlationId };
    return KNOWN.has(code) ? { key: `errors.${code}`, params } : { key: 'errors.generic', params };
  }
  return { key: 'errors.generic', params: { code: 'UNKNOWN' } };
}

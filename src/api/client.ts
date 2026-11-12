import { ApiError, type Problem } from './errors';

export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface ClientOptions {
  baseUrl: string;
  /** Only for a device REGISTERED on the server (device binding, with its key). The server refuses any other id, so leave it out. */
  deviceId?: string;
  appVersion: string;
  getToken: () => Promise<string | null>;
  /** Called once after a 401. Returns the new token, or null when the session cannot be renewed. */
  refreshToken: () => Promise<string | null>;
  onSignedOut: () => void;
  uuid: () => string;
  fetchImpl?: typeof fetch;
}

export interface RequestOptions {
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  /** The version read earlier, sent as If-Match on edits. */
  version?: string | number;
  /** One key per user action. Pass the same key again when the user retries the same action. */
  idempotencyKey?: string;
  signal?: AbortSignal;
  /** Read the answer as text (for example the HTML of a printable invoice) instead of JSON. */
  as?: 'text';
}

const isMutation = (m: Method) => m !== 'GET';

export function createClient(o: ClientOptions) {
  const doFetch = o.fetchImpl ?? fetch;

  function url(path: string, query?: RequestOptions['query']): string {
    const q = Object.entries(query ?? {}).filter(([, v]) => v !== undefined && v !== '');
    const qs = q.length ? `?${new URLSearchParams(q.map(([k, v]) => [k, String(v)])).toString()}` : '';
    return `${o.baseUrl}${path}${qs}`;
  }

  async function send(
    method: Method,
    path: string,
    opts: RequestOptions,
    token: string,
    key: string,
    corr: string,
  ) {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: opts.as === 'text' ? 'text/html' : 'application/json',
      'X-Correlation-Id': corr,
      'X-App-Version': o.appVersion,
    };
    if (o.deviceId) headers['X-Device-Id'] = o.deviceId;
    if (isMutation(method)) headers['Idempotency-Key'] = key;
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
    if (opts.version !== undefined) headers['If-Match'] = `"${opts.version}"`;
    try {
      return await doFetch(url(path, opts.query), {
        method,
        headers,
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
        signal: opts.signal,
      });
    } catch {
      throw new ApiError(0, null, corr);
    }
  }

  async function request<T>(method: Method, path: string, opts: RequestOptions = {}): Promise<T> {
    // Created once here and reused for the retry after a refresh, so a retry never creates a second document.
    const key = opts.idempotencyKey ?? o.uuid();
    const corr = o.uuid();
    let token = await o.getToken();
    if (!token) {
      o.onSignedOut();
      throw new ApiError(401, { title: 'UNAUTHENTICATED' }, corr);
    }
    let res = await send(method, path, opts, token, key, corr);
    if (res.status === 401) {
      token = await o.refreshToken();
      if (!token) {
        o.onSignedOut();
        throw new ApiError(401, { title: 'UNAUTHENTICATED' }, corr);
      }
      res = await send(method, path, opts, token, key, corr);
      if (res.status === 401) {
        o.onSignedOut();
        throw new ApiError(401, { title: 'UNAUTHENTICATED' }, corr);
      }
    }
    if (res.status === 204) return null as T;
    if (opts.as === 'text') {
      const text = await res.text();
      if (!res.ok) {
        let problem: Problem | null = null;
        try {
          problem = JSON.parse(text) as Problem;
        } catch {
          problem = null;
        }
        throw new ApiError(res.status, problem, res.headers.get('X-Correlation-Id') ?? corr);
      }
      return text as T;
    }
    let data: unknown = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    if (!res.ok)
      throw new ApiError(res.status, data as Problem | null, res.headers.get('X-Correlation-Id') ?? corr);
    return data as T;
  }

  return {
    request,
    get: <T>(p: string, opts?: RequestOptions) => request<T>('GET', p, opts),
    post: <T>(p: string, opts?: RequestOptions) => request<T>('POST', p, opts),
    put: <T>(p: string, opts?: RequestOptions) => request<T>('PUT', p, opts),
    patch: <T>(p: string, opts?: RequestOptions) => request<T>('PATCH', p, opts),
    delete: <T>(p: string, opts?: RequestOptions) => request<T>('DELETE', p, opts),
  };
}

export type ApiClient = ReturnType<typeof createClient>;

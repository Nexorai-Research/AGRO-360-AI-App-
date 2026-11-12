import { createClient, type ClientOptions } from '../src/api/client';
import { ApiError } from '../src/api/errors';

type Call = { url: string; init: RequestInit & { headers: Record<string, string> } };

function res(status: number, body?: unknown, headers: Record<string, string> = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (k: string) => headers[k] ?? null },
    json: async () => {
      if (body === undefined) throw new Error('no body');
      return body;
    },
  } as unknown as Response;
}

function setup(responses: (Response | Error)[], over: Partial<ClientOptions> = {}) {
  const calls: Call[] = [];
  let n = 0;
  let id = 0;
  const fetchImpl = jest.fn(async (url: string, init: Call['init']) => {
    calls.push({ url, init });
    const r = responses[Math.min(n++, responses.length - 1)]!;
    if (r instanceof Error) throw r;
    return r;
  });
  const opts: ClientOptions = {
    baseUrl: 'https://api.test/api/v1',
    deviceId: 'dev-1',
    appVersion: '0.1.0',
    getToken: jest.fn(async () => 'tok-1'),
    refreshToken: jest.fn(async () => 'tok-2'),
    onSignedOut: jest.fn(),
    uuid: () => `uuid-${++id}`,
    fetchImpl: fetchImpl as unknown as typeof fetch,
    ...over,
  };
  return { client: createClient(opts), calls, opts };
}

describe('api client', () => {
  it('sends bearer, correlation, device and version headers; no Idempotency-Key on GET', async () => {
    const { client, calls } = setup([res(200, { ok: true })]);
    await client.get('/me');
    const h = calls[0]!.init.headers;
    expect(calls[0]!.url).toBe('https://api.test/api/v1/me');
    expect(h.Authorization).toBe('Bearer tok-1');
    expect(h['X-Correlation-Id']).toBeTruthy();
    expect(h['X-Device-Id']).toBe('dev-1');
    expect(h['X-App-Version']).toBe('0.1.0');
    expect(h['Idempotency-Key']).toBeUndefined();
    expect(h['If-Match']).toBeUndefined();
  });

  it('builds the query string and skips empty values', async () => {
    const { client, calls } = setup([res(200, [])]);
    await client.get('/customers', { query: { q: 'ram', limit: 20, branch: undefined, x: '' } });
    expect(calls[0]!.url).toBe('https://api.test/api/v1/customers?q=ram&limit=20');
  });

  it.each(['post', 'put', 'patch', 'delete'] as const)('%s sends an Idempotency-Key', async (m) => {
    const { client, calls } = setup([res(200, {})]);
    await client[m]('/x', { body: m === 'delete' ? undefined : { a: 1 } });
    expect(calls[0]!.init.headers['Idempotency-Key']).toBeTruthy();
  });

  it('keeps a caller-supplied Idempotency-Key', async () => {
    const { client, calls } = setup([res(200, {})]);
    await client.post('/sales/invoices', { body: {}, idempotencyKey: 'my-key-0123456789' });
    expect(calls[0]!.init.headers['Idempotency-Key']).toBe('my-key-0123456789');
  });

  it('sends Content-Type and a JSON body only when there is a body', async () => {
    const { client, calls } = setup([res(200, {})]);
    await client.post('/x', { body: { a: 1 } });
    expect(calls[0]!.init.headers['Content-Type']).toBe('application/json');
    expect(calls[0]!.init.body).toBe('{"a":1}');
  });

  it('sends If-Match as "<version>"', async () => {
    const { client, calls } = setup([res(200, {})]);
    await client.patch('/customers/1', { body: {}, version: 7 });
    expect(calls[0]!.init.headers['If-Match']).toBe('"7"');
  });

  it('on 401 refreshes once and retries once with the SAME Idempotency-Key', async () => {
    const { client, calls, opts } = setup([res(401, { title: 'X' }), res(200, { id: 1 })]);
    const out = await client.post('/sales/invoices', { body: {} });
    expect(out).toEqual({ id: 1 });
    expect(opts.refreshToken).toHaveBeenCalledTimes(1);
    expect(calls).toHaveLength(2);
    expect(calls[1]!.init.headers.Authorization).toBe('Bearer tok-2');
    expect(calls[1]!.init.headers['Idempotency-Key']).toBe(calls[0]!.init.headers['Idempotency-Key']);
    expect(opts.onSignedOut).not.toHaveBeenCalled();
  });

  it('a second 401 signs out and does not refresh again', async () => {
    const { client, calls, opts } = setup([res(401), res(401)]);
    await expect(client.get('/me')).rejects.toMatchObject({ status: 401, code: 'UNAUTHENTICATED' });
    expect(opts.refreshToken).toHaveBeenCalledTimes(1);
    expect(calls).toHaveLength(2);
    expect(opts.onSignedOut).toHaveBeenCalledTimes(1);
  });

  it('refresh returning null signs out without a retry', async () => {
    const { client, calls, opts } = setup([res(401)], { refreshToken: jest.fn(async () => null) });
    await expect(client.get('/me')).rejects.toBeInstanceOf(ApiError);
    expect(calls).toHaveLength(1);
    expect(opts.onSignedOut).toHaveBeenCalledTimes(1);
  });

  it('no stored token signs out and makes no request', async () => {
    const { client, calls, opts } = setup([res(200, {})], { getToken: jest.fn(async () => null) });
    await expect(client.get('/me')).rejects.toMatchObject({ status: 401 });
    expect(calls).toHaveLength(0);
    expect(opts.onSignedOut).toHaveBeenCalledTimes(1);
  });

  it('network failure becomes ApiError with code NETWORK', async () => {
    const { client } = setup([new TypeError('Network request failed')]);
    await expect(client.get('/me')).rejects.toMatchObject({ status: 0, code: 'NETWORK' });
  });

  it('204 returns null', async () => {
    const { client } = setup([res(204)]);
    await expect(client.delete('/x')).resolves.toBeNull();
  });

  it('maps an error body to ApiError (code, correlationId, fields)', async () => {
    const body = {
      title: 'VALIDATION_FAILED',
      detail: 'qty: must be positive',
      correlationId: 'c-9',
      errors: [{ field: 'qty', message: 'must be positive' }],
    };
    const { client } = setup([res(422, body)]);
    const e = (await client.post('/x', { body: {} }).catch((x) => x)) as ApiError;
    expect(e).toBeInstanceOf(ApiError);
    expect(e.status).toBe(422);
    expect(e.code).toBe('VALIDATION_FAILED');
    expect(e.correlationId).toBe('c-9');
    expect(e.fields).toEqual([{ field: 'qty', message: 'must be positive' }]);
  });

  it('falls back to the X-Correlation-Id response header when the body has none', async () => {
    const { client } = setup([res(500, { title: 'INTERNAL' }, { 'X-Correlation-Id': 'hdr-1' })]);
    await expect(client.get('/x')).rejects.toMatchObject({ code: 'INTERNAL', correlationId: 'hdr-1' });
  });

  it('reads an HTML answer as text and asks for text/html, still sending the auth headers', async () => {
    const r = { ...res(200), text: async () => '<html>Invoice</html>' } as unknown as Response;
    const { client, calls } = setup([r]);
    await expect(client.get<string>('/sales/invoices/i-1/print', { query: { paper: 'A4' }, as: 'text' })).resolves.toBe('<html>Invoice</html>');
    expect(calls[0]!.url).toBe('https://api.test/api/v1/sales/invoices/i-1/print?paper=A4');
    expect(calls[0]!.init.headers.Accept).toBe('text/html');
    expect(calls[0]!.init.headers.Authorization).toBe('Bearer tok-1');
  });

  it('turns a failed text request into an ApiError with the problem code', async () => {
    const r = { ...res(403, undefined, { 'X-Correlation-Id': 'c-9' }), text: async () => JSON.stringify({ title: 'FORBIDDEN' }) } as unknown as Response;
    const { client } = setup([r]);
    await expect(client.get('/x', { as: 'text' })).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
  });
});

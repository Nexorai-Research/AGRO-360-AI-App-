import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import parts from '../i18n-parts/ai.json';
import { i18n, setLanguage } from '../src/i18n';
import { parseSse, readSse, utf8Decoder } from '../src/api/sse';
import { createClient } from '../src/api/client';
import { ApiError } from '../src/api/errors';
import { askAssistant, resetStreamChoice } from '../src/features/ai/api';
import AssistantScreen from '../src/features/ai/AssistantScreen';
import type { ApiClient } from '../src/api/client';

const mockPost = jest.fn();
const mockStream = jest.fn();
let mockId = 0;
jest.mock('../src/auth/AuthProvider', () => ({
  useAuth: () => ({
    status: 'signedIn',
    me: { userId: 'u-1', roles: [], permissions: undefined },
    client: {
      get: jest.fn(),
      post: (...a: unknown[]) => mockPost(...a),
      stream: (...a: unknown[]) => mockStream(...a),
    },
    signOut: jest.fn(),
  }),
}));
jest.mock('../src/device', () => ({ newId: () => `key-${++mockId}` }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }));

// UTF-8 bytes of a string without Node's Buffer (the app's types have no Node)
const enc = (s: string) => Uint8Array.from(unescape(encodeURIComponent(s)), (ch) => ch.charCodeAt(0));
const sse = (events: [string, unknown][]) =>
  events.map(([n, d]) => `event: ${n}\ndata: ${JSON.stringify(d)}\n\n`).join('');
const reader = (chunks: Uint8Array[]) => {
  let i = 0;
  return {
    getReader: () => ({
      read: async () => (i < chunks.length ? { done: false, value: chunks[i++] } : { done: true }),
    }),
  };
};

let qc: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={qc}>{children}</QueryClientProvider>
);
beforeAll(() => {
  for (const lg of ['en', 'hi', 'mr'] as const)
    i18n.addResourceBundle(lg, 'translation', (parts as Record<string, object>)[lg], true, true);
});
beforeEach(async () => {
  [mockPost, mockStream].forEach((m) => m.mockReset());
  mockId = 0;
  resetStreamChoice();
  qc = new QueryClient();
  await setLanguage('en');
});

describe('reading server-sent events', () => {
  test('a Hindi letter cut between two chunks is decoded whole', () => {
    const b = enc('नमस्ते');
    const d = utf8Decoder();
    expect(d(b.slice(0, 4)) + d(b.slice(4))).toBe('नमस्ते');
  });
  test('events are cut at blank lines; an unfinished one waits', () => {
    const { events, rest } = parseSse('event: text\ndata: {"text":"Hel"}\n\nevent: text\ndata: {"te');
    expect(events).toEqual([{ name: 'text', data: { text: 'Hel' } }]);
    expect(rest).toBe('event: text\ndata: {"te');
  });
  test('read piece by piece, or whole when the answer cannot be read in pieces', async () => {
    const body = sse([
      ['text', { text: 'खाद ' }],
      ['done', { content: [{ type: 'text', text: 'खाद दें' }], stopReason: 'end_turn' }],
    ]);
    const b = enc(body);
    const got: string[] = [];
    await readSse({ body: reader([b.slice(0, 7), b.slice(7, 30), b.slice(30)]), text: async () => '' }, (e) =>
      got.push(e.name),
    );
    expect(got).toEqual(['text', 'done']);
    const whole: string[] = [];
    await readSse({ body: null, text: async () => body }, (e) => whole.push(e.name));
    expect(whole).toEqual(['text', 'done']);
  });
});

describe('the client', () => {
  const make = (streamFetch: jest.Mock, refresh = jest.fn().mockResolvedValue('t2')) =>
    createClient({
      baseUrl: 'https://api',
      appVersion: '1.0.0',
      getToken: async () => 't1',
      refreshToken: refresh,
      onSignedOut: jest.fn(),
      uuid: () => 'u',
      fetchImpl: jest.fn(),
      streamFetch: streamFetch as unknown as typeof fetch,
    });
  const ok = (body: string, type = 'text/event-stream') => ({
    ok: true,
    status: 200,
    headers: { get: (h: string) => (h.toLowerCase() === 'content-type' ? type : null) },
    body: reader([enc(body)]),
    text: async () => body,
    json: async () => JSON.parse(body),
  });

  test('asks for an event stream with the key, renews the sign-in once, and hands over the events', async () => {
    const f = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 401, headers: { get: () => null }, json: async () => ({}) })
      .mockResolvedValueOnce(ok(sse([['text', { text: 'Hi' }]])));
    const names: string[] = [];
    await make(f).stream('/assistant/chat/stream', {
      body: { a: 1 },
      idempotencyKey: 'k1',
      onEvent: (e) => names.push(e.name),
    });
    expect(names).toEqual(['text']);
    const [url, init] = f.mock.calls[1];
    expect(url).toBe('https://api/assistant/chat/stream');
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer t2',
      Accept: 'text/event-stream',
      'Idempotency-Key': 'k1',
    });
  });
  test('an answer that is not a stream is NOT_STREAM; an error event is thrown with its code', async () => {
    await expect(
      make(jest.fn().mockResolvedValue(ok('{}', 'application/json'))).stream('/x', { onEvent: jest.fn() }),
    ).rejects.toMatchObject({ code: 'NOT_STREAM' });
    await expect(
      make(
        jest
          .fn()
          .mockResolvedValue(ok(sse([['error', { code: 'ASSISTANT_UNAVAILABLE', message: 'stopped' }]]))),
      ).stream('/x', {
        onEvent: jest.fn(),
      }),
    ).rejects.toMatchObject({ code: 'ASSISTANT_UNAVAILABLE' });
  });
});

describe('asking the assistant', () => {
  const body = { messages: [], today: '2026-11-20', lang: 'en' };
  test('streamed words go to the preview; the done event is the answer', async () => {
    const c = {
      stream: jest.fn(async (_p: string, o: { onEvent: (e: { name: string; data: unknown }) => void }) => {
        o.onEvent({ name: 'text', data: { text: 'Buy ' } });
        o.onEvent({ name: 'text', data: { text: 'urea' } });
        o.onEvent({
          name: 'done',
          data: { content: [{ type: 'text', text: 'Buy urea.' }], stopReason: 'end_turn' },
        });
      }),
      post: jest.fn(),
    } as unknown as ApiClient;
    const seen: string[] = [];
    const a = await askAssistant(
      c,
      body,
      () => 'k',
      (s) => seen.push(s),
    );
    expect(seen).toEqual(['Buy ', 'Buy urea']);
    expect(a.content[0]).toMatchObject({ text: 'Buy urea.' });
  });
  test('a server that cannot stream: asked the ordinary way, and not streamed again', async () => {
    const stream = jest.fn().mockRejectedValue(new ApiError(502, { title: 'NOT_STREAM' }));
    const post = jest.fn().mockResolvedValue({ content: [], stopReason: 'end_turn' });
    const c = { stream, post } as unknown as ApiClient;
    await askAssistant(c, body, () => 'k', jest.fn());
    await askAssistant(c, body, () => 'k', jest.fn());
    expect(stream).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledTimes(2);
    expect(post.mock.calls[0][0]).toBe('/assistant/chat');
  });
});

test('the assistant screen shows the streamed answer', async () => {
  mockStream.mockImplementation(
    async (_p: string, o: { onEvent: (e: { name: string; data: unknown }) => void }) => {
      o.onEvent({ name: 'text', data: { text: 'Sales today ' } });
      o.onEvent({
        name: 'done',
        data: { content: [{ type: 'text', text: 'Sales today are 12,000 rupees.' }], stopReason: 'end_turn' },
      });
    },
  );
  await render(<AssistantScreen />, { wrapper });
  await fireEvent.changeText(screen.getByLabelText('Type your question'), 'sales today?');
  await fireEvent.press(screen.getByLabelText('Send'));
  expect(await screen.findByText('Sales today are 12,000 rupees.')).toBeTruthy();
  await waitFor(() =>
    expect(mockStream).toHaveBeenCalledWith(
      '/assistant/chat/stream',
      expect.objectContaining({ idempotencyKey: 'key-1' }),
    ),
  );
  expect(mockPost).not.toHaveBeenCalled();
});

import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import parts from '../i18n-parts/ai.json';
import { i18n, setLanguage } from '../src/i18n';
import AssistantScreen, { MAX_STEPS } from '../src/features/ai/AssistantScreen';
import DigestScreen, { evidenceRoute } from '../src/features/ai/DigestScreen';

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockPush = jest.fn();
let mockMe: { userId: string; roles: string[]; permissions?: string[] };
let mockId = 0;
jest.mock('../src/auth/AuthProvider', () => ({
  useAuth: () => ({
    status: 'signedIn',
    me: mockMe,
    client: { get: (...a: unknown[]) => mockGet(...a), post: (...a: unknown[]) => mockPost(...a) },
    signIn: jest.fn(),
    signOut: jest.fn(),
  }),
}));
jest.mock('../src/device', () => ({ newId: () => `key-${++mockId}` }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: (...a: unknown[]) => mockPush(...a), back: jest.fn() }),
  Stack: { Screen: () => null },
}));

let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);
beforeAll(() => {
  for (const lg of ['en', 'hi', 'mr'] as const)
    i18n.addResourceBundle(lg, 'translation', (parts as Record<string, object>)[lg], true, true);
});
beforeEach(async () => {
  [mockGet, mockPost, mockPush].forEach((m) => m.mockReset());
  mockId = 0;
  mockMe = { userId: 'u-1', roles: [], permissions: undefined };
  client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retryDelay: 0 } } });
  await setLanguage('en');
});

const say = (text: string) => ({ content: [{ type: 'text', text }], stopReason: 'end_turn' });
const ask = async (q: string) => {
  await fireEvent.changeText(screen.getByLabelText('Type your question'), q);
  await fireEvent.press(screen.getByLabelText('Send'));
};

describe('assistant', () => {
  test('a plain answer is shown and the conversation is sent with a key', async () => {
    mockPost.mockResolvedValue(say('Sales today are 12,000 rupees.'));
    await render(<AssistantScreen />, { wrapper });
    await ask('today sales');
    await screen.findByText('Sales today are 12,000 rupees.');
    expect(mockPost).toHaveBeenCalledTimes(1);
    const [path, opts] = mockPost.mock.calls[0];
    expect(path).toBe('/assistant/chat');
    expect(opts.idempotencyKey).toBe('key-1');
    expect(opts.body.messages).toEqual([{ role: 'user', content: 'today sales' }]);
    expect(opts.body.lang).toBe('en');
    expect(JSON.stringify(opts.body)).not.toMatch(/tenant/i);
  });

  test('a tool call is run and its result goes back to the model', async () => {
    mockGet.mockResolvedValue({ items: [{ name: 'Ramesh' }] });
    mockPost
      .mockResolvedValueOnce({
        content: [{ type: 'tool_use', id: 't1', name: 'get', input: { path: '/customers?q=ramesh' } }],
        stopReason: 'tool_use',
      })
      .mockResolvedValueOnce(say('Found Ramesh.'));
    await render(<AssistantScreen />, { wrapper });
    await ask('find ramesh');
    await screen.findByText('Found Ramesh.');
    expect(mockGet).toHaveBeenCalledWith('/customers?q=ramesh');
    const second = mockPost.mock.calls[1][1].body.messages;
    expect(second[2].content[0]).toMatchObject({ type: 'tool_result', tool_use_id: 't1' });
    expect(mockPost.mock.calls[1][1].idempotencyKey).toBe('key-2'); // a new model call, a new key
  });

  test('a change waits for Yes: No sends nothing, Yes posts once', async () => {
    const CID = '11111111-1111-4111-8111-111111111111';
    const tool = {
      content: [
        { type: 'tool_use', id: 't1', name: 'add_customer', input: { name: 'Ramesh', mobile: '9876543210' } },
      ],
      stopReason: 'tool_use',
    };
    mockPost.mockImplementation((path: string) =>
      path === '/customers'
        ? Promise.resolve({ id: CID })
        : Promise.resolve(mockPost.mock.calls.length === 1 ? tool : say('Done.')),
    );
    await render(<AssistantScreen />, { wrapper });
    await ask('add ramesh 9876543210');
    await screen.findByText('Add customer Ramesh?');
    expect(mockPost.mock.calls.filter((c) => c[0] === '/customers')).toHaveLength(0);
    await fireEvent.press(screen.getByLabelText('Yes, do it'));
    await screen.findByText('Done.');
    expect(mockPost.mock.calls.filter((c) => c[0] === '/customers')).toHaveLength(1);
  });

  test('saying No changes nothing', async () => {
    mockPost
      .mockResolvedValueOnce({
        content: [
          {
            type: 'tool_use',
            id: 't1',
            name: 'add_customer',
            input: { name: 'Ramesh', mobile: '9876543210' },
          },
        ],
        stopReason: 'tool_use',
      })
      .mockResolvedValueOnce(say('Okay, not added.'));
    await render(<AssistantScreen />, { wrapper });
    await ask('add ramesh');
    await screen.findByText('Add customer Ramesh?');
    await fireEvent.press(screen.getByLabelText('No'));
    await screen.findByText('Okay, not added.');
    expect(mockPost.mock.calls.map((c) => c[0])).toEqual(['/assistant/chat', '/assistant/chat']);
  });

  test('a model that keeps calling tools is stopped after the step limit', async () => {
    mockGet.mockResolvedValue({});
    mockPost.mockResolvedValue({
      content: [{ type: 'tool_use', id: 't', name: 'get', input: { path: '/branches' } }],
      stopReason: 'tool_use',
    });
    await render(<AssistantScreen />, { wrapper });
    await ask('loop');
    await screen.findByText('That took too many steps. Please ask in a narrower way.');
    expect(mockPost).toHaveBeenCalledTimes(MAX_STEPS);
  });

  test('offline shows a message and the broken question is dropped from the history', async () => {
    const { ApiError } = jest.requireActual('../src/api/errors');
    mockPost.mockRejectedValueOnce(new ApiError(0, null, 'c')).mockResolvedValueOnce(say('Back.'));
    await render(<AssistantScreen />, { wrapper });
    await ask('first');
    await screen.findByText(/No connection/);
    await ask('second');
    await screen.findByText('Back.');
    expect(mockPost.mock.calls[1][1].body.messages).toEqual([{ role: 'user', content: 'second' }]);
  });

  test('a server refusal is shown as translated text', async () => {
    const { ApiError } = jest.requireActual('../src/api/errors');
    mockPost.mockRejectedValue(new ApiError(503, { title: 'ASSISTANT_NOT_CONFIGURED' }, 'c'));
    await render(<AssistantScreen />, { wrapper });
    await ask('hello');
    await screen.findByText('The AI assistant is not switched on for this server yet.');
  });

  test('Hindi text', async () => {
    await setLanguage('hi');
    await render(<AssistantScreen />, { wrapper });
    expect(screen.getByLabelText(i18n.t('ai.send'))).toBeTruthy();
    expect(i18n.t('ai.send')).toBe('भेजें');
  });
});

const digest = {
  date: '2026-11-13',
  branchId: null,
  branches: 2,
  counts: { HIGH: 1, MEDIUM: 1, LOW: 0 },
  total: 2,
  summary: '2 things need attention',
  snoozed: 1,
  notScanned: ['compliance'],
  items: [
    {
      kind: 'STOCKOUT',
      severity: 'HIGH',
      title: 'Urea runs out',
      detail: 'about 2 days of cover',
      subjectRef: 'p1',
      branchId: 'b1',
      link: '/x',
      dedupeKey: 'STOCKOUT:p1',
    },
    {
      kind: 'COLLECTION',
      severity: 'MEDIUM',
      title: 'Collect from Ramesh',
      detail: 'overdue',
      subjectRef: '11111111-1111-4111-8111-111111111111',
      branchId: null,
      link: '/y',
      dedupeKey: 'COLLECTION:c1',
    },
  ],
};

describe('digest', () => {
  const route = (extra: Record<string, unknown> = {}) =>
    mockGet.mockImplementation((p: string) =>
      p === '/ai/digest'
        ? Promise.resolve(digest)
        : p === '/branches'
          ? Promise.resolve({
              items: [
                { id: 'b1', name: 'Main' },
                { id: 'b2', name: 'Yard' },
              ],
            })
          : Promise.reject(new Error(`unexpected ${p} ${JSON.stringify(extra)}`)),
    );

  test('lists findings by severity with the summary, hidden count and the not-checked warning', async () => {
    route();
    await render(<DigestScreen />, { wrapper });
    await screen.findByText('2 things need attention');
    expect(screen.getByText('High · Urea runs out')).toBeTruthy();
    expect(screen.getByText('Medium · Collect from Ramesh')).toBeTruthy();
    expect(screen.getByText('1 hidden for now')).toBeTruthy();
    expect(screen.getByText(/Not checked: compliance/)).toBeTruthy();
    expect(mockGet.mock.calls.find((c) => c[0] === '/ai/digest')?.[1].query).toEqual({ branch: 'all' });
  });

  test('a branch chip re-reads the digest for that branch', async () => {
    route();
    await render(<DigestScreen />, { wrapper });
    await screen.findByText('2 things need attention');
    await fireEvent.press(screen.getByText('Yard'));
    await waitFor(() =>
      expect(mockGet.mock.calls.some((c) => c[0] === '/ai/digest' && c[1].query.branch === 'b2')).toBe(true),
    );
  });

  test('Open goes to the customer; snooze posts once with a reason and a key', async () => {
    route();
    mockPost.mockResolvedValue({});
    await render(<DigestScreen />, { wrapper });
    await screen.findByText('2 things need attention');
    await fireEvent.press(screen.getAllByLabelText('Open')[1]!);
    expect(mockPush).toHaveBeenCalledWith('/customers/11111111-1111-4111-8111-111111111111');
    await fireEvent.press(screen.getAllByLabelText('Hide for 7 days')[0]!);
    await screen.findByText('Hidden for 7 days.');
    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(mockPost).toHaveBeenCalledWith('/ai/digest/snooze', {
      body: { dedupeKey: 'STOCKOUT:p1', days: 7, reason: 'Hidden for a week from the phone' },
      idempotencyKey: 'key-1',
    });
  });

  test('without the permission nothing is read; a 403 shows the denied text', async () => {
    mockMe = { userId: 'u-1', roles: [], permissions: ['customer.view'] };
    await render(<DigestScreen />, { wrapper });
    await screen.findByText('You do not have permission for this screen.');
    expect(mockGet).not.toHaveBeenCalled();
  });

  test('an empty digest says nothing needs attention', async () => {
    mockGet.mockImplementation((p: string) =>
      Promise.resolve(
        p === '/ai/digest'
          ? {
              ...digest,
              items: [],
              total: 0,
              counts: { HIGH: 0, MEDIUM: 0, LOW: 0 },
              snoozed: 0,
              notScanned: [],
            }
          : { items: [] },
      ),
    );
    await render(<DigestScreen />, { wrapper });
    await screen.findByText('Nothing needs attention right now.');
  });

  test('evidence routes', () => {
    expect(evidenceRoute('STOCKOUT', 'p')).toBe('/stock');
    expect(evidenceRoute('EXPIRY', 'p')).toBe('/inventory-expiry');
    expect(evidenceRoute('COLLECTION', 'not-an-id')).toBe('/collections');
    expect(evidenceRoute('DRIFT', 'p')).toBeNull();
  });
});

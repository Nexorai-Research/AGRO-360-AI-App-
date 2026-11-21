import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import parts from '../i18n-parts/ai.json';
import { i18n, setLanguage } from '../src/i18n';
import AssistantScreen from '../src/features/ai/AssistantScreen';
import {
  WRITES_OFF,
  chatWritesAllowed,
  classifyReply,
  makeTools,
  type ToolCtx,
} from '../src/features/ai/tools';

const mockGet = jest.fn();
const mockPost = jest.fn();
let mockId = 0;
jest.mock('../src/auth/AuthProvider', () => ({
  useAuth: () => ({
    status: 'signedIn',
    me: { userId: 'u-1', roles: [], permissions: undefined },
    client: { get: (...a: unknown[]) => mockGet(...a), post: (...a: unknown[]) => mockPost(...a) },
    signOut: jest.fn(),
  }),
}));
jest.mock('../src/device', () => ({ newId: () => `key-${++mockId}` }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }));

let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);
beforeAll(() => {
  for (const lg of ['en', 'hi', 'mr'] as const)
    i18n.addResourceBundle(lg, 'translation', (parts as Record<string, object>)[lg], true, true);
});
beforeEach(async () => {
  [mockGet, mockPost].forEach((m) => m.mockReset());
  mockId = 0;
  client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retryDelay: 0 } } });
  await setLanguage('en');
});
const say = (text: string) => ({ content: [{ type: 'text', text }], stopReason: 'end_turn' });
const addRamesh = {
  content: [
    { type: 'tool_use', id: 't1', name: 'add_customer', input: { name: 'Ramesh', mobile: '9876543210' } },
  ],
  stopReason: 'tool_use',
};
const type = async (q: string) => {
  await fireEvent.changeText(screen.getByLabelText('Type your question'), q);
  await fireEvent.press(screen.getByLabelText('Send'));
};

describe('the confirmation rules of the web', () => {
  test('only an exact negative cancels; a short yes or no is only a reply; the rest is unrelated', () => {
    expect(classifyReply('Nahi!')).toBe('negative');
    expect(classifyReply('नहीं')).toBe('negative');
    expect(classifyReply('cancel')).toBe('negative');
    expect(classifyReply('haan karo')).toBe('reply');
    expect(classifyReply('ok')).toBe('reply');
    expect(classifyReply('no, wait')).toBe('reply');
    expect(classifyReply('no, wait for the mobile')).toBe('unrelated'); // more than four words
    expect(classifyReply('what is the stock of urea today')).toBe('unrelated');
    expect(classifyReply('')).toBe('unrelated');
  });

  test('the server is asked whether the assistant may change things; anything but a clear yes is no', async () => {
    const c = { get: jest.fn() } as unknown as ToolCtx['client'];
    (c.get as jest.Mock).mockResolvedValueOnce({ chatWrites: true });
    expect(await chatWritesAllowed(c)).toBe(true);
    (c.get as jest.Mock).mockResolvedValueOnce({});
    expect(await chatWritesAllowed(c)).toBe(false);
    (c.get as jest.Mock).mockRejectedValueOnce(new Error('offline'));
    expect(await chatWritesAllowed(c)).toBe(false);
    expect(c.get).toHaveBeenCalledWith('/assistant/capabilities');
  });

  test('changes switched off on the server: nothing is proposed or sent', async () => {
    const confirm = jest.fn();
    const post = jest.fn();
    const t = makeTools({
      client: { get: jest.fn(), post } as unknown as ToolCtx['client'],
      can: () => true,
      confirm,
      writesAllowed: async () => false,
      go: jest.fn(),
      openCustomer: jest.fn(),
      setLang: jest.fn(),
      signOut: jest.fn(),
      today: () => '2026-11-20',
    });
    expect(await t.add_customer!({ name: 'Ramesh', mobile: '9876543210' })).toBe(WRITES_OFF);
    expect(
      await t.record_payment!({
        customerId: '11111111-1111-4111-8111-111111111111',
        amount: 100,
        mode: 'CASH',
      }),
    ).toBe(WRITES_OFF);
    expect(confirm).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });
});

describe('assistant screen', () => {
  test('typed "haan" does not confirm; a typed exact "nahi" cancels and nothing is created', async () => {
    mockGet.mockResolvedValue({ chatWrites: true });
    mockPost.mockResolvedValueOnce(addRamesh).mockResolvedValueOnce(say('Okay, not added.'));
    await render(<AssistantScreen />, { wrapper });
    await type('add ramesh 9876543210');
    await screen.findByText('Add customer Ramesh?');
    await type('haan karo');
    expect(await screen.findByText(/never confirm a change/)).toBeTruthy();
    expect(screen.getByText('Add customer Ramesh?')).toBeTruthy(); // still waiting
    expect(mockPost.mock.calls.filter((c) => c[0] === '/customers')).toHaveLength(0);
    await type('nahi');
    await screen.findByText('Okay, not added.');
    expect(mockPost.mock.calls.map((c) => c[0])).toEqual(['/assistant/chat', '/assistant/chat']);
  });

  test('switched off on the server: no Yes card at all', async () => {
    mockGet.mockResolvedValue({ chatWrites: false });
    mockPost.mockResolvedValueOnce(addRamesh).mockResolvedValueOnce(say('That is switched off here.'));
    await render(<AssistantScreen />, { wrapper });
    await type('add ramesh 9876543210');
    await screen.findByText('That is switched off here.');
    expect(screen.queryByText('Add customer Ramesh?')).toBeNull();
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(2));
    const result = mockPost.mock.calls[1][1].body.messages.at(-1).content[0];
    expect(result.content).toBe(WRITES_OFF);
  });
});

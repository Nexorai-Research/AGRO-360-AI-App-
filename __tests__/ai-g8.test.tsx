import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import parts from '../i18n-parts/ai-g8.json';
import { i18n, setLanguage } from '../src/i18n';
import SearchG8Screen from '../src/features/ai/SearchG8Screen';
import VoiceG8Screen from '../src/features/ai/VoiceG8Screen';
import ClassifyG8Screen from '../src/features/ai/ClassifyG8Screen';
import TrainingG8Screen from '../src/features/ai/TrainingG8Screen';
import QuizG8Screen from '../src/features/ai/QuizG8Screen';

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockPush = jest.fn();
const mockPick = jest.fn();
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
jest.mock('expo-document-picker', () => ({ getDocumentAsync: (...a: unknown[]) => mockPick(...a) }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: (...a: unknown[]) => mockPush(...a) }),
  useLocalSearchParams: () => ({ id: 'item-1' }),
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
  [mockGet, mockPost, mockPush, mockPick].forEach((m) => m.mockReset());
  mockId = 0;
  mockMe = { userId: 'u-1', roles: [], permissions: undefined };
  client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retryDelay: 0 } } });
  await setLanguage('en');
});
const route = (map: Record<string, unknown>) =>
  mockGet.mockImplementation((p: string) =>
    p in map ? Promise.resolve(map[p]) : Promise.reject(new Error(`unexpected GET ${p}`)),
  );
const BR = { items: [{ id: 'b1', name: 'Main' }] };

describe('smart search', () => {
  test('shows hits with the reason; short text calls nothing', async () => {
    route({
      '/ai/search/products': {
        query: 'urea',
        method: 'rules',
        items: [
          {
            id: 'p1',
            code: 'UR-50',
            name: 'Urea 50kg',
            localName: 'Yuriya',
            brand: 'IFFCO',
            category: 'Fertiliser',
            score: 9,
            because: ['name', 'alias'],
          },
        ],
      },
    });
    await render(<SearchG8Screen />, { wrapper });
    await fireEvent.changeText(screen.getByLabelText('Search product'), 'u');
    expect(mockGet).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText('Search product'), 'urea');
    await screen.findByText('Urea 50kg');
    expect(screen.getByText('Matched on: name, alias')).toBeTruthy();
    expect(mockGet).toHaveBeenCalledWith(
      '/ai/search/products',
      expect.objectContaining({ query: { q: 'urea', limit: 20 } }),
    );
  });
  test('denied without product.view', async () => {
    mockMe = { userId: 'u', roles: [], permissions: ['ai.assistant.use'] };
    await render(<SearchG8Screen />, { wrapper });
    await screen.findByText('You do not have permission for this screen.');
    expect(mockGet).not.toHaveBeenCalled();
  });
});

describe('voice draft', () => {
  test('posts transcript, lang, intent with one key; flags an assumed quantity; says it is a draft', async () => {
    mockPost.mockResolvedValue({
      intent: 'cart',
      customer: { query: 'Ramesh', confidence: 0.8 },
      warnings: ['One product not clear'],
      draftOnly: true,
      note: 'This is a draft. Check every product and quantity before you bill.',
      lines: [
        { productQuery: 'urea', qty: 2, unit: 'bag', qtyAssumed: false, confidence: 0.9 },
        { productQuery: 'dap', qty: 1, unit: null, qtyAssumed: true, confidence: 0.6 },
      ],
    });
    await render(<VoiceG8Screen />, { wrapper });
    await fireEvent.press(screen.getByLabelText('Read it'));
    await screen.findByText('Enter 1 to 600 characters.');
    expect(mockPost).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText('What was said'), 'Ramesh ko 2 bag urea');
    await fireEvent.press(screen.getByLabelText('Read it'));
    await screen.findByText('Customer: Ramesh');
    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(mockPost).toHaveBeenCalledWith('/ai/voice/parse', {
      body: { transcript: 'Ramesh ko 2 bag urea', lang: 'en', intent: 'cart' },
      idempotencyKey: 'key-1',
    });
    expect(screen.getByText('Quantity 1  · quantity assumed, check it')).toBeTruthy();
    expect(screen.getByText('One product not clear')).toBeTruthy();
    expect(
      screen.getByText('This is a draft. Check every product and quantity before you bill.'),
    ).toBeTruthy();
  });
  test('search intent shows the query', async () => {
    mockPost.mockResolvedValue({ intent: 'search', query: 'urea', draftOnly: true, note: 'draft' });
    await render(<VoiceG8Screen />, { wrapper });
    await fireEvent.press(screen.getByText('Search'));
    await fireEvent.changeText(screen.getByLabelText('What was said'), 'urea dikhao');
    await fireEvent.press(screen.getByLabelText('Read it'));
    await screen.findByText('urea');
    expect(mockPost.mock.calls[0][1].body).toMatchObject({ intent: 'search' });
  });
});

describe('document classification', () => {
  const doc = {
    id: 'd1',
    status: 'REVIEW',
    filename: 'licence.pdf',
    version: 1,
    result: null,
    suggestion: {
      category: 'LICENCE',
      confidence: 0.7,
      reason: 'file name mentions: licence',
      source: 'keyword',
    },
  };
  test('upload sends base64 and branch; confirm sends version and the chosen category', async () => {
    route({ '/branches': BR });
    mockPick.mockResolvedValue({ canceled: false, assets: [{ name: 'licence.pdf', base64: 'QUJD' }] });
    mockPost
      .mockResolvedValueOnce({ duplicate: false, document: doc })
      .mockResolvedValueOnce({
        document: { ...doc, status: 'CONFIRMED', version: 2, result: { category: 'KYC' } },
      });
    await render(<ClassifyG8Screen />, { wrapper });
    await fireEvent.press(await screen.findByLabelText('Choose a file'));
    await screen.findByText('licence.pdf (0 KB)');
    await fireEvent.press(screen.getByLabelText('Read the file'));
    await screen.findByText('Suggested: Licence');
    expect(mockPost).toHaveBeenNthCalledWith(1, '/ai/ocr/classify', {
      body: { branchId: 'b1', filename: 'licence.pdf', contentBase64: 'QUJD' },
      idempotencyKey: 'key-1',
    });
    await fireEvent.press(screen.getByText('KYC'));
    await fireEvent.press(screen.getByLabelText('File it'));
    await screen.findByText('Filed as KYC.');
    expect(mockPost).toHaveBeenNthCalledWith(2, '/ai/ocr/documents/d1/confirm', {
      body: { expectedVersion: 1, category: 'KYC' },
      idempotencyKey: 'key-2',
    });
  });
  test('a file over 4 MB is refused before upload; denied without org.document.manage', async () => {
    route({ '/branches': BR });
    mockPick.mockResolvedValue({
      canceled: false,
      assets: [{ name: 'big.pdf', base64: 'A'.repeat(6 * 1024 * 1024) }],
    });
    await render(<ClassifyG8Screen />, { wrapper });
    await fireEvent.press(await screen.findByLabelText('Choose a file'));
    await screen.findByText('The file is larger than 4 MB.');
    expect(mockPost).not.toHaveBeenCalled();
  });
  test('denied without org.document.manage', async () => {
    mockMe = { userId: 'u', roles: [], permissions: ['ai.assistant.use'] };
    await render(<ClassifyG8Screen />, { wrapper });
    await screen.findByText('You do not have permission for this screen.');
  });
});

describe('training', () => {
  test('ask shows quoted passages with source; nothing found says so', async () => {
    route({
      '/ai/training/ask': {
        question: 'return policy',
        found: true,
        message: '',
        summary: null,
        summaryNote: null,
        passages: [
          {
            itemId: 'i1',
            title: 'Returns SOP',
            source: 'SOP-4',
            version: 3,
            text: 'Returns within 7 days.',
            score: 2,
          },
        ],
      },
    });
    await render(<TrainingG8Screen />, { wrapper });
    await fireEvent.changeText(screen.getByLabelText('Your question'), 'return policy');
    await fireEvent.press(screen.getByLabelText('Find the answer'));
    await screen.findByText('Returns within 7 days.');
    expect(screen.getByText('Source: SOP-4, version 3')).toBeTruthy();
  });
  test('notes list opens the quiz; my results show pass state', async () => {
    route({
      '/ai/training/items': {
        items: [
          {
            id: 'i1',
            title: 'Returns SOP',
            category: 'Sales',
            source: 'SOP-4',
            version: 3,
            body: 'text',
            status: 'ACTIVE',
          },
        ],
      },
      '/ai/training/completions': {
        items: [
          {
            id: 'c1',
            itemId: 'i1',
            title: 'Returns SOP',
            itemVersion: 3,
            score: 4,
            total: 5,
            passed: true,
            completedAt: '2026-11-10T08:00:00Z',
          },
        ],
      },
    });
    await render(<TrainingG8Screen />, { wrapper });
    await fireEvent.press(screen.getByText('Notes'));
    await screen.findByText('Returns SOP');
    await fireEvent.press(screen.getByLabelText('Take the quiz'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/ai-training-quiz', params: { id: 'i1' } });
    await fireEvent.press(screen.getByText('My results'));
    await screen.findByText('4/5 · passed');
  });
  test('quiz: the button waits for every answer, then posts the answers with a key', async () => {
    route({
      '/ai/training/items/item-1/quiz': {
        itemId: 'item-1',
        title: 'Returns SOP',
        version: 3,
        message: null,
        questions: [
          { id: 1, prompt: 'How many days?', options: ['3', '7'] },
          { id: 2, prompt: 'Who approves?', options: ['Owner', 'Staff'] },
        ],
      },
    });
    mockPost.mockResolvedValue({
      id: 'c1',
      itemId: 'item-1',
      title: 'Returns SOP',
      itemVersion: 3,
      score: 2,
      total: 2,
      passed: true,
      completedAt: '2026-11-13T08:00:00Z',
    });
    await render(<QuizG8Screen />, { wrapper });
    await screen.findByText('1. How many days?');
    await fireEvent.press(screen.getByText('7'));
    await fireEvent.press(screen.getByLabelText('Send answers'));
    expect(mockPost).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText('Owner'));
    await fireEvent.press(screen.getByLabelText('Send answers'));
    await screen.findByText('2/2 · passed');
    expect(mockPost).toHaveBeenCalledWith('/ai/training/items/item-1/quiz', {
      body: {
        answers: [
          { id: 1, option: 1 },
          { id: 2, option: 0 },
        ],
      },
      idempotencyKey: 'key-1',
    });
  });
  test('Hindi and Marathi texts for group 8', async () => {
    for (const lg of ['hi', 'mr'] as const) {
      await setLanguage(lg);
      for (const key of ['nav.aiSearch', 'ai.sr.title', 'ai.vo.title', 'ai.cl.title', 'ai.tr.title'])
        expect(i18n.t(key)).not.toBe(i18n.getFixedT('en')(key));
    }
  });
});

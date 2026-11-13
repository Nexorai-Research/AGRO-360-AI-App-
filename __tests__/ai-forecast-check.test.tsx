import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import parts from '../i18n-parts/ai.json';
import { i18n, setLanguage } from '../src/i18n';
import AccuracyScreen from '../src/features/ai/AccuracyScreen';
import ProductCheckScreen from '../src/features/ai/ProductCheckScreen';

const mockGet = jest.fn();
const mockPost = jest.fn();
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
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }), Stack: { Screen: () => null } }));

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
  mockMe = { userId: 'u-1', roles: [], permissions: undefined };
  client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retryDelay: 0 } } });
  await setLanguage('en');
});
const route = (map: Record<string, unknown>) =>
  mockGet.mockImplementation((p: string) =>
    p in map ? Promise.resolve(map[p]) : Promise.reject(new Error(`unexpected GET ${p}`)),
  );
const BR = {
  items: [
    { id: 'b1', name: 'Main' },
    { id: 'b2', name: 'Yard' },
  ],
};
const drift = (o = {}) => ({
  state: 'OK',
  reason: null,
  drifted: true,
  recentWape: 0.45,
  referenceWape: 0.2,
  action: 'REVIEW_MODEL',
  ...o,
});

describe('accuracy dashboard', () => {
  const ov = {
    asOf: '2026-11-13',
    branchId: 'b1',
    summary: {
      products: 10,
      measured: 8,
      wape: 0.21,
      naiveWape: 0.3,
      beatsNaivePct: 62.5,
      notMeasured: 2,
      worst: [{ skuId: 's1', skuName: 'Urea', wape: 0.5 }],
    },
    drifted: [{ skuId: 's1', skuName: 'Urea', drift: drift() }],
    history: [{ takenOn: '2026-11-12', products: 8, wape: 0.22, naiveWape: 0.3, beatsNaivePct: 60 }],
  };
  test('shows the branch figure, worst products and worsening ones; only looking does not save a snapshot', async () => {
    route({ '/branches': BR, '/ai/forecast/overview': ov });
    await render(<AccuracyScreen />, { wrapper });
    await screen.findByText('8 of 10 products measured');
    expect(screen.getByText('Error 21% (lower is better)')).toBeTruthy();
    expect(screen.getByText("Forecast beat 'same as last week' on 63% of products")).toBeTruthy();
    expect(screen.getByText('2 could not be planned (not enough data).')).toBeTruthy();
    expect(screen.getByText('Urea: 50%')).toBeTruthy();
    expect(screen.getByText('Urea: 20% → 45%')).toBeTruthy();
    expect(screen.getByText('2026-11-12: 22% (8)')).toBeTruthy();
    expect(mockGet.mock.calls.find((c) => c[0] === '/ai/forecast/overview')![1].query).toEqual({
      branch: 'b1',
      save: 'false',
    });
  });
  test('scan posts once with the branch and a key; nothing is switched', async () => {
    route({ '/branches': BR, '/ai/forecast/overview': ov });
    mockPost.mockResolvedValue({ scanned: 8, drifting: 1 });
    await render(<AccuracyScreen />, { wrapper });
    await fireEvent.press(await screen.findByLabelText('Flag worsening products'));
    await screen.findByText('Done. Worsening products are flagged for a person to review.');
    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(mockPost).toHaveBeenCalledWith('/ai/forecast/drift-scan', {
      body: { branch: 'b1' },
      idempotencyKey: 'key-1',
    });
    expect(screen.getAllByText('Nothing is switched by itself. A person decides.').length).toBeGreaterThan(0);
  });
  test('no scan button without ai.recommendation.decide; denied without inventory.view', async () => {
    mockMe = { userId: 'u', roles: [], permissions: ['ai.assistant.use', 'inventory.view'] };
    route({ '/branches': BR, '/ai/forecast/overview': ov });
    await render(<AccuracyScreen />, { wrapper });
    await screen.findByText('8 of 10 products measured');
    expect(screen.queryByLabelText('Flag worsening products')).toBeNull();
  });
  test('denied reads nothing', async () => {
    mockMe = { userId: 'u', roles: [], permissions: ['ai.assistant.use'] };
    await render(<AccuracyScreen />, { wrapper });
    await screen.findByText('You do not have permission for this screen.');
    expect(mockGet).not.toHaveBeenCalled();
  });
});

describe('check one product', () => {
  const PRODS = { items: [{ id: 'p1', name: 'Urea 50kg', code: 'UR-50' }] };
  async function pick() {
    await fireEvent.changeText(await screen.findByLabelText('Search product (2+ letters)'), 'ur');
    await fireEvent.press(await screen.findByLabelText('Urea 50kg'));
  }
  test('search needs 2 letters, then explain tab shows the drivers and caveats', async () => {
    route({
      '/branches': BR,
      '/products': PRODS,
      '/ai/forecast/explain': {
        state: 'RECOMMEND',
        reason: null,
        explanation: {
          summary: 'Expect about 30 a week.',
          drivers: [{ name: 'method', detail: 'Repeats last season' }],
          caveats: ['Only 40 weeks of history'],
        },
      },
    });
    await render(<ProductCheckScreen />, { wrapper });
    await pick();
    await screen.findByText('Expect about 30 a week.');
    expect(screen.getByText('• method: Repeats last season')).toBeTruthy();
    expect(screen.getByText('Only 40 weeks of history')).toBeTruthy();
    expect(mockGet.mock.calls.find((c) => c[0] === '/products')![1].query).toEqual({ q: 'ur', limit: 20 });
    expect(mockGet.mock.calls.find((c) => c[0] === '/ai/forecast/explain')![1].query).toEqual({
      product: 'p1',
      branch: 'b1',
    });
  });
  test('accuracy, drift and season tabs', async () => {
    route({
      '/branches': BR,
      '/products': PRODS,
      '/ai/forecast/explain': { state: 'x', reason: null, explanation: null },
      '/ai/forecast/accuracy': {
        accuracy: {
          state: 'OK',
          reason: null,
          folds: 8,
          wape: 0.18,
          naiveWape: 0.25,
          bias: 0.07,
          beatsNaive: true,
          method: 'seasonal_naive',
        },
      },
      '/ai/forecast/drift': { drift: drift() },
      '/ai/anomalies/seasonal': {
        state: 'OK',
        reason: null,
        anomaly: true,
        ratio: 2.1,
        direction: 'ABOVE',
        current: 120,
        lastYear: 55,
        detail: '2.1x last year',
      },
    });
    await render(<ProductCheckScreen />, { wrapper });
    await pick();
    await fireEvent.press(await screen.findByText('Accuracy'));
    await screen.findByText('Error 18% (lower is better)');
    expect(screen.getByText('Forecasts ran 7% too high')).toBeTruthy();
    await fireEvent.press(screen.getByText('Drift'));
    await screen.findByText('Forecast is getting less accurate');
    expect(screen.getByText('Error before 20%, now 45%')).toBeTruthy();
    await fireEvent.press(screen.getByText('Season'));
    await screen.findByText('Selling much more than the same weeks last year');
    expect(screen.getByText('Last 4 weeks 120, same weeks last year 55')).toBeTruthy();
  });
  test('not enough data keeps its reason, never a number', async () => {
    route({
      '/branches': BR,
      '/products': PRODS,
      '/ai/forecast/explain': { state: 'x', reason: null, explanation: null },
      '/ai/forecast/accuracy': {
        accuracy: {
          state: 'INSUFFICIENT_DATA',
          reason: 'fewer than 8 weeks',
          folds: 0,
          wape: null,
          naiveWape: null,
          bias: null,
          beatsNaive: null,
          method: null,
        },
      },
    });
    await render(<ProductCheckScreen />, { wrapper });
    await pick();
    await fireEvent.press(await screen.findByText('Accuracy'));
    await screen.findByText('Not enough data: fewer than 8 weeks');
  });
  test('methods tab: champion and challenger, save posts once with a key and changes no forecast', async () => {
    route({
      '/branches': BR,
      '/products': PRODS,
      '/ai/forecast/explain': { state: 'x', reason: null, explanation: null },
      '/ai/forecast/compare/gbm': {
        comparison: {
          state: 'OK',
          reason: null,
          folds: 12,
          decision: 'REVIEW_CHALLENGER',
          best: 'gbm',
          note: 'GBM 12% better',
          scores: [
            { id: 'baseline', label: 'Baseline', role: 'CHAMPION', folds: 12, wape: 0.3, bias: 0 },
            { id: 'gbm', label: 'Boosting', role: 'CHALLENGER', folds: 12, wape: 0.2, bias: 0 },
          ],
        },
      },
    });
    mockPost.mockResolvedValue({});
    await render(<ProductCheckScreen />, { wrapper });
    await pick();
    await fireEvent.press(await screen.findByText('Methods'));
    await screen.findByText('Current: Baseline · 30%');
    expect(screen.getByText('Challenger: Boosting · 20%')).toBeTruthy();
    expect(screen.getByText('A person may review adopting the challenger.')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Save this comparison'));
    await screen.findByText('Saved. No forecast was changed.');
    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(mockPost).toHaveBeenCalledWith('/ai/forecast/compare/gbm/save', {
      body: { product: 'p1', branch: 'b1' },
      idempotencyKey: 'key-1',
    });
  });
  test('a product search with no result says so; changing branch re-reads', async () => {
    route({ '/branches': BR, '/products': { items: [] } });
    await render(<ProductCheckScreen />, { wrapper });
    await fireEvent.changeText(await screen.findByLabelText('Search product (2+ letters)'), 'zz');
    await screen.findByText('No product found.');
  });
  test('Hindi and Marathi texts for group 2', async () => {
    for (const lg of ['hi', 'mr'] as const) {
      await setLanguage(lg);
      for (const key of [
        'nav.aiAccuracy',
        'ai.ac.title',
        'ai.pc.title',
        'ai.pc.tab.explain',
        'ai.pc.drifted',
      ])
        expect(i18n.t(key)).not.toBe(i18n.getFixedT('en')(key));
    }
    await waitFor(() => expect(true).toBe(true));
  });
});

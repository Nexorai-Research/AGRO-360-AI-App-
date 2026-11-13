import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import parts from '../i18n-parts/ai.json';
import { i18n, setLanguage } from '../src/i18n';
import ForecastScreen from '../src/features/ai/ForecastScreen';
import SeasonScreen from '../src/features/ai/SeasonScreen';
import ReorderScreen from '../src/features/ai/ReorderScreen';
import RecommendationsScreen from '../src/features/ai/RecommendationsScreen';
import RecommendationScreen from '../src/features/ai/RecommendationScreen';
import ExpiryScreen from '../src/features/ai/ExpiryScreen';
import SupplierPricesScreen from '../src/features/ai/SupplierPricesScreen';
import ScenarioScreen from '../src/features/ai/ScenarioScreen';
import { budgetBody, validBudget, validPercent } from '../src/features/ai/scenario-logic';
import { payloadRows, pct, rupee, units } from '../src/features/ai/fmt';

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
  useLocalSearchParams: () => ({ id: 'rec-1' }),
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

describe('format helpers', () => {
  test('units, pct and rupee are display only and safe on missing values', () => {
    expect(units(12.34)).toBe('12.3');
    expect(units(null)).toBe('-');
    expect(units(NaN)).toBe('-');
    expect(pct(0.234)).toBe('23%');
    expect(pct(undefined)).toBe('-');
    expect(rupee(123456.5)).toBe('₹1,23,456.5');
    expect(rupee(null)).toBe('-');
  });
  test('payload rows hide ids, hashes and nested data', () => {
    const rows = payloadRows({
      quantity: '40',
      skuId: 'x',
      payloadHash: 'h',
      note: 'ok',
      nested: { a: 1 },
      flag: true,
      long: 'x'.repeat(90),
    });
    expect(rows).toEqual([
      ['quantity', '40'],
      ['note', 'ok'],
      ['flag', 'true'],
    ]);
  });
});

describe('scenario logic', () => {
  test('budget and percent are checked as decimals', () => {
    for (const ok of ['', '1000', '1000.5', '0.01']) expect(validBudget(ok)).toBe(true);
    for (const bad of ['0', '-5', '1e5', '10.123', 'abc', '1000000001']) expect(validBudget(bad)).toBe(false);
    for (const ok of ['', '0', '-50', '200', '12.5']) expect(validPercent(ok)).toBe(true);
    for (const bad of ['-51', '201', '1.25', 'x']) expect(validPercent(bad)).toBe(false);
  });
  test('body holds only what was filled', () => {
    expect(budgetBody('5000', '', false)).toEqual({ budget: 5000 });
    expect(budgetBody('', '-5', true)).toEqual({ priceChangePct: -5, useCash: true });
  });
});

const fc = {
  asOf: '2026-11-13',
  branchId: 'b1',
  weeks: 4,
  note: 'Each interval is the back-test error.',
  summary: { products: 2, forecast: 1, insufficientData: 1 },
  items: [
    {
      skuId: 's1',
      skuName: 'Urea 50kg',
      onHand: 120,
      adopted: null,
      forecast: {
        state: 'OK',
        reason: null,
        method: 'seasonal_naive',
        wape: 0.23,
        folds: 4,
        weeks: [{ week: 1, from: '2026-11-16', to: '2026-11-22', value: 30, low: 20, high: 40 }],
        total: 120,
        totalLow: 90,
        totalHigh: 150,
      },
    },
    {
      skuId: 's2',
      skuName: 'New seed',
      onHand: 5,
      adopted: null,
      forecast: {
        state: 'INSUFFICIENT_DATA',
        reason: 'less than a year of sales',
        method: 'x',
        wape: null,
        folds: 0,
        weeks: [],
        total: null,
        totalLow: null,
        totalHigh: null,
      },
    },
  ],
};

describe('forecast screen', () => {
  test('shows expected sales with the range, and says plainly when data is not enough', async () => {
    route({ '/branches': BR, '/ai/forecast/table': fc });
    await render(<ForecastScreen />, { wrapper });
    await screen.findByText('Urea 50kg');
    expect(screen.getByText(/Expected sales: 120 \(likely 90 to 150\)/)).toBeTruthy();
    expect(screen.getByText(/past error 23%/)).toBeTruthy();
    expect(screen.getByText('Not enough data: less than a year of sales')).toBeTruthy();
    expect(screen.getByText('1 of 2 products forecast')).toBeTruthy();
    expect(screen.getByText('1 could not be planned (not enough data).')).toBeTruthy();
    const call = mockGet.mock.calls.find((c) => c[0] === '/ai/forecast/table')!;
    expect(call[1].query).toEqual({ branch: undefined, weeks: 4, limit: 40 });
  });
  test('weeks chip and branch chip re-read the table', async () => {
    route({ '/branches': BR, '/ai/forecast/table': fc });
    await render(<ForecastScreen />, { wrapper });
    await screen.findByText('Urea 50kg');
    await fireEvent.press(screen.getByText('8 weeks'));
    await waitFor(() =>
      expect(mockGet.mock.calls.some((c) => c[0] === '/ai/forecast/table' && c[1].query.weeks === 8)).toBe(
        true,
      ),
    );
    await fireEvent.press(screen.getByText('Yard'));
    await waitFor(() =>
      expect(
        mockGet.mock.calls.some((c) => c[0] === '/ai/forecast/table' && c[1].query.branch === 'b2'),
      ).toBe(true),
    );
  });
  test('needs inventory.view; nothing is read without it', async () => {
    mockMe = { userId: 'u', roles: [], permissions: ['ai.assistant.use'] };
    await render(<ForecastScreen />, { wrapper });
    await screen.findByText('You do not have permission for this screen.');
    expect(mockGet).not.toHaveBeenCalled();
  });
});

describe('season screen', () => {
  const se = {
    asOf: '2026-11-13',
    branchId: 'b1',
    window: { startInWeeks: 0, weeks: 8 },
    season: null,
    products: 2,
    planned: 1,
    notPlanned: 1,
    totalUnitsToBuy: 80,
    earliestOrderBy: '2026-11-20',
    buy: [{ skuId: 's1', skuName: 'Urea 50kg', toBuy: 80, orderBy: '2026-11-20' }],
    unplanned: [],
    lines: [
      {
        skuId: 's1',
        skuName: 'Urea 50kg',
        state: 'OK',
        reason: null,
        windowFrom: '2026-11-13',
        windowTo: '2027-01-08',
        lastYearUnits: 200,
        growth: 1.1,
        expected: 220,
        low: 180,
        high: 260,
        toBuy: 80,
        orderBy: '2026-11-20',
        assumptions: ['Lead time 7 days'],
      },
      {
        skuId: 's2',
        skuName: 'Seed',
        state: 'INSUFFICIENT_DATA',
        reason: 'no sales last year',
        windowFrom: null,
        windowTo: null,
        lastYearUnits: null,
        growth: null,
        expected: null,
        low: null,
        high: null,
        toBuy: null,
        orderBy: null,
        assumptions: [],
      },
    ],
  };
  test('plan per product with the order-by date; unplanned products keep their reason', async () => {
    route({ '/branches': BR, '/ai/planning/season/catalogue': se });
    await render(<SeasonScreen />, { wrapper });
    await screen.findByText('Total to buy: 80 units');
    expect(screen.getByText('Order the first ones by 2026-11-20')).toBeTruthy();
    expect(screen.getByText('Expected sales: 220 (180–260)')).toBeTruthy();
    expect(screen.getByText('• Lead time 7 days')).toBeTruthy();
    expect(screen.getByText('Not enough data: no sales last year')).toBeTruthy();
  });
});

const basket = {
  branchId: 'b1',
  asOf: '2026-11-13',
  horizonDays: 30,
  basket: {
    budget: 50000,
    wantedValue: 80000,
    fundedValue: 48000,
    shortfallValue: 32000,
    unknownCost: 0,
    note: '',
  },
  skipped: [{ skuId: 's9', skuName: 'Old item', reason: 'no sales' }],
  assumptions: ['Shelf life counted from receipt'],
  lines: [
    {
      skuId: 's1',
      skuName: 'Urea 50kg',
      quantity: 100,
      unitCost: 600,
      daysOfCover: 3,
      fundedQty: 80,
      cost: 48000,
      status: 'TRIMMED',
      shortfallQty: 20,
      shortfallValue: 12000,
      note: 'Cut to fit the budget',
      supplier: {
        state: 'OK',
        reason: null,
        chosen: { supplierName: 'Kisan Agro', lastRate: 600, leadDays: 4, why: 'lowest' },
      },
      shelf: { state: 'OK', quantity: 100, sellableBeforeExpiry: null, note: '' },
      forecast: { stockoutDate: '2026-11-16', onHand: 10, onOrder: 0, leadTimeDays: 4 },
    },
  ],
};
describe('reorder screen', () => {
  test('shows lines with supplier, shortfall and the budget; nothing is ordered from here', async () => {
    route({ '/branches': BR, '/ai/reorder/basket': basket });
    await render(<ReorderScreen />, { wrapper });
    await screen.findByText('Urea 50kg');
    expect(screen.getByText(/80 of 100 units · reduced/)).toBeTruthy();
    expect(screen.getByText(/Supplier: Kisan Agro/)).toBeTruthy();
    expect(screen.getByText('Short by 20 units (₹12,000)')).toBeTruthy();
    expect(screen.getByText('Left out for want of budget: ₹32,000')).toBeTruthy();
    expect(screen.getByText(/Nothing is ordered from here/)).toBeTruthy();
    expect(screen.getByText('Old item: no sales')).toBeTruthy();
    expect(mockGet.mock.calls.find((c) => c[0] === '/ai/reorder/basket')![1].query).toEqual({ branch: 'b1' });
  });
  test('saving as suggestions posts once with a key and goes to the list', async () => {
    route({ '/branches': BR, '/ai/reorder/basket': basket });
    mockPost.mockResolvedValue({});
    await render(<ReorderScreen />, { wrapper });
    await screen.findByText('Urea 50kg');
    await fireEvent.press(screen.getByLabelText('Save as suggestions'));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/ai-recommendations'));
    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(mockPost).toHaveBeenCalledWith('/ai/reorder/basket', {
      body: { branch: 'b1' },
      idempotencyKey: 'key-1',
    });
  });
  test('without ai.recommendation.decide there is no save button', async () => {
    mockMe = { userId: 'u', roles: [], permissions: ['ai.assistant.use', 'inventory.view', 'purchase.view'] };
    route({ '/branches': BR, '/ai/reorder/basket': basket });
    await render(<ReorderScreen />, { wrapper });
    await screen.findByText('Urea 50kg');
    expect(screen.queryByLabelText('Save as suggestions')).toBeNull();
  });
});

const rec = (over: Record<string, unknown> = {}) => ({
  id: 'rec-1',
  branchId: 'b1',
  kind: 'inventory.reorder',
  tier: 'T2',
  status: 'PRESENTED',
  subjectRef: 's1',
  payload: { quantity: '80', neededBy: '2026-11-20', skuId: 'hidden-id' },
  payloadHash: 'a'.repeat(64),
  evidence: [1, 2, 3],
  confidence: 0.8,
  expiresAt: '2026-11-30T00:00:00Z',
  domainRef: null,
  rejectReason: null,
  createdAt: '2026-11-13T00:00:00Z',
  version: 1,
  ...over,
});
const action = (r = rec(), ap: Record<string, unknown> = {}) => ({
  recommendation: r,
  approval: {
    action: 'procurement.requisition.draft',
    label: 'Reorder: Urea',
    draftIn: 'a requisition draft in procurement',
    tier: 'T2',
    size: 80,
    sizeUnit: 'units',
    needsSecondApprover: false,
    approvedBy: [],
    youMayApprove: true,
    whyNot: null,
    ...ap,
  },
});

describe('recommendations list', () => {
  test('lists by status and opens one', async () => {
    route({ '/ai/recommendations': { items: [rec()] } });
    await render(<RecommendationsScreen />, { wrapper });
    await fireEvent.press(await screen.findByLabelText(/Reorder rec-1/));
    expect(mockPush).toHaveBeenCalledWith('/ai-recommendation/rec-1');
    expect(mockGet.mock.calls[0][1].query).toEqual({ status: 'PRESENTED', limit: 100 });
  });
  test('status chip re-reads; empty list says so; no permission reads nothing', async () => {
    route({ '/ai/recommendations': { items: [] } });
    await render(<RecommendationsScreen />, { wrapper });
    await screen.findByText('No suggestions in this list.');
    await fireEvent.press(screen.getByText('Rejected'));
    await waitFor(() => expect(mockGet.mock.calls.some((c) => c[1].query.status === 'REJECTED')).toBe(true));
  });
  test('denied without ai.recommendation.view', async () => {
    mockMe = { userId: 'u', roles: [], permissions: ['ai.assistant.use'] };
    await render(<RecommendationsScreen />, { wrapper });
    await screen.findByText('You do not have permission for this screen.');
    expect(mockGet).not.toHaveBeenCalled();
  });
});

describe('recommendation detail', () => {
  test('shows details without ids or hashes; Check writes nothing and lists the checks', async () => {
    route({ '/ai/actions/rec-1': action() });
    mockPost.mockResolvedValue({
      wouldCreate: 'a requisition DRAFT',
      allPass: false,
      writes: 'NONE',
      checks: [
        { name: 'still needed', ok: false, detail: 'engine says 60' },
        { name: 'status', ok: true, detail: 'PRESENTED' },
      ],
    });
    await render(<RecommendationScreen />, { wrapper });
    await screen.findByText('Reorder: Urea');
    expect(screen.getByText('quantity: 80')).toBeTruthy();
    expect(screen.queryByText(/hidden-id/)).toBeNull();
    expect(screen.getByText('Based on 3 facts')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Check first'));
    await screen.findByText('Some checks fail');
    expect(screen.getByText('✗ still needed: engine says 60')).toBeTruthy();
    expect(mockPost).toHaveBeenCalledWith('/ai/actions/rec-1/dry-run', { idempotencyKey: 'key-1' });
  });
  test('approve sends the hash that was shown, then the token makes the draft; each step has its own key', async () => {
    route({ '/ai/actions/rec-1': action() });
    mockPost.mockImplementation((p: string) =>
      p.endsWith('/approve')
        ? Promise.resolve({
            token: 'T'.repeat(40),
            expiresAt: 'x',
            payloadHash: 'a'.repeat(64),
            recommendationId: 'rec-1',
          })
        : Promise.resolve(rec({ status: 'OUTCOME_PENDING' })),
    );
    await render(<RecommendationScreen />, { wrapper });
    await fireEvent.press(await screen.findByLabelText('Approve'));
    await screen.findByLabelText('Make the draft');
    expect(mockPost).toHaveBeenCalledWith('/ai/actions/rec-1/approve', {
      body: { payloadHash: 'a'.repeat(64) },
      idempotencyKey: 'key-1',
    });
    expect(screen.queryByLabelText('Approve')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Make the draft'));
    await screen.findByText('The draft was made.');
    expect(mockPost).toHaveBeenLastCalledWith('/ai/actions/rec-1/execute', {
      body: { approvalToken: 'T'.repeat(40) },
      idempotencyKey: 'key-2',
    });
    expect(screen.queryByLabelText('Make the draft')).toBeNull();
  });
  test('when a second person must approve, no token is kept and no execute button shows', async () => {
    route({ '/ai/actions/rec-1': action(rec(), { needsSecondApprover: true }) });
    mockPost.mockResolvedValue({
      token: '',
      expiresAt: '',
      payloadHash: 'a'.repeat(64),
      recommendationId: 'rec-1',
      awaitingSecondApprover: true,
    });
    await render(<RecommendationScreen />, { wrapper });
    await screen.findByText('This needs two different people to approve.');
    await fireEvent.press(screen.getByLabelText('Approve'));
    await screen.findByText('Approved.');
    expect(screen.queryByLabelText('Make the draft')).toBeNull();
  });
  test('a person who may not approve sees why, and no Approve button', async () => {
    route({ '/ai/actions/rec-1': action(rec(), { youMayApprove: false, whyNot: 'you asked for this one' }) });
    await render(<RecommendationScreen />, { wrapper });
    await screen.findByText('you asked for this one');
    expect(screen.queryByLabelText('Approve')).toBeNull();
  });
  test('reject needs a reason of 3+ letters, then posts once with a key', async () => {
    route({ '/ai/actions/rec-1': action() });
    mockPost.mockResolvedValue(rec({ status: 'REJECTED', rejectReason: 'too much' }));
    await render(<RecommendationScreen />, { wrapper });
    await fireEvent.press(await screen.findByLabelText('Reject'));
    await fireEvent.press(screen.getByLabelText('Reject now'));
    await screen.findByText('Write a reason of 3 to 500 letters.');
    expect(mockPost).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText('Reason (at least 3 letters)'), 'too much');
    await fireEvent.press(screen.getByLabelText('Reject now'));
    await screen.findByText('Rejected.');
    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(mockPost).toHaveBeenCalledWith('/ai/recommendations/rec-1/reject', {
      body: { reason: 'too much' },
      idempotencyKey: 'key-1',
    });
  });
  test('a finished suggestion shows no action buttons; read-only users see none either', async () => {
    route({ '/ai/actions/rec-1': action(rec({ status: 'OUTCOME_PENDING', domainRef: 'd-1' })) });
    await render(<RecommendationScreen />, { wrapper });
    await screen.findByText('A draft has been made.');
    expect(screen.queryByLabelText('Approve')).toBeNull();
    expect(screen.queryByLabelText('Reject')).toBeNull();
  });
  test('read-only role: Check only', async () => {
    mockMe = { userId: 'u', roles: [], permissions: ['ai.recommendation.view'] };
    route({ '/ai/actions/rec-1': action() });
    await render(<RecommendationScreen />, { wrapper });
    await screen.findByLabelText('Check first');
    expect(screen.queryByLabelText('Approve')).toBeNull();
    expect(screen.queryByLabelText('Reject')).toBeNull();
  });
});

const ex = (over: Record<string, unknown> = {}) => ({
  skuId: 's1',
  skuName: 'Pesticide X',
  batchId: 'bt1',
  batchNo: 'B-77',
  branchId: 'b1',
  expiryDate: '2027-01-10',
  daysLeft: 58,
  qty: 40,
  expectedSold: 10,
  atRiskQty: 30,
  atRiskValue: 9000,
  severity: 'HIGH',
  action: 'DISCOUNT',
  discountPct: 15,
  note: 'Sell fast',
  currentPrice: '400.00',
  discountedPrice: '340.00',
  marginPct: 22,
  locked: false,
  transfer: { toBranchId: 'b2', toBranchName: 'Yard', quantity: 12, note: '' },
  returnNote: null,
  purchaseReturn: { billNumber: 'PB-1', supplierName: 'Kisan Agro', quantity: '10' },
  ...over,
});
const plan = (items = [ex()], costKnown = true) => ({
  asOf: '2026-11-13',
  items,
  floorMarginPct: 10,
  costKnown,
  assumptions: ['A discount is drafted as a price list'],
});

describe('expiry screen', () => {
  test('shows risk, discount with the two prices, transfer and return options', async () => {
    route({ '/branches': BR, '/ai/stock/expiry-plan': plan() });
    await render(<ExpiryScreen />, { wrapper });
    await screen.findByText('Pesticide X · B-77');
    expect(screen.getByText('likely unsold: 30 · high risk')).toBeTruthy();
    expect(screen.getByText(/Suggested discount 15% \(400.00 → 340.00\)/)).toBeTruthy();
    expect(screen.getByText('Another branch can sell it: Yard, 12 units')).toBeTruthy();
    expect(screen.getByText('Can be returned: 10 units to Kisan Agro')).toBeTruthy();
    expect(mockGet.mock.calls.find((c) => c[0] === '/ai/stock/expiry-plan')![1].query).toEqual({
      branch: undefined,
      withinDays: 60,
    });
  });
  test('proposing a discount posts batch and branch with a key, only once, then opens the list', async () => {
    route({ '/branches': BR, '/ai/stock/expiry-plan': plan() });
    mockPost.mockResolvedValue({});
    await render(<ExpiryScreen />, { wrapper });
    await fireEvent.press(await screen.findByLabelText('Suggest discount'));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/ai-recommendations'));
    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(mockPost).toHaveBeenCalledWith('/ai/recommendations/expiry-discount', {
      body: { batch: 'bt1', branch: 'b1' },
      idempotencyKey: 'key-1',
    });
  });
  test('a fixed-price product gets no discount button; unknown cost warns and hides it', async () => {
    route({ '/branches': BR, '/ai/stock/expiry-plan': plan([ex({ locked: true })]) });
    await render(<ExpiryScreen />, { wrapper });
    await screen.findByText('Fixed-price product: no discount allowed.');
    expect(screen.queryByLabelText('Suggest discount')).toBeNull();
  });
  test('without cost visibility: warning and no discount button', async () => {
    route({ '/branches': BR, '/ai/stock/expiry-plan': plan([ex()], false) });
    await render(<ExpiryScreen />, { wrapper });
    await screen.findByText('You cannot see stock cost, so discounts cannot be checked against it.');
    expect(screen.queryByLabelText('Suggest discount')).toBeNull();
    expect(screen.getByLabelText('Suggest move')).toBeTruthy();
  });
  test('empty plan', async () => {
    route({ '/branches': BR, '/ai/stock/expiry-plan': plan([]) });
    await render(<ExpiryScreen />, { wrapper });
    await screen.findByText('No stock is at risk in this period.');
  });
});

describe('supplier prices screen', () => {
  test('lists suppliers with flagged share; says when there is not enough data', async () => {
    route({
      '/ai/anomalies/suppliers': {
        state: 'OK',
        reason: null,
        judgedLines: 120,
        skippedLines: 4,
        days: 365,
        items: [
          {
            supplierId: 'sp1',
            supplierName: 'Kisan Agro',
            lines: 20,
            flagged: 5,
            flaggedShare: 0.25,
            avgDeviationPct: 8.4,
            products: 6,
          },
        ],
      },
    });
    await render(<SupplierPricesScreen />, { wrapper });
    await screen.findByText('Kisan Agro');
    expect(screen.getByText('5 of 20 lines higher than usual (25%)')).toBeTruthy();
    expect(screen.getByText('120 bill lines checked, 4 skipped')).toBeTruthy();
    expect(mockGet.mock.calls[0][1].query).toEqual({ days: 365 });
  });
  test('insufficient data keeps its reason', async () => {
    route({
      '/ai/anomalies/suppliers': {
        state: 'INSUFFICIENT_DATA',
        reason: 'fewer than 30 bill lines',
        judgedLines: 0,
        skippedLines: 0,
        items: [],
        days: 365,
      },
    });
    await render(<SupplierPricesScreen />, { wrapper });
    await screen.findByText('Not enough data: fewer than 30 bill lines');
  });
});

describe('budget scenario screen', () => {
  const result = {
    limit: { budget: 50000, cashHeadroom: null, applied: 50000, bindingLimit: 'BUDGET' },
    wanted: 80000,
    funded: 48000,
    remaining: 2000,
    lines: [
      {
        recommendationId: 'r1',
        skuId: 's1',
        skuName: 'Urea 50kg',
        wantedQty: 100,
        fundedQty: 80,
        unitCost: 600,
        cost: 48000,
        marginPct: 12,
        daysOfCover: 3,
        status: 'PARTIAL',
        risk: 'HIGH',
        riskNote: 'will run out before an order arrives',
      },
    ],
    notFunded: [],
    assumptions: ['No draft is made'],
    writes: 'NONE',
  };
  test('checks the inputs first, then runs once with numbers, one key per distinct question', async () => {
    mockPost.mockResolvedValue(result);
    await render(<ScenarioScreen />, { wrapper });
    await fireEvent.press(screen.getByLabelText('Run'));
    await screen.findByText('Give a budget, or choose to limit by cash.');
    expect(mockPost).not.toHaveBeenCalled();
    await fireEvent.changeText(
      screen.getByLabelText('Budget in rupees (leave blank to use cash only)'),
      '50000',
    );
    await fireEvent.press(screen.getByLabelText('Run'));
    await screen.findByText('Covered ₹48,000 of ₹80,000');
    expect(mockPost).toHaveBeenCalledWith('/ai/scenarios/budget', {
      body: { budget: 50000 },
      idempotencyKey: 'key-1',
    });
    expect(screen.getByText('will run out before an order arrives')).toBeTruthy();
    expect(screen.getByText('This is a trial only. Nothing was ordered.')).toBeTruthy();
  });
  test('a bad budget is not sent', async () => {
    await render(<ScenarioScreen />, { wrapper });
    await fireEvent.changeText(
      screen.getByLabelText('Budget in rupees (leave blank to use cash only)'),
      '10.123',
    );
    await fireEvent.press(screen.getByLabelText('Run'));
    await screen.findByText('Enter an amount above 0 with up to 2 decimals.');
    expect(mockPost).not.toHaveBeenCalled();
  });
  test('cash-only limit sends useCash', async () => {
    mockPost.mockResolvedValue(result);
    await render(<ScenarioScreen />, { wrapper });
    await fireEvent.press(screen.getByText('Yes'));
    await fireEvent.press(screen.getByLabelText('Run'));
    await screen.findByText(/Covered/);
    expect(mockPost.mock.calls[0][1].body).toEqual({ useCash: true });
  });
  test('Hindi and Marathi texts exist for the new screens', async () => {
    for (const lg of ['hi', 'mr'] as const) {
      await setLanguage(lg);
      for (const key of [
        'nav.aiForecast',
        'ai.fc.title',
        'ai.ro.title',
        'ai.rec.title',
        'ai.ex.title',
        'ai.sp.title',
        'ai.sc.title',
        'ai.se.title',
      ]) {
        expect(i18n.exists(key)).toBe(true);
        expect(i18n.t(key)).not.toBe(i18n.getFixedT('en')(key));
      }
    }
  });
});

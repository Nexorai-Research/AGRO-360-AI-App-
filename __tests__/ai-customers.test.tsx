import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import parts from '../i18n-parts/ai.json';
import { i18n, setLanguage } from '../src/i18n';
import CustomersAiScreen from '../src/features/ai/CustomersAiScreen';
import CashFlowScreen from '../src/features/ai/CashFlowScreen';
import PricingAdviceScreen from '../src/features/ai/PricingAdviceScreen';
import MarketingScreen from '../src/features/ai/MarketingScreen';

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
  useRouter: () => ({ push: (...a: unknown[]) => mockPush(...a) }),
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
const BR = { items: [{ id: 'b1', name: 'Main' }] };
const CID = '11111111-1111-4111-8111-111111111111';

describe('customer insights', () => {
  const credit = {
    items: [
      {
        customerId: CID,
        label: 'Ramesh (Sonai)',
        state: 'OK',
        score: 72,
        band: 'HIGH',
        reason: null,
        factors: [{ name: 'pays late', points: 30, detail: 'pays 25 days after the due date on average' }],
      },
      {
        customerId: 'c2',
        label: 'New buyer',
        state: 'INSUFFICIENT_DATA',
        score: null,
        band: null,
        factors: [],
        reason: 'no credit history yet',
      },
    ],
  };
  test('credit risk: band, score and the reasons; a customer with no history is not scored', async () => {
    route({ '/ai/customers/credit-risk': credit });
    await render(<CustomersAiScreen />, { wrapper });
    await screen.findByText('Ramesh (Sonai)');
    expect(screen.getByText('High risk · score 72 of 100')).toBeTruthy();
    expect(screen.getByText('• pays 25 days after the due date on average (+30)')).toBeTruthy();
    expect(screen.getByText('Not enough data: no credit history yet')).toBeTruthy();
    await fireEvent.press(screen.getAllByLabelText('Open')[0]!);
    expect(mockPush).toHaveBeenCalledWith(`/customers/${CID}`);
  });
  test('collection plan: order, overdue, best day, channel advice; blocked channel is a warning', async () => {
    route({
      '/ai/customers/collection-plan': {
        items: [
          {
            rank: 1,
            customerId: CID,
            label: 'Ramesh',
            overdue: 45000,
            oldestOverdueDays: 80,
            priority: 99,
            why: '45000 overdue, oldest 80 days',
            followUp: { state: 'NONE', note: 'No follow-up task is open.' },
            bestDay: { state: 'OK', reason: null, weekday: 'Saturday', receipts: 6 },
            channel: { state: 'BLOCKED', channel: null, reason: 'prefers SMS but has withdrawn consent' },
            channelNote: null,
          },
        ],
      },
    });
    await render(<CustomersAiScreen />, { wrapper });
    await fireEvent.press(await screen.findByText('Who to call'));
    await screen.findByText('1. Ramesh');
    expect(screen.getByText('Overdue ₹45,000, oldest 80 days')).toBeTruthy();
    expect(screen.getByText('Usually pays on Saturday')).toBeTruthy();
    expect(screen.getByText('prefers SMS but has withdrawn consent')).toBeTruthy();
    expect(screen.getByText('No follow-up task is open.')).toBeTruthy();
  });
  test('stopped buying list; empty list says so', async () => {
    route({
      '/ai/customers/churn': {
        items: [
          {
            customerId: CID,
            label: 'Suresh',
            state: 'INACTIVE',
            reason: 'no purchase for 120 days',
            daysSincePurchase: 120,
            spendChangePct: -100,
          },
        ],
      },
    });
    await render(<CustomersAiScreen />, { wrapper });
    await fireEvent.press(await screen.findByText('Stopped buying'));
    await screen.findByText('Suresh');
    expect(screen.getByText('No purchase for 90+ days · no purchase for 120 days')).toBeTruthy();
    expect(screen.getByText('Spend change vs the 90 days before: -100%')).toBeTruthy();
  });
  test('each tab needs its own permission; nothing is read without it', async () => {
    mockMe = { userId: 'u', roles: [], permissions: ['ai.assistant.use', 'customer.view'] };
    await render(<CustomersAiScreen />, { wrapper });
    await screen.findByText('You do not have permission for this screen.');
    expect(mockGet).not.toHaveBeenCalled();
    route({ '/ai/customers/churn': { items: [] } });
    await fireEvent.press(screen.getByText('Stopped buying'));
    await screen.findByText('No customer looks inactive or at risk.');
  });
});

describe('cash outlook', () => {
  const out = {
    state: 'OK',
    reason: null,
    cashAndBank: 120000,
    firstProblemDays: 14,
    severity: 'MEDIUM',
    asOf: '2026-11-13',
    horizons: [
      { days: 7, inflow: 30000, outflow: 20000, projected: 130000, status: 'OK' },
      { days: 14, inflow: 50000, outflow: 190000, projected: -20000, status: 'SHORTFALL' },
    ],
    assumptions: ['Only receivables falling due are counted'],
    payroll: { included: false, reason: 'needs hr.salary.view' },
    tax: { included: true, reason: null },
  };
  test('shows cash now, the first problem, each horizon, and what is not included', async () => {
    route({ '/ai/cashflow/outlook': out });
    await render(<CashFlowScreen />, { wrapper });
    await screen.findByText('Cash and bank now: ₹1,20,000');
    expect(screen.getByText('Cash may run short within 14 days.')).toBeTruthy();
    expect(screen.getByText('In 14 days: ₹-20,000 · shortfall')).toBeTruthy();
    expect(screen.getByText('Payroll not included: needs hr.salary.view')).toBeTruthy();
    expect(screen.queryByText(/GST payment not included/)).toBeNull();
    expect(screen.getByText('A projection to help you plan. It does not move any money.')).toBeTruthy();
  });
  test('no cash account: the reason, never a zero', async () => {
    route({
      '/ai/cashflow/outlook': {
        ...out,
        state: 'INSUFFICIENT_DATA',
        reason: 'no cash or bank account is set up in the books',
        cashAndBank: null,
        horizons: [],
      },
    });
    await render(<CashFlowScreen />, { wrapper });
    await screen.findByText('Not enough data: no cash or bank account is set up in the books');
  });
  test('needs reports.financial and reports.receivables', async () => {
    mockMe = { userId: 'u', roles: [], permissions: ['ai.assistant.use', 'reports.financial'] };
    await render(<CashFlowScreen />, { wrapper });
    await screen.findByText('You do not have permission for this screen.');
    expect(mockGet).not.toHaveBeenCalled();
  });
});

describe('price advice', () => {
  const advice = {
    items: [
      {
        categoryId: null,
        category: 'Everyone (the default price)',
        price: '400.00',
        source: 'DEFAULT',
        suggestion: {
          state: 'OK',
          reason: 'SLOW_STOCK',
          note: 'Sales fell and stock is high',
          currentPrice: 400,
          suggestedPrice: 380,
          currentMarginPct: 25,
          suggestedMarginPct: 21,
          floorPrice: 350,
          mrp: 450,
          mustFix: false,
          assumptions: [],
        },
      },
      {
        categoryId: 'cat-1',
        category: 'Dealers',
        price: '380.00',
        source: 'CATEGORY_LIST',
        suggestion: {
          state: 'INSUFFICIENT_DATA',
          reason: null,
          note: 'No sales data',
          currentPrice: 380,
          suggestedPrice: null,
          currentMarginPct: null,
          suggestedMarginPct: null,
          floorPrice: null,
          mrp: null,
          mustFix: false,
          assumptions: [],
        },
      },
    ],
    assumptions: ["Demand signals are the branch's"],
  };
  async function pick() {
    await fireEvent.changeText(await screen.findByLabelText('Search product (2+ letters)'), 'ur');
    await fireEvent.press(await screen.findByLabelText('Urea 50kg'));
  }
  test('current price as a string, suggestion with margin; propose posts category and key once', async () => {
    route({
      '/branches': BR,
      '/products': { items: [{ id: 'p1', name: 'Urea 50kg' }] },
      '/ai/pricing/categories': advice,
    });
    mockPost.mockResolvedValue({});
    await render(<PricingAdviceScreen />, { wrapper });
    await pick();
    await screen.findByText('Everyone (the default price)');
    expect(screen.getByText('Price now: ₹400.00')).toBeTruthy();
    expect(screen.getByText('Suggested price ₹380 · margin 21%')).toBeTruthy();
    expect(screen.getAllByText('No change suggested.').length).toBe(1);
    await fireEvent.press(screen.getByLabelText('Suggest this price'));
    await screen.findByText('Saved as a suggestion for approval.');
    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(mockPost).toHaveBeenCalledWith('/ai/recommendations/price-revision', {
      body: { product: 'p1', branch: 'b1' },
      idempotencyKey: 'key-1',
    });
  });
  test('needs pricing.manage and inventory.value.view', async () => {
    mockMe = { userId: 'u', roles: [], permissions: ['ai.assistant.use', 'pricing.manage'] };
    await render(<PricingAdviceScreen />, { wrapper });
    await screen.findByText('You do not have permission for this screen.');
    expect(mockGet).not.toHaveBeenCalled();
  });
});

describe('message drafts', () => {
  const tpls = {
    languages: ['en', 'hi', 'mr'],
    channels: [
      { channel: 'SMS', limit: 160 },
      { channel: 'WHATSAPP', limit: 600 },
    ],
    sending: 'Sending is done in communications by another person.',
    templates: [
      { code: 'WIN_BACK', label: 'We have not seen you for a while', needs: [] },
      { code: 'PRICE_LISTED', label: 'A product at its price', needs: ['product', 'price'] },
    ],
  };
  const prev = {
    text: 'Shop: we miss you. Reply STOP to opt out.',
    template: 'WIN_BACK',
    language: 'en',
    channel: 'SMS',
    shop: 'Shop',
    product: null,
    price: null,
    length: 41,
    limit: 160,
    problems: [],
    polish: { state: 'NOT_ASKED', message: '' },
    notes: ['Shop name from settings'],
  };
  test('makes the text with a key; shows length and says nothing was sent', async () => {
    route({ '/ai/marketing/templates': tpls, '/branches': BR });
    mockPost.mockResolvedValue(prev);
    await render(<MarketingScreen />, { wrapper });
    await fireEvent.press(await screen.findByLabelText('Make the text'));
    await screen.findByText('Shop: we miss you. Reply STOP to opt out.');
    expect(screen.getByText('41 of 160 characters')).toBeTruthy();
    expect(screen.getByText('Nothing was sent or saved.')).toBeTruthy();
    expect(mockPost).toHaveBeenCalledWith('/ai/marketing/preview', {
      body: { template: 'WIN_BACK', language: 'en', channel: 'SMS', branch: 'b1' },
      idempotencyKey: 'key-1',
    });
  });
  test('a template that needs a product cannot be made until one is picked', async () => {
    route({
      '/ai/marketing/templates': tpls,
      '/branches': BR,
      '/products': { items: [{ id: 'p1', name: 'Urea 50kg' }] },
    });
    mockPost.mockResolvedValue({ ...prev, template: 'PRICE_LISTED' });
    await render(<MarketingScreen />, { wrapper });
    await fireEvent.press(await screen.findByText('A product at its price'));
    await screen.findByLabelText('Search product (2+ letters)');
    await fireEvent.press(screen.getByLabelText('Make the text'));
    expect(mockPost).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText('Search product (2+ letters)'), 'ur');
    await fireEvent.press(await screen.findByLabelText('Urea 50kg'));
    await fireEvent.press(screen.getByLabelText('Make the text'));
    await screen.findByText('Text made.');
    expect(mockPost.mock.calls[0][1].body).toMatchObject({ template: 'PRICE_LISTED', product: 'p1' });
  });
  test('rule problems warn the person not to use the text; denied without crm.greeting.manage', async () => {
    route({ '/ai/marketing/templates': tpls, '/branches': BR });
    mockPost.mockResolvedValue({ ...prev, problems: [{ rule: 'x' }] });
    await render(<MarketingScreen />, { wrapper });
    await fireEvent.press(await screen.findByLabelText('Make the text'));
    await screen.findByText('1 rule problem(s) in the text. Do not use it.');
  });
  test('denied without crm.greeting.manage', async () => {
    mockMe = { userId: 'u', roles: [], permissions: ['ai.assistant.use', 'customer.view'] };
    await render(<MarketingScreen />, { wrapper });
    await screen.findByText('You do not have permission for this screen.');
    expect(mockGet).not.toHaveBeenCalled();
  });
  test('Hindi and Marathi texts for group 3', async () => {
    for (const lg of ['hi', 'mr'] as const) {
      await setLanguage(lg);
      for (const key of ['nav.aiCustomers', 'ai.cu.title', 'ai.cf.title', 'ai.pa.title', 'ai.mk.title'])
        expect(i18n.t(key)).not.toBe(i18n.getFixedT('en')(key));
    }
  });
});

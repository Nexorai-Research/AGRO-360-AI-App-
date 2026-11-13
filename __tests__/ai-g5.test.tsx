import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import base from '../i18n-parts/ai.json';
import g5 from '../i18n-parts/ai-g5.json';
import { i18n, setLanguage } from '../src/i18n';
import ReportAskScreen from '../src/features/ai/ReportAskScreen';
import ReportDraftsScreen from '../src/features/ai/ReportDraftsScreen';
import StrategyScreen from '../src/features/ai/StrategyScreen';
import BranchCompareScreen from '../src/features/ai/BranchCompareScreen';
import ExpansionScreen, { parseForm } from '../src/features/ai/ExpansionScreen';

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockDelete = jest.fn();
let mockMe: { userId: string; roles: string[]; permissions?: string[] };
let mockId = 0;
jest.mock('../src/auth/AuthProvider', () => ({
  useAuth: () => ({
    status: 'signedIn',
    me: mockMe,
    client: {
      get: (...a: unknown[]) => mockGet(...a),
      post: (...a: unknown[]) => mockPost(...a),
      delete: (...a: unknown[]) => mockDelete(...a),
    },
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
  for (const lg of ['en', 'hi', 'mr'] as const) {
    i18n.addResourceBundle(lg, 'translation', (base as Record<string, object>)[lg], true, true);
    i18n.addResourceBundle(lg, 'translation', (g5 as Record<string, object>)[lg], true, true);
  }
});
beforeEach(async () => {
  [mockGet, mockPost, mockDelete].forEach((m) => m.mockReset());
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
const base0 = {
  plan: { report: 'sales', label: 'Sales', understood: ['sales, last month'] },
  followUp: false,
  message: null,
  options: [],
  ask: [],
  resolved: [],
  filters: {},
  memory: { m: 1 },
  table: null,
};

describe('ask a report', () => {
  test('question checked; answer shows summary and table; save sends the same body with its own key', async () => {
    mockPost
      .mockResolvedValueOnce({
        ...base0,
        state: 'ANSWERED',
        summary: { title: 'Sales, October', paragraphs: ['Sales were 1,20,000.'] },
        table: {
          groupBy: 'village',
          rows: [{ label: 'Sonai', value: 120000, sharePct: 100 }],
          truncated: false,
        },
      })
      .mockResolvedValueOnce({});
    await render(<ReportAskScreen />, { wrapper });
    await fireEvent.press(screen.getByLabelText('Get the report'));
    await screen.findByText('Write 3 to 500 characters.');
    expect(mockPost).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText('Your question'), 'sales last month by village');
    await fireEvent.press(screen.getByLabelText('Get the report'));
    await screen.findByText('Sales, October');
    expect(mockPost).toHaveBeenCalledWith('/ai/reports/run', {
      body: { question: 'sales last month by village' },
      idempotencyKey: 'key-1',
    });
    expect(screen.getByText('Sonai: ₹1,20,000 (100%)')).toBeTruthy();
    expect(screen.getByText('Understood: sales, last month')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Save as a draft'));
    await screen.findByText('Draft saved.');
    expect(mockPost).toHaveBeenLastCalledWith('/ai/reports/drafts', {
      body: { question: 'sales last month by village' },
      idempotencyKey: 'key-2',
    });
  });
  test('follow-up sends the earlier memory as previous', async () => {
    mockPost.mockResolvedValue({ ...base0, state: 'ANSWERED', summary: { title: 'T', paragraphs: ['p'] } });
    await render(<ReportAskScreen />, { wrapper });
    await fireEvent.changeText(screen.getByLabelText('Your question'), 'sales last month');
    await fireEvent.press(screen.getByLabelText('Get the report'));
    await screen.findByText('T');
    await fireEvent.changeText(screen.getByLabelText('Your question'), 'and by product');
    await fireEvent.press(screen.getByLabelText('Ask as a follow-up'));
    await screen.findByText('Done.');
    expect(mockPost.mock.calls[1][1].body).toEqual({ question: 'and by product', previous: { m: 1 } });
  });
  test('ambiguous name: candidates shown; choosing one re-runs with that id; nothing was run before', async () => {
    mockPost
      .mockResolvedValueOnce({
        ...base0,
        state: 'NEEDS_CLARIFICATION',
        summary: null,
        message: 'More than one customer matches "Ramesh". Which one do you mean?',
        ask: [
          {
            kind: 'customer',
            text: 'Ramesh',
            candidates: [
              { id: 'c1', label: 'Ramesh Patil', hint: 'Sonai' },
              { id: 'c2', label: 'Ramesh Shinde' },
            ],
          },
        ],
      })
      .mockResolvedValueOnce({
        ...base0,
        state: 'ANSWERED',
        summary: { title: 'Sales to Ramesh Patil', paragraphs: ['x'] },
      });
    await render(<ReportAskScreen />, { wrapper });
    await fireEvent.changeText(screen.getByLabelText('Your question'), 'sales to Ramesh');
    await fireEvent.press(screen.getByLabelText('Get the report'));
    await screen.findByText('More than one customer matches "Ramesh". Which one do you mean?');
    await fireEvent.press(screen.getByLabelText('Ramesh Patil (Sonai)'));
    await screen.findByText('Sales to Ramesh Patil');
    expect(mockPost.mock.calls[1][1].body).toEqual({
      question: 'sales to Ramesh',
      filters: { customerId: 'c1' },
    });
  });
  test('a report the role may not open comes back as a message, not numbers', async () => {
    mockPost.mockResolvedValue({
      ...base0,
      state: 'UNSUPPORTED',
      summary: null,
      message: 'Your role cannot open that report.',
    });
    await render(<ReportAskScreen />, { wrapper });
    await fireEvent.changeText(screen.getByLabelText('Your question'), 'profit this year');
    await fireEvent.press(screen.getByLabelText('Get the report'));
    await screen.findByText('Your role cannot open that report.');
  });
  test('saved drafts list', async () => {
    route({
      '/ai/reports/drafts': {
        items: [
          {
            id: 'd1',
            report: 'sales',
            title: 'Sales, October',
            currentVersion: 1,
            updatedAt: '2026-11-01T10:00:00Z',
            current: { source: 'TEMPLATE', paragraphs: ['Sales were 1,20,000.'] },
          },
        ],
      },
    });
    await render(<ReportDraftsScreen />, { wrapper });
    await screen.findByText('Sales, October');
    expect(screen.getByText('Version 1, 2026-11-01, TEMPLATE')).toBeTruthy();
  });
});

describe('strategy and health', () => {
  const st = (over = {}) => ({
    id: 's1',
    kind: 'MONTHLY',
    periodLabel: 'October 2026',
    payloadHash: 'h1',
    status: 'DRAFT',
    decisionNote: null,
    content: {
      notice: 'Draft for the owner.',
      findings: [
        { area: 'GROWTH', status: 'act', finding: 'Sales fell 10%.', action: 'Call top customers.' },
      ],
      targets: [
        { name: 'Sales target', value: 500000, unit: 'rupees', formula: 'last month plus half the growth' },
      ],
      roadmap: null,
      notAvailable: ['collections: no permission'],
    },
    ...over,
  });
  const health = {
    score: 72,
    band: 'WATCH',
    complete: false,
    asOf: '2026-11-13',
    components: [
      {
        key: 'COLLECTIONS',
        label: 'Collections',
        max: 20,
        points: 12,
        available: true,
        explanation: 'Efficiency 60%',
      },
      {
        key: 'DATA_QUALITY',
        label: 'Data quality',
        max: 15,
        points: null,
        available: false,
        explanation: 'No checks yet',
      },
    ],
  };
  test('shows health parts, findings, formula; approve sends the shown hash and a key', async () => {
    route({ '/branches': BR, '/ai/strategy': { items: [st()] }, '/ai/health-score': health });
    mockPost.mockResolvedValue({});
    await render(<StrategyScreen />, { wrapper });
    await screen.findByText('Shop health 72 of 100');
    expect(screen.getByText('Data quality: not measured. No checks yet')).toBeTruthy();
    await screen.findByText('Sales fell 10%.');
    expect(screen.getByText('last month plus half the growth')).toBeTruthy();
    expect(screen.getByText('Not read: collections: no permission')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Approve this draft'));
    await screen.findByText('Approved.');
    expect(mockPost).toHaveBeenCalledWith('/ai/strategy/s1/decide', {
      body: { decision: 'APPROVE', payloadHash: 'h1' },
      idempotencyKey: 'key-1',
    });
  });
  test('reject needs a reason first', async () => {
    route({ '/branches': BR, '/ai/strategy': { items: [st()] }, '/ai/health-score': health });
    mockPost.mockResolvedValue({});
    await render(<StrategyScreen />, { wrapper });
    await screen.findByText('Sales fell 10%.');
    await fireEvent.press(screen.getByLabelText('Reject'));
    expect(mockPost).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText('Note (needed to reject)'), 'numbers look wrong');
    await fireEvent.press(screen.getByLabelText('Reject'));
    await screen.findByText('Rejected.');
    expect(mockPost.mock.calls[0][1].body).toEqual({
      decision: 'REJECT',
      payloadHash: 'h1',
      note: 'numbers look wrong',
    });
  });
  test('a decided strategy has no buttons; generate sends kind and branch', async () => {
    route({
      '/branches': BR,
      '/ai/strategy': { items: [st({ status: 'APPROVED' })] },
      '/ai/health-score': health,
    });
    mockPost.mockResolvedValue({ state: 'OK', reason: null, strategy: st() });
    await render(<StrategyScreen />, { wrapper });
    await screen.findByText('Approved');
    expect(screen.queryByLabelText('Approve this draft')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Make quarterly roadmap'));
    await screen.findByText('Draft made.');
    expect(mockPost).toHaveBeenCalledWith('/ai/strategy/generate', {
      body: { kind: 'QUARTERLY', branch: 'b1' },
      idempotencyKey: 'key-1',
    });
  });
  test('needs reports.financial', async () => {
    mockMe = { userId: 'u', roles: [], permissions: ['ai.assistant.use'] };
    await render(<StrategyScreen />, { wrapper });
    await screen.findByText('You do not have permission for this screen.');
    expect(mockGet).not.toHaveBeenCalled();
  });
});

describe('branch comparison', () => {
  test('statuses, moves and cost; missing cost says so', async () => {
    route({
      '/products': { items: [{ id: 'p1', name: 'Urea 50kg' }] },
      '/ai/branches/transfer-plan': {
        state: 'OK',
        reason: null,
        asOf: 'x',
        costPerUnit: null,
        branches: [
          {
            branchId: 'b1',
            branchName: 'Main',
            onHand: 5,
            free: 5,
            dailyDemand: 2,
            coverDays: 2.5,
            status: 'SHORT',
          },
          {
            branchId: 'b2',
            branchName: 'Sonai',
            onHand: 90,
            free: 90,
            dailyDemand: 1,
            coverDays: 90,
            status: 'SURPLUS',
          },
        ],
        transfers: [
          {
            fromBranchId: 'b2',
            fromBranchName: 'Sonai',
            toBranchId: 'b1',
            toBranchName: 'Main',
            quantity: 30,
            reason: 'Main has 2.5 days of cover',
            cost: { perUnit: null, total: null },
          },
        ],
      },
    });
    await render(<BranchCompareScreen />, { wrapper });
    await fireEvent.changeText(await screen.findByLabelText('Search product (2+ letters)'), 'ur');
    await fireEvent.press(await screen.findByLabelText('Urea 50kg'));
    await screen.findByText('Move 30 from Sonai to Main');
    expect(screen.getByText('Short · free 5 · covers 2.5 days')).toBeTruthy();
    expect(screen.getByText('Cost not set (the owner sets a cost per unit).')).toBeTruthy();
  });
  test('needs inventory.view', async () => {
    mockMe = { userId: 'u', roles: [], permissions: ['ai.assistant.use'] };
    await render(<BranchCompareScreen />, { wrapper });
    await screen.findByText('You do not have permission for this screen.');
  });
});

describe('expansion what-if', () => {
  const ok = {
    investment: '500000',
    fixed: '40000',
    sales: '600000',
    ramp: '30,50,100',
    margin: '',
    wc: '30',
  };
  test('parseForm: checks each field, margin may be empty, ramp is a list', () => {
    expect(parseForm(ok)).toEqual({
      ok: true,
      v: {
        investment: 500000,
        monthlyFixedCost: 40000,
        matureMonthlySales: 600000,
        rampPct: [30, 50, 100],
        workingCapitalDays: 30,
      },
    });
    expect(parseForm({ ...ok, margin: '18.5' })).toMatchObject({ ok: true, v: { grossMarginPct: 18.5 } });
    expect(parseForm({ ...ok, investment: '5e5' })).toEqual({ ok: false, field: 'investment' });
    expect(parseForm({ ...ok, ramp: '30,abc' })).toEqual({ ok: false, field: 'ramp' });
    expect(parseForm({ ...ok, ramp: '200' })).toEqual({ ok: false, field: 'ramp' });
    expect(parseForm({ ...ok, wc: '400' })).toEqual({ ok: false, field: 'wc' });
  });
  test('runs, shows break-even, payback and "not within 24 months", saves with a name', async () => {
    route({ '/ai/expansion/scenarios': { items: [] } });
    const result = {
      label: 'A what-if, not a forecast',
      inputs: {},
      marginSource: 'ENTERED',
      fingerprint: 'exp-1',
      notes: ['Gross margin was entered by you.'],
      base: {
        breakEvenMonth: 5,
        paybackMonth: null,
        cumulativeCash24: -120000,
        peakFunding: 650000,
        totalSales: 1,
      },
      sensitivity: [
        {
          label: 'Sales 20% lower',
          direction: 'DOWN',
          breakEvenMonth: null,
          paybackMonth: null,
          cumulativeCash24: 0,
          peakFunding: 0,
          totalSales: 0,
        },
      ],
    };
    mockPost.mockResolvedValueOnce(result).mockResolvedValueOnce({ id: 'x1' });
    await render(<ExpansionScreen />, { wrapper });
    await fireEvent.press(screen.getByLabelText('Run what-if'));
    await screen.findAllByText('Check this value.');
    expect(mockPost).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText('Investment (₹)'), '500000');
    await fireEvent.changeText(screen.getByLabelText('Fixed cost per month (₹)'), '40000');
    await fireEvent.changeText(screen.getByLabelText('Sales per month once mature (₹)'), '600000');
    await fireEvent.changeText(
      screen.getByLabelText('Gross margin % (empty = your own last 12 months)'),
      '18',
    );
    await fireEvent.press(screen.getByLabelText('Run what-if'));
    await screen.findByText('Monthly break-even: month 5');
    expect(screen.getByText('Payback: not within 24 months')).toBeTruthy();
    expect(screen.getByText('A what-if, not a forecast')).toBeTruthy();
    expect(mockPost.mock.calls[0][1]).toEqual({
      body: {
        investment: 500000,
        monthlyFixedCost: 40000,
        matureMonthlySales: 600000,
        rampPct: [30, 50, 70, 100],
        workingCapitalDays: 30,
        grossMarginPct: 18,
      },
      idempotencyKey: 'key-1',
    });
    await fireEvent.changeText(screen.getByLabelText('Name to save'), 'Sonai shop');
    await fireEvent.press(screen.getByLabelText('Save this what-if'));
    await screen.findByText('Saved.');
    expect(mockPost.mock.calls[1][0]).toBe('/ai/expansion/scenarios');
    expect(mockPost.mock.calls[1][1].body.name).toBe('Sonai shop');
  });
  test('delete a saved what-if sends a key', async () => {
    route({
      '/ai/expansion/scenarios': {
        items: [{ id: 'x1', name: 'Sonai shop', inputs: {}, result: { base: { paybackMonth: 14 } } }],
      },
    });
    mockDelete.mockResolvedValue({});
    await render(<ExpansionScreen />, { wrapper });
    await screen.findByText('Sonai shop');
    expect(screen.getByText('Payback: month 14')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Delete'));
    await screen.findByText('Deleted.');
    expect(mockDelete).toHaveBeenCalledWith('/ai/expansion/scenarios/x1', { idempotencyKey: 'key-1' });
  });
  test('Hindi and Marathi texts exist for group 5', async () => {
    for (const lg of ['hi', 'mr'] as const) {
      await setLanguage(lg);
      for (const key of ['nav.aiReport', 'ai.rp.title', 'ai.st.title', 'ai.bc.title', 'ai.ex2.title'])
        expect(i18n.t(key)).not.toBe(i18n.getFixedT('en')(key));
    }
  });
});

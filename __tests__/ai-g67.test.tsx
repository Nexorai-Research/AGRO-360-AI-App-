import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import parts from '../i18n-parts/ai-g67.json';
import { i18n, setLanguage } from '../src/i18n';
import RiskRegisterScreen from '../src/features/ai/RiskRegisterScreen';
import RiskCaseScreen, { validDay, validReason } from '../src/features/ai/RiskCaseScreen';
import QualityScreen from '../src/features/ai/QualityScreen';
import GovernanceScreen from '../src/features/ai/GovernanceScreen';
import PoliciesScreen, { limitOf, ttlOf } from '../src/features/ai/PoliciesScreen';
import RecFollowUpScreen, { qtyOf } from '../src/features/ai/RecFollowUpScreen';
import AuditScreen from '../src/features/ai/AuditScreen';

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockPut = jest.fn();
const mockPush = jest.fn();
let mockMe: { userId: string; roles: string[]; permissions?: string[] };
let mockId = 0;
jest.mock('../src/auth/AuthProvider', () => ({
  useAuth: () => ({
    status: 'signedIn',
    me: mockMe,
    client: {
      get: (...a: unknown[]) => mockGet(...a),
      post: (...a: unknown[]) => mockPost(...a),
      put: (...a: unknown[]) => mockPut(...a),
    },
    signIn: jest.fn(),
    signOut: jest.fn(),
  }),
}));
jest.mock('../src/device', () => ({ newId: () => `key-${++mockId}` }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: (...a: unknown[]) => mockPush(...a) }),
  useLocalSearchParams: () => ({ id: 'r1' }),
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
  [mockGet, mockPost, mockPut, mockPush].forEach((m) => m.mockReset());
  mockId = 0;
  mockMe = { userId: 'u-1', roles: [], permissions: undefined };
  client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retryDelay: 0 } } });
  await setLanguage('en');
});
const route = (map: Record<string, unknown>) =>
  mockGet.mockImplementation((p: string) =>
    p in map ? Promise.resolve(map[p]) : Promise.reject(new Error(`unexpected GET ${p}`)),
  );
const RISK = {
  id: 'r1',
  kind: 'STOCKOUT',
  severity: 'HIGH',
  subjectRef: 's',
  branchId: null,
  title: 'Urea may run out',
  detail: { detail: '3 days of stock left' },
  status: 'OPEN',
  assignee: null,
  dueDate: null,
  resolutionNote: null,
  createdAt: '',
  updatedAt: '',
  version: 1,
};

describe('validators', () => {
  test('reason, day, limits, ttl, quantity', () => {
    expect(validReason('no')).toBe(false);
    expect(validReason('done it')).toBe(true);
    expect(validDay('2026-12-31')).toBe(true);
    expect(validDay('31-12-2026')).toBe(false);
    expect(limitOf('')).toBeNull();
    expect(limitOf('0')).toBeUndefined();
    expect(limitOf('12.5')).toBe(12.5);
    expect(limitOf('abc')).toBeUndefined();
    expect(ttlOf('15')).toBe(15);
    expect(ttlOf('16')).toBeUndefined();
    expect(qtyOf('')).toBeNull();
    expect(qtyOf('-1')).toBeUndefined();
  });
});

describe('risk register', () => {
  test('lists with counts; scan posts once with a key; tapping opens the case', async () => {
    route({ '/ai/risks': { summary: { open: { HIGH: 1, MEDIUM: 0, LOW: 2 }, total: 3 }, items: [RISK] } });
    mockPost.mockResolvedValue({ created: 1, refreshed: 0, found: 1 });
    await render(<RiskRegisterScreen />, { wrapper });
    await screen.findByText('Urea may run out');
    expect(screen.getByText('Open: 1 high, 0 medium, 2 low')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Scan now'));
    await screen.findByText('Scan done.');
    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(mockPost).toHaveBeenCalledWith('/ai/risks/scan', { body: {}, idempotencyKey: 'key-1' });
    await fireEvent.press(screen.getByLabelText('Urea may run out'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/ai-risk', params: { id: 'r1' } });
  });
  test('no scan button without ai.recommendation.decide; denied without view', async () => {
    mockMe = { userId: 'u', roles: [], permissions: ['ai.recommendation.view'] };
    route({ '/ai/risks': { summary: { open: {}, total: 0 }, items: [] } });
    await render(<RiskRegisterScreen />, { wrapper });
    await screen.findByText('No risks here.');
    expect(screen.queryByLabelText('Scan now')).toBeNull();
    mockMe = { userId: 'u2', roles: [], permissions: [] };
    await render(<RiskRegisterScreen />, { wrapper });
    await screen.findByText('You do not have permission for this screen.');
  });
});

describe('risk case', () => {
  beforeEach(() =>
    route({
      '/ai/risks/r1': {
        ...RISK,
        notes: [{ id: 'n1', actorId: 'a', note: 'called the supplier', createdAt: '2026-11-13T10:00:00Z' }],
      },
      '/ai/risks/r1/evidence': { items: [] },
    }),
  );
  test('timeline shown; closing needs a reason and sends it with a key', async () => {
    mockPost.mockResolvedValue({ ...RISK, status: 'RESOLVED' });
    await render(<RiskCaseScreen />, { wrapper });
    await screen.findByText(/called the supplier/);
    await fireEvent.press(screen.getByLabelText('Resolve'));
    await screen.findByText('Give a reason of 3 to 500 characters.');
    expect(mockPost).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText('Reason (3 to 500 characters)'), 'stock arrived');
    await fireEvent.press(screen.getByLabelText('Resolve'));
    await screen.findByText('Case updated.');
    expect(mockPost).toHaveBeenCalledWith('/ai/risks/r1/status', {
      body: { status: 'RESOLVED', note: 'stock arrived' },
      idempotencyKey: 'key-1',
    });
  });
  test('acknowledge needs no reason; a note is added', async () => {
    mockPost.mockResolvedValue({});
    await render(<RiskCaseScreen />, { wrapper });
    await fireEvent.press(await screen.findByLabelText('Acknowledge'));
    await screen.findByText('Case updated.');
    expect(mockPost.mock.calls[0][1].body).toEqual({ status: 'ACKNOWLEDGED' });
    await fireEvent.changeText(screen.getByLabelText('Note'), 'checking');
    await fireEvent.press(screen.getByLabelText('Add note'));
    await screen.findByText('Note added.');
    expect(mockPost).toHaveBeenLastCalledWith('/ai/risks/r1/notes', {
      body: { note: 'checking' },
      idempotencyKey: 'key-2',
    });
  });
  test('a closed case offers reopen only to governance, never actions', async () => {
    route({
      '/ai/risks/r1': { ...RISK, status: 'DISMISSED', resolutionNote: 'false alarm', notes: [] },
      '/ai/risks/r1/evidence': { items: [] },
    });
    mockMe = { userId: 'u', roles: [], permissions: ['ai.recommendation.view', 'ai.recommendation.decide'] };
    await render(<RiskCaseScreen />, { wrapper });
    await screen.findByText('Reason: false alarm');
    expect(screen.queryByLabelText('Resolve')).toBeNull();
    expect(screen.queryByLabelText('Reopen')).toBeNull();
  });
});

describe('data quality', () => {
  test('overall, per source and not-scanned list; needs inventory.view', async () => {
    route({
      '/ai/data-quality/dashboard': {
        overall: 72,
        note: 'Customers belong to the franchise.',
        notScanned: ['SUPPLIERS'],
        branches: [],
        sources: [
          {
            source: 'CUSTOMERS',
            state: 'OK',
            score: 60,
            band: 'FAIR',
            checked: 200,
            reason: null,
            issues: [{ label: 'missing village', count: 14 }],
          },
          {
            source: 'STOCK_HISTORY',
            state: 'INSUFFICIENT_DATA',
            score: null,
            band: null,
            checked: 0,
            reason: 'no sales history yet',
          },
        ],
      },
    });
    await render(<QualityScreen />, { wrapper });
    await screen.findByText('Overall 72 of 100');
    expect(screen.getByText('Customers: 60/100')).toBeTruthy();
    expect(screen.getByText('• missing village (14)')).toBeTruthy();
    expect(screen.getByText('Not enough data: no sales history yet')).toBeTruthy();
    expect(screen.getByText('Not scanned: SUPPLIERS')).toBeTruthy();
  });
  test('denied without inventory.view', async () => {
    mockMe = { userId: 'u', roles: [], permissions: ['ai.assistant.use'] };
    await render(<QualityScreen />, { wrapper });
    await screen.findByText('You do not have permission for this screen.');
    expect(mockGet).not.toHaveBeenCalled();
  });
});

describe('governance', () => {
  test('quota and evaluation counts; denied for others', async () => {
    route({
      '/ai/quota': {
        effectiveQuota: 1000,
        limitedBy: 'PLAN',
        franchiseQuota: 2000,
        planQuota: 1000,
        used: 120,
        remaining: 880,
        note: 'The lower applies.',
      },
      '/ai/evaluation/report': {
        generatedAt: '',
        days: 90,
        modelVersion: 'v1',
        accuracyTrend: [{ branchId: 'b', branch: 'Main', points: [1, 2] }],
        comparisons: [1],
        promotions: [],
        methodsInForce: [1, 2],
        driftCases: [1],
        usage: { used: 1, quota: 1, settings: { enabled: true, monthlyQuota: 1 } },
      },
    });
    await render(<GovernanceScreen />, { wrapper });
    await screen.findByText('Used 120 of 1000 AI calls this month');
    expect(screen.getByText('880 left')).toBeTruthy();
    await screen.findByText('1 method comparisons, 0 promotions, 1 drift cases, 2 methods in force');
    mockMe = { userId: 'x', roles: [], permissions: ['ai.assistant.use'] };
    await render(<GovernanceScreen />, { wrapper });
    await screen.findAllByText('You do not have permission for this screen.');
  });
});

describe('approval policy', () => {
  const pol = {
    action: 'REORDER',
    requireDistinctActor: false,
    ttlMinutes: 10,
    ownerAboveQty: 500,
    requireSecondApprover: false,
    secondApproverAbove: null,
    version: 3,
    isDefault: false,
  };
  test('save sends the version as If-Match and one key; a bad ttl is stopped', async () => {
    route({
      '/ai/policies': { items: [pol] },
      '/ai/action-settings': { reorderBudget: null, transferCostPerUnit: null, version: 1 },
    });
    mockPut.mockResolvedValue(pol);
    await render(<PoliciesScreen />, { wrapper });
    await fireEvent.changeText(await screen.findByLabelText('Approval valid for (1 to 15 minutes)'), '40');
    await fireEvent.press(screen.getAllByLabelText('Save')[0]!);
    await screen.findByText('Whole number from 1 to 15.');
    expect(mockPut).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText('Approval valid for (1 to 15 minutes)'), '5');
    await fireEvent.press(screen.getAllByLabelText('Save')[0]!);
    await screen.findByText('Saved.');
    expect(mockPut).toHaveBeenCalledTimes(1);
    expect(mockPut).toHaveBeenCalledWith('/ai/policies/REORDER', {
      body: {
        requireDistinctActor: false,
        requireSecondApprover: false,
        ttlMinutes: 5,
        ownerAboveQty: 500,
        secondApproverAbove: null,
      },
      version: 3,
      idempotencyKey: 'key-1',
    });
  });
  test('action limits save with their version', async () => {
    route({
      '/ai/policies': { items: [] },
      '/ai/action-settings': { reorderBudget: 50000, transferCostPerUnit: null, version: 7 },
    });
    mockPut.mockResolvedValue({});
    await render(<PoliciesScreen />, { wrapper });
    await fireEvent.changeText(
      await screen.findByLabelText('Transfer cost per unit (blank = not set)'),
      '2.5',
    );
    await fireEvent.press(screen.getByLabelText('Save'));
    await screen.findByText('Saved.');
    expect(mockPut).toHaveBeenCalledWith('/ai/action-settings', {
      body: { reorderBudget: 50000, transferCostPerUnit: 2.5 },
      version: 7,
      idempotencyKey: 'key-1',
    });
  });
});

describe('feedback and outcome', () => {
  test('feedback posts the verdict with a key; outcome shows the source', async () => {
    mockPost
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ receivedQty: 40, stockedOut: false, source: 'ENTERED_BY_REVIEWER' });
    await render(<RecFollowUpScreen />, { wrapper });
    await fireEvent.press(screen.getByText('Wrong'));
    await fireEvent.press(screen.getByLabelText('Send feedback'));
    await screen.findByText('Thank you. Feedback saved.');
    expect(mockPost).toHaveBeenCalledWith('/ai/recommendations/r1/feedback', {
      body: { verdict: 'WRONG' },
      idempotencyKey: 'key-1',
    });
    await fireEvent.changeText(screen.getByLabelText('Quantity received (optional)'), '40');
    await fireEvent.press(screen.getByLabelText('Measure now'));
    await screen.findByText('Received 40; ran out: no · entered by you');
    expect(mockPost).toHaveBeenLastCalledWith('/ai/recommendations/r1/outcome', {
      body: { receivedQty: 40 },
      idempotencyKey: 'key-2',
    });
  });
  test('outcome section is hidden without ai.recommendation.decide', async () => {
    mockMe = { userId: 'u', roles: [], permissions: ['ai.recommendation.view'] };
    await render(<RecFollowUpScreen />, { wrapper });
    expect(screen.queryByLabelText('Measure now')).toBeNull();
    expect(screen.getByLabelText('Send feedback')).toBeTruthy();
  });
});

describe('decision log', () => {
  test('summary and rows; denied without ai.audit.view', async () => {
    route({
      '/ai/audit/summary': { items: [{ tool: 'ai.forecast', model: 'naive-1', outcome: 'OK', calls: 12 }] },
      '/ai/audit': {
        items: [
          {
            id: 'l1',
            tool: 'ai.weather',
            outcome: 'DENIED',
            summary: 'no access',
            model_version: null,
            created_at: '2026-11-13T09:30:00Z',
          },
        ],
      },
    });
    await render(<AuditScreen />, { wrapper });
    await screen.findByText('ai.weather · DENIED');
    expect(screen.getByText('ai.forecast · naive-1 · OK: 12')).toBeTruthy();
    expect(screen.getByText('2026-11-13 09:30 · -')).toBeTruthy();
    mockMe = { userId: 'x', roles: [], permissions: ['ai.assistant.use'] };
    await render(<AuditScreen />, { wrapper });
    await screen.findAllByText('You do not have permission for this screen.');
  });
  test('Hindi and Marathi texts exist for group 6 and 7', async () => {
    for (const lg of ['hi', 'mr'] as const) {
      await setLanguage(lg);
      for (const key of [
        'nav.aiRisks',
        'ai.rk.title',
        'ai.dq.title',
        'ai.gv.title',
        'ai.po.title',
        'ai.fu.title',
        'ai.au.title',
      ])
        expect(i18n.t(key)).not.toBe(i18n.getFixedT('en')(key));
    }
  });
});

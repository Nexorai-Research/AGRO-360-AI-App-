import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '../src/api/errors';
import { i18n, setLanguage } from '../src/i18n';
import parts from '../i18n-parts/cus.json';
import EngagementScreen from '../src/features/customers/EngagementScreen';
import ComplaintInsightsScreen from '../src/features/customers/ComplaintInsightsScreen';

const mockGet = jest.fn();
const mockPost = jest.fn();
let mockMe: { userId: string; tenantId: string; roles: string[]; permissions?: string[] };
let mockId = 0;
const mockClient = { get: (...a: unknown[]) => mockGet(...a), post: (...a: unknown[]) => mockPost(...a) };
jest.mock('expo-router', () => ({ Stack: { Screen: () => null } }));
jest.mock('../src/auth/AuthProvider', () => ({
  useAuth: () => ({ status: 'signedIn', me: mockMe, client: mockClient }),
}));
jest.mock('../src/device', () => ({ newId: () => `key-${++mockId}` }));

let qc: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={qc}>{children}</QueryClientProvider>
);
const ALL = [
  'customer.view',
  'crm.loyalty.manage',
  'privacy.consent.manage',
  'crm.calendar.manage',
  'crm.greeting.manage',
  'customer.complaint.resolve',
];

beforeAll(() => {
  for (const l of ['en', 'hi', 'mr'] as const) i18n.addResourceBundle(l, 'translation', parts[l], true, true);
});
beforeEach(async () => {
  [mockGet, mockPost].forEach((m) => m.mockReset());
  mockId = 0;
  mockMe = { userId: 'u1', tenantId: 't1', roles: [], permissions: ALL };
  qc = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retryDelay: 0 } } });
  await setLanguage('en');
  mockGet.mockImplementation(async (path: string) => {
    if (path === '/crm/loyalty/tiers')
      return {
        items: [
          {
            id: 'l1',
            name: 'Silver',
            rank: 1,
            minSpend: '50000.0000',
            minInvoices: 5,
            discountPct: '2.00',
            benefits: 'Free delivery',
          },
        ],
      };
    if (path === '/crm/consent/purposes')
      return {
        items: [
          { code: 'PROMO', name: 'Offers', wordingVersion: 2, wording: { en: 'DRAFT text' } },
          { code: 'REMIND', name: 'Reminders', wordingVersion: null },
        ],
      };
    if (path === '/crm/consent/coverage')
      return {
        activeCustomers: 200,
        rows: [{ purpose: 'PROMO', channel: 'SMS', granted: 50, coveragePct: 25 }],
      };
    if (path === '/crm/events')
      return {
        items: [
          {
            id: 'e1',
            title: 'Pola',
            kind: 'FESTIVAL',
            startDate: '2026-12-01',
            endDate: null,
            source: 'Mandi',
          },
        ],
      };
    if (path === '/crm/greetings')
      return {
        items: [
          {
            id: 'g1',
            name: 'Diwali',
            occasion: 'DATE',
            month: 11,
            day: 8,
            channel: 'SMS',
            templateEn: 'Happy Diwali {name}',
          },
        ],
      };
    if (path === '/crm/messages')
      return {
        items: [
          {
            id: 'm1',
            createdAt: '2026-11-08T05:00:00Z',
            customerName: 'Ramesh',
            customerId: 'c1',
            channel: 'SMS',
            purpose: 'GREETING',
            status: 'QUEUED',
            suppressReason: null,
          },
        ],
        providerConfigured: false,
      };
    if (path === '/crm/complaints/trends')
      return {
        total: 12,
        open: 4,
        breached: 1,
        avgResolutionHours: 30,
        avgRating: null,
        byBatch: [{ batchNo: 'B-77', complaints: 3 }],
        byCategory: { PRODUCT_QUALITY: 5 },
        bySeverity: { HIGH: 2 },
      };
    return {};
  });
});

describe('loyalty tiers', () => {
  test('lists tiers with money and percent from strings', async () => {
    await render(<EngagementScreen />, { wrapper });
    expect(await screen.findByText('1. Silver')).toBeTruthy();
    expect(screen.getByText('Spend ₹50,000, 5 bills, 2.00% discount')).toBeTruthy();
  });
  test('add tier sends amounts as strings with one key', async () => {
    mockPost.mockResolvedValue({});
    await render(<EngagementScreen />, { wrapper });
    await screen.findByText('1. Silver');
    await fireEvent.press(screen.getByLabelText('Add a tier'));
    await fireEvent.changeText(screen.getByLabelText('Tier name'), 'Gold');
    await fireEvent.changeText(screen.getByLabelText('Rank (1 is lowest)'), '2');
    await fireEvent.changeText(screen.getByLabelText('Spend needed'), '100000.50');
    await fireEvent.changeText(screen.getByLabelText('Discount %'), '5');
    await fireEvent.press(screen.getAllByLabelText('Save')[0]!);
    await waitFor(() => expect(mockPost).toHaveBeenCalled());
    expect(mockPost.mock.calls[0]![0]).toBe('/crm/loyalty/tiers');
    expect(mockPost.mock.calls[0]![1].body).toEqual({
      name: 'Gold',
      rank: 2,
      minSpend: '100000.50',
      discountPct: '5',
    });
    expect(mockPost.mock.calls[0]![1].idempotencyKey).toBeTruthy();
  });
  test('a bad amount is stopped before any call', async () => {
    await render(<EngagementScreen />, { wrapper });
    await screen.findByText('1. Silver');
    await fireEvent.press(screen.getByLabelText('Add a tier'));
    await fireEvent.changeText(screen.getByLabelText('Tier name'), 'Gold');
    await fireEvent.changeText(screen.getByLabelText('Rank (1 is lowest)'), '2');
    await fireEvent.changeText(screen.getByLabelText('Spend needed'), '1,00,000');
    await fireEvent.press(screen.getAllByLabelText('Save')[0]!);
    expect(await screen.findByText('Enter an amount such as 5000 or 5000.50.')).toBeTruthy();
    expect(mockPost).not.toHaveBeenCalled();
  });
  test('recalculate posts once and shows the counts', async () => {
    mockPost.mockResolvedValue({ changed: 3, pointsAdded: 40 });
    await render(<EngagementScreen />, { wrapper });
    await screen.findByText('1. Silver');
    await fireEvent.press(screen.getByLabelText('Recalculate all tiers'));
    expect(await screen.findByText('3 customers changed tier, 40 purchase points added.')).toBeTruthy();
    expect(mockPost.mock.calls[0]![0]).toBe('/crm/loyalty/recompute');
  });
  test('without crm.loyalty.manage there are no write buttons', async () => {
    mockMe.permissions = ['customer.view'];
    await render(<EngagementScreen />, { wrapper });
    await screen.findByText('1. Silver');
    expect(screen.queryByLabelText('Add a tier')).toBeNull();
    expect(screen.queryByLabelText('Recalculate all tiers')).toBeNull();
    expect(screen.queryByLabelText('Greetings and messages')).toBeNull();
  });
});

describe('consent', () => {
  const go = async () => {
    await render(<EngagementScreen />, { wrapper });
    await screen.findByText('1. Silver');
    await fireEvent.press(screen.getByLabelText('Consent'));
    await screen.findByText('PROMO · Offers');
  };
  test('purposes with wording version and draft mark, and coverage', async () => {
    await go();
    expect(screen.getByText('Wording version 2 (draft)')).toBeTruthy();
    expect(screen.getByText('No wording yet')).toBeTruthy();
    expect(await screen.findByText('50 of 200 customers (25%)')).toBeTruthy();
  });
  test('a purpose code in small letters is refused; a good one is posted', async () => {
    mockPost.mockResolvedValue({});
    await go();
    await fireEvent.press(screen.getByLabelText('Add a purpose'));
    await fireEvent.changeText(screen.getByLabelText('Code (CAPITALS)'), 'offers');
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Offers');
    await fireEvent.press(screen.getAllByLabelText('Save')[0]!);
    expect(await screen.findByText(/Use capital letters/)).toBeTruthy();
    expect(mockPost).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText('Code (CAPITALS)'), 'OFFERS');
    await fireEvent.press(screen.getAllByLabelText('Save')[0]!);
    await waitFor(() => expect(mockPost).toHaveBeenCalled());
    expect(mockPost.mock.calls[0]![0]).toBe('/crm/consent/purposes');
    expect(mockPost.mock.calls[0]![1].body).toEqual({ code: 'OFFERS', name: 'Offers' });
  });
  test('new wording is posted for the purpose code', async () => {
    mockPost.mockResolvedValue({});
    await go();
    await fireEvent.press(screen.getAllByLabelText('New wording')[1]!);
    await fireEvent.changeText(screen.getByLabelText('English'), 'We will send you reminders.');
    await fireEvent.press(screen.getAllByLabelText('Save')[0]!);
    await waitFor(() => expect(mockPost).toHaveBeenCalled());
    expect(mockPost.mock.calls[0]![0]).toBe('/crm/consent/purposes/REMIND/wording');
    expect(mockPost.mock.calls[0]![1].body).toEqual({ en: 'We will send you reminders.' });
  });
});

describe('calendar', () => {
  test('lists events from today and adds one with a checked date', async () => {
    mockPost.mockResolvedValue({});
    await render(<EngagementScreen />, { wrapper });
    await screen.findByText('1. Silver');
    await fireEvent.press(screen.getByLabelText('Farming calendar'));
    expect(await screen.findByText('Pola')).toBeTruthy();
    expect(mockGet.mock.calls.find((c) => c[0] === '/crm/events')![1].query.from).toMatch(
      /^\d{4}-\d{2}-\d{2}$/,
    );
    await fireEvent.press(screen.getByLabelText('Add an event'));
    await fireEvent.changeText(screen.getByLabelText('Title'), 'Cotton mela');
    await fireEvent.changeText(screen.getByLabelText('Starts (YYYY-MM-DD)'), '2026-13-01');
    await fireEvent.press(screen.getAllByLabelText('Save')[0]!);
    expect(await screen.findByText('Enter a valid date as YYYY-MM-DD.')).toBeTruthy();
    expect(mockPost).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText('Starts (YYYY-MM-DD)'), '2026-12-05');
    await fireEvent.press(screen.getByLabelText('Fair (mela)'));
    await fireEvent.press(screen.getAllByLabelText('Save')[0]!);
    await waitFor(() => expect(mockPost).toHaveBeenCalled());
    expect(mockPost.mock.calls[0]![1].body).toEqual({
      title: 'Cotton mela',
      kind: 'MELA',
      startDate: '2026-12-05',
    });
  });
});

describe('greetings and messages', () => {
  const go = async () => {
    await render(<EngagementScreen />, { wrapper });
    await screen.findByText('1. Silver');
    await fireEvent.press(screen.getByLabelText('Greetings and messages'));
    await screen.findByText('Diwali');
  };
  test('rules and recent messages are listed with their status', async () => {
    await go();
    expect(screen.getByText('8/11')).toBeTruthy();
    expect(await screen.findByText('Ramesh')).toBeTruthy();
    expect(screen.getByText('QUEUED')).toBeTruthy();
  });
  test('add greeting on a date needs month and day, then posts numbers', async () => {
    mockPost.mockResolvedValue({});
    await go();
    await fireEvent.press(screen.getByLabelText('Add a greeting'));
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Pola');
    await fireEvent.press(screen.getByLabelText('On a date every year'));
    await fireEvent.press(screen.getByLabelText('SMS'));
    await fireEvent.changeText(screen.getByLabelText(/^Message/), 'Happy Pola {name}');
    await fireEvent.press(screen.getAllByLabelText('Save')[0]!);
    expect(await screen.findByText('Month is 1 to 12.')).toBeTruthy();
    expect(mockPost).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText('Month (for a date)'), '9');
    await fireEvent.changeText(screen.getByLabelText('Day (for a date)'), '2');
    await fireEvent.press(screen.getAllByLabelText('Save')[0]!);
    await waitFor(() => expect(mockPost).toHaveBeenCalled());
    expect(mockPost.mock.calls[0]![0]).toBe('/crm/greetings');
    expect(mockPost.mock.calls[0]![1].body).toEqual({
      name: 'Pola',
      occasion: 'DATE',
      month: 9,
      day: 2,
      channel: 'SMS',
      templateEn: 'Happy Pola {name}',
    });
  });
  test('run now says nothing is sent when no provider is connected', async () => {
    mockPost.mockResolvedValue({ greetings: { queued: 2 }, providerConfigured: false });
    await go();
    await fireEvent.press(screen.getByLabelText('Run now'));
    expect(await screen.findByText(/2 greetings queued\. No provider is connected/)).toBeTruthy();
    expect(mockPost.mock.calls[0]![0]).toBe('/crm/comms/process');
  });
});

describe('states', () => {
  test('error shows the reference code', async () => {
    mockGet.mockRejectedValue(new ApiError(500, { title: 'BOOM', correlationId: 'corr-9' }));
    await render(<EngagementScreen />, { wrapper });
    expect(await screen.findByText(/corr-9/)).toBeTruthy();
  });
  test('offline shows the offline text', async () => {
    mockGet.mockRejectedValue(new ApiError(0, null));
    await render(<EngagementScreen />, { wrapper });
    expect(await screen.findByText('No network. Check your connection and try again.')).toBeTruthy();
  });
  test('empty list in Hindi', async () => {
    mockGet.mockResolvedValue({ items: [] });
    await setLanguage('hi');
    await render(<EngagementScreen />, { wrapper });
    expect(await screen.findByText('अभी कोई स्तर नहीं।')).toBeTruthy();
  });
  test('a 403 shows permission denied', async () => {
    mockGet.mockRejectedValue(new ApiError(403, { title: 'FORBIDDEN' }));
    await render(<EngagementScreen />, { wrapper });
    expect(await screen.findByText('You do not have permission to see this.')).toBeTruthy();
  });
  test('no permission: no call', async () => {
    mockMe.permissions = ['sales.pos.use'];
    await render(<EngagementScreen />, { wrapper });
    expect(await screen.findByText('You do not have permission to see this.')).toBeTruthy();
    expect(mockGet).not.toHaveBeenCalled();
  });
});

describe('complaint trends', () => {
  test('summary and groupings', async () => {
    await render(<ComplaintInsightsScreen />, { wrapper });
    expect(await screen.findByText('12 complaints, 4 open, 1 past their due date')).toBeTruthy();
    expect(screen.getByText('Average 30 hours to resolve')).toBeTruthy();
    expect(screen.getByText('B-77')).toBeTruthy();
    expect(screen.getByText('product quality')).toBeTruthy();
    expect(screen.getByText('high')).toBeTruthy();
  });
  test('late check posts once and shows how many were escalated', async () => {
    mockPost.mockResolvedValue({ escalated: 2 });
    await render(<ComplaintInsightsScreen />, { wrapper });
    await screen.findByText('B-77');
    await fireEvent.press(screen.getByLabelText('Check for late complaints'));
    expect(await screen.findByText('2 complaints escalated.')).toBeTruthy();
    expect(mockPost.mock.calls[0]![0]).toBe('/crm/complaints/sla-sweep');
    expect(mockPost.mock.calls[0]![1].idempotencyKey).toBeTruthy();
  });
  test('needs customer.complaint.resolve', async () => {
    mockMe.permissions = ['customer.view'];
    await render(<ComplaintInsightsScreen />, { wrapper });
    expect(await screen.findByText('You do not have permission to see this.')).toBeTruthy();
    expect(mockGet).not.toHaveBeenCalled();
  });
});

import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import parts from '../i18n-parts/wp5.json';
import { i18n, setLanguage } from '../src/i18n';
import {
  AiInbox,
  AiSettingsCard,
  AliasesCard,
  AskReorder,
  CropFactors,
  WeatherSetup,
  aiSettingsBody,
  aiSettingsErrors,
  factorBody,
  factorErrors,
  validLatLng,
} from '../src/features/ai/Parity5';

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockPut = jest.fn();
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
      put: (...a: unknown[]) => mockPut(...a),
      delete: (...a: unknown[]) => mockDelete(...a),
    },
  }),
}));
jest.mock('../src/device', () => ({ newId: () => `key-${++mockId}` }));

let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);
beforeAll(() => {
  for (const lg of ['en', 'hi', 'mr'] as const)
    i18n.addResourceBundle(lg, 'translation', (parts as Record<string, object>)[lg], true, true);
});
beforeEach(async () => {
  [mockGet, mockPost, mockPut, mockDelete].forEach((m) => m.mockReset());
  mockId = 0;
  mockMe = { userId: 'u-1', roles: [], permissions: undefined };
  client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retryDelay: 0 } } });
  await setLanguage('en');
});
const route = (map: Record<string, unknown>) =>
  mockGet.mockImplementation((p: string) =>
    p in map ? Promise.resolve(map[p]) : Promise.reject(new Error(`GET ${p}`)),
  );

describe('logic', () => {
  test('AI settings: blanks become null, hours in range', () => {
    const f = {
      enabled: true,
      monthlyQuota: '2000',
      minMarginPct: '',
      minCashBuffer: '50000',
      openHour: '8',
      closeHour: '',
    };
    expect(aiSettingsErrors(f)).toEqual([]);
    expect(aiSettingsBody(f)).toEqual({
      enabled: true,
      monthlyQuota: 2000,
      minMarginPct: null,
      minCashBuffer: 50000,
      openHour: 8,
      closeHour: null,
    });
    expect(
      aiSettingsErrors({ ...f, monthlyQuota: 'x', minMarginPct: '120', openHour: '24', closeHour: '0' }),
    ).toEqual(['quota', 'margin', 'open', 'close']);
  });
  test('weather point and requirement factor', () => {
    expect(validLatLng('18.15', '74.57')).toBe(true);
    expect(validLatLng('95', '74')).toBe(false);
    const f = {
      crop: 'Cotton',
      skuId: 's1',
      skuName: 'Urea',
      stage: 'Vegetative',
      fromDas: '20',
      toDas: '45',
      unitsPerAcre: '1.5',
    };
    expect(factorErrors(f)).toEqual([]);
    expect(factorBody(f)).toEqual({
      crop: 'Cotton',
      skuId: 's1',
      stage: 'Vegetative',
      fromDas: 20,
      toDas: 45,
      unitsPerAcre: 1.5,
    });
    expect(factorErrors({ ...f, skuId: '', fromDas: '50', unitsPerAcre: '0' })).toEqual([
      'product',
      'days',
      'units',
    ]);
  });
});

describe('screens', () => {
  test('inbox: mark one and all read', async () => {
    route({
      '/ai/inbox': {
        unread: 1,
        items: [
          {
            id: 'n1',
            severity: 'WARN',
            title: 'Urea running out',
            body: 'Baramati: 3 days left',
            createdAt: '2026-11-18T06:00:00Z',
            read: false,
          },
        ],
      },
    });
    mockPost.mockResolvedValue({});
    await render(<AiInbox />, { wrapper });
    expect(await screen.findByText('AI inbox (1 unread)')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Mark read Urea running out'));
    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith(
        '/ai/inbox/n1/read',
        expect.objectContaining({ idempotencyKey: expect.any(String) }),
      ),
    );
    await fireEvent.press(screen.getByText('Mark all read'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/ai/inbox/read-all', expect.anything()));
  });
  test('inbox hidden without ai.assistant.use', async () => {
    mockMe = { userId: 'u-1', roles: [], permissions: ['customer.view'] };
    await render(<AiInbox />, { wrapper });
    expect(mockGet).not.toHaveBeenCalled();
  });
  test('AI settings saved with PUT and the version; owners only', async () => {
    route({
      '/ai/settings': {
        enabled: true,
        monthlyQuota: 1000,
        minMarginPct: null,
        minCashBuffer: null,
        openHour: null,
        closeHour: null,
        version: 3,
      },
    });
    mockPut.mockResolvedValue({});
    await render(<AiSettingsCard />, { wrapper });
    await fireEvent.press(await screen.findByText('Change'));
    await fireEvent.changeText(screen.getByLabelText('Calls allowed per month'), '1500');
    await fireEvent.press(screen.getByLabelText('AI is switched on (off is the kill switch)'));
    await fireEvent.press(screen.getByText('Save AI settings'));
    await waitFor(() => expect(mockPut).toHaveBeenCalledTimes(1));
    expect(mockPut.mock.calls[0][0]).toBe('/ai/settings');
    expect(mockPut.mock.calls[0][1].version).toBe(3);
    expect(mockPut.mock.calls[0][1].body).toMatchObject({ enabled: false, monthlyQuota: 1500 });
  });
  test('aliases: add one and switch it off with its version', async () => {
    route({
      '/ai/search/aliases': {
        items: [
          {
            id: 'a1',
            term: 'yuriya',
            canonical: 'urea',
            kind: 'OTHER',
            active: true,
            source: 'FRANCHISE',
            version: 2,
          },
          {
            id: 'd1',
            term: 'kapas',
            canonical: 'cotton',
            kind: 'CROP',
            active: true,
            source: 'DEFAULT',
            version: 1,
          },
        ],
      },
    });
    mockPost.mockResolvedValue({});
    await render(<AliasesCard />, { wrapper });
    expect(await screen.findByText(/1 common farm words are built in. 1 added/)).toBeTruthy();
    await fireEvent.press(screen.getByText('Add an alias'));
    await fireEvent.changeText(screen.getByLabelText('Word farmers use (any script)'), 'डीएपी');
    await fireEvent.changeText(screen.getByLabelText('Word in your catalogue'), 'DAP');
    await fireEvent.press(screen.getByLabelText('product type'));
    await fireEvent.press(screen.getByText('Save alias'));
    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith(
        '/ai/search/aliases',
        expect.objectContaining({ body: { term: 'डीएपी', canonical: 'DAP', kind: 'PRODUCT_TYPE' } }),
      ),
    );
    await fireEvent.press(await screen.findByLabelText('Switch off yuriya'));
    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith(
        '/ai/search/aliases/a1/active',
        expect.objectContaining({ body: { active: false, expectedVersion: 2 } }),
      ),
    );
  });
  test('weather: set a branch location; change a rule with its version', async () => {
    route({
      '/branches': { items: [{ id: 'b1', name: 'Baramati' }] },
      '/ai/weather/locations': { items: [] },
      '/ai/weather/rules': {
        items: [
          {
            code: 'HEAVY_RAIN',
            label: 'Heavy rain',
            unit: 'mm',
            direction: 'ABOVE',
            threshold: 50,
            defaultThreshold: 50,
            enabled: true,
            version: 4,
          },
        ],
      },
    });
    mockPut.mockResolvedValue({});
    await render(<WeatherSetup />, { wrapper });
    await fireEvent.press(await screen.findByLabelText('Set location Baramati'));
    await fireEvent.changeText(screen.getByLabelText('Latitude'), '18.15');
    await fireEvent.changeText(screen.getByLabelText('Longitude'), '74.57');
    await fireEvent.press(screen.getByText('Save location'));
    await waitFor(() =>
      expect(mockPut).toHaveBeenCalledWith(
        '/ai/weather/locations/b1',
        expect.objectContaining({ body: { name: 'Baramati', latitude: 18.15, longitude: 74.57 } }),
      ),
    );
    await fireEvent.press(await screen.findByLabelText('Change Heavy rain'));
    await fireEvent.changeText(screen.getByLabelText('Alert threshold'), '65');
    await fireEvent.press(screen.getByText('Save rule'));
    await waitFor(() =>
      expect(mockPut).toHaveBeenCalledWith(
        '/ai/weather/rules/HEAVY_RAIN',
        expect.objectContaining({ body: { threshold: 65, enabled: true, expectedVersion: 4 } }),
      ),
    );
  });
  test('ask what to reorder: no recommendation is made when the AI says there is not enough data', async () => {
    mockGet.mockImplementation((p: string) =>
      Promise.resolve(
        p === '/branches'
          ? { items: [{ id: 'b1', name: 'Baramati' }] }
          : { items: [{ id: 'p1', name: 'Urea 45kg' }] },
      ),
    );
    mockPost.mockResolvedValueOnce({ state: 'INSUFFICIENT_DATA', reason: 'Only 2 weeks of sales.' });
    await render(<AskReorder />, { wrapper });
    expect(mockGet).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText('▸ Ask the AI what to reorder'));
    await fireEvent.changeText(screen.getByLabelText('Product'), 'ure');
    await fireEvent.press(await screen.findByText('Urea 45kg'));
    await fireEvent.press(screen.getByText('Look at it'));
    expect(await screen.findByText('Only 2 weeks of sales.')).toBeTruthy();
    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(mockPost.mock.calls[0][0]).toBe('/ai/forecast/stockout');
    mockPost
      .mockResolvedValueOnce({ state: 'RECOMMEND', forecast: { quantity: '40' } })
      .mockResolvedValueOnce({});
    await fireEvent.press(screen.getByText('Look at it'));
    expect(await screen.findByText('Recommendation made: buy 40.')).toBeTruthy();
    expect(mockPost.mock.calls[2][0]).toBe('/ai/recommendations/reorder');
    expect(mockPost.mock.calls[2][1].body).toEqual({ product: 'p1', branch: 'b1' });
  });
  test('requirement factors: change with expectedVersion, remove', async () => {
    route({
      '/ai/crops/factors': {
        items: [
          {
            id: 'f1',
            crop: 'Cotton',
            skuId: 's1',
            product: 'Urea',
            stage: 'Vegetative',
            fromDas: 20,
            toDas: 45,
            unitsPerAcre: '1.5',
            version: 7,
          },
        ],
      },
    });
    mockPut.mockResolvedValue({});
    mockDelete.mockResolvedValue(null);
    await render(<CropFactors />, { wrapper });
    await fireEvent.press(await screen.findByLabelText('Change Cotton Vegetative'));
    await fireEvent.changeText(screen.getByLabelText('Units of the product per acre'), '2');
    await fireEvent.press(screen.getByText('Save factor'));
    await waitFor(() => expect(mockPut).toHaveBeenCalledTimes(1));
    expect(mockPut.mock.calls[0][0]).toBe('/ai/crops/factors/f1');
    expect(mockPut.mock.calls[0][1].body).toEqual({
      crop: 'Cotton',
      skuId: 's1',
      stage: 'Vegetative',
      fromDas: 20,
      toDas: 45,
      unitsPerAcre: 2,
      expectedVersion: 7,
    });
    await fireEvent.press(await screen.findByLabelText('Remove Cotton Vegetative'));
    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith('/ai/crops/factors/f1', expect.anything()));
  });
});

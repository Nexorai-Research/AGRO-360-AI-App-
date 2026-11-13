import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import parts from '../i18n-parts/ai.json';
import { i18n, setLanguage } from '../src/i18n';
import CropDoctorScreen from '../src/features/ai/CropDoctorScreen';
import AdvisoryScreen from '../src/features/ai/AdvisoryScreen';
import WeatherScreen from '../src/features/ai/WeatherScreen';
import ProblemProductsScreen from '../src/features/ai/ProblemProductsScreen';
import { base64Bytes } from '../src/features/ai/photo';

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
  useLocalSearchParams: () => ({ id: 'k1', branch: 'b1', case: 'case-1', name: 'Aphids' }),
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
const STATUS = {
  approved: 5,
  photoConfigured: true,
  disclaimer: 'Advice only. Check the field.',
  message: null,
};
const DX = {
  case: { id: 'case-1' },
  outcome: 'MATCHED',
  message: 'One likely match.',
  escalated: false,
  source: 'symptom words',
  disclaimer: 'Advice only.',
  verify: 'Check the symptoms in the field.',
  candidates: [
    {
      knowledgeId: 'k1',
      kind: 'PEST',
      crop: 'cotton',
      names: { en: 'Aphids', hi: null, mr: null },
      symptoms: 'curled leaves',
      level: 'high',
      confidence: 0.9,
      control: {
        cultural: 'Remove weeds',
        biological: null,
        chemical: null,
        ingredients: ['imidacloprid'],
        dose: { text: '0.5 ml per litre', source: 'ICAR', sourceRef: 'p.12' },
      },
      source: { name: 'ICAR', ref: 'p.12' },
    },
  ],
};

describe('base64Bytes', () => {
  test('counts the real bytes, with padding', () => {
    expect(base64Bytes('QUJD')).toBe(3);
    expect(base64Bytes('QUI=')).toBe(2);
    expect(base64Bytes('QQ==')).toBe(1);
  });
});

describe('crop doctor', () => {
  test('text only: crop and symptoms are checked, then posted with one key; result shows control text and source', async () => {
    route({ '/ai/agro/status': STATUS, '/branches': BR });
    mockPost.mockResolvedValue(DX);
    await render(<CropDoctorScreen />, { wrapper });
    await fireEvent.press(await screen.findByLabelText('Find the problem'));
    await screen.findByText('Enter the crop (2 to 80 letters).');
    expect(mockPost).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText('Crop'), 'cotton');
    await fireEvent.changeText(screen.getByLabelText('Symptoms'), 'leaves curled');
    await fireEvent.press(screen.getByLabelText('Find the problem'));
    await screen.findByText('One likely match.');
    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(mockPost).toHaveBeenCalledWith('/ai/agro/diagnose', {
      body: { crop: 'cotton', symptoms: 'leaves curled', branch: 'b1' },
      idempotencyKey: 'key-1',
    });
    expect(screen.getByText('Aphids')).toBeTruthy();
    expect(screen.getByText('Dose: 0.5 ml per litre (source: ICAR)')).toBeTruthy();
    expect(screen.getByText('Pest · High confidence')).toBeTruthy();
  });
  test('photo goes as base64 in image.data; a too-big photo is refused before upload', async () => {
    route({ '/ai/agro/status': STATUS, '/branches': BR });
    mockPost.mockResolvedValue(DX);
    mockPick.mockResolvedValueOnce({
      canceled: false,
      assets: [{ name: 'big.jpg', base64: 'A'.repeat(4 * 1024 * 1024 + 8) }],
    });
    await render(<CropDoctorScreen />, { wrapper });
    await fireEvent.press(await screen.findByLabelText('Add a photo'));
    await screen.findByText('The photo is larger than 3 MB.');
    mockPick.mockResolvedValueOnce({ canceled: false, assets: [{ name: 'leaf.jpg', base64: 'QUJD' }] });
    await fireEvent.press(screen.getByLabelText('Add a photo'));
    await screen.findByText('leaf.jpg (0 KB)');
    await fireEvent.changeText(screen.getByLabelText('Crop'), 'cotton');
    await fireEvent.press(screen.getByLabelText('Find the problem'));
    await screen.findByText('One likely match.');
    expect(mockPost.mock.calls[0][1].body).toMatchObject({ crop: 'cotton', image: { data: 'QUJD' } });
  });
  test('not sure: asks an expert with a note and its own key', async () => {
    route({ '/ai/agro/status': STATUS, '/branches': BR });
    mockPost
      .mockResolvedValueOnce({
        ...DX,
        outcome: 'NOT_SURE',
        message: 'Not sure.',
        escalated: true,
        candidates: [],
      })
      .mockResolvedValueOnce({});
    await render(<CropDoctorScreen />, { wrapper });
    await fireEvent.changeText(await screen.findByLabelText('Crop'), 'cotton');
    await fireEvent.changeText(screen.getByLabelText('Symptoms'), 'spots on leaf');
    await fireEvent.press(screen.getByLabelText('Find the problem'));
    await screen.findByText('Not sure.');
    await fireEvent.press(screen.getByLabelText('Send to expert'));
    await screen.findByText('Sent to the expert.');
    expect(mockPost).toHaveBeenLastCalledWith('/ai/agro/cases/case-1/escalate', {
      body: { note: 'Please advise.' },
      idempotencyKey: 'key-2',
    });
  });
  test('no photo service: says so', async () => {
    route({
      '/ai/agro/status': {
        ...STATUS,
        photoConfigured: false,
        approved: 0,
        message: 'No approved knowledge yet.',
      },
      '/branches': BR,
    });
    await render(<CropDoctorScreen />, { wrapper });
    await screen.findByText(
      'Photo identification is not set up on the server. Describe the symptoms instead.',
    );
    expect(screen.getByText('No approved knowledge yet.')).toBeTruthy();
  });
  test('denied without ai.assistant.use', async () => {
    mockMe = { userId: 'u', roles: [], permissions: ['customer.view'] };
    await render(<CropDoctorScreen />, { wrapper });
    await screen.findByText('You do not have permission for this screen.');
    expect(mockGet).not.toHaveBeenCalled();
  });
});

describe('products for a problem', () => {
  test('lists products with stock, the left-out ones with reasons, and the staff-only line', async () => {
    route({
      '/ai/agro/knowledge/k1/products': {
        problem: DX.candidates[0],
        branchId: 'b1',
        staffOnly: 'For staff only.',
        note: null,
        disclaimer: 'Advice only.',
        products: [
          {
            skuId: 's1',
            code: 'IMI-1',
            name: 'Imida 100ml',
            matchedIngredients: ['imidacloprid'],
            stockQty: 12,
          },
        ],
        excluded: [{ code: 'X-2', name: 'Old brand', reason: 'sale is blocked' }],
      },
    });
    await render(<ProblemProductsScreen />, { wrapper });
    await screen.findByText('Imida 100ml');
    expect(screen.getByText('For staff only.')).toBeTruthy();
    expect(screen.getByText('Old brand (X-2): sale is blocked')).toBeTruthy();
    expect(mockGet).toHaveBeenCalledWith(
      '/ai/agro/knowledge/k1/products',
      expect.objectContaining({ query: { branch: 'b1', case: 'case-1' } }),
    );
  });
});

describe('crop advisory', () => {
  test('crop is required; sections show text with its source', async () => {
    route({
      '/branches': BR,
      '/ai/agro/advisory': {
        crop: 'cotton',
        stage: null,
        season: 'KHARIF',
        empty: false,
        message: null,
        weatherNote: 'Rain 12 mm expected.',
        disclaimer: 'Advice only.',
        sections: [
          {
            title: 'Sowing window',
            items: [{ text: 'Sow in June', source: 'ICAR', sourceRef: 'p.3', stage: null }],
          },
        ],
      },
    });
    await render(<AdvisoryScreen />, { wrapper });
    await fireEvent.press(await screen.findByLabelText('Show advisory'));
    await screen.findByText('Enter the crop (2 to 80 letters).');
    expect(mockGet).not.toHaveBeenCalledWith('/ai/agro/advisory', expect.anything());
    await fireEvent.changeText(screen.getByLabelText('Crop'), 'cotton');
    await fireEvent.press(screen.getByText('Kharif'));
    await fireEvent.press(screen.getByLabelText('Show advisory'));
    await screen.findByText('Sowing window');
    expect(screen.getByText('• Sow in June')).toBeTruthy();
    expect(screen.getByText('Rain 12 mm expected.')).toBeTruthy();
    expect(mockGet).toHaveBeenCalledWith(
      '/ai/agro/advisory',
      expect.objectContaining({
        query: { crop: 'cotton', stage: undefined, season: 'KHARIF', branch: undefined },
      }),
    );
  });
  test('nothing approved: shows the server message, not an invented answer', async () => {
    route({
      '/branches': BR,
      '/ai/agro/advisory': {
        crop: 'okra',
        stage: null,
        season: null,
        empty: true,
        message: 'No approved knowledge for this crop, stage and season yet.',
        weatherNote: null,
        disclaimer: 'x',
        sections: [],
      },
    });
    await render(<AdvisoryScreen />, { wrapper });
    await fireEvent.changeText(await screen.findByLabelText('Crop'), 'okra');
    await fireEvent.press(screen.getByLabelText('Show advisory'));
    await screen.findByText('No approved knowledge for this crop, stage and season yet.');
  });
});

describe('weather alerts', () => {
  test('alerts with detail; a branch with no forecast shows why; a calm one says no alerts', async () => {
    route({
      '/ai/weather/overview': {
        providerConfigured: true,
        items: [
          {
            location: { id: 'l1', branchId: 'b1', name: 'Main' },
            source: 'openmeteo',
            fetchedAt: '2026-11-13T06:00:00Z',
            ageMinutes: 30,
            stale: false,
            unavailable: null,
            evaluation: {
              covered: true,
              summary: { rainMm: 40, maxTempC: 31, minTempC: 22, maxWindKmh: 18 },
              alerts: [
                {
                  code: 'HEAVY_RAIN',
                  severity: 'HIGH',
                  title: 'Heavy rain',
                  detail: '40 mm in 24 hours',
                  advisory: 'Hold spraying.',
                },
              ],
            },
          },
          {
            location: { id: 'l2', branchId: 'b2', name: 'Sonai' },
            source: null,
            fetchedAt: null,
            ageMinutes: null,
            stale: false,
            evaluation: null,
            unavailable: 'No forecast has been fetched yet.',
          },
          {
            location: { id: 'l3', branchId: 'b3', name: 'Rahuri' },
            source: 'openmeteo',
            fetchedAt: '2026-11-13T06:00:00Z',
            ageMinutes: 30,
            stale: false,
            unavailable: null,
            evaluation: {
              covered: true,
              summary: { rainMm: 0, maxTempC: 30, minTempC: 20, maxWindKmh: 8 },
              alerts: [],
            },
          },
        ],
      },
    });
    await render(<WeatherScreen />, { wrapper });
    await screen.findByText('Heavy rain');
    expect(screen.getByText('40 mm in 24 hours')).toBeTruthy();
    expect(screen.getByText('Hold spraying.')).toBeTruthy();
    expect(screen.getByText('No forecast has been fetched yet.')).toBeTruthy();
    expect(screen.getByText('No alerts.')).toBeTruthy();
    expect(screen.getByText('Next 24 hours: rain 40 mm, 22 to 31 C, wind up to 18 km/h')).toBeTruthy();
  });
  test('Hindi and Marathi texts for the farming screens', async () => {
    for (const lg of ['hi', 'mr'] as const) {
      await setLanguage(lg);
      for (const key of ['nav.aiCropDoctor', 'ai.cd.title', 'ai.av.title', 'ai.wx.title'])
        expect(i18n.t(key)).not.toBe(i18n.getFixedT('en')(key));
    }
  });
});

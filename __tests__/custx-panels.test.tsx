import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import parts from '../i18n-parts/custx.json';
import { i18n, setLanguage } from '../src/i18n';
import { ApiError } from '../src/api/errors';
import { PlansPanel } from '../src/features/customers/PlansPanel';
import { PrivacyPanel } from '../src/features/customers/PrivacyPanel';
import { ServicePanel } from '../src/features/customers/ServicePanel';
import {
  buildCase,
  buildContact,
  buildCropPlan,
  buildPurchasePlan,
  caseErrors,
  contactErrors,
  cropPlanErrors,
  prefBody,
  prefErrors,
  purchasePlanErrors,
  transitionErrors,
} from '../src/features/customers/plans-logic';

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockPut = jest.fn();
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
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
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
  [mockGet, mockPost, mockPut].forEach((m) => m.mockReset());
  mockId = 0;
  mockMe = { userId: 'u-1', roles: [], permissions: undefined };
  client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retryDelay: 0 } } });
  await setLanguage('en');
});
const route = (map: Record<string, unknown>) =>
  mockGet.mockImplementation((p: string) =>
    p in map ? Promise.resolve(map[p]) : Promise.reject(new Error(`unexpected GET ${p}`)),
  );
const C = '/customers/c-1';

describe('logic', () => {
  test('crop plan: area is a decimal string, year is 4 digits, date is real', () => {
    const f = {
      cropId: 'x',
      season: 'KHARIF',
      seasonYear: '2026',
      plotId: '',
      areaValue: '2.5',
      areaUnit: 'ACRE',
      sowingDate: '2026-06-20',
      intercrop: false,
    };
    expect(cropPlanErrors(f)).toEqual([]);
    expect(
      cropPlanErrors({ ...f, cropId: '', seasonYear: '26', areaValue: '0', sowingDate: '2026-02-30' }),
    ).toEqual(['crop', 'year', 'area', 'date']);
    expect(buildCropPlan(f)).toEqual({
      cropId: 'x',
      season: 'KHARIF',
      seasonYear: 2026,
      areaValue: '2.5',
      areaUnit: 'ACRE',
      sowingDate: '2026-06-20',
      intercrop: false,
    });
    expect(buildCropPlan({ ...f, plotId: 'p1' })).toMatchObject({ plotId: 'p1' });
  });
  test('moves: harvest needs a date, abandon needs a reason', () => {
    const t = { date: '', yieldQty: '', yieldUnit: '', note: '' };
    expect(transitionErrors('HARVESTED', t)).toEqual(['date']);
    expect(transitionErrors('SOWN', t)).toEqual([]);
    expect(transitionErrors('ABANDONED', t)).toEqual(['note']);
    expect(transitionErrors('HARVESTED', { ...t, date: '2026-10-01', yieldQty: '1.2345' })).toEqual([
      'yield',
    ]);
  });
  test('purchase plan, case, contact, preferences', () => {
    const p = { season: 'RABI', seasonYear: '2026', description: 'Urea', qty: '10', neededBy: '' };
    expect(purchasePlanErrors(p)).toEqual([]);
    expect(buildPurchasePlan(p)).toEqual({
      season: 'RABI',
      seasonYear: 2026,
      lines: [{ description: 'Urea', qty: '10' }],
    });
    expect(purchasePlanErrors({ ...p, qty: '-1', description: '' })).toEqual(['item', 'qty']);
    const c = {
      kind: 'ADVICE',
      queryText: 'leaf curl',
      adviceText: 'spray',
      adviceSource: '',
      adviceReference: '',
      followUpOn: '',
    };
    expect(caseErrors(c)).toEqual(['source', 'reference']);
    expect(buildCase({ ...c, adviceSource: 'EXPERT_PROVIDED', adviceReference: 'Dr Rao' })).toMatchObject({
      adviceSource: 'EXPERT_PROVIDED',
      adviceReference: 'Dr Rao',
    });
    expect(contactErrors({ name: '', phone: '12345', relation: '', isPrimary: false })).toEqual([
      'name',
      'phone',
    ]);
    expect(buildContact({ name: ' Sita ', phone: '9876543210', relation: '', isPrimary: true })).toEqual({
      name: 'Sita',
      phone: '9876543210',
      isPrimary: true,
    });
    expect(prefErrors({ channel: '', quietStart: '21:00', quietEnd: '', maxPerWeek: '200' })).toEqual([
      'quiet',
      'max',
    ]);
    const orig = {
      customerId: 'c',
      preferredChannel: 'SMS',
      quietStart: null,
      quietEnd: null,
      maxPerWeek: 3,
      language: 'en',
      version: 4,
    };
    expect(
      prefBody({ channel: 'SMS', quietStart: '21:00', quietEnd: '07:00', maxPerWeek: '' }, orig),
    ).toEqual({ quietStart: '21:00', quietEnd: '07:00', maxPerWeek: null });
  });
});

const plan = (over = {}) => ({
  id: 'cp-1',
  season: 'KHARIF',
  seasonYear: 2026,
  cropId: 'cr-1',
  cropName: 'Soybean',
  varietyName: null,
  plotId: null,
  plotName: null,
  areaAcres: '2.5000',
  sowingDate: '2026-06-20',
  expectedHarvestDate: '2026-10-05',
  actualHarvestDate: null,
  status: 'PLANNED',
  stage: null,
  version: 1,
  ...over,
});

describe('crop plans and purchase plans', () => {
  test('nothing is read while the cards are closed', async () => {
    await render(<PlansPanel customerId="c-1" />, { wrapper });
    expect(mockGet).not.toHaveBeenCalled();
  });
  test('lists plans; the allowed next steps only; harvest sends the date', async () => {
    route({ [`${C}/crop-plans`]: { items: [plan({ status: 'SOWN' })] } });
    mockPost.mockResolvedValue({});
    await render(<PlansPanel customerId="c-1" />, { wrapper });
    await fireEvent.press(screen.getByText(/Crops grown/));
    expect(await screen.findByText('Soybean')).toBeTruthy();
    expect(screen.queryByLabelText('Mark sown Soybean')).toBeNull();
    expect(screen.getByLabelText('Growing Soybean')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Harvested Soybean'));
    await fireEvent.press(screen.getByText('Confirm'));
    expect(await screen.findByText('Enter a real date as YYYY-MM-DD.')).toBeTruthy();
    expect(mockPost).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText('Harvest date (YYYY-MM-DD)'), '2026-10-04');
    await fireEvent.changeText(screen.getByLabelText('Yield (optional)'), '12.5');
    await fireEvent.press(screen.getByText('Confirm'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    expect(mockPost.mock.calls[0][0]).toBe(`${C}/crop-plans/cp-1/transition`);
    expect(mockPost.mock.calls[0][1].body).toEqual({
      status: 'HARVESTED',
      date: '2026-10-04',
      yieldQty: '12.5',
    });
    expect(mockPost.mock.calls[0][1].idempotencyKey).toBeTruthy();
  });
  test('abandon needs a reason', async () => {
    route({ [`${C}/crop-plans`]: { items: [plan()] } });
    mockPost.mockResolvedValue({});
    await render(<PlansPanel customerId="c-1" />, { wrapper });
    await fireEvent.press(screen.getByText(/Crops grown/));
    await fireEvent.press(await screen.findByLabelText('Abandon Soybean'));
    await fireEvent.press(screen.getByText('Confirm'));
    expect(await screen.findByText('Give a reason of up to 500 letters.')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Reason'), 'hail damage');
    await fireEvent.press(screen.getByText('Confirm'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    expect(mockPost.mock.calls[0][1].body).toEqual({ status: 'ABANDONED', note: 'hail damage' });
  });
  test('adding a crop sends the area as a string and keeps one key after a lost answer', async () => {
    route({
      [`${C}/crop-plans`]: { items: [] },
      '/crops': {
        items: [
          {
            id: 'cr-1',
            name: 'Soybean',
            durationDays: 100,
            seasons: ['KHARIF'],
            reviewed: true,
            status: 'ACTIVE',
          },
        ],
      },
      [`${C}/farms`]: {
        items: [
          {
            id: 'f1',
            status: 'ACTIVE',
            plots: [{ id: 'p1', name: 'North', areaAcres: '3.0', status: 'ACTIVE' }],
          },
        ],
      },
    });
    mockPost.mockRejectedValueOnce(new ApiError(0, null)).mockResolvedValueOnce({});
    await render(<PlansPanel customerId="c-1" />, { wrapper });
    await fireEvent.press(screen.getByText(/Crops grown/));
    await fireEvent.press(await screen.findByText('Add a crop'));
    await fireEvent.press(screen.getByText('Save'));
    expect(await screen.findByText('Choose a crop.')).toBeTruthy();
    await fireEvent.press(await screen.findByLabelText('Soybean'));
    await fireEvent.press(await screen.findByLabelText('North (3.0 ac)'));
    await fireEvent.changeText(screen.getByLabelText('Area (more than 0)'), '2.5');
    await fireEvent.changeText(screen.getByLabelText('Sowing date (YYYY-MM-DD)'), '2026-06-20');
    await fireEvent.press(screen.getByText('Save'));
    await screen.findByRole('alert');
    await fireEvent.press(screen.getByText('Save'));
    expect(await screen.findByText('Crop added.')).toBeTruthy();
    expect(mockPost.mock.calls[1][0]).toBe(`${C}/crop-plans`);
    expect(mockPost.mock.calls[1][1].body).toMatchObject({
      cropId: 'cr-1',
      plotId: 'p1',
      areaValue: '2.5',
      areaUnit: 'ACRE',
      sowingDate: '2026-06-20',
      seasonYear: new Date().getFullYear(),
    });
    expect(mockPost.mock.calls[0][1].idempotencyKey).toBe(mockPost.mock.calls[1][1].idempotencyKey);
  });
  test('purchase plan: add one line, then confirm a draft', async () => {
    route({
      [`${C}/purchase-plans`]: {
        items: [
          {
            id: 'pp-1',
            season: 'RABI',
            seasonYear: 2026,
            status: 'DRAFT',
            notes: null,
            version: 1,
            lines: [{ id: 'l1', description: 'Urea', qty: '10.000', neededBy: null }],
          },
        ],
      },
    });
    mockPost.mockResolvedValue({});
    await render(<PlansPanel customerId="c-1" />, { wrapper });
    await fireEvent.press(screen.getByText(/Seasonal purchase plans/));
    expect(await screen.findByText(/Urea × 10.000/)).toBeTruthy();
    await fireEvent.press(screen.getByText('Confirm with farmer'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    expect(mockPost.mock.calls[0][0]).toBe(`${C}/purchase-plans/pp-1/status`);
    expect(mockPost.mock.calls[0][1].body).toEqual({ status: 'CONFIRMED' });
    await fireEvent.press(screen.getByText('New purchase plan'));
    await fireEvent.changeText(screen.getByLabelText('Item'), 'DAP');
    await fireEvent.changeText(screen.getByLabelText('Quantity (more than 0)'), '5');
    await fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(2));
    expect(mockPost.mock.calls[1][1].body.lines).toEqual([{ description: 'DAP', qty: '5' }]);
  });
  test('no manage permission: view only', async () => {
    mockMe = { userId: 'u-1', roles: [], permissions: ['customer.view'] };
    route({ [`${C}/crop-plans`]: { items: [plan()] } });
    await render(<PlansPanel customerId="c-1" />, { wrapper });
    await fireEvent.press(screen.getByText(/Crops grown/));
    await screen.findByText('Soybean');
    expect(screen.queryByText('Add a crop')).toBeNull();
    expect(screen.queryByLabelText('Abandon Soybean')).toBeNull();
  });
});

describe('service cases and contacts', () => {
  test('a case with advice must name its source', async () => {
    route({ [`${C}/service-cases`]: { items: [] } });
    mockPost.mockResolvedValue({});
    await render(<ServicePanel customerId="c-1" />, { wrapper });
    await fireEvent.press(screen.getByText(/Service cases/));
    await fireEvent.press(await screen.findByText('New service case'));
    await fireEvent.changeText(screen.getByLabelText('What was asked or seen'), 'leaf curl on cotton');
    await fireEvent.changeText(screen.getByLabelText('Advice given (optional)'), 'spray neem oil');
    await fireEvent.press(screen.getByText('Save'));
    expect(await screen.findByText('Choose where the advice comes from.')).toBeTruthy();
    expect(mockPost).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText('Expert'));
    await fireEvent.changeText(screen.getByLabelText('Source document or name of the expert'), 'Dr Rao');
    await fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    expect(mockPost.mock.calls[0][0]).toBe(`${C}/service-cases`);
    expect(mockPost.mock.calls[0][1].body).toEqual({
      kind: 'QUERY',
      queryText: 'leaf curl on cotton',
      adviceText: 'spray neem oil',
      adviceSource: 'EXPERT_PROVIDED',
      adviceReference: 'Dr Rao',
    });
  });
  test('contacts: add with a 10 digit mobile, and remove', async () => {
    route({
      [`${C}/contacts`]: {
        items: [{ id: 'ct-1', name: 'Sita', phone: '9876543210', relation: 'wife', isPrimary: true }],
      },
    });
    mockPost.mockResolvedValue({});
    await render(<ServicePanel customerId="c-1" />, { wrapper });
    await fireEvent.press(screen.getByText(/Extra contacts/));
    expect(await screen.findByText(/Sita · primary/)).toBeTruthy();
    await fireEvent.press(screen.getByText('Add a contact'));
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Ram');
    await fireEvent.changeText(screen.getByLabelText('Mobile (10 digits)'), '12345');
    await fireEvent.press(screen.getByText('Save'));
    expect(await screen.findByText('Mobile must be exactly 10 digits.')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Mobile (10 digits)'), '9123456780');
    await fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    expect(mockPost.mock.calls[0][1].body).toEqual({ name: 'Ram', phone: '9123456780', isPrimary: false });
    await fireEvent.press(screen.getByLabelText('Remove Sita'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(2));
    expect(mockPost.mock.calls[1][0]).toBe(`${C}/contacts/ct-1:remove`);
  });
});

describe('preferences, access log, status and anonymise', () => {
  const pref = {
    customerId: 'c-1',
    preferredChannel: 'SMS',
    quietStart: null,
    quietEnd: null,
    maxPerWeek: 3,
    language: 'en',
    version: 4,
  };
  test('preferences are saved with the version and only what changed', async () => {
    route({ [`${C}/preferences`]: pref });
    mockPut.mockResolvedValue({});
    await render(<PrivacyPanel customerId="c-1" code="C-0001" status="ACTIVE" />, { wrapper });
    await fireEvent.press(screen.getByText(/Communication preferences/));
    expect(await screen.findByText(/Preferred channel: SMS/)).toBeTruthy();
    await fireEvent.press(screen.getByText('Change preferences'));
    await fireEvent.changeText(screen.getByLabelText('Quiet from (HH:MM, blank for none)'), '21:00');
    await fireEvent.press(screen.getByText('Save'));
    expect(await screen.findByText('Quiet hours need both a start and an end.')).toBeTruthy();
    expect(mockPut).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText('Quiet until (HH:MM)'), '07:00');
    await fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(mockPut).toHaveBeenCalledTimes(1));
    expect(mockPut.mock.calls[0][0]).toBe(`${C}/preferences`);
    expect(mockPut.mock.calls[0][1].version).toBe(4);
    expect(mockPut.mock.calls[0][1].body).toEqual({ quietStart: '21:00', quietEnd: '07:00' });
  });
  test('the access log only shows with customer.privacy', async () => {
    mockMe = { userId: 'u-1', roles: [], permissions: ['customer.view'] };
    await render(<PrivacyPanel customerId="c-1" code="C-0001" status="ACTIVE" />, { wrapper });
    expect(screen.queryByText(/Document access log/)).toBeNull();
    expect(screen.queryByText(/Status and privacy/)).toBeNull();
  });
  test('access log lists who opened documents', async () => {
    route({
      [`${C}/documents/access-log`]: {
        items: [
          {
            id: 'a1',
            documentId: 'd1',
            actorId: 'user-abcdef123456',
            action: 'VIEW',
            at: '2026-11-10T09:30:00.000Z',
          },
        ],
      },
    });
    await render(<PrivacyPanel customerId="c-1" code="C-0001" status="ACTIVE" />, { wrapper });
    await fireEvent.press(screen.getByText(/Document access log/));
    expect(await screen.findByText('VIEW')).toBeTruthy();
    expect(screen.getByText(/2026-11-10 09:30 · by user 123456/)).toBeTruthy();
  });
  test('deactivate a customer, then anonymise only when the typed text matches', async () => {
    mockPost.mockResolvedValue({});
    await render(<PrivacyPanel customerId="c-1" code="C-0001" status="ACTIVE" />, { wrapper });
    await fireEvent.press(screen.getByText(/Status and privacy/));
    await fireEvent.press(screen.getByText('Make this customer inactive'));
    await fireEvent.press(screen.getByText('Confirm'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    expect(mockPost.mock.calls[0][0]).toBe(`${C}/status`);
    expect(mockPost.mock.calls[0][1].body).toEqual({ status: 'INACTIVE' });

    await fireEvent.press(await screen.findByText('Anonymise this customer'));
    await fireEvent.changeText(screen.getByLabelText('Reason (3 to 500 letters)'), 'asked to be forgotten');
    await fireEvent.changeText(screen.getByLabelText('Type exactly: ANONYMIZE C-0001'), 'ANONYMIZE C-0002');
    await fireEvent.press(screen.getByText('Anonymise now'));
    expect(await screen.findByText('The text does not match.')).toBeTruthy();
    expect(mockPost).toHaveBeenCalledTimes(1);
    await fireEvent.changeText(screen.getByLabelText('Type exactly: ANONYMIZE C-0001'), 'ANONYMIZE C-0001');
    await fireEvent.press(screen.getByText('Anonymise now'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(2));
    expect(mockPost.mock.calls[1][0]).toBe(`${C}/anonymize`);
    expect(mockPost.mock.calls[1][1].body).toEqual({
      reason: 'asked to be forgotten',
      confirm: 'ANONYMIZE C-0001',
    });
  });
  test('Hindi', async () => {
    await setLanguage('hi');
    await render(<PlansPanel customerId="c-1" />, { wrapper });
    expect(screen.getByText(/मौसमी खरीद योजना/)).toBeTruthy();
  });
});

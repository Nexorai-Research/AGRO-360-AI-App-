import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setLanguage } from '../src/i18n';
import CustomerFormScreen from '../src/features/customers/CustomerFormScreen';
import {
  emptyLand,
  isFarmerCategory,
  landError,
  saveRegistrationLand,
} from '../src/features/customers/RegisterLand';
import type { ApiClient } from '../src/api/client';

const mockGet = jest.fn();
const mockPost = jest.fn();
let mockMe: { userId: string; tenantId: string; roles: string[]; permissions?: string[] };
let mockId = 0;
jest.mock('../src/auth/AuthProvider', () => ({
  useAuth: () => ({
    status: 'signedIn',
    me: mockMe,
    client: { get: (...a: unknown[]) => mockGet(...a), post: (...a: unknown[]) => mockPost(...a) },
  }),
}));
jest.mock('../src/device', () => ({ newId: () => `key-${++mockId}` }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);
beforeEach(async () => {
  [mockGet, mockPost].forEach((m) => m.mockReset());
  mockId = 0;
  mockMe = {
    userId: 'u-1',
    tenantId: 't-1',
    roles: [],
    permissions: ['customer.create', 'customer.farm', 'customer.crop'],
  };
  client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retryDelay: 0 } } });
  await setLanguage('en');
  mockGet.mockImplementation(async (path: string) => {
    if (path === '/customer-categories')
      return { items: [{ id: 'cat-f', name: 'Small farmer', status: 'ACTIVE' }] };
    if (path === '/crops')
      return { items: [{ id: 'crop-1', name: 'Cotton', durationDays: 160, seasons: ['KHARIF'] }] };
    return { items: [] };
  });
});

describe('rules like the web', () => {
  test('a farmer category asks for land; an area must be above 0', () => {
    expect(isFarmerCategory('Small farmer')).toBe(true);
    expect(isFarmerCategory('Kisan')).toBe(true);
    expect(isFarmerCategory('Dealer')).toBe(false);
    expect(landError(emptyLand())).toBeNull();
    expect(landError({ ...emptyLand(), areaValue: '0' })).toBe('area');
    expect(landError({ ...emptyLand(), areaValue: '2.5' })).toBeNull();
  });
  test('the plot, then the crop plan on that plot; a failure is reported, never thrown', async () => {
    const post = jest.fn().mockResolvedValueOnce({ id: 'plot-1' }).mockResolvedValueOnce({});
    const c = { post } as unknown as ApiClient;
    let k = 0;
    const ok = await saveRegistrationLand(
      c,
      'c-1',
      { ...emptyLand(), areaValue: '3', irrigationSource: 'WELL', cropId: 'crop-1', season: 'RABI' },
      () => `k${++k}`,
      2026,
    );
    expect(ok).toBe(true);
    expect(post.mock.calls[0]).toEqual([
      '/customers/c-1/plots',
      {
        body: { name: 'Main plot', areaValue: '3', areaUnit: 'ACRE', irrigationSource: 'WELL' },
        idempotencyKey: 'k1',
      },
    ]);
    expect(post.mock.calls[1]).toEqual([
      '/customers/c-1/crop-plans',
      {
        body: {
          season: 'RABI',
          seasonYear: 2026,
          cropId: 'crop-1',
          plotId: 'plot-1',
          areaValue: '3',
          areaUnit: 'ACRE',
        },
        idempotencyKey: 'k2',
      },
    ]);
    const bad = { post: jest.fn().mockRejectedValue(new Error('x')) } as unknown as ApiClient;
    expect(await saveRegistrationLand(bad, 'c-1', { ...emptyLand(), areaValue: '1' }, () => 'k')).toBe(false);
    expect(await saveRegistrationLand(bad, 'c-1', emptyLand(), () => 'k')).toBe(true); // nothing to save
  });
});

describe('new customer form', () => {
  const fill = async () => {
    await fireEvent.changeText(await screen.findByLabelText('Name'), 'Ramesh Patil');
    await fireEvent.changeText(screen.getByLabelText('Mobile'), '9876543210');
    await fireEvent.changeText(screen.getByLabelText('Village'), 'Wadgaon');
  };

  test('the customer is created first, then the land as its first plot', async () => {
    mockPost.mockImplementation(async (path: string) =>
      path === '/customers' ? { id: 'c-9', name: 'Ramesh Patil' } : { id: 'plot-9' },
    );
    await render(<CustomerFormScreen />, { wrapper });
    await fill();
    await fireEvent.press(await screen.findByText('Small farmer'));
    expect(screen.getByText(/This is a farmer category/)).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Land holding'), '4');
    await fireEvent.press(screen.getByText('Save customer'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(2));
    expect(mockPost.mock.calls[0][0]).toBe('/customers');
    expect(mockPost.mock.calls[1]).toEqual([
      '/customers/c-9/plots',
      { body: { name: 'Main plot', areaValue: '4', areaUnit: 'ACRE' }, idempotencyKey: expect.any(String) },
    ]);
  });

  test('land that cannot be saved does not undo the registration', async () => {
    mockPost.mockImplementation(async (path: string) => {
      if (path === '/customers') return { id: 'c-9', name: 'Ramesh Patil' };
      throw new Error('plot refused');
    });
    await render(<CustomerFormScreen />, { wrapper });
    await fill();
    await fireEvent.changeText(await screen.findByLabelText('Land holding'), '4');
    await fireEvent.press(screen.getByText('Save customer'));
    expect(await screen.findByText(/the land details were not saved/)).toBeTruthy();
  });

  test('no land typed: only the customer is created; no land right: no land section', async () => {
    mockPost.mockResolvedValue({ id: 'c-9', name: 'Ramesh Patil' });
    const r = await render(<CustomerFormScreen />, { wrapper });
    await fill();
    await fireEvent.press(screen.getByText('Save customer'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    r.unmount();
  });

  test('without customer.farm the land section is not shown', async () => {
    mockMe = { userId: 'u-1', tenantId: 't-1', roles: [], permissions: ['customer.create'] };
    await render(<CustomerFormScreen />, { wrapper });
    await screen.findByLabelText('Name');
    expect(screen.queryByLabelText('Land holding')).toBeNull();
  });
});

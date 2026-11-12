import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '../src/api/errors';
import { setLanguage } from '../src/i18n';
import { FarmEditor } from '../src/features/customers/FarmEditor';
import { farmBody, farmOk, plotBody, plotOk, validArea } from '../src/features/customers/farm-api';

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockPatch = jest.fn();
let mockMe: { userId: string; tenantId: string; roles: string[]; permissions?: string[] };
let mockId = 0;
jest.mock('../src/auth/AuthProvider', () => ({
  useAuth: () => ({
    me: mockMe,
    client: {
      get: (...a: unknown[]) => mockGet(...a),
      post: (...a: unknown[]) => mockPost(...a),
      patch: (...a: unknown[]) => mockPatch(...a),
    },
  }),
}));
jest.mock('../src/device', () => ({ newId: () => `key-${++mockId}` }));

let qc: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={qc}>{children}</QueryClientProvider>
);
const farmsData = {
  items: [
    {
      id: 'f1',
      name: 'North field',
      ownership: 'OWNED',
      areaAcres: '4.5',
      plotAcres: '4.5',
      status: 'ACTIVE',
      version: 7,
      plots: [],
    },
    {
      id: 'f2',
      name: 'Old farm',
      ownership: 'LEASED',
      areaAcres: null,
      plotAcres: '0',
      status: 'ARCHIVED',
      version: 2,
      plots: [],
    },
  ],
};

beforeEach(async () => {
  [mockGet, mockPost, mockPatch].forEach((m) => m.mockReset());
  mockId = 0;
  mockMe = { userId: 'u1', tenantId: 't1', roles: [], permissions: ['customer.view', 'customer.farm'] };
  mockGet.mockResolvedValue(farmsData);
  qc = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retryDelay: 0 } } });
  await setLanguage('en');
});

describe('farm checks', () => {
  test('area: more than 0, at most 4 decimals, at most 1000000', () => {
    expect(validArea('2.25')).toBe(true);
    expect(validArea('0')).toBe(false);
    expect(validArea('1.23456')).toBe(false);
    expect(validArea('1000001')).toBe(false);
    expect(validArea('-1')).toBe(false);
    expect(validArea('')).toBe(false);
  });
  test('farm: area is optional but needs a unit when given; plot needs farm, name and area', () => {
    expect(farmOk({ name: 'A', ownership: 'OWNED', areaValue: '', areaUnit: 'ACRE' })).toBe(true);
    expect(farmOk({ name: '', ownership: 'OWNED', areaValue: '', areaUnit: 'ACRE' })).toBe(false);
    expect(farmOk({ name: 'A', ownership: 'OWNED', areaValue: 'x', areaUnit: 'ACRE' })).toBe(false);
    expect(farmBody({ name: ' A ', ownership: 'OWNED', areaValue: '', areaUnit: 'ACRE' })).toEqual({
      name: 'A',
      ownership: 'OWNED',
    });
    expect(
      plotOk({ farmId: '', name: 'P', areaValue: '1', areaUnit: 'ACRE', soilType: '', irrigationSource: '' }),
    ).toBe(false);
    expect(
      plotBody({
        farmId: 'f1',
        name: 'P',
        areaValue: '1',
        areaUnit: 'GUNTHA',
        soilType: 'BLACK',
        irrigationSource: '',
      }),
    ).toEqual({ farmId: 'f1', name: 'P', areaValue: '1', areaUnit: 'GUNTHA', soilType: 'BLACK' });
  });
});

describe('farm editor', () => {
  test('without customer.farm nothing is shown', async () => {
    mockMe = { ...mockMe, permissions: ['customer.view'] };
    await render(<FarmEditor customerId="c1" />, { wrapper });
    expect(screen.queryByLabelText('Add farm')).toBeNull();
  });
  test('add farm posts the body with one key', async () => {
    mockPost.mockResolvedValue({});
    await render(<FarmEditor customerId="c1" />, { wrapper });
    await fireEvent.press(await screen.findByLabelText('Add farm'));
    await fireEvent.changeText(screen.getByLabelText('Farm name'), 'River farm');
    await fireEvent.changeText(screen.getByLabelText('Area'), '3.5');
    await fireEvent.press(screen.getByLabelText('Hectare'));
    await fireEvent.press(screen.getByLabelText('Save farm'));
    expect(await screen.findByText('Farm saved.')).toBeTruthy();
    expect(mockPost).toHaveBeenCalledWith('/customers/c1/farms', {
      body: { name: 'River farm', ownership: 'OWNED', areaValue: '3.5', areaUnit: 'HECTARE' },
      idempotencyKey: 'key-1',
    });
  });
  test('save stays off until the name is filled and a bad area is flagged', async () => {
    await render(<FarmEditor customerId="c1" />, { wrapper });
    await fireEvent.press(await screen.findByLabelText('Add farm'));
    await fireEvent.press(screen.getByLabelText('Save farm'));
    expect(mockPost).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText('Farm name'), 'X');
    await fireEvent.changeText(screen.getByLabelText('Area'), '0');
    expect(screen.getByText('Area must be more than 0, up to 4 decimals.')).toBeTruthy();
  });
  test('add plot offers only active farms and posts farmId, area and unit', async () => {
    mockPost.mockResolvedValue({});
    await render(<FarmEditor customerId="c1" />, { wrapper });
    await fireEvent.press(await screen.findByLabelText('Add plot'));
    expect(await screen.findByLabelText('North field')).toBeTruthy();
    expect(screen.queryByLabelText('Old farm')).toBeNull();
    await fireEvent.press(screen.getByLabelText('North field'));
    await fireEvent.changeText(screen.getByLabelText('Plot name'), 'Plot B');
    await fireEvent.changeText(screen.getByLabelText('Area'), '2');
    await fireEvent.press(screen.getByLabelText('Black'));
    await fireEvent.press(screen.getByLabelText('Save plot'));
    expect(await screen.findByText('Plot saved.')).toBeTruthy();
    expect(mockPost).toHaveBeenCalledWith('/customers/c1/plots', {
      body: { farmId: 'f1', name: 'Plot B', areaValue: '2', areaUnit: 'ACRE', soilType: 'BLACK' },
      idempotencyKey: 'key-1',
    });
  });
  test('archive sends status ARCHIVED with the farm version', async () => {
    mockPatch.mockResolvedValue({});
    await render(<FarmEditor customerId="c1" />, { wrapper });
    await fireEvent.press(await screen.findByLabelText('Archive farm'));
    await fireEvent.press(await screen.findByLabelText('North field'));
    await fireEvent.press(screen.getByLabelText('Archive'));
    expect(await screen.findByText('Farm archived.')).toBeTruthy();
    expect(mockPatch).toHaveBeenCalledWith('/customers/c1/farms/f1', {
      body: { status: 'ARCHIVED' },
      version: 7,
      idempotencyKey: 'key-1',
    });
  });
  test('a lost answer then retry reuses the key; server refusal is shown', async () => {
    mockPost.mockRejectedValueOnce(new ApiError(0, null, 'c1')).mockResolvedValueOnce({});
    await render(<FarmEditor customerId="c1" />, { wrapper });
    await fireEvent.press(await screen.findByLabelText('Add farm'));
    await fireEvent.changeText(screen.getByLabelText('Farm name'), 'Z');
    await fireEvent.press(screen.getByLabelText('Save farm'));
    await screen.findByRole('alert');
    await fireEvent.press(screen.getByLabelText('Save farm'));
    await screen.findByText('Farm saved.');
    expect(mockPost.mock.calls[0]![1].idempotencyKey).toBe(mockPost.mock.calls[1]![1].idempotencyKey);
  });
  test('Marathi labels', async () => {
    await setLanguage('mr');
    await render(<FarmEditor customerId="c1" />, { wrapper });
    expect(await screen.findByText('शेत आणि प्लॉट')).toBeTruthy();
  });
});

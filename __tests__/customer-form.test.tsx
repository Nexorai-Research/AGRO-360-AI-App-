import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '../src/api/errors';
import { setLanguage } from '../src/i18n';
import CustomerFormScreen from '../src/features/customers/CustomerFormScreen';
import {
  draftOf,
  emptyDraft,
  isChanged,
  toBody,
  validateDraft,
  type CustomerFull,
} from '../src/features/customers/form-logic';

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockPatch = jest.fn();
let mockMe: { userId: string; tenantId: string; roles: string[]; permissions?: string[] };
let mockParams: { id?: string };
let mockId = 0;
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ replace: mockReplace, push: jest.fn() }),
}));
jest.mock('../src/auth/AuthProvider', () => ({
  useAuth: () => ({
    status: 'signedIn',
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
const saved: CustomerFull = {
  id: 'c1',
  code: 'CUS-1',
  name: 'Ramesh Patil',
  mobile: '9876543210',
  altMobile: null,
  sharedMobile: false,
  village: 'Shirur',
  taluka: null,
  district: 'Pune',
  stateCode: '27',
  pin: null,
  categoryId: 'k1',
  language: 'mr',
  gstin: null,
  status: 'ACTIVE',
  version: 4,
};

beforeEach(async () => {
  [mockGet, mockPost, mockPatch, mockReplace].forEach((m) => m.mockReset());
  mockId = 0;
  mockParams = {};
  mockMe = {
    userId: 'u1',
    tenantId: 't1',
    roles: [],
    permissions: ['customer.create', 'customer.update', 'customer.view'],
  };
  qc = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retryDelay: 0 } } });
  await setLanguage('en');
  mockGet.mockImplementation(async (path: string) => {
    if (path === '/customer-categories')
      return {
        items: [
          { id: 'k1', name: 'Farmer', status: 'ACTIVE' },
          { id: 'k2', name: 'Old', status: 'INACTIVE' },
        ],
      };
    if (path === '/customers/c1') return saved;
    return {};
  });
});

describe('form logic', () => {
  test('name and mobile are required; mobile is 10 digits starting 6 to 9', () => {
    expect(validateDraft(emptyDraft)).toMatchObject({ name: 'required', mobile: 'required' });
    expect(validateDraft({ ...emptyDraft, name: 'Ra', mobile: '5876543210' }).mobile).toBe('mobile');
    expect(validateDraft({ ...emptyDraft, name: 'Ramesh', mobile: '9876543210' })).toEqual({});
    expect(validateDraft({ ...emptyDraft, name: 'R', mobile: '9876543210' }).name).toBe('name');
  });
  test('optional fields are checked only when filled: alt mobile, state, pin, GSTIN and its state', () => {
    const ok = { ...emptyDraft, name: 'Ramesh', mobile: '9876543210' };
    expect(validateDraft({ ...ok, altMobile: '123' }).altMobile).toBe('mobile');
    expect(validateDraft({ ...ok, stateCode: '2' }).stateCode).toBe('state');
    expect(validateDraft({ ...ok, pin: '41210' }).pin).toBe('pin');
    expect(validateDraft({ ...ok, gstin: 'BAD' }).gstin).toBe('gstin');
    expect(validateDraft({ ...ok, gstin: '27AAPFU0939F1ZV', stateCode: '29' }).gstin).toBe('gstinState');
    expect(validateDraft({ ...ok, gstin: '27aapfu0939f1zv', stateCode: '27' })).toEqual({});
  });
  test('create sends only what was filled; a ticked shared phone is sent, an unticked one is not', () => {
    expect(
      toBody({ ...emptyDraft, name: ' Ramesh ', mobile: '9876543210', village: 'Shirur' }, null),
    ).toEqual({ name: 'Ramesh', mobile: '9876543210', village: 'Shirur', language: 'mr' });
    expect(
      toBody({ ...emptyDraft, name: 'R R', mobile: '9876543210', sharedMobile: true }, null),
    ).toMatchObject({ sharedMobile: true });
  });
  test('edit sends only changed fields; clearing an optional field sends null', () => {
    const d = { ...draftOf(saved), village: 'Daund', district: '' };
    expect(toBody(d, saved)).toEqual({ village: 'Daund', district: null });
    expect(isChanged(toBody(draftOf(saved), saved))).toBe(false);
  });
});

describe('customer form screen', () => {
  const fill = async () => {
    await fireEvent.changeText(await screen.findByLabelText('Name'), 'Sunita Jadhav');
    await fireEvent.changeText(screen.getByLabelText('Mobile'), '9123456789');
  };
  test('create: sends the body with one key and shows the saved message; inactive categories are not offered', async () => {
    mockPost.mockResolvedValue({ ...saved, id: 'c9', name: 'Sunita Jadhav' });
    await render(<CustomerFormScreen />, { wrapper });
    await fill();
    expect(await screen.findByLabelText('Farmer')).toBeTruthy();
    expect(screen.queryByLabelText('Old')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Farmer'));
    await fireEvent.press(screen.getByLabelText('Save customer'));
    expect(await screen.findByText('Customer Sunita Jadhav created.')).toBeTruthy();
    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(mockPost.mock.calls[0]![0]).toBe('/customers');
    expect(mockPost.mock.calls[0]![1]).toMatchObject({
      body: { name: 'Sunita Jadhav', mobile: '9123456789', categoryId: 'k1', language: 'mr' },
      idempotencyKey: 'key-1',
    });
  });
  test('an invalid form is not sent and shows the messages', async () => {
    await render(<CustomerFormScreen />, { wrapper });
    await fireEvent.changeText(await screen.findByLabelText('Mobile'), '123');
    await fireEvent.press(screen.getByLabelText('Save customer'));
    expect(await screen.findByText('Enter a 10 digit mobile starting with 6, 7, 8 or 9.')).toBeTruthy();
    expect(screen.getByText('This is required.')).toBeTruthy();
    expect(mockPost).not.toHaveBeenCalled();
  });
  test('a lost answer then a retry reuses the same key', async () => {
    mockPost.mockRejectedValueOnce(new ApiError(0, null, 'c1')).mockResolvedValueOnce({ ...saved, id: 'c9' });
    await render(<CustomerFormScreen />, { wrapper });
    await fill();
    await fireEvent.press(screen.getByLabelText('Save customer'));
    await screen.findByRole('alert');
    await fireEvent.press(screen.getByLabelText('Save customer'));
    await screen.findByText(/created/);
    expect(mockPost.mock.calls[0]![1].idempotencyKey).toBe(mockPost.mock.calls[1]![1].idempotencyKey);
  });
  test('same name in the village: asks, then creates anyway with confirmDuplicate and the body changed so a new key', async () => {
    mockPost
      .mockRejectedValueOnce(new ApiError(409, { title: 'DUPLICATE_WARNING' }, 'c2'))
      .mockResolvedValueOnce({ ...saved, id: 'c9' });
    await render(<CustomerFormScreen />, { wrapper });
    await fill();
    await fireEvent.press(screen.getByLabelText('Save customer'));
    expect(
      await screen.findByText(
        'A customer with the same name already exists in this village. Create this one anyway?',
      ),
    ).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Create anyway'));
    await screen.findByText(/created/);
    expect(mockPost.mock.calls[1]![1].body).toMatchObject({ confirmDuplicate: true });
    expect(mockPost.mock.calls[1]![1].idempotencyKey).not.toBe(mockPost.mock.calls[0]![1].idempotencyKey);
  });
  test('same mobile number: the server refusal is shown in words', async () => {
    mockPost.mockRejectedValue(new ApiError(409, { title: 'DUPLICATE_MOBILE' }, 'c3'));
    await render(<CustomerFormScreen />, { wrapper });
    await fill();
    await fireEvent.press(screen.getByLabelText('Save customer'));
    expect(await screen.findByText(/already exists\. Open that customer/)).toBeTruthy();
  });
  test('edit: loads the customer, sends only the change with the version, via PATCH', async () => {
    mockParams = { id: 'c1' };
    mockPatch.mockResolvedValue({ ...saved, village: 'Daund' });
    await render(<CustomerFormScreen />, { wrapper });
    const village = await screen.findByLabelText('Village');
    expect(village.props.value).toBe('Shirur');
    await fireEvent.changeText(village, 'Daund');
    await fireEvent.press(screen.getByLabelText('Save customer'));
    expect(await screen.findByText('Customer Ramesh Patil saved.')).toBeTruthy();
    expect(mockPatch).toHaveBeenCalledWith(
      '/customers/c1',
      expect.objectContaining({ body: { village: 'Daund' }, version: 4 }),
    );
    expect(mockPost).not.toHaveBeenCalled();
  });
  test('edit with no change sends nothing', async () => {
    mockParams = { id: 'c1' };
    await render(<CustomerFormScreen />, { wrapper });
    await screen.findByLabelText('Village');
    await fireEvent.press(screen.getByLabelText('Save customer'));
    expect(await screen.findByText('Nothing was changed.')).toBeTruthy();
    expect(mockPatch).not.toHaveBeenCalled();
  });
  test('without the permission the form is not shown', async () => {
    mockMe = { ...mockMe, permissions: ['customer.view'] };
    await render(<CustomerFormScreen />, { wrapper });
    expect(await screen.findByText(/permission/i)).toBeTruthy();
    expect(screen.queryByLabelText('Save customer')).toBeNull();
  });
  test('Hindi labels', async () => {
    await setLanguage('hi');
    await render(<CustomerFormScreen />, { wrapper });
    expect(await screen.findByText('नया ग्राहक')).toBeTruthy();
  });
});

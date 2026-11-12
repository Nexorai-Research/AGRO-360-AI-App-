import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '../src/api/errors';
import { setLanguage } from '../src/i18n';
import SupplierFormScreen from '../src/features/purchase/SupplierFormScreen';
import { draftOfSupplier, emptySupplier, supplierBody, validateSupplier, type SupplierFull } from '../src/features/purchase/supplier-logic';

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockPatch = jest.fn();
let mockMe: { userId: string; tenantId: string; roles: string[]; permissions?: string[] };
let mockParams: { id?: string };
let mockId = 0;
jest.mock('expo-router', () => ({ useLocalSearchParams: () => mockParams, useRouter: () => ({ replace: jest.fn(), push: jest.fn() }) }));
jest.mock('../src/auth/AuthProvider', () => ({
  useAuth: () => ({ me: mockMe, client: { get: (...a: unknown[]) => mockGet(...a), post: (...a: unknown[]) => mockPost(...a), patch: (...a: unknown[]) => mockPatch(...a) } }),
}));
jest.mock('../src/device', () => ({ newId: () => `key-${++mockId}` }));
let qc: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
const saved: SupplierFull = { id: 's1', code: 'SUP-1', name: 'Green Agro', type: 'COMPANY', gstin: '27AAPFU0939F1ZV', pan: null, stateCode: '27', address: null, creditDays: 30, creditLimit: '50000.0000', leadTimeDays: null, paymentTerms: null, tdsApplicable: false, tcsApplicable: false, status: 'ACTIVE', version: 5 };

beforeEach(async () => {
  [mockGet, mockPost, mockPatch].forEach((m) => m.mockReset());
  mockId = 0;
  mockParams = {};
  mockMe = { userId: 'u1', tenantId: 't1', roles: [], permissions: ['purchase.supplier.manage'] };
  mockGet.mockResolvedValue(saved);
  qc = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retryDelay: 0 } } });
  await setLanguage('en');
});

describe('supplier checks', () => {
  const ok = { ...emptySupplier, name: 'Green Agro', stateCode: '27' };
  test('name and state are required', () => {
    expect(validateSupplier(emptySupplier)).toMatchObject({ name: 'required', stateCode: 'required' });
    expect(validateSupplier(ok)).toEqual({});
  });
  test('GSTIN shape and its state, PAN shape, days and credit limit', () => {
    expect(validateSupplier({ ...ok, gstin: 'BAD' }).gstin).toBe('gstin');
    expect(validateSupplier({ ...ok, gstin: '29AAPFU0939F1ZV' }).gstin).toBe('gstinState');
    expect(validateSupplier({ ...ok, gstin: '27aapfu0939f1zv' })).toEqual({});
    expect(validateSupplier({ ...ok, pan: 'ABC' }).pan).toBe('pan');
    expect(validateSupplier({ ...ok, creditDays: '400' }).creditDays).toBe('days');
    expect(validateSupplier({ ...ok, leadTimeDays: 'x' }).leadTimeDays).toBe('days');
    expect(validateSupplier({ ...ok, creditLimit: '1.23456' }).creditLimit).toBe('amount');
  });
  test('create sends numbers for days and a decimal string for the limit', () => {
    expect(supplierBody({ ...ok, creditDays: '30', creditLimit: '1000.50', tdsApplicable: true }, null)).toEqual({ name: 'Green Agro', type: 'COMPANY', stateCode: '27', creditDays: 30, creditLimit: '1000.50', tdsApplicable: true });
  });
  test('edit sends only changes; a cleared optional field is null; a new GSTIN carries the state', () => {
    expect(supplierBody({ ...draftOfSupplier(saved), creditDays: '45', paymentTerms: '' }, saved)).toEqual({ creditDays: 45 });
    expect(supplierBody({ ...draftOfSupplier(saved), gstin: '' }, saved)).toEqual({ gstin: null });
    expect(supplierBody({ ...draftOfSupplier(saved), gstin: '27AAACB1234C1ZA' }, saved)).toEqual({ gstin: '27AAACB1234C1ZA', stateCode: '27' });
  });
});

describe('supplier form screen', () => {
  test('create posts the body with one key', async () => {
    mockPost.mockResolvedValue({ ...saved, name: 'New Co' });
    await render(<SupplierFormScreen />, { wrapper });
    await fireEvent.changeText(await screen.findByLabelText('Supplier name'), 'New Co');
    await fireEvent.changeText(screen.getByLabelText('State code (2 digits, like 27)'), '27');
    await fireEvent.press(screen.getByLabelText('Save supplier'));
    expect(await screen.findByText('Supplier New Co created.')).toBeTruthy();
    expect(mockPost).toHaveBeenCalledWith('/procurement/suppliers', { body: { name: 'New Co', type: 'COMPANY', stateCode: '27', creditDays: 0, creditLimit: '0' }, idempotencyKey: 'key-1' });
  });
  test('an invalid form is not sent', async () => {
    await render(<SupplierFormScreen />, { wrapper });
    await fireEvent.press(await screen.findByLabelText('Save supplier'));
    expect(await screen.findAllByText('This is required.')).toHaveLength(2);
    expect(mockPost).not.toHaveBeenCalled();
  });
  test('same GSTIN or name: asks, then saves anyway with confirmDuplicate', async () => {
    mockPost.mockRejectedValueOnce(new ApiError(409, { title: 'DUPLICATE_WARNING' }, 'c1')).mockResolvedValueOnce(saved);
    await render(<SupplierFormScreen />, { wrapper });
    await fireEvent.changeText(await screen.findByLabelText('Supplier name'), 'Green Agro');
    await fireEvent.changeText(screen.getByLabelText('State code (2 digits, like 27)'), '27');
    await fireEvent.press(screen.getByLabelText('Save supplier'));
    expect(await screen.findByText(/already exists\. Save this one anyway/)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Save anyway'));
    await screen.findByText(/created/);
    expect(mockPost.mock.calls[1]![1].body).toMatchObject({ confirmDuplicate: true });
  });
  test('edit: PATCH with the version and only the change', async () => {
    mockParams = { id: 's1' };
    mockPatch.mockResolvedValue(saved);
    await render(<SupplierFormScreen />, { wrapper });
    const days = await screen.findByLabelText('Credit days');
    expect(days.props.value).toBe('30');
    await fireEvent.changeText(days, '45');
    await fireEvent.press(screen.getByLabelText('Save supplier'));
    expect(await screen.findByText('Supplier Green Agro saved.')).toBeTruthy();
    expect(mockPatch).toHaveBeenCalledWith('/procurement/suppliers/s1', { body: { creditDays: 45 }, version: 5, idempotencyKey: 'key-1' });
  });
  test('edit with no change sends nothing; no permission shows the denied view', async () => {
    mockParams = { id: 's1' };
    await render(<SupplierFormScreen />, { wrapper });
    await fireEvent.press(await screen.findByLabelText('Save supplier'));
    expect(await screen.findByText('Nothing was changed.')).toBeTruthy();
    expect(mockPatch).not.toHaveBeenCalled();
  });
  test('without the permission the form is denied', async () => {
    mockMe = { ...mockMe, permissions: ['purchase.view'] };
    await render(<SupplierFormScreen />, { wrapper });
    expect(await screen.findByText('You do not have permission to manage suppliers.')).toBeTruthy();
  });
});

import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '../src/api/errors';
import { setLanguage } from '../src/i18n';
import { LoyaltyAdjust } from '../src/features/customers/LoyaltyAdjust';
import { validPoints, validPointsReason } from '../src/features/customers/loyalty-api';

const mockPost = jest.fn();
let mockMe: { userId: string; tenantId: string; roles: string[]; permissions?: string[] };
let mockId = 0;
jest.mock('../src/auth/AuthProvider', () => ({ useAuth: () => ({ me: mockMe, client: { post: (...a: unknown[]) => mockPost(...a) } }) }));
jest.mock('../src/device', () => ({ newId: () => `key-${++mockId}` }));
let qc: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;

beforeEach(async () => {
  mockPost.mockReset();
  mockId = 0;
  mockMe = { userId: 'u1', tenantId: 't1', roles: [], permissions: ['crm.loyalty.manage'] };
  qc = new QueryClient();
  await setLanguage('en');
});

test('points: whole, not zero, within 100000, sign allowed; reason 3 to 200', () => {
  expect(validPoints('50')).toBe(true);
  expect(validPoints('-20')).toBe(true);
  expect(validPoints('+5')).toBe(true);
  expect(validPoints('0')).toBe(false);
  expect(validPoints('1.5')).toBe(false);
  expect(validPoints('100001')).toBe(false);
  expect(validPoints('abc')).toBe(false);
  expect(validPointsReason('ab')).toBe(false);
  expect(validPointsReason('goodwill')).toBe(true);
});
test('hidden without the permission', async () => {
  mockMe = { ...mockMe, permissions: ['customer.view'] };
  await render(<LoyaltyAdjust customerId="c1" />, { wrapper });
  expect(screen.queryByLabelText('Adjust loyalty points')).toBeNull();
});
test('posts a number and the reason with one key; save stays off while invalid', async () => {
  mockPost.mockResolvedValue({});
  await render(<LoyaltyAdjust customerId="c1" />, { wrapper });
  await fireEvent.press(screen.getByLabelText('Adjust loyalty points'));
  await fireEvent.changeText(screen.getByLabelText('Points (use - to take away)'), '1.5');
  expect(screen.getByText('Enter a whole number, not zero.')).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText('Reason'), 'goodwill');
  await fireEvent.press(screen.getByLabelText('Save points'));
  expect(mockPost).not.toHaveBeenCalled();
  await fireEvent.changeText(screen.getByLabelText('Points (use - to take away)'), '-20');
  await fireEvent.press(screen.getByLabelText('Save points'));
  expect(await screen.findByText('Loyalty points updated.')).toBeTruthy();
  expect(mockPost).toHaveBeenCalledWith('/customers/c1/loyalty/points', { body: { points: -20, reason: 'goodwill' }, idempotencyKey: 'key-1' });
});
test('not enough points is explained; a retry reuses the key', async () => {
  mockPost.mockRejectedValueOnce(new ApiError(0, null, 'c1')).mockRejectedValueOnce(new ApiError(409, { title: 'INSUFFICIENT_POINTS' }, 'c2'));
  await render(<LoyaltyAdjust customerId="c1" />, { wrapper });
  await fireEvent.press(screen.getByLabelText('Adjust loyalty points'));
  await fireEvent.changeText(screen.getByLabelText('Points (use - to take away)'), '-500');
  await fireEvent.changeText(screen.getByLabelText('Reason'), 'correction');
  await fireEvent.press(screen.getByLabelText('Save points'));
  await screen.findByRole('alert');
  await fireEvent.press(screen.getByLabelText('Save points'));
  expect(await screen.findByText('The customer does not have enough points for this.')).toBeTruthy();
  expect(mockPost.mock.calls[0]![1].idempotencyKey).toBe(mockPost.mock.calls[1]![1].idempotencyKey);
});

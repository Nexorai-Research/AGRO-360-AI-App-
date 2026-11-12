import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '../src/api/errors';
import { setLanguage } from '../src/i18n';
import { CrmActions } from '../src/features/customers/CrmActions';
import {
  interactionBody,
  interactionOk,
  validDay,
  emptyInteraction,
} from '../src/features/customers/crm-api';

const mockGet = jest.fn();
const mockPut = jest.fn();
const mockPost = jest.fn();
let mockMe: { userId: string; tenantId: string; roles: string[]; permissions?: string[] };
let mockId = 0;
jest.mock('../src/auth/AuthProvider', () => ({
  useAuth: () => ({
    me: mockMe,
    client: {
      get: (...a: unknown[]) => mockGet(...a),
      put: (...a: unknown[]) => mockPut(...a),
      post: (...a: unknown[]) => mockPost(...a),
    },
  }),
}));
jest.mock('../src/device', () => ({ newId: () => `key-${++mockId}` }));

let qc: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={qc}>{children}</QueryClientProvider>
);

beforeEach(async () => {
  [mockGet, mockPut, mockPost].forEach((m) => m.mockReset());
  mockId = 0;
  mockMe = {
    userId: 'u1',
    tenantId: 't1',
    roles: [],
    permissions: ['customer.view', 'customer.consent', 'customer.interaction'],
  };
  mockGet.mockResolvedValue({
    items: [
      { code: 'PROMOTIONAL', name: 'Offers', status: 'ACTIVE' },
      { code: 'OLD', name: 'Old purpose', status: 'INACTIVE' },
    ],
  });
  qc = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retryDelay: 0 } } });
  await setLanguage('en');
});

describe('crm checks', () => {
  test('date must be a real YYYY-MM-DD', () => {
    expect(validDay('2026-12-31')).toBe(true);
    expect(validDay('2026-02-30')).toBe(false);
    expect(validDay('31-12-2026')).toBe(false);
  });
  test('entry needs notes; optional fields only sent when filled', () => {
    expect(interactionOk(emptyInteraction)).toBe(false);
    expect(interactionOk({ ...emptyInteraction, notes: 'x', followUpOn: '2026-13-01' })).toBe(false);
    expect(interactionBody({ ...emptyInteraction, notes: ' Called ' })).toEqual({
      kind: 'CALL',
      notes: 'Called',
    });
  });
});

describe('crm actions', () => {
  test('shows nothing without either permission', async () => {
    mockMe = { ...mockMe, permissions: ['customer.view'] };
    await render(<CrmActions customerId="c1" />, { wrapper });
    expect(screen.queryByLabelText('Record consent')).toBeNull();
  });
  test('only the permitted action is offered', async () => {
    mockMe = { ...mockMe, permissions: ['customer.interaction'] };
    await render(<CrmActions customerId="c1" />, { wrapper });
    expect(screen.queryByLabelText('Record consent')).toBeNull();
    expect(screen.getByLabelText('Log call or visit')).toBeTruthy();
  });
  test('consent: purpose from the server list (inactive hidden), PUT with source STAFF and one key', async () => {
    mockPut.mockResolvedValue({});
    await render(<CrmActions customerId="c1" />, { wrapper });
    await fireEvent.press(screen.getByLabelText('Record consent'));
    expect(await screen.findByLabelText('Offers')).toBeTruthy();
    expect(screen.queryByLabelText('Old purpose')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Save consent'));
    expect(mockPut).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText('Offers'));
    await fireEvent.press(screen.getByLabelText('SMS'));
    await fireEvent.press(screen.getByLabelText('Refused'));
    await fireEvent.press(screen.getByLabelText('Save consent'));
    expect(await screen.findByText('Consent recorded.')).toBeTruthy();
    expect(mockPut).toHaveBeenCalledWith('/customers/c1/consents', {
      body: { consents: [{ purpose: 'PROMOTIONAL', channel: 'SMS', granted: false, source: 'STAFF' }] },
      idempotencyKey: 'key-1',
    });
  });
  test('interaction: posts the body; lost answer then retry keeps the key', async () => {
    mockPost.mockRejectedValueOnce(new ApiError(0, null, 'c1')).mockResolvedValueOnce({});
    await render(<CrmActions customerId="c1" />, { wrapper });
    await fireEvent.press(screen.getByLabelText('Log call or visit'));
    await fireEvent.changeText(screen.getByLabelText('Notes'), 'Spoke about spray');
    await fireEvent.press(screen.getByLabelText('Field visit'));
    await fireEvent.changeText(screen.getByLabelText('Follow up on (YYYY-MM-DD, optional)'), '2026-12-01');
    await fireEvent.press(screen.getByLabelText('Save entry'));
    await screen.findByRole('alert');
    await fireEvent.press(screen.getByLabelText('Save entry'));
    expect(await screen.findByText('Entry saved.')).toBeTruthy();
    expect(mockPost.mock.calls[1]![0]).toBe('/customers/c1/interactions');
    expect(mockPost.mock.calls[1]![1].body).toEqual({
      kind: 'VISIT',
      notes: 'Spoke about spray',
      followUpOn: '2026-12-01',
    });
    expect(mockPost.mock.calls[0]![1].idempotencyKey).toBe(mockPost.mock.calls[1]![1].idempotencyKey);
  });
  test('a bad follow-up date is flagged and blocks saving', async () => {
    await render(<CrmActions customerId="c1" />, { wrapper });
    await fireEvent.press(screen.getByLabelText('Log call or visit'));
    await fireEvent.changeText(screen.getByLabelText('Notes'), 'x');
    await fireEvent.changeText(screen.getByLabelText('Follow up on (YYYY-MM-DD, optional)'), '2026-02-30');
    expect(screen.getByText('Enter a real date like 2026-12-31.')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Save entry'));
    expect(mockPost).not.toHaveBeenCalled();
  });
});

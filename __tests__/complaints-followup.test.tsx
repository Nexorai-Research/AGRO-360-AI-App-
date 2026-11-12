import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import parts from '../i18n-parts/step3.json';
import { i18n, setLanguage } from '../src/i18n';
import { ApiError } from '../src/api/errors';
import ComplaintsScreen from '../src/features/complaints/ComplaintsScreen';
import ComplaintFormScreen from '../src/features/complaints/ComplaintFormScreen';
import ComplaintDetailScreen from '../src/features/complaints/ComplaintDetailScreen';
import FollowUpScreen from '../src/features/collections/FollowUpScreen';
import {
  buildComplaintBody,
  buildTransition,
  complaintErrors,
  transitionError,
} from '../src/features/complaints/logic';
import {
  buildOutcome,
  outcomeErrors,
  promiseErrors,
  validAmount,
  validFutureDate,
} from '../src/features/collections/extras-logic';
import type { Complaint } from '../src/features/complaints/api';

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockPush = jest.fn();
const mockReplace = jest.fn();
let mockMe: { userId: string; roles: string[]; permissions?: string[] };
let mockId = 0;
const mockClient = { get: (...a: unknown[]) => mockGet(...a), post: (...a: unknown[]) => mockPost(...a) };
jest.mock('../src/auth/AuthProvider', () => ({
  useAuth: () => ({
    status: 'signedIn',
    me: mockMe,
    client: mockClient,
    signIn: jest.fn(),
    signOut: jest.fn(),
  }),
}));
jest.mock('../src/device', () => ({ newId: () => `key-${++mockId}` }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useLocalSearchParams: () => ({ id: 'c-1' }),
  Stack: { Screen: () => null },
}));

let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

const cmp = (over: Partial<Complaint> = {}): Complaint => ({
  id: 'c-1',
  ticketNo: 'CMP-1',
  customerId: 'k-1',
  customerName: 'Ramesh Patil',
  category: 'GERMINATION',
  severity: 'HIGH',
  description: 'Seeds did not grow',
  batchNo: 'B7',
  invoiceNumber: null,
  status: 'OPEN',
  slaDueAt: '2026-11-12T00:00:00Z',
  overdue: false,
  resolutionType: null,
  resolutionText: null,
  createdAt: '2026-11-10T00:00:00Z',
  version: 4,
  ...over,
});
const task = {
  id: 't-1',
  customerId: 'k-1',
  customerName: 'Ramesh Patil',
  mobile: null,
  village: 'Wadgaon',
  branchId: 'b-1',
  assignedTo: null,
  taskDate: '2026-11-11',
  overdueAmount: '5000.00',
  oldestDays: 40,
  status: 'OPEN',
  outcome: null,
  note: null,
};

beforeAll(() => {
  for (const lg of ['en', 'hi', 'mr'] as const)
    i18n.addResourceBundle(lg, 'translation', (parts as Record<string, object>)[lg], true, true);
});
beforeEach(async () => {
  [mockGet, mockPost, mockPush, mockReplace].forEach((m) => m.mockReset());
  mockId = 0;
  mockMe = { userId: 'u-1', roles: [], permissions: undefined };
  client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retryDelay: 0 } } });
  await setLanguage('en');
});

describe('logic', () => {
  test('complaint form rules', () => {
    const d = { customerId: 'k', category: 'SERVICE', severity: 'LOW', description: 'ab', batchNo: '' };
    expect(complaintErrors(d)).toEqual(['description']);
    expect(complaintErrors({ ...d, description: 'abc', customerId: '' })).toEqual(['customer']);
    expect(buildComplaintBody({ ...d, description: ' late delivery ' })).toEqual({
      customerId: 'k',
      category: 'SERVICE',
      severity: 'LOW',
      description: 'late delivery',
    });
  });
  test('resolve needs text', () => {
    expect(transitionError('RESOLVED', ' ')).toBe('text');
    expect(transitionError('IN_PROGRESS', '')).toBeNull();
    expect(buildTransition('RESOLVED', 'replaced', 'REPLACEMENT')).toEqual({
      to: 'RESOLVED',
      text: 'replaced',
      resolutionType: 'REPLACEMENT',
    });
    expect(buildTransition('IN_PROGRESS', '', 'REFUND')).toEqual({ to: 'IN_PROGRESS' });
  });
  test('amounts are decimal strings; promise date must be after today', () => {
    expect(validAmount('100.50')).toBe(true);
    expect(validAmount('100.505')).toBe(false);
    expect(validAmount('0')).toBe(false);
    expect(validAmount('1000000000000')).toBe(false);
    expect(validFutureDate('2026-11-12', '2026-11-11')).toBe(true);
    expect(validFutureDate('2026-11-11', '2026-11-11')).toBe(false);
    expect(validFutureDate('2026-02-30', '2026-01-01')).toBe(false);
    expect(outcomeErrors('PROMISE', { note: '', amount: '', date: '' }, '2026-11-11')).toEqual([
      'amount',
      'date',
    ]);
    expect(outcomeErrors('DISPUTE', { note: ' ', amount: '', date: '' })).toEqual(['note']);
    expect(outcomeErrors('PAID', { note: '', amount: '', date: '' })).toEqual([]);
    expect(buildOutcome('PROMISE', { note: '', amount: '500', date: '2026-12-01' })).toEqual({
      outcome: 'PROMISE',
      promiseAmount: '500',
      promiseDate: '2026-12-01',
    });
    expect(buildOutcome('PAID', { note: 'cash', amount: '500', date: '2026-12-01' })).toEqual({
      outcome: 'PAID',
      note: 'cash',
    });
    expect(promiseErrors({ customerId: '', amount: 'x', date: '', note: '' })).toEqual([
      'customer',
      'amount',
      'date',
    ]);
  });
});

describe('complaints list', () => {
  test('lists, with overdue mark', async () => {
    mockGet.mockResolvedValue({ items: [cmp({ overdue: true })] });
    await render(<ComplaintsScreen />, { wrapper });
    expect(await screen.findByText('CMP-1 · Ramesh Patil')).toBeTruthy();
    expect(screen.getByText('Overdue: the time to resolve has passed.')).toBeTruthy();
    expect(mockGet.mock.calls[0]![1].query.open).toBe('true');
  });
  test('loading', async () => {
    mockGet.mockReturnValue(new Promise(() => undefined));
    await render(<ComplaintsScreen />, { wrapper });
    expect(await screen.findByTestId('state-loading')).toBeTruthy();
  });
  test('empty', async () => {
    mockGet.mockResolvedValue({ items: [] });
    await render(<ComplaintsScreen />, { wrapper });
    expect(await screen.findByText('No complaints found.')).toBeTruthy();
  });
  test('offline', async () => {
    mockGet.mockRejectedValue(new ApiError(0, null));
    await render(<ComplaintsScreen />, { wrapper });
    expect(await screen.findByTestId('state-offline')).toBeTruthy();
  });
  test('error', async () => {
    mockGet.mockRejectedValue(new ApiError(500, { title: 'BOOM' }));
    await render(<ComplaintsScreen />, { wrapper });
    expect(await screen.findByTestId('state-error')).toBeTruthy();
  });
  test('no permission: nothing called', async () => {
    mockMe = { userId: 'u-1', roles: [], permissions: [] };
    await render(<ComplaintsScreen />, { wrapper });
    expect(await screen.findByText('You do not have permission to see complaints.')).toBeTruthy();
    expect(mockGet).not.toHaveBeenCalled();
  });
  test('new-complaint button hidden without customer.complaint', async () => {
    mockMe = { userId: 'u-1', roles: [], permissions: ['customer.view'] };
    mockGet.mockResolvedValue({ items: [cmp()] });
    await render(<ComplaintsScreen />, { wrapper });
    await screen.findByText('CMP-1 · Ramesh Patil');
    expect(screen.queryByLabelText('New complaint')).toBeNull();
  });
});

describe('complaint form', () => {
  test('validation, then one key reused after a lost answer', async () => {
    mockGet.mockResolvedValue({ items: [{ id: 'k-1', name: 'Ramesh Patil', village: 'Wadgaon' }] });
    await render(<ComplaintFormScreen />, { wrapper });
    await fireEvent.press(screen.getByLabelText('Register complaint'));
    expect(await screen.findByText('Pick a customer.')).toBeTruthy();
    expect(mockPost).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText('Search customer'), 'Ram');
    await fireEvent.press(await screen.findByLabelText('Ramesh Patil · Wadgaon'));
    await fireEvent.press(screen.getByLabelText('Germination'));
    await fireEvent.changeText(screen.getByLabelText('What happened'), 'Seeds did not grow');
    let first = true;
    mockPost.mockImplementation(async () => {
      if (first) {
        first = false;
        throw new ApiError(0, null);
      }
      return cmp();
    });
    await fireEvent.press(screen.getByLabelText('Register complaint'));
    await screen.findByText(/No network/);
    await fireEvent.press(screen.getByLabelText('Register complaint'));
    await screen.findByText(/No network|x/, {}, { timeout: 200 }).catch(() => null);
    expect(mockPost.mock.calls.map((c) => c[1].idempotencyKey)).toEqual(['key-1', 'key-1']);
    expect(mockPost.mock.calls[0]![1].body).toEqual({
      customerId: 'k-1',
      category: 'GERMINATION',
      severity: 'MEDIUM',
      description: 'Seeds did not grow',
    });
    expect(mockReplace).toHaveBeenCalled();
  });
  test('changed description gets a new key', async () => {
    mockGet.mockResolvedValue({ items: [{ id: 'k-1', name: 'Ramesh Patil' }] });
    mockPost.mockRejectedValue(new ApiError(0, null));
    await render(<ComplaintFormScreen />, { wrapper });
    await fireEvent.changeText(screen.getByLabelText('Search customer'), 'Ram');
    await fireEvent.press(await screen.findByLabelText('Ramesh Patil'));
    await fireEvent.press(screen.getByLabelText('Service'));
    await fireEvent.changeText(screen.getByLabelText('What happened'), 'late delivery');
    await fireEvent.press(screen.getByLabelText('Register complaint'));
    await screen.findByText(/No network/);
    await fireEvent.changeText(screen.getByLabelText('What happened'), 'late delivery by a week');
    await fireEvent.press(screen.getByLabelText('Register complaint'));
    await screen.findByText(/No network/);
    expect(mockPost.mock.calls.map((c) => c[1].idempotencyKey)).toEqual(['key-1', 'key-2']);
  });
  test('denied without permission', async () => {
    mockMe = { userId: 'u-1', roles: [], permissions: ['customer.view'] };
    await render(<ComplaintFormScreen />, { wrapper });
    expect(await screen.findByText('You do not have permission to register complaints.')).toBeTruthy();
  });
});

describe('complaint detail', () => {
  test('resolve needs text; sends If-Match version; retry reuses the key', async () => {
    mockGet.mockResolvedValue(cmp());
    await render(<ComplaintDetailScreen />, { wrapper });
    await screen.findByText('CMP-1');
    await fireEvent.press(screen.getByLabelText('Resolved'));
    expect(await screen.findByText('Write what was done to resolve or close it.')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Save status'));
    expect(mockPost).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText('What was done (required)'), 'seed replaced');
    let first = true;
    mockPost.mockImplementation(async () => {
      if (first) {
        first = false;
        throw new ApiError(0, null);
      }
      return cmp({ status: 'RESOLVED' });
    });
    await fireEvent.press(screen.getByLabelText('Save status'));
    await screen.findByText(/No network/);
    await fireEvent.press(screen.getByLabelText('Save status'));
    expect(await screen.findByText('Status changed.')).toBeTruthy();
    expect(mockPost.mock.calls.map((c) => c[1].idempotencyKey)).toEqual(['key-1', 'key-1']);
    expect(mockPost.mock.calls[0]![0]).toBe('/complaints/c-1/transition');
    expect(mockPost.mock.calls[0]![1].version).toBe(4);
    expect(mockPost.mock.calls[0]![1].body).toEqual({ to: 'RESOLVED', text: 'seed replaced' });
  });
  test('status controls hidden without resolve permission', async () => {
    mockMe = { userId: 'u-1', roles: [], permissions: ['customer.view'] };
    mockGet.mockResolvedValue(cmp());
    await render(<ComplaintDetailScreen />, { wrapper });
    await screen.findByText('CMP-1');
    expect(screen.queryByLabelText('Resolved')).toBeNull();
    expect(screen.queryByLabelText('Add comment')).toBeNull();
  });
});

describe('collection follow-up', () => {
  beforeEach(() => {
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/credit/tasks') return { items: [task] };
      if (path === '/credit/promises')
        return {
          items: [
            {
              id: 'p-1',
              customerId: 'k-1',
              customerName: 'Ramesh Patil',
              promisedAmount: '2000.00',
              promiseDate: '2026-12-01',
              madeOn: '2026-11-10',
              status: 'PENDING',
              receivedAmount: '0.00',
              note: null,
            },
          ],
        };
      if (path === '/receipts')
        return {
          items: [
            {
              id: 'r-1',
              number: 'RC-1',
              customerId: 'k-1',
              receiptDate: '2026-11-10',
              modeCode: 'CASH',
              reference: null,
              amount: '1500.00',
              allocated: '1500.00',
              onAccount: '0.00',
              status: 'ACTIVE',
            },
          ],
        };
      return { items: [] };
    });
  });

  test('task outcome: promise needs amount and future date; valid body sent; retry same key', async () => {
    await render(<FollowUpScreen />, { wrapper });
    expect(await screen.findByText('Ramesh Patil · ₹5,000.00')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Record result Ramesh Patil'));
    await fireEvent.press(screen.getByLabelText('Promised to pay'));
    await fireEvent.press(screen.getByLabelText('Save result'));
    expect(await screen.findByText('Amount must be more than 0 with at most 2 decimals.')).toBeTruthy();
    expect(mockPost).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText('Amount promised'), '2000.50');
    await fireEvent.changeText(screen.getByLabelText('Promised date (after today)'), '2099-01-01');
    let first = true;
    mockPost.mockImplementation(async () => {
      if (first) {
        first = false;
        throw new ApiError(0, null);
      }
      return {};
    });
    await fireEvent.press(screen.getByLabelText('Save result'));
    await screen.findByText(/No network/);
    await fireEvent.press(screen.getByLabelText('Save result'));
    expect(await screen.findByText('Result saved.')).toBeTruthy();
    expect(mockPost.mock.calls.map((c) => c[1].idempotencyKey)).toEqual(['key-1', 'key-1']);
    expect(mockPost.mock.calls[0]![0]).toBe('/credit/tasks/t-1/outcome');
    expect(mockPost.mock.calls[0]![1].body).toEqual({
      outcome: 'PROMISE',
      promiseAmount: '2000.50',
      promiseDate: '2099-01-01',
    });
  });

  test('dispute without a note is refused', async () => {
    await render(<FollowUpScreen />, { wrapper });
    await screen.findByText('Ramesh Patil · ₹5,000.00');
    await fireEvent.press(screen.getByLabelText('Record result Ramesh Patil'));
    await fireEvent.press(screen.getByLabelText('Dispute'));
    await fireEvent.press(screen.getByLabelText('Save result'));
    expect(await screen.findByText('Say what the dispute is about.')).toBeTruthy();
    expect(mockPost).not.toHaveBeenCalled();
  });

  test('promises tab lists and cancels a pending promise; receipts tab lists receipts', async () => {
    mockPost.mockResolvedValue({});
    await render(<FollowUpScreen />, { wrapper });
    await screen.findByText('Ramesh Patil · ₹5,000.00');
    await fireEvent.press(screen.getByLabelText('Promises'));
    expect(await screen.findByText('Ramesh Patil · ₹2,000.00')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Cancel promise Ramesh Patil'));
    expect(await screen.findByText('Promise cancelled.')).toBeTruthy();
    expect(mockPost.mock.calls[0]![0]).toBe('/credit/promises/p-1/cancel');
    await fireEvent.press(screen.getByLabelText('Receipts'));
    expect(await screen.findByText('RC-1 · ₹1,500.00')).toBeTruthy();
  });

  test('tabs follow permissions: only receipts for a ledger-only user', async () => {
    mockMe = { userId: 'u-1', roles: [], permissions: ['customer.ledger.view'] };
    await render(<FollowUpScreen />, { wrapper });
    expect(await screen.findByText('RC-1 · ₹1,500.00')).toBeTruthy();
    expect(screen.queryByLabelText('Tasks')).toBeNull();
    expect(screen.queryByLabelText('Promises')).toBeNull();
    expect(mockGet.mock.calls.map((c) => c[0])).toEqual(['/receipts']);
  });

  test('no permission at all: denied, nothing called', async () => {
    mockMe = { userId: 'u-1', roles: [], permissions: [] };
    await render(<FollowUpScreen />, { wrapper });
    expect(await screen.findByText('You do not have permission to see collection follow-up.')).toBeTruthy();
    expect(mockGet).not.toHaveBeenCalled();
  });

  test('offline and empty', async () => {
    mockGet.mockRejectedValue(new ApiError(0, null));
    await render(<FollowUpScreen />, { wrapper });
    expect(await screen.findByTestId('state-offline')).toBeTruthy();
  });
  test('empty tasks', async () => {
    mockGet.mockResolvedValue({ items: [] });
    await render(<FollowUpScreen />, { wrapper });
    expect(await screen.findByText('No open follow-up tasks.')).toBeTruthy();
  });
});

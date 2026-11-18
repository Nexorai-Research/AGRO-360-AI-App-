import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import parts from '../i18n-parts/wp1.json';
import custx from '../i18n-parts/custx.json';
import { i18n, setLanguage } from '../src/i18n';
import { ApiError } from '../src/api/errors';
import { CustomerExtras } from '../src/features/customers/CustomerExtras';
import {
  applicationBody,
  applicationErrors,
  emptyApplication,
  guarantorBody,
  guarantorErrors,
  householdBody,
  validTtl,
} from '../src/features/customers/extras-api';

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockDelete = jest.fn();
const mockPick = jest.fn();
const mockShare = jest.fn();
let mockMe: { userId: string; roles: string[]; permissions?: string[] };
let mockId = 0;
jest.mock('../src/auth/AuthProvider', () => ({
  useAuth: () => ({
    status: 'signedIn',
    me: mockMe,
    client: {
      get: (...a: unknown[]) => mockGet(...a),
      post: (...a: unknown[]) => mockPost(...a),
      delete: (...a: unknown[]) => mockDelete(...a),
    },
  }),
}));
jest.mock('../src/device', () => ({ newId: () => `key-${++mockId}` }));
jest.mock('../src/features/ai/file-g4', () => ({
  SCAN_TYPES: ['application/pdf', 'image/png', 'image/jpeg'],
  pickScan: (...a: unknown[]) => mockPick(...a),
}));
jest.mock('../src/features/admin/usr-files', () => ({
  saveAndShare: (...a: unknown[]) => mockShare(...a),
}));

let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);
beforeAll(() => {
  for (const lg of ['en', 'hi', 'mr'] as const) {
    i18n.addResourceBundle(lg, 'translation', (custx as Record<string, object>)[lg], true, true);
    i18n.addResourceBundle(lg, 'translation', (parts as Record<string, object>)[lg], true, true);
  }
});
beforeEach(async () => {
  [mockGet, mockPost, mockDelete, mockPick, mockShare].forEach((m) => m.mockReset());
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
const open = async (title: RegExp) => {
  await render(<CustomerExtras customerId="c-1" />, { wrapper });
  await fireEvent.press(screen.getByText(title));
};

describe('logic', () => {
  test('application: product, quantity and a real date; blank fields are left out', () => {
    const f = { ...emptyApplication('2026-11-18'), productName: 'Neem oil', qty: '2.5' };
    expect(applicationErrors(f)).toEqual([]);
    expect(applicationBody(f)).toEqual({
      productName: 'Neem oil',
      qty: '2.5',
      unit: 'litre',
      appliedOn: '2026-11-18',
    });
    expect(applicationErrors({ ...f, productName: ' ', qty: '1.2345', appliedOn: '2026-02-30' })).toEqual([
      'product',
      'qty',
      'date',
    ]);
  });
  test('guarantor: name, a mobile starting 6-9 and a relationship', () => {
    const g = {
      name: 'Ramesh',
      mobile: '9876543210',
      relationship: 'brother',
      documentRef: '',
      limitCovered: '',
    };
    expect(guarantorErrors(g)).toEqual([]);
    expect(
      guarantorErrors({ ...g, name: 'R', mobile: '5876543210', relationship: 'x', limitCovered: '0' }),
    ).toEqual(['name', 'mobile', 'relationship', 'amount']);
    expect(guarantorBody({ ...g, limitCovered: '5000' })).toEqual({
      relationship: 'brother',
      name: 'Ramesh',
      mobile: '9876543210',
      limitCovered: '5000',
    });
  });
  test('household body and link days', () => {
    expect(householdBody(' Patil ', 'c-1')).toEqual({
      name: 'Patil',
      decisionMakerId: 'c-1',
      payerId: 'c-1',
      members: [{ customerId: 'c-1', relationship: 'SELF' }],
    });
    expect(validTtl('30')).toBe(true);
    expect(validTtl('0')).toBe(false);
    expect(validTtl('91')).toBe(false);
  });
});

describe('customer extras', () => {
  test('nothing is read while closed; parts follow the permissions', async () => {
    mockMe = { userId: 'u-1', roles: [], permissions: ['customer.view'] };
    await render(<CustomerExtras customerId="c-1" />, { wrapper });
    expect(mockGet).not.toHaveBeenCalled();
    expect(screen.getByText(/Inputs applied/)).toBeTruthy();
    expect(screen.getByText(/Purchase history/)).toBeTruthy();
    expect(screen.queryByText(/Open tasks/)).toBeNull();
    expect(screen.queryByText(/KYC files/)).toBeNull();
    expect(screen.queryByText(/Guarantors/)).toBeNull();
    expect(screen.queryByText(/Share the statement/)).toBeNull();
    expect(screen.queryByText(/^▸ Household/)).toBeNull();
  });

  test('open tasks: marks one done with a key', async () => {
    route({
      '/crm/tasks': {
        items: [
          {
            id: 't-1',
            customerId: 'c-1',
            title: 'Call back',
            dueOn: '2026-11-20',
            status: 'OPEN',
            overdue: true,
          },
        ],
      },
    });
    mockPost.mockResolvedValue({});
    await open(/Open tasks/);
    expect(await screen.findByText('Call back')).toBeTruthy();
    expect(mockGet.mock.calls[0][1].query).toEqual({ customerId: 'c-1', status: 'OPEN' });
    expect(screen.getByText(/overdue/)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Done Call back'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    expect(mockPost.mock.calls[0][0]).toBe('/crm/tasks/t-1/done');
    expect(mockPost.mock.calls[0][1]).toEqual({ body: {}, idempotencyKey: 'key-1' });
  });

  test('inputs applied: checks the form, sends only filled fields, verifies', async () => {
    route({
      [`${C}/applications`]: {
        items: [
          {
            id: 'a-1',
            appliedOn: '2026-11-01',
            productName: 'Urea',
            batchNo: null,
            qty: '10.000',
            unit: 'kg',
            source: 'REPORTED',
            verified: false,
          },
        ],
      },
    });
    mockPost.mockResolvedValue({});
    await open(/Inputs applied/);
    expect(await screen.findByText('Urea')).toBeTruthy();
    expect(screen.getByText(/reported by farmer/)).toBeTruthy();
    await fireEvent.press(screen.getByText('Record an application'));
    await fireEvent.press(screen.getByText('Save'));
    expect(await screen.findByText('Name the product (up to 160 letters).')).toBeTruthy();
    expect(mockPost).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText('Product'), 'Neem oil');
    await fireEvent.changeText(screen.getByLabelText('Quantity'), '2');
    await fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    expect(mockPost.mock.calls[0][0]).toBe(`${C}/applications`);
    expect(mockPost.mock.calls[0][1].body).toMatchObject({
      productName: 'Neem oil',
      qty: '2',
      unit: 'litre',
    });
    expect(mockPost.mock.calls[0][1].body.batchNo).toBeUndefined();
    await fireEvent.press(screen.getByLabelText('Verify Urea'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(2));
    expect(mockPost.mock.calls[1][0]).toBe(`${C}/applications/a-1:verify`);
  });

  test('inputs applied: view only without agri.application.record', async () => {
    mockMe = { userId: 'u-1', roles: [], permissions: ['customer.view'] };
    route({
      [`${C}/applications`]: {
        items: [
          {
            id: 'a-1',
            appliedOn: '2026-11-01',
            productName: 'Urea',
            batchNo: null,
            qty: '1',
            unit: 'kg',
            source: 'STAFF_OBSERVED',
            verified: false,
          },
        ],
      },
    });
    await open(/Inputs applied/);
    await screen.findByText('Urea');
    expect(screen.queryByText('Record an application')).toBeNull();
    expect(screen.getByText('Not verified yet')).toBeTruthy();
  });

  test('KYC: a file over 2 MB is refused; upload sends base64; download shares; remove asks first', async () => {
    route({
      [`${C}/documents`]: {
        items: [
          {
            id: 'd-1',
            docType: 'PAN',
            numberMasked: 'XX1234',
            expiresOn: null,
            expired: false,
            filename: 'pan.pdf',
          },
        ],
      },
      [`${C}/documents/d-1/content`]: {
        filename: 'pan.pdf',
        contentType: 'application/pdf',
        contentBase64: 'AAAA',
      },
    });
    mockPost.mockResolvedValue({});
    mockShare.mockResolvedValue(true);
    await open(/KYC files/);
    expect(await screen.findByText(/PAN · XX1234/)).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Download pan.pdf'));
    await waitFor(() => expect(mockShare).toHaveBeenCalledWith('pan.pdf', 'application/pdf', 'AAAA'));

    await fireEvent.press(screen.getByText('Upload KYC document'));
    await fireEvent.press(screen.getByText('Upload'));
    expect(await screen.findByText('Choose a file.')).toBeTruthy();
    mockPick.mockResolvedValueOnce({
      ok: true,
      file: { name: 'big.pdf', mediaType: 'application/pdf', bytes: 3 * 1024 * 1024, base64: 'x' },
    });
    await fireEvent.press(screen.getByText(/Choose a file \(PDF/));
    expect(await screen.findByText(/larger than 2 MB/)).toBeTruthy();
    mockPick.mockResolvedValueOnce({
      ok: true,
      file: { name: 'aadhaar.jpg', mediaType: 'image/jpeg', bytes: 1000, base64: 'QUJD' },
    });
    await fireEvent.press(screen.getByText(/Choose a file \(PDF/));
    await screen.findByText('aadhaar.jpg');
    await fireEvent.changeText(screen.getByLabelText('Document number (optional)'), '1234 5678 9012');
    await fireEvent.press(screen.getByText('Upload'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    expect(mockPost.mock.calls[0][0]).toBe(`${C}/documents`);
    expect(mockPost.mock.calls[0][1].body).toEqual({
      docType: 'AADHAAR',
      number: '1234 5678 9012',
      filename: 'aadhaar.jpg',
      contentBase64: 'QUJD',
    });

    await fireEvent.press(screen.getByLabelText('Remove pan.pdf'));
    expect(screen.getByText('The file is erased.')).toBeTruthy();
    expect(mockPost).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByText('Remove document'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(2));
    expect(mockPost.mock.calls[1][0]).toBe(`${C}/documents/d-1:remove`);
  });

  test('points history lists entries with sign', async () => {
    route({
      [`${C}/loyalty/ledger`]: {
        items: [
          {
            id: 'l1',
            points: 12,
            reason: 'Points for purchases (automatic)',
            ref: null,
            at: '2026-11-10T08:00:00.000Z',
          },
          { id: 'l2', points: -5, reason: 'Redeemed', ref: 'INV-9', at: '2026-11-11T08:00:00.000Z' },
        ],
      },
    });
    await open(/Points history/);
    expect(await screen.findByText('+12 points')).toBeTruthy();
    expect(screen.getByText('-5 points')).toBeTruthy();
    expect(screen.getByText('2026-11-11 · Redeemed · INV-9')).toBeTruthy();
  });

  test('household: shown only when there is none; creates with the customer as SELF', async () => {
    route({ [`${C}/household`]: { household: null } });
    mockPost.mockResolvedValue({});
    await open(/^▸ Household/);
    await fireEvent.press(await screen.findByText('New household'));
    expect(await screen.findByText('Enter a household name (up to 120 letters).')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Household name'), 'Patil family');
    await fireEvent.press(screen.getByText('New household'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    expect(mockPost.mock.calls[0][0]).toBe('/crm/households');
    expect(mockPost.mock.calls[0][1].body).toEqual(householdBody('Patil family', 'c-1'));
  });

  test('purchase history: season filter adds season and year', async () => {
    mockGet.mockResolvedValue({
      items: [
        {
          number: 'INV-1',
          d: '2026-07-01',
          sku_code: 'U45',
          sku_name: 'Urea 45kg',
          batch_no: 'B1',
          qty: '2.000',
          returned: '1.000',
          line_total: '600.00',
          status: 'FINALIZED',
        },
      ],
    });
    await open(/Purchase history/);
    expect(await screen.findByText('U45 Urea 45kg')).toBeTruthy();
    expect(screen.getByText(/1 returned/)).toBeTruthy();
    expect(mockGet.mock.calls[0][1].query).toEqual({ limit: 200 });
    await fireEvent.press(screen.getByLabelText('Kharif'));
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));
    expect(mockGet.mock.calls[1][1].query).toEqual({
      limit: 200,
      season: 'KHARIF',
      year: String(new Date().getFullYear()),
    });
  });

  test('guarantors: add someone who is not a customer, then remove', async () => {
    route({
      [`${C}/credit`]: {
        guarantors: [
          {
            id: 'g-1',
            name: 'Suresh',
            mobile: '9876500000',
            relationship: 'uncle',
            limitCovered: '10000.0000',
            overdue: null,
          },
        ],
      },
    });
    mockPost.mockRejectedValueOnce(new ApiError(0, null)).mockResolvedValueOnce({});
    mockDelete.mockResolvedValue(null);
    await open(/Guarantors/);
    expect(await screen.findByText('Suresh · uncle')).toBeTruthy();
    await fireEvent.press(screen.getByText('Add guarantor'));
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Ganesh');
    await fireEvent.changeText(screen.getByLabelText('Mobile (10 digits, starts 6-9)'), '1234567890');
    await fireEvent.changeText(screen.getByLabelText('Relationship'), 'friend');
    await fireEvent.press(screen.getByText('Save'));
    expect(await screen.findByText('Mobile must be 10 digits starting 6-9.')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Mobile (10 digits, starts 6-9)'), '9123456780');
    await fireEvent.press(screen.getByText('Save'));
    await screen.findByRole('alert');
    await fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(2));
    expect(mockPost.mock.calls[1][0]).toBe(`${C}/guarantors`);
    expect(mockPost.mock.calls[1][1].body).toEqual({
      relationship: 'friend',
      name: 'Ganesh',
      mobile: '9123456780',
    });
    expect(mockPost.mock.calls[0][1].idempotencyKey).toBe(mockPost.mock.calls[1][1].idempotencyKey);
    await fireEvent.press(await screen.findByLabelText('Remove Suresh'));
    await waitFor(() => expect(mockDelete).toHaveBeenCalledTimes(1));
    expect(mockDelete.mock.calls[0][0]).toBe(`${C}/guarantors/g-1`);
    expect(mockDelete.mock.calls[0][1].idempotencyKey).toBeTruthy();
  });

  test('share the statement: days 1 to 90, shows the link', async () => {
    mockPost.mockResolvedValue({ url: 'https://example.test/s/abc', message: { status: 'QUEUED' } });
    await open(/Share the statement/);
    await fireEvent.changeText(screen.getByLabelText('Link works for (days, 1 to 90)'), '120');
    expect(screen.getByText('Enter 1 to 90 days.')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Link works for (days, 1 to 90)'), '15');
    await fireEvent.press(screen.getByLabelText('मराठी'));
    await fireEvent.press(screen.getAllByLabelText('Yes')[0]!);
    await fireEvent.press(screen.getByText('Make the link'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    expect(mockPost.mock.calls[0][0]).toBe(`${C}/statement/share`);
    expect(mockPost.mock.calls[0][1].body).toEqual({ language: 'mr', ttlDays: 15, send: true });
    expect(await screen.findByText('https://example.test/s/abc')).toBeTruthy();
  });

  test('Hindi', async () => {
    await setLanguage('hi');
    await render(<CustomerExtras customerId="c-1" />, { wrapper });
    expect(screen.getByText(/गारंटर/)).toBeTruthy();
    expect(screen.getByText(/खरीद इतिहास/)).toBeTruthy();
  });
});

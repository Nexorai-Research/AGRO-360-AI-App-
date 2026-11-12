import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '../src/api/errors';
import { setLanguage } from '../src/i18n';
import { MoreSections } from '../src/features/customers/MoreSections';
import { SECTION_PERM } from '../src/features/customers/more-api';

const mockGet = jest.fn();
let mockMe: { userId: string; tenantId: string; roles: string[]; permissions?: string[] };
jest.mock('../src/auth/AuthProvider', () => ({
  useAuth: () => ({ me: mockMe, client: { get: (...a: unknown[]) => mockGet(...a) } }),
}));

let qc: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
const data: Record<string, unknown> = {
  '/customers/c1/farms': { items: [{ id: 'f1', name: 'North field', ownership: 'OWNED', areaAcres: '4.500', plotAcres: '4.500', status: 'ACTIVE', plots: [{ id: 'p1', name: 'Plot A', areaAcres: '2.250', soilType: 'Black', irrigationSource: 'Drip', status: 'ACTIVE' }] }] },
  '/customers/c1/documents': { items: [{ id: 'k1', docType: 'AADHAAR', numberMasked: 'XXXX-XXXX-1234', expiresOn: '2025-01-31', expired: true, filename: 'a.pdf', status: 'VERIFIED' }] },
  '/customers/c1/loyalty': { tier: { id: 't1', name: 'Silver', minSpend: '10000.00', minInvoices: 3, discountPct: '2.00' }, nextTier: { id: 't2', name: 'Gold', minSpend: '50000.00', minInvoices: 6, discountPct: '4.00' }, points: 120, spend: '32500.50', invoices: 5, why: 'x', eligible: true },
  '/customers/c1/household': { household: { id: 'h1', name: 'Patil family', decisionMakerCustomerId: 'c1', payerCustomerId: 'c2', members: [{ customerId: 'c1', name: 'Ramesh Patil', code: 'CUS-1', mobile: '98xxxxxx10', relationship: 'SELF' }, { customerId: 'c2', name: 'Sunita Patil', code: 'CUS-2', mobile: null, relationship: 'SPOUSE' }] } },
  '/customers/c1/consents': { current: [{ purpose: 'MARKETING', channel: 'SMS', granted: false, capturedAt: '2026-01-01' }], history: [] },
  '/customers/c1/interactions': { items: [{ id: 'i1', kind: 'VISIT', occurredAt: '2026-11-05T09:00:00Z', notes: 'Checked the field', cropIssue: 'Yellow leaves', advice: 'Spray 19:19:19', followUpOn: '2026-11-20' }] },
};
const calledPaths = () => mockGet.mock.calls.map((c) => c[0] as string);

beforeEach(async () => {
  mockGet.mockReset();
  mockGet.mockImplementation(async (path: string) => data[path]);
  mockMe = { userId: 'u1', tenantId: 't1', roles: [], permissions: ['customer.view', 'customer.kyc.view'] };
  qc = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retryDelay: 0 } } });
  await setLanguage('en');
});
const open = async (label: string) => fireEvent.press(await screen.findByLabelText(label));

describe('customer 360: more sections', () => {
  test('nothing is loaded until a section is opened (KYC listing writes an access log on the server)', async () => {
    await render(<MoreSections customerId="c1" />, { wrapper });
    await screen.findByText('More about this customer');
    expect(mockGet).not.toHaveBeenCalled();
    await open('▸ KYC documents');
    expect(await screen.findByText('XXXX-XXXX-1234')).toBeTruthy();
    expect(calledPaths()).toEqual(['/customers/c1/documents']);
  });

  test('KYC shows only the masked number and an expired mark, never a file', async () => {
    await render(<MoreSections customerId="c1" />, { wrapper });
    await open('▸ KYC documents');
    expect(await screen.findByText(/Expired · expires 31-01-2025/)).toBeTruthy();
    expect(screen.getByText(/masked number is shown/)).toBeTruthy();
    expect(calledPaths().some((p) => p.includes('/content'))).toBe(false);
  });

  test('farms show area and plots as strings', async () => {
    await render(<MoreSections customerId="c1" />, { wrapper });
    await open('▸ Farms and crops');
    expect(await screen.findByText('Plot A · 2.250 acres · Black · Drip')).toBeTruthy();
    expect(screen.getByText('Owned · 4.500 acres')).toBeTruthy();
  });

  test('loyalty: tier, points and the spend still needed for the next tier as a decimal', async () => {
    await render(<MoreSections customerId="c1" />, { wrapper });
    await open('▸ Loyalty');
    expect(await screen.findByText('Silver')).toBeTruthy();
    expect(screen.getByText('Spent ₹32,500.50 over 5 bills in the last 12 months')).toBeTruthy();
    expect(screen.getByText('To reach Gold: ₹17,499.50 more spend')).toBeTruthy();
  });

  test('household members with who decides and who pays', async () => {
    await render(<MoreSections customerId="c1" />, { wrapper });
    await open('▸ Household');
    expect(await screen.findByText('Patil family')).toBeTruthy();
    expect(screen.getByText('CUS-1 · 98xxxxxx10 · decides')).toBeTruthy();
    expect(screen.getByText('CUS-2 · pays')).toBeTruthy();
  });

  test('consent and activity', async () => {
    await render(<MoreSections customerId="c1" />, { wrapper });
    await open('▸ Consent');
    expect(await screen.findByText('MARKETING · SMS')).toBeTruthy();
    expect(screen.getByText('Refused')).toBeTruthy();
    await open('▸ Activity and advice');
    expect(await screen.findByText('Crop issue: Yellow leaves')).toBeTruthy();
    expect(screen.getByText('Advice: Spray 19:19:19')).toBeTruthy();
    expect(screen.getByText('Follow up on 20-11-2026')).toBeTruthy();
  });

  test('empty sections say so', async () => {
    mockGet.mockResolvedValue({ household: null });
    await render(<MoreSections customerId="c1" />, { wrapper });
    await open('▸ Household');
    expect(await screen.findByText('Not part of a household.')).toBeTruthy();
  });

  test('a refusal from the server shows the denied state; an error offers a retry', async () => {
    mockGet.mockRejectedValueOnce(new ApiError(403, { title: 'FORBIDDEN' }, 'c-1'));
    await render(<MoreSections customerId="c1" />, { wrapper });
    await open('▸ Farms and crops');
    expect(await screen.findByText(/permission|allowed/i)).toBeTruthy();
    mockGet.mockReset();
    mockGet.mockRejectedValueOnce(new ApiError(500, { title: 'BOOM' }, 'c-2'));
    await open('▸ Loyalty');
    expect(await screen.findByText('Try again')).toBeTruthy();
  });

  test('KYC section is hidden without customer.kyc.view', async () => {
    mockMe = { ...mockMe, permissions: ['customer.view'] };
    await render(<MoreSections customerId="c1" />, { wrapper });
    await screen.findByText('More about this customer');
    expect(screen.queryByLabelText('▸ KYC documents')).toBeNull();
    expect(screen.getByLabelText('▸ Loyalty')).toBeTruthy();
  });

  test('with no permission nothing is shown', async () => {
    mockMe = { ...mockMe, permissions: [] };
    await render(<MoreSections customerId="c1" />, { wrapper });
    expect(screen.queryByText('More about this customer')).toBeNull();
  });

  test('permissions table: only KYC asks for its own permission', () => {
    expect(Object.entries(SECTION_PERM).filter(([, p]) => p !== 'customer.view')).toEqual([['kyc', 'customer.kyc.view']]);
  });

  test('Hindi titles', async () => {
    await setLanguage('hi');
    await render(<MoreSections customerId="c1" />, { wrapper });
    expect(await screen.findByText('इस ग्राहक के बारे में और')).toBeTruthy();
  });
});

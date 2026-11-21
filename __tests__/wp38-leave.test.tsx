import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setLanguage } from '../src/i18n';
import LeaveScreen from '../src/features/hr/LeaveScreen';

const mockGet = jest.fn();
let mockMe: { userId: string; roles: string[]; permissions?: string[] };
jest.mock('../src/auth/AuthProvider', () => ({
  useAuth: () => ({
    status: 'signedIn',
    me: mockMe,
    client: { get: (...a: unknown[]) => mockGet(...a), post: jest.fn() },
    signIn: jest.fn(),
    signOut: jest.fn(),
  }),
}));
jest.mock('../src/device', () => ({ newId: () => 'key-1' }));

let qc: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={qc}>{children}</QueryClientProvider>
);

describe('leave with no leave type (the web says so instead of opening a form that cannot be sent)', () => {
  beforeEach(async () => {
    mockGet.mockReset();
    mockMe = { userId: 'u-1', roles: [], permissions: undefined };
    qc = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retryDelay: 0 } } });
    await setLanguage('en');
    mockGet.mockResolvedValue({ items: [] });
  });
  test('Apply for leave shows that no leave type is set up', async () => {
    await render(<LeaveScreen />, { wrapper });
    await fireEvent.press(await screen.findByLabelText('Apply for leave'));
    expect(await screen.findByText('No leave types are set up.')).toBeTruthy();
  });
});

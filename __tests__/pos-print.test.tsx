import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setLanguage } from '../src/i18n';
import InvoicesScreen from '../src/features/pos/InvoicesScreen';
import { printInvoice, shareInvoicePdf } from '../src/features/pos/print';

const mockGet = jest.fn();
let mockMe: { userId: string; roles: string[]; permissions?: string[] };
const mockClient = { get: (...a: unknown[]) => mockGet(...a), post: jest.fn(), delete: jest.fn() };
jest.mock('../src/auth/AuthProvider', () => ({
  useAuth: () => ({ status: 'signedIn', me: mockMe, client: mockClient, signIn: jest.fn(), signOut: jest.fn() }),
}));
jest.mock('../src/device', () => ({ newId: () => 'key-1' }));
jest.mock('expo-print', () => ({
  printAsync: jest.fn(async () => undefined),
  printToFileAsync: jest.fn(async () => ({ uri: 'file:///cache/invoice.pdf' })),
}));
jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(async () => true),
  shareAsync: jest.fn(async () => undefined),
}));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Print = require('expo-print') as { printAsync: jest.Mock; printToFileAsync: jest.Mock };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Sharing = require('expo-sharing') as { isAvailableAsync: jest.Mock; shareAsync: jest.Mock };

let qc: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
const inv = { id: 'i-1', number: 'INV-1', invoiceDate: '2026-11-11', customerName: 'Ramesh Patil', total: '280.00', creditAmount: '0.00', status: 'FINALIZED' };
const client = mockClient as never;

beforeEach(async () => {
  jest.clearAllMocks();
  Sharing.isAvailableAsync.mockResolvedValue(true);
  mockMe = { userId: 'u-1', roles: [], permissions: undefined };
  qc = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retryDelay: 0 } } });
  await setLanguage('en');
  mockGet.mockImplementation(async (path: string) => {
    if (path === '/sales/invoices') return { items: [inv] };
    if (path === '/sales/invoices/i-1/print') return '<html>INV-1</html>';
    return { items: [] };
  });
});

describe('print helpers', () => {
  test('print asks the server page as A4 text and opens the print dialog with it', async () => {
    await printInvoice(client, 'i-1');
    expect(mockGet).toHaveBeenCalledWith('/sales/invoices/i-1/print', { query: { paper: 'A4' }, as: 'text' });
    expect(Print.printAsync).toHaveBeenCalledWith({ html: '<html>INV-1</html>' });
  });
  test('pdf makes a file from the same page and shares it as a PDF', async () => {
    expect(await shareInvoicePdf(client, 'i-1')).toBe('done');
    expect(Print.printToFileAsync).toHaveBeenCalledWith({ html: '<html>INV-1</html>' });
    expect(Sharing.shareAsync).toHaveBeenCalledWith('file:///cache/invoice.pdf', expect.objectContaining({ mimeType: 'application/pdf' }));
  });
  test('pdf says so when the phone cannot share files, and does not try', async () => {
    Sharing.isAvailableAsync.mockResolvedValue(false);
    expect(await shareInvoicePdf(client, 'i-1')).toBe('noSharing');
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
  });
});

describe('invoices screen print buttons', () => {
  test('Print opens the print dialog', async () => {
    await render(<InvoicesScreen />, { wrapper });
    await screen.findByText('INV-1 · ₹280.00');
    await fireEvent.press(screen.getByText('Print'));
    await waitFor(() => expect(Print.printAsync).toHaveBeenCalledWith({ html: '<html>INV-1</html>' }));
  });
  test('PDF button shares a file; no sharing shows the message', async () => {
    await render(<InvoicesScreen />, { wrapper });
    await screen.findByText('INV-1 · ₹280.00');
    await fireEvent.press(screen.getByText('Save or share PDF'));
    await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalled());
    Sharing.isAvailableAsync.mockResolvedValue(false);
    await fireEvent.press(screen.getByText('Save or share PDF'));
    expect(await screen.findByText('This phone cannot share files.')).toBeTruthy();
  });
  test('a server refusal is shown and nothing is printed', async () => {
    const { ApiError } = jest.requireActual('../src/api/errors');
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/sales/invoices') return { items: [inv] };
      throw new ApiError(403, { title: 'FORBIDDEN' }, 'c-1');
    });
    await render(<InvoicesScreen />, { wrapper });
    await screen.findByText('INV-1 · ₹280.00');
    await fireEvent.press(screen.getByText('Print'));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(Print.printAsync).not.toHaveBeenCalled();
  });
  test('buttons are hidden without the print permission', async () => {
    mockMe = { userId: 'u-1', roles: [], permissions: ['sales.view'] };
    await render(<InvoicesScreen />, { wrapper });
    await screen.findByText('INV-1 · ₹280.00');
    expect(screen.queryByText('Print')).toBeNull();
    expect(screen.queryByText('Save or share PDF')).toBeNull();
  });
});

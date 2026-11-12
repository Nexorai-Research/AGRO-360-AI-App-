import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '../src/api/errors';
import { i18n, setLanguage } from '../src/i18n';
import step5 from '../i18n-parts/step5.json';
import usr from '../i18n-parts/usr.json';
import DocumentsScreen from '../src/features/admin/DocumentsScreen';

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockPick = jest.fn();
const mockShare = jest.fn();
let mockMe: { userId: string; roles: string[]; permissions?: string[] };
let mockId = 0;
const mockClient = { get: (...a: unknown[]) => mockGet(...a), post: (...a: unknown[]) => mockPost(...a) };
jest.mock('../src/auth/AuthProvider', () => ({
  useAuth: () => ({ status: 'signedIn', me: mockMe, client: mockClient, signIn: jest.fn(), signOut: jest.fn() }),
}));
jest.mock('../src/device', () => ({ newId: () => `key-${++mockId}` }));
jest.mock('../src/features/admin/usr-files', () => ({
  pickFile: (...a: unknown[]) => mockPick(...a),
  saveAndShare: (...a: unknown[]) => mockShare(...a),
}));

let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
const doc = { id: 'doc-1', title: 'Fertiliser licence', category: 'LICENCE', expiresOn: '2027-03-31', notes: null, active: true, status: 'ACTIVE', currentVersion: 2, filename: 'lic.pdf', contentType: 'application/pdf', sizeBytes: 2048, uploadedAt: '2026-10-01T04:00:00Z', updatedAt: '2026-10-01T04:00:00Z' };

beforeAll(() => {
  for (const l of ['en', 'hi', 'mr'] as const) {
    i18n.addResourceBundle(l, 'translation', step5[l], true, true);
    i18n.addResourceBundle(l, 'translation', usr[l], true, true);
  }
});
beforeEach(async () => {
  [mockGet, mockPost, mockPick, mockShare].forEach((m) => m.mockReset());
  mockId = 0;
  mockMe = { userId: 'u-1', roles: [], permissions: undefined };
  client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retryDelay: 0 } } });
  await setLanguage('en');
  mockGet.mockImplementation(async (path: string) => {
    if (path === '/documents') return { items: [doc], next_cursor: null };
    if (path === '/documents/dashboard') return { total: 5, byStatus: { ACTIVE: 3, EXPIRING_SOON: 1, EXPIRED: 1 } };
    if (path === '/documents/doc-1/versions')
      return { items: [{ version: 2, filename: 'lic.pdf', contentType: 'application/pdf', sizeBytes: 2048, uploadedAt: '2026-10-01T04:00:00Z' }, { version: 1, filename: 'old.pdf', contentType: 'application/pdf', sizeBytes: 1024, uploadedAt: '2026-09-01T04:00:00Z' }] };
    if (path === '/documents/doc-1/content') return { filename: 'lic.pdf', contentType: 'application/pdf', contentBase64: 'QUJD' };
    throw new Error(`unexpected ${path}`);
  });
});

const show = async () => {
  await render(<DocumentsScreen />, { wrapper });
  await screen.findByText('Fertiliser licence');
};

describe('dashboard', () => {
  test('shows the counts and a tile filters the list', async () => {
    await show();
    expect(await screen.findByLabelText('Expiring soon: 1')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Expired: 1'));
    await screen.findByText('Fertiliser licence');
    expect(mockGet.mock.calls.filter((c) => c[0] === '/documents').at(-1)![1].query.status).toBe('EXPIRED');
  });
});

describe('upload', () => {
  const small = { name: 'licence.pdf', size: 2048, base64: 'QUJD' };

  test('picks a file, uploads it with a key, and a lost answer retries with the SAME key', async () => {
    mockPick.mockResolvedValue(small);
    let first = true;
    mockPost.mockImplementation(async () => {
      if (first) {
        first = false;
        throw new ApiError(0, null);
      }
      return doc;
    });
    await show();
    await fireEvent.press(screen.getByLabelText('Upload document'));
    await fireEvent.press(await screen.findByLabelText('Choose file'));
    await screen.findByText(/licence.pdf/);
    await fireEvent.changeText(screen.getByLabelText('Expiry date (optional)'), '2027-03-31');
    await fireEvent.press(screen.getAllByLabelText('Upload document').at(-1)!);
    await screen.findByText(/No network|reference/);
    await fireEvent.press(screen.getAllByLabelText('Upload document').at(-1)!);
    expect(await screen.findByText('Document uploaded.')).toBeTruthy();
    const [path, opts] = mockPost.mock.calls[0]!;
    expect(path).toBe('/documents');
    expect(opts.body).toEqual({ title: 'licence.pdf', category: 'GENERAL', expiresOn: '2027-03-31', notes: null, filename: 'licence.pdf', contentBase64: 'QUJD' });
    expect(mockPost.mock.calls[1]![1].idempotencyKey).toBe(opts.idempotencyKey);
  });

  test('a file that is too big or the wrong type is refused before sending', async () => {
    mockPick.mockResolvedValueOnce({ name: 'big.pdf', size: 5 * 1024 * 1024, base64: 'QUJD' });
    await show();
    await fireEvent.press(screen.getByLabelText('Upload document'));
    await fireEvent.press(await screen.findByLabelText('Choose file'));
    expect(await screen.findByText('The file is larger than 4 MB.')).toBeTruthy();
    await fireEvent.press(screen.getAllByLabelText('Upload document').at(-1)!);
    mockPick.mockResolvedValueOnce({ name: 'run.exe', size: 10, base64: 'QUJD' });
    await fireEvent.press(screen.getByLabelText('Choose another file'));
    expect(await screen.findByText(/This file type is not allowed/)).toBeTruthy();
    expect(mockPost).not.toHaveBeenCalled();
  });

  test('without a file the form asks for one; cancelling the picker changes nothing', async () => {
    mockPick.mockResolvedValue(null);
    await show();
    await fireEvent.press(screen.getByLabelText('Upload document'));
    await fireEvent.press(await screen.findByLabelText('Choose file'));
    await fireEvent.press(screen.getAllByLabelText('Upload document').at(-1)!);
    expect(await screen.findByText('Choose a file.')).toBeTruthy();
    expect(mockPost).not.toHaveBeenCalled();
  });

  test('a duplicate file refusal shows the reference', async () => {
    mockPick.mockResolvedValue(small);
    mockPost.mockRejectedValue(new ApiError(409, { title: 'DUPLICATE_DOCUMENT', correlationId: 'c-12' }));
    await show();
    await fireEvent.press(screen.getByLabelText('Upload document'));
    await fireEvent.press(await screen.findByLabelText('Choose file'));
    await screen.findByText(/licence.pdf/);
    await fireEvent.press(screen.getAllByLabelText('Upload document').at(-1)!);
    expect(await screen.findByText(/c-12/)).toBeTruthy();
  });

  test('read-only people see no upload button', async () => {
    mockMe = { userId: 'u-1', roles: [], permissions: ['org.document.view'] };
    await show();
    expect(screen.queryByLabelText('Upload document')).toBeNull();
  });
});

describe('versions, download, replace', () => {
  const openDoc = async () => {
    await show();
    await fireEvent.press(screen.getByLabelText('Show details'));
  };

  test('lists versions and downloads one through the share sheet', async () => {
    mockShare.mockResolvedValue(true);
    await openDoc();
    await fireEvent.press(await screen.findByLabelText('Versions'));
    expect(await screen.findByText('old.pdf · 1 KB · 01/09/2026 09:30')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Download version 1'));
    expect(await screen.findByText('File ready.')).toBeTruthy();
    const c = mockGet.mock.calls.filter((x) => x[0] === '/documents/doc-1/content').at(-1)!;
    expect(c[1].query).toEqual({ version: 1 });
    expect(mockShare).toHaveBeenCalledWith('lic.pdf', 'application/pdf', 'QUJD');
  });

  test('says so when this phone cannot share', async () => {
    mockShare.mockResolvedValue(false);
    await openDoc();
    await fireEvent.press(await screen.findByLabelText('Download file'));
    expect(await screen.findByText(/cannot open the share sheet/)).toBeTruthy();
  });

  test('a download failure shows the reference', async () => {
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/documents') return { items: [doc], next_cursor: null };
      if (path === '/documents/doc-1/content') throw new ApiError(500, { title: 'BOOM', correlationId: 'c-30' });
      throw new Error('x');
    });
    await openDoc();
    await fireEvent.press(await screen.findByLabelText('Download file'));
    expect(await screen.findByText(/c-30/)).toBeTruthy();
  });

  test('replace uploads a new version with the file name and content only', async () => {
    mockPick.mockResolvedValue({ name: 'lic2.pdf', size: 100, base64: 'REVG' });
    mockPost.mockResolvedValue({ ...doc, currentVersion: 3 });
    await openDoc();
    await fireEvent.press(await screen.findByLabelText('Replace file'));
    await fireEvent.press(screen.getByLabelText('Choose file'));
    await screen.findByText(/lic2.pdf/);
    await fireEvent.press(screen.getByLabelText('Upload new version'));
    expect(await screen.findByText('New version saved.')).toBeTruthy();
    const [path, opts] = mockPost.mock.calls[0]!;
    expect(path).toBe('/documents/doc-1/versions');
    expect(opts.body).toEqual({ filename: 'lic2.pdf', contentBase64: 'REVG' });
    expect(opts.idempotencyKey).toBeTruthy();
  });

  test('view-only people can download but not replace', async () => {
    mockMe = { userId: 'u-1', roles: [], permissions: ['org.document.view'] };
    await openDoc();
    expect(await screen.findByLabelText('Download file')).toBeTruthy();
    expect(screen.queryByLabelText('Replace file')).toBeNull();
  });
});

describe('states and languages', () => {
  test('permission denied sends nothing', async () => {
    mockMe = { userId: 'u-1', roles: [], permissions: [] };
    await render(<DocumentsScreen />, { wrapper });
    expect(await screen.findByText('You do not have permission to see documents.')).toBeTruthy();
    expect(mockGet).not.toHaveBeenCalled();
  });
  test('Hindi and Marathi', async () => {
    await setLanguage('hi');
    const { unmount } = await render(<DocumentsScreen />, { wrapper });
    expect(await screen.findByLabelText('दस्तावेज़ अपलोड करें')).toBeTruthy();
    unmount();
    await setLanguage('mr');
    await render(<DocumentsScreen />, { wrapper });
    expect(await screen.findByLabelText('दस्तऐवज अपलोड करा')).toBeTruthy();
  });
});

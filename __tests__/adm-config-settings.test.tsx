import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '../src/api/errors';
import { i18n, setLanguage } from '../src/i18n';
import parts from '../i18n-parts/adm.json';
import ConfigurationScreen from '../src/features/adm/ConfigurationScreen';
import SettingsEditScreen from '../src/features/adm/SettingsEditScreen';

const mockGet = jest.fn();
const mockPut = jest.fn();
let mockMe: { userId: string; roles: string[]; permissions?: string[] };
let mockId = 0;
const mockClient = { get: (...a: unknown[]) => mockGet(...a), put: (...a: unknown[]) => mockPut(...a) };
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

let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

beforeAll(() => {
  for (const l of ['en', 'hi', 'mr'] as const) i18n.addResourceBundle(l, 'translation', parts[l], true, true);
});
beforeEach(async () => {
  [mockGet, mockPut].forEach((m) => m.mockReset());
  mockId = 0;
  mockMe = { userId: 'u-1', roles: [], permissions: undefined };
  client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retryDelay: 0 } } });
  await setLanguage('en');
});

describe('configuration screen', () => {
  const fieldsCfg = {
    screen: 'customer',
    fields: [
      {
        field: 'name',
        label: 'Name',
        locked: true,
        visible: true,
        required: true,
        labels: {},
        sortOrder: null,
      },
      {
        field: 'email',
        label: 'Email',
        locked: false,
        visible: true,
        required: null,
        labels: { en: 'E-mail', ta: 'மின்னஞ்சல்' },
        sortOrder: 4,
      },
    ],
  };
  const menuCfg = { items: [{ key: 'sales', label: 'Sales', labels: {}, sortOrder: 10 }] };
  beforeEach(() => {
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/config/fields') return { items: [{ screen: 'customer', fields: 2 }] };
      if (path === '/config/fields/customer') return fieldsCfg;
      if (path === '/config/menu') return menuCfg;
      throw new Error(`unexpected ${path}`);
    });
  });
  const show = () => render(<ConfigurationScreen />, { wrapper });

  test('shows fields; a locked field has no toggles', async () => {
    await show();
    expect(await screen.findByText('Email')).toBeTruthy();
    expect(screen.getByText('Always shown and required.')).toBeTruthy();
    expect(screen.queryByLabelText('Name: shown')).toBeNull();
    expect(screen.getByLabelText('Email: shown')).toBeTruthy();
  });

  test('saving sends hidden/required flags, keeps labels of other languages and the order', async () => {
    mockPut.mockResolvedValue(fieldsCfg);
    await show();
    await screen.findByText('Email');
    await fireEvent.press(screen.getByLabelText('Email: required'));
    await fireEvent.changeText(screen.getByLabelText('Email - हिन्दी'), 'ईमेल');
    await fireEvent.press(screen.getByLabelText('Save field setup'));
    expect(await screen.findByText('Field setup saved.')).toBeTruthy();
    const [path, opts] = mockPut.mock.calls[0]!;
    expect(path).toBe('/config/fields/customer');
    expect(opts.body.fields).toEqual([
      { field: 'name', labels: {}, sortOrder: null },
      {
        field: 'email',
        visible: null,
        required: true,
        labels: { en: 'E-mail', ta: 'மின்னஞ்சல்', hi: 'ईमेल' },
        sortOrder: 4,
      },
    ]);
    expect(opts.idempotencyKey).toBe('key-1');
  });

  test('hiding a field sends visible false and drops required', async () => {
    mockPut.mockResolvedValue(fieldsCfg);
    await show();
    await screen.findByText('Email');
    await fireEvent.press(screen.getByLabelText('Email: shown'));
    await fireEvent.press(screen.getByLabelText('Save field setup'));
    await screen.findByText('Field setup saved.');
    expect(mockPut.mock.calls[0]![1].body.fields[1]).toMatchObject({
      field: 'email',
      visible: false,
      required: null,
    });
  });

  test('a bad order blocks the save', async () => {
    await show();
    await screen.findByText('Email');
    await fireEvent.changeText(screen.getByLabelText('Email: order (0 to 999)'), '5000');
    expect(screen.getByText('Enter a whole number from 0 to 999 or leave empty.')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Save field setup'));
    expect(mockPut).not.toHaveBeenCalled();
  });

  test('lost answer retries with the same key', async () => {
    mockPut.mockRejectedValueOnce(new ApiError(0, null)).mockResolvedValue(fieldsCfg);
    await show();
    await screen.findByText('Email');
    await fireEvent.press(screen.getByLabelText('Email: required'));
    await fireEvent.press(screen.getByLabelText('Save field setup'));
    await screen.findByText('No network. Check your connection and try again.');
    await fireEvent.press(screen.getByLabelText('Save field setup'));
    await screen.findByText('Field setup saved.');
    expect(mockPut.mock.calls[1]![1].idempotencyKey).toBe(mockPut.mock.calls[0]![1].idempotencyKey);
  });

  test('without org.settings.manage it is view only', async () => {
    mockMe = { userId: 'u-1', roles: [], permissions: ['identity.session.view'] };
    await show();
    expect(await screen.findByText('Email')).toBeTruthy();
    expect(screen.getByText('You can see the setup but not change it.')).toBeTruthy();
    expect(screen.queryByLabelText('Save field setup')).toBeNull();
  });

  test('menu: rename and reorder are saved', async () => {
    mockPut.mockResolvedValue(menuCfg);
    await show();
    await screen.findByText('Email');
    await fireEvent.press(screen.getByLabelText('Menu'));
    expect(await screen.findByText('Sales')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Sales - मराठी'), 'विक्री');
    await fireEvent.changeText(screen.getByLabelText('Sales: order (0 to 999)'), '3');
    await fireEvent.press(screen.getByLabelText('Save menu'));
    expect(await screen.findByText('Menu saved.')).toBeTruthy();
    expect(mockPut.mock.calls[0]![0]).toBe('/config/menu');
    expect(mockPut.mock.calls[0]![1].body.items).toEqual([
      { key: 'sales', labels: { mr: 'विक्री' }, sortOrder: 3 },
    ]);
  });

  test('loading state', async () => {
    mockGet.mockImplementation(() => new Promise(() => undefined));
    await show();
    expect(await screen.findByText('Loading...')).toBeTruthy();
  });

  test('error shows the reference', async () => {
    mockGet.mockRejectedValue(new ApiError(500, { title: 'BOOM', correlationId: 'c-3' }));
    await show();
    expect(await screen.findByText(/reference c-3/)).toBeTruthy();
  });

  test('offline state', async () => {
    mockGet.mockRejectedValue(new ApiError(0, null));
    await show();
    expect(await screen.findByText('No network. Check your connection and try again.')).toBeTruthy();
  });

  test('permission denied: nothing is called', async () => {
    mockMe = { userId: 'u-1', roles: [], permissions: ['sales.invoice.view'] };
    await show();
    expect(await screen.findByText('You do not have permission to see this.')).toBeTruthy();
    expect(mockGet).not.toHaveBeenCalled();
  });
});

describe('edit settings screen', () => {
  const company = {
    legalName: 'Patil Agro Traders',
    tradeName: null,
    gstin: '27ABCDE1234F1Z5',
    pan: 'ABCDE1234F',
    stateCode: '27',
    address: 'Main road',
    contactPhone: '9876543210',
    contactEmail: null,
    bankName: null,
    bankAccountHolder: null,
    bankAccountNumber: null,
    bankIfsc: null,
    signatoryName: null,
    signatoryDesignation: null,
    version: 4,
  };
  const modes = {
    items: [
      { code: 'CASH', enabled: true, ledgerAccountId: 'l-1', upiVpa: null, version: 2 },
      { code: 'UPI', enabled: false, ledgerAccountId: null, upiVpa: null, version: 1 },
      { code: 'CHEQUE', enabled: false, ledgerAccountId: 'l-2', upiVpa: null, version: 1 },
    ],
  };
  const pol = {
    settings: {
      'inventory.allow_negative_stock': {
        value: false,
        default: false,
        type: 'bool',
        specifiedBySource: true,
        description: 'Allow selling stock below zero',
        customised: false,
      },
      'credit.default_days': {
        value: 0,
        default: 0,
        type: 'int',
        specifiedBySource: false,
        description: 'Default credit period in days',
        customised: false,
      },
    },
    costingMethod: { effective: 'WEIGHTED_AVERAGE', scheduled: [] },
  };
  beforeEach(() => {
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/settings/company') return company;
      if (path === '/settings/payment-modes') return modes;
      if (path === '/settings/general') return pol;
      throw new Error(`unexpected ${path}`);
    });
  });
  const show = () => render(<SettingsEditScreen />, { wrapper });

  test('company: only changed fields are sent, with the version; emptied optional fields go as null', async () => {
    mockPut.mockResolvedValue({ profile: company, warnings: [] });
    await show();
    await screen.findByDisplayValue('Patil Agro Traders');
    await fireEvent.changeText(screen.getByLabelText('Trade name'), 'Patil Agro');
    await fireEvent.changeText(screen.getByLabelText('Registered address'), '');
    await fireEvent.press(screen.getByLabelText('Save company profile'));
    expect(await screen.findByText('Company profile saved.')).toBeTruthy();
    const [path, opts] = mockPut.mock.calls[0]!;
    expect(path).toBe('/settings/company');
    expect(opts.body).toEqual({ tradeName: 'Patil Agro', address: null });
    expect(opts.version).toBe(4);
    expect(opts.idempotencyKey).toBe('key-1');
  });

  test('company: a bad GSTIN or email blocks the save', async () => {
    await show();
    await screen.findByDisplayValue('Patil Agro Traders');
    await fireEvent.changeText(screen.getByLabelText('GSTIN'), '27ABC');
    await fireEvent.changeText(screen.getByLabelText('Email'), 'nope');
    expect(screen.getAllByText('This value is not valid.').length).toBe(2);
    await fireEvent.press(screen.getByLabelText('Save company profile'));
    expect(mockPut).not.toHaveBeenCalled();
  });

  test('company: a stale version error is shown with its reference and the key is kept for retry', async () => {
    mockPut
      .mockRejectedValueOnce(new ApiError(409, { title: 'STALE_VERSION', correlationId: 'c-6' }))
      .mockResolvedValue({ profile: company });
    await show();
    await screen.findByDisplayValue('Patil Agro Traders');
    await fireEvent.changeText(screen.getByLabelText('Trade name'), 'Patil Agro');
    await fireEvent.press(screen.getByLabelText('Save company profile'));
    expect(await screen.findByText(/Someone else changed this/)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Save company profile'));
    await screen.findByText('Company profile saved.');
    expect(mockPut.mock.calls[1]![1].idempotencyKey).toBe(mockPut.mock.calls[0]![1].idempotencyKey);
  });

  test('payment modes: turn off one with a ledger; a mode without a ledger cannot be turned on here', async () => {
    mockPut.mockResolvedValue(modes.items[0]);
    await show();
    await screen.findByText('Payment modes');
    expect(
      await screen.findByText('Link a ledger account on the web app before turning this on.'),
    ).toBeTruthy();
    expect(screen.queryByLabelText('Turn on UPI')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Turn off CASH'));
    expect(await screen.findByText('Payment mode saved.')).toBeTruthy();
    expect(mockPut.mock.calls[0]![0]).toBe('/settings/payment-modes');
    expect(mockPut.mock.calls[0]![1]).toMatchObject({ body: { code: 'CASH', enabled: false }, version: 2 });
  });

  test('payment modes: UPI address is checked and saved', async () => {
    mockPut.mockResolvedValue(modes.items[1]);
    await show();
    await screen.findByLabelText('UPI address (name@bank)');
    await fireEvent.changeText(screen.getByLabelText('UPI address (name@bank)'), 'nope');
    expect(screen.getByText('Enter a UPI address like name@bank.')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('UPI address (name@bank)'), 'shop@okbank');
    await fireEvent.press(screen.getByLabelText('Save UPI address'));
    await screen.findByText('Payment mode saved.');
    expect(mockPut.mock.calls[0]![1]).toMatchObject({
      body: { code: 'UPI', upiVpa: 'shop@okbank' },
      version: 1,
    });
  });

  test('rules: only changed values are sent; an int is sent as a number', async () => {
    mockPut.mockResolvedValue(pol);
    await show();
    await screen.findByText('Business rules');
    await fireEvent.press(await screen.findByLabelText('Allow selling stock below zero'));
    await fireEvent.changeText(screen.getByLabelText('Default credit period in days'), '30');
    expect(
      screen.getByText('Proposed default, not in the requirements. Confirm with the business owner.'),
    ).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Save rules'));
    expect(await screen.findByText('Rules saved.')).toBeTruthy();
    expect(mockPut.mock.calls[0]![0]).toBe('/settings/general');
    expect(mockPut.mock.calls[0]![1].body).toEqual({
      settings: { 'inventory.allow_negative_stock': true, 'credit.default_days': 30 },
    });
  });

  test('rules: a non-number int blocks the save', async () => {
    await show();
    await fireEvent.changeText(await screen.findByLabelText('Default credit period in days'), '3.5');
    expect(screen.getByText('This value is not valid.')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Save rules'));
    expect(mockPut).not.toHaveBeenCalled();
  });

  test('costing change needs a valid date and sends method and date', async () => {
    mockPut.mockResolvedValue(pol);
    await show();
    await fireEvent.press(await screen.findByLabelText('FIFO'));
    await fireEvent.changeText(
      screen.getByLabelText('From (first day of a financial year, YYYY-MM-DD)'),
      '2027-02-30',
    );
    expect(screen.getByText('Enter a date as YYYY-MM-DD.')).toBeTruthy();
    await fireEvent.changeText(
      screen.getByLabelText('From (first day of a financial year, YYYY-MM-DD)'),
      '2027-04-01',
    );
    await fireEvent.press(screen.getByLabelText('Schedule change'));
    expect(await screen.findByText('Costing change scheduled.')).toBeTruthy();
    expect(mockPut.mock.calls[0]![1].body).toEqual({
      costingMethod: 'FIFO',
      costingEffectiveFrom: '2027-04-01',
    });
  });

  test('only org.config.view: rules and modes are view only, company is hidden', async () => {
    mockMe = { userId: 'u-1', roles: [], permissions: ['org.config.view'] };
    await show();
    expect(await screen.findByText('You can see these rules but not change them.')).toBeTruthy();
    expect(screen.queryByText('Company profile')).toBeNull();
    expect(screen.queryByLabelText('Save rules')).toBeNull();
    expect(screen.queryByLabelText('Turn off CASH')).toBeNull();
    expect(mockGet.mock.calls.some((c) => c[0] === '/settings/company')).toBe(false);
  });

  test('denied without any settings permission', async () => {
    mockMe = { userId: 'u-1', roles: [], permissions: ['sales.invoice.view'] };
    await show();
    expect(await screen.findByText('You do not have permission to edit settings.')).toBeTruthy();
    expect(mockGet).not.toHaveBeenCalled();
  });

  test('a failing part shows its reference, the others still load, Hindi text', async () => {
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/settings/company') throw new ApiError(500, { title: 'BOOM', correlationId: 'c-11' });
      if (path === '/settings/payment-modes') return modes;
      return pol;
    });
    await setLanguage('hi');
    await show();
    expect(await screen.findByText(/c-11/)).toBeTruthy();
    expect(await screen.findByText('भुगतान तरीके')).toBeTruthy();
  });
});

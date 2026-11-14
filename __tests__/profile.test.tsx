import { fireEvent, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setLanguage } from '../src/i18n';
import { ProfileCard } from '../src/features/home/ProfileCard';
import { groupPermissions, initials, prettyRole, splitRoles } from '../src/features/home/profile-logic';

let mockMe: { userId: string; roles: string[]; permissions?: string[] } | null;
const mockSignOut = jest.fn();
let mockName: string | null = null;
jest.mock('../src/auth/AuthProvider', () => ({
  useAuth: () => ({ me: mockMe, signOut: mockSignOut }),
}));
jest.mock('../src/auth/auth', () => ({ signedInName: () => mockName }));

const PERMS = ['ai.view', 'ai.audit.view', 'compliance.case.manage', 'reports.sales', 'agri.reference.manage'];

const show = async () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ProfileCard />
    </QueryClientProvider>,
  );

beforeEach(async () => {
  jest.clearAllMocks();
  mockName = 'a.owner';
  mockMe = {
    userId: '2af1ea6b-ea86-489f-845c-a8ea87fd8b70',
    roles: ['default-roles-agro360', 'offline_access', 'uma_authorization', 'franchise_admin'],
    permissions: PERMS,
  };
  await setLanguage('en');
});

describe('profile logic', () => {
  it('makes a readable role name', () => {
    expect(prettyRole('franchise_admin')).toBe('Franchise admin');
    expect(prettyRole('OWNER')).toBe('Owner');
  });

  it('keeps the system roles apart from the business roles', () => {
    expect(splitRoles(['default-roles-agro360', 'offline_access', 'uma_authorization', 'franchise_admin'])).toEqual({
      business: ['Franchise admin'],
      system: ['default-roles-agro360', 'offline_access', 'uma_authorization'],
    });
  });

  it('makes avatar letters, and a mark when there is no name', () => {
    expect(initials('a.owner')).toBe('AO');
    expect(initials('Ravi Kumar Singh')).toBe('RK');
    expect(initials(null)).toBe('?');
  });

  it('groups permissions by module, sorted, and filters them', () => {
    const g = groupPermissions(PERMS);
    expect(g.map((x) => x.title)).toEqual(['Agri', 'AI', 'Compliance', 'Reports']);
    expect(g.find((x) => x.prefix === 'ai')!.items).toEqual(['ai.audit.view', 'ai.view']);
    expect(groupPermissions(PERMS, 'AUDIT').flatMap((x) => x.items)).toEqual(['ai.audit.view']);
    expect(groupPermissions(PERMS, 'zzz')).toEqual([]);
  });
});

describe('profile card', () => {
  it('shows the user name from the token, not the id, with readable roles and counts', async () => {
    await show();
    expect(screen.getByText('a.owner')).toBeTruthy();
    expect(screen.queryByText(/2af1ea6b/)).toBeNull();
    expect(screen.getByText('Franchise admin')).toBeTruthy();
    expect(screen.getByText(/System roles: default-roles-agro360, offline_access, uma_authorization/)).toBeTruthy();
    expect(screen.getByText('5')).toBeTruthy(); // permissions
    expect(screen.getByText('4')).toBeTruthy(); // roles
  });

  it('shows a neutral title when the name cannot be read', async () => {
    mockName = null;
    await show();
    expect(screen.getByText('Your account')).toBeTruthy();
  });

  it('lists permissions by module, opens one module, and searches across all', async () => {
    await show();
    expect(screen.queryByText('ai.view')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Show permissions'));
    expect(screen.getByLabelText('AI, 2')).toBeTruthy();
    expect(screen.queryByText('ai.view')).toBeNull(); // collapsed
    await fireEvent.press(screen.getByLabelText('AI, 2'));
    expect(screen.getByText('ai.view')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Search permissions'), 'manage');
    expect(screen.getByText('compliance.case.manage')).toBeTruthy();
    expect(screen.getByText('agri.reference.manage')).toBeTruthy();
    expect(screen.queryByText('ai.view')).toBeNull();
    await fireEvent.changeText(screen.getByLabelText('Search permissions'), 'zzz');
    expect(screen.getByText('No permission matches "zzz".')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Hide permissions'));
    expect(screen.queryByLabelText('Search permissions')).toBeNull();
  });

  it('hides the permission button when the list is unknown', async () => {
    mockMe = { userId: 'u-1', roles: ['OWNER'] };
    await show();
    expect(screen.queryByLabelText('Show permissions')).toBeNull();
  });

  it('signs out and clears the cached numbers', async () => {
    const client = new QueryClient();
    client.setQueryData(['home', 'x'], { a: 1 });
    await render(
      <QueryClientProvider client={client}>
        <ProfileCard />
      </QueryClientProvider>,
    );
    await fireEvent.press(screen.getByLabelText('Sign out'));
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(client.getQueryData(['home', 'x'])).toBeUndefined();
  });

  it('shows Hindi text', async () => {
    await setLanguage('hi');
    await show();
    expect(screen.getByText('इस रूप में साइन इन')).toBeTruthy();
    expect(screen.getByText('अनुमतियाँ')).toBeTruthy();
  });
});

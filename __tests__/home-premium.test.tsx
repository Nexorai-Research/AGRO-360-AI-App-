import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { setLanguage } from '../src/i18n';
import { ModuleGrid } from '../src/features/home/ModuleGrid';
import { BottomNav } from '../src/ui/BottomNav';
import { visibleModules } from '../src/features/home/modules';

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
let mockCanGoBack = true;
let mockPath = '/';
jest.mock('expo-router', () => ({
  router: {
    push: (...a: unknown[]) => mockPush(...a),
    back: () => mockBack(),
    canGoBack: () => mockCanGoBack,
    replace: (...a: unknown[]) => mockReplace(...a),
  },
  usePathname: () => mockPath,
}));

const metrics = {
  frame: { x: 0, y: 0, width: 360, height: 800 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};
const nav = () => (
  <SafeAreaProvider initialMetrics={metrics}>
    <BottomNav />
  </SafeAreaProvider>
);

beforeEach(async () => {
  jest.clearAllMocks();
  mockCanGoBack = true;
  mockPath = '/';
  await SecureStore.deleteItemAsync('agro360.home.modules.off');
  await SecureStore.deleteItemAsync('agro360.home.modules.hidden');
  await setLanguage('en');
});

describe('module on/off switches', () => {
  it('every card has a switch, all on by default', async () => {
    await render(<ModuleGrid />);
    for (const m of visibleModules([]))
      expect(screen.getByTestId(`module-switch-${m.id}`).props.value).toBe(true);
  });

  it('switching a card off dims it, shows Off and stops it opening; switching on restores it', async () => {
    await render(<ModuleGrid />);
    await fireEvent(screen.getByTestId('module-switch-customers'), 'valueChange', false);
    expect(screen.getByTestId('module-switch-customers').props.value).toBe(false);
    expect(screen.getByText('Off')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('module-customers'));
    expect(mockPush).not.toHaveBeenCalled();
    // other cards still open
    await fireEvent.press(screen.getByTestId('module-ops'));
    expect(mockPush).toHaveBeenCalledWith('/module/ops');
    await fireEvent(screen.getByTestId('module-switch-customers'), 'valueChange', true);
    await fireEvent.press(screen.getByTestId('module-customers'));
    expect(mockPush).toHaveBeenCalledWith('/module/customers');
  });

  it('remembers the choice on the phone and restores it next time', async () => {
    const first = await render(<ModuleGrid />);
    await fireEvent(screen.getByTestId('module-switch-staff'), 'valueChange', false);
    expect(await SecureStore.getItemAsync('agro360.home.modules.off')).toBe(JSON.stringify(['staff']));
    await first.unmount();
    await render(<ModuleGrid />);
    await waitFor(() => expect(screen.getByTestId('module-switch-staff').props.value).toBe(false));
    expect(screen.getByTestId('module-switch-ops').props.value).toBe(true);
  });

  it('ignores a damaged saved value', async () => {
    await SecureStore.setItemAsync('agro360.home.modules.off', '{not json');
    await render(<ModuleGrid />);
    expect(screen.getByTestId('module-switch-ops').props.value).toBe(true);
  });

  it('shows Off in Hindi', async () => {
    await setLanguage('hi');
    await render(<ModuleGrid />);
    await fireEvent(screen.getByTestId('module-switch-ops'), 'valueChange', false);
    expect(screen.getByText('बंद')).toBeTruthy();
  });
});

describe('master switch for all modules', () => {
  const cards = () => visibleModules([]).map((m) => screen.queryByTestId(`module-${m.id}`));

  it('is on by default and every card is shown', async () => {
    await render(<ModuleGrid />);
    expect(screen.getByTestId('modules-master-switch').props.value).toBe(true);
    expect(cards().every((c) => c !== null)).toBe(true);
    expect(screen.queryByTestId('modules-hidden-note')).toBeNull();
  });

  it('off hides every module card and says so; on shows them all again', async () => {
    await render(<ModuleGrid />);
    await fireEvent(screen.getByTestId('modules-master-switch'), 'valueChange', false);
    expect(cards().every((c) => c === null)).toBe(true);
    expect(screen.getByTestId('modules-hidden-note')).toBeTruthy();
    expect(screen.getByText('All modules are hidden. Switch on to show them all again.')).toBeTruthy();
    await fireEvent(screen.getByTestId('modules-master-switch'), 'valueChange', true);
    expect(cards().every((c) => c !== null)).toBe(true);
  });

  it('on shows every module, also the ones switched off one by one', async () => {
    await render(<ModuleGrid />);
    await fireEvent(screen.getByTestId('module-switch-ops'), 'valueChange', false);
    await fireEvent(screen.getByTestId('module-switch-staff'), 'valueChange', false);
    await fireEvent(screen.getByTestId('modules-master-switch'), 'valueChange', false);
    await fireEvent(screen.getByTestId('modules-master-switch'), 'valueChange', true);
    for (const m of visibleModules([]))
      expect(screen.getByTestId(`module-switch-${m.id}`).props.value).toBe(true);
    expect(await SecureStore.getItemAsync('agro360.home.modules.off')).toBe('[]');
  });

  it('remembers hidden after the app is opened again', async () => {
    const first = await render(<ModuleGrid />);
    await fireEvent(screen.getByTestId('modules-master-switch'), 'valueChange', false);
    expect(await SecureStore.getItemAsync('agro360.home.modules.hidden')).toBe('1');
    await first.unmount();
    await render(<ModuleGrid />);
    await waitFor(() => expect(screen.getByTestId('modules-master-switch').props.value).toBe(false));
    expect(screen.queryByTestId('module-ops')).toBeNull();
  });

  it('shows Hindi text', async () => {
    await setLanguage('hi');
    await render(<ModuleGrid />);
    await fireEvent(screen.getByTestId('modules-master-switch'), 'valueChange', false);
    expect(screen.getByText('सभी मॉड्यूल छिपे हैं। सब दोबारा दिखाने के लिए स्विच ऑन करें।')).toBeTruthy();
  });
});

describe('bottom navigation', () => {
  it('Home goes to the start screen', async () => {
    await render(nav());
    await fireEvent.press(screen.getByTestId('nav-home'));
    expect(mockReplace).toHaveBeenCalledWith('/');
  });

  it('Back goes back, or to Home when there is nothing to go back to', async () => {
    await render(nav());
    await fireEvent.press(screen.getByTestId('nav-back'));
    expect(mockBack).toHaveBeenCalled();
    mockCanGoBack = false;
    await fireEvent.press(screen.getByTestId('nav-back'));
    expect(mockReplace).toHaveBeenCalledWith('/');
  });

  it('Home is marked active only on the home screen', async () => {
    const r = await render(nav());
    expect(screen.getByTestId('nav-home').props.accessibilityState.selected).toBe(true);
    await r.unmount();
    mockPath = '/stock';
    await render(nav());
    expect(screen.getByTestId('nav-home').props.accessibilityState.selected).toBe(false);
  });

  it('Menu lists every module and opens the one tapped', async () => {
    await render(nav());
    await fireEvent.press(screen.getByTestId('nav-menu'));
    for (const m of visibleModules([])) expect(screen.getByTestId(`menu-${m.id}`)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('menu-customers'));
    expect(mockPush).toHaveBeenCalledWith('/module/customers');
  });

  it('shows Hindi labels', async () => {
    await setLanguage('hi');
    await render(nav());
    expect(screen.getByText('पीछे')).toBeTruthy();
    expect(screen.getByText('मेन्यू')).toBeTruthy();
  });
});

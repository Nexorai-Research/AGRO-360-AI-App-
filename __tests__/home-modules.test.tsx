import { fireEvent, render, screen } from '@testing-library/react-native';
import { i18n, setLanguage } from '../src/i18n';
import { ModuleGrid } from '../src/features/home/ModuleGrid';
import { ModuleScreen } from '../src/features/home/ModuleScreen';
import { MODULES, findModule, moduleTarget } from '../src/features/home/modules';

const fs = jest.requireActual('fs') as { existsSync: (p: string) => boolean };
const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  router: {
    push: (...a: unknown[]) => mockPush(...a),
    back: () => mockBack(),
    canGoBack: () => true,
    replace: jest.fn(),
  },
}));

beforeEach(async () => {
  jest.clearAllMocks();
  await setLanguage('en');
});

describe('module catalog', () => {
  it('lists every app screen exactly once, and each route file exists', () => {
    const hrefs = MODULES.flatMap((m) => m.features.map((f) => f.href));
    expect(new Set(hrefs).size).toBe(hrefs.length);
    expect(hrefs).toHaveLength(30);
    for (const h of hrefs) {
      const base = `${process.cwd()}/app${h}`;
      expect(fs.existsSync(`${base}.tsx`) || fs.existsSync(`${base}/index.tsx`)).toBe(true);
    }
  });

  it('every module and feature has a title and a description in English, Hindi and Marathi', async () => {
    for (const lng of ['en', 'hi', 'mr'] as const) {
      await setLanguage(lng);
      for (const m of MODULES) {
        expect(i18n.exists(`modules.${m.id}.title`)).toBe(true);
        expect(i18n.exists(`modules.${m.id}.sub`)).toBe(true);
        for (const f of m.features) {
          expect(i18n.exists(`nav.${f.key}`)).toBe(true);
          expect(i18n.exists(`featureDesc.${f.key}`)).toBe(true);
        }
      }
    }
  });

  it('a module with one screen opens it directly, others open their list', async () => {
    expect(moduleTarget(findModule('reports')!)).toBe('/reports');
    expect(moduleTarget(findModule('ops')!)).toBe('/module/ops');
  });
});

describe('home module cards', () => {
  it('shows one card per module with its number of screens', async () => {
    await render(<ModuleGrid />);
    for (const m of MODULES) expect(screen.getByTestId(`module-${m.id}`)).toBeTruthy();
    expect(screen.getByText('Operations')).toBeTruthy();
    expect(screen.getByText('11 screens ›')).toBeTruthy();
  });

  it('tapping a module opens its feature list', async () => {
    await render(<ModuleGrid />);
    await fireEvent.press(screen.getByTestId('module-customers'));
    expect(mockPush).toHaveBeenCalledWith('/module/customers');
  });

  it('tapping a one-screen module opens that screen', async () => {
    await render(<ModuleGrid />);
    await fireEvent.press(screen.getByTestId('module-account'));
    expect(mockPush).toHaveBeenCalledWith('/account');
  });

  it('shows Hindi text', async () => {
    await setLanguage('hi');
    await render(<ModuleGrid />);
    expect(screen.getByText('सभी मॉड्यूल')).toBeTruthy();
    expect(screen.getByText('ग्राहक')).toBeTruthy();
  });
});

describe('module screen', () => {
  it('shows the feature cards of the module and opens one on tap', async () => {
    await render(<ModuleScreen id="customers" />);
    expect(screen.getByText('Collection follow-up')).toBeTruthy();
    expect(screen.getByText('Calls and promises to pay')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('feature-followup'));
    expect(mockPush).toHaveBeenCalledWith('/collections/follow-up');
  });

  it('every feature card of every module opens its own route', async () => {
    for (const m of MODULES) {
      mockPush.mockClear();
      const { unmount } = await render(<ModuleScreen id={m.id} />);
      for (const f of m.features) {
        await fireEvent.press(screen.getByTestId(`feature-${f.key}`));
        expect(mockPush).toHaveBeenLastCalledWith(f.href);
      }
      await unmount();
    }
  });

  it('Back goes back, and an unknown module says not found', async () => {
    const { unmount } = await render(<ModuleScreen id="ops" />);
    await fireEvent.press(screen.getByLabelText('Back'));
    expect(mockBack).toHaveBeenCalled();
    await unmount();
    await render(<ModuleScreen id="nope" />);
    expect(screen.getByText('This section was not found.')).toBeTruthy();
  });
});

import { fireEvent, render, screen } from '@testing-library/react-native';
import { COVERAGE, LANGUAGES, RTL_LANGS, i18n, setLanguage } from '../src/i18n';
import { LanguagePicker } from '../src/ui/LanguagePicker';

const fs = jest.requireActual('fs') as { readFileSync: (p: string, e: string) => string };
const dir =`${process.cwd()}/src/i18n/locales`;
const flat = (o: Record<string, unknown>, p = '', out: Record<string, string> = {}) => {
  for (const [k, v] of Object.entries(o)) {
    const key = p ? `${p}.${k}` : k;
    if (v && typeof v === 'object') flat(v as Record<string, unknown>, key, out);
    else out[key] = String(v);
  }
  return out;
};
const read = (l: string) =>
  flat(JSON.parse(fs.readFileSync(`${dir}/${l}.json`, 'utf8')) as Record<string, unknown>);
const en = read('en');
const ADDED = LANGUAGES.map((l) => l.code).filter((c) => !['en', 'hi', 'mr'].includes(c));
const HAND = ['bn', 'te', 'ta', 'ur', 'gu', 'kn', 'ml', 'or', 'pa', 'as', 'ne', 'kok', 'mai', 'doi', 'sa'];
const holes = (s: string) => [...s.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]).sort();

afterEach(async () => {
  await setLanguage('en');
});

describe('the 22 scheduled languages of India, like the web', () => {
  test('English and 22 languages in the web order, each named in its own script; Urdu and Kashmiri right to left', () => {
    expect(LANGUAGES.map((l) => l.code)).toEqual([
      'en',
      'hi',
      'bn',
      'te',
      'mr',
      'ta',
      'ur',
      'gu',
      'kn',
      'ml',
      'or',
      'pa',
      'as',
      'mai',
      'sat',
      'ks',
      'ne',
      'sd',
      'kok',
      'doi',
      'mni',
      'brx',
      'sa',
    ]);
    expect(LANGUAGES.find((l) => l.code === 'ta')!.label).toBe('தமிழ்');
    expect(LANGUAGES.find((l) => l.code === 'bn')!.label).toBe('বাংলা');
    expect(RTL_LANGS).toEqual(['ur', 'ks']);
    expect(ADDED).toHaveLength(20);
  });

  test.each(ADDED)('%s: only app keys, no placeholder lost or invented, coverage as reported', (lang) => {
    const tr = read(lang);
    const keys = Object.keys(tr);
    expect(keys.length).toBeGreaterThan(1500);
    for (const k of keys) {
      expect(en[k]).toBeDefined();
      expect(holes(tr[k]!)).toEqual(holes(en[k]!));
    }
    expect(COVERAGE[lang]).toBe(Math.round((keys.length / Object.keys(en).length) * 100));
  });

  test.each(HAND)('%s: the core screens are translated by hand', (lang) => {
    const tr = read(lang);
    for (const k of [
      'login.password',
      'login.network',
      'home.title',
      'bottomNav.menuTitle',
      'modules.ops.sub',
      'errors.NETWORK',
      'errors.FORBIDDEN',
      'common.retry',
    ])
      expect(tr[k] && tr[k] !== en[k]).toBeTruthy();
  });

  test('a chosen language shows its text, and English where it has none', async () => {
    await setLanguage('ta');
    expect(i18n.t('login.password')).toBe('கடவுச்சொல்');
    expect(i18n.t('home.hello', { name: 'Ravi' })).toBe('வணக்கம், Ravi');
    expect(i18n.t('wp14.pos.save')).toBe('Save bill offline'); // not translated yet: English, never blank
  });
});

describe('language picker', () => {
  test('English, Hindi and Marathi first; the other 20 open with More; a pick switches and says how much is translated', async () => {
    await render(<LanguagePicker />);
    expect(screen.getByTestId('lang-mr')).toBeTruthy();
    expect(screen.queryByTestId('lang-ta')).toBeNull();
    await fireEvent.press(screen.getByText('+20'));
    await fireEvent.press(screen.getByTestId('lang-ta'));
    expect(i18n.language).toBe('ta');
    expect(
      screen.getByText(
        `${COVERAGE.ta}% of the app in this language, the rest in English. Not yet checked by a native speaker.`,
      ),
    ).toBeTruthy();
  });

  test('no note for English, Hindi or Marathi', async () => {
    await setLanguage('hi');
    await render(<LanguagePicker />);
    expect(screen.queryByText(/native/)).toBeNull();
  });
});

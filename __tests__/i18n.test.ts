import { currentLanguage, i18n, setLanguage, tw } from '../src/i18n';

afterEach(async () => {
  await setLanguage('en');
});

describe('i18n', () => {
  it('starts in English', () => {
    expect(currentLanguage()).toBe('en');
    expect(i18n.t('login.button')).toBe('Sign in');
  });

  it('switches to Hindi and Marathi', async () => {
    await setLanguage('hi');
    expect(i18n.t('home.signOut')).toBe('साइन आउट');
    await setLanguage('mr');
    expect(i18n.t('common.language')).toBe('भाषा');
  });

  it('falls back to English for an unknown language and for a missing key', async () => {
    // @ts-expect-error not a supported code
    await setLanguage('xx');
    expect(currentLanguage()).toBe('en');
    expect(i18n.t('nope.missing', { defaultValue: 'x' })).toBe('x');
  });

  it('puts the error code and correlation id into the generic message', () => {
    expect(i18n.t('errors.generic', { code: 'E1', correlationId: 'c-9' })).toBe('Something went wrong. Code E1, reference c-9.');
  });

  it('has every error key in all three languages', async () => {
    const keys = Object.keys(i18n.getResourceBundle('en', 'translation').errors);
    for (const lng of ['hi', 'mr']) {
      const other = Object.keys(i18n.getResourceBundle(lng, 'translation').errors);
      expect(other.sort()).toEqual([...keys].sort());
    }
  });

  it('tw fills {0} and {1}, in English and in a translated language', async () => {
    expect(tw('{0} ({1} days)', 'Ravi', 5)).toBe('Ravi (5 days)');
    await setLanguage('hi');
    expect(tw('{0} - ledger', 'Ravi')).toBe('Ravi - बही');
    expect(tw('A phrase that is not in the web dictionary {0}', 1)).toBe('A phrase that is not in the web dictionary 1');
  });
});

import { loadConfig, isConfigured } from '../src/config';

describe('config', () => {
  it('defaults to dev, empty urls and the agro360-mobile client', () => {
    const c = loadConfig({});
    expect(c.env).toBe('dev');
    expect(c.apiBaseUrl).toBe('');
    expect(c.oidcClientId).toBe('agro360-mobile');
    expect(c.redirectScheme).toBe('agro360');
    expect(isConfigured(c)).toBe(false);
  });

  it('reads staging and production, strips trailing slashes', () => {
    const c = loadConfig({
      EXPO_PUBLIC_APP_ENV: 'staging',
      EXPO_PUBLIC_API_BASE_URL: 'https://api.example.test/api/v1/',
      EXPO_PUBLIC_OIDC_ISSUER: 'https://id.example.test/realms/agro360//',
    });
    expect(c.env).toBe('staging');
    expect(c.apiBaseUrl).toBe('https://api.example.test/api/v1');
    expect(c.oidcIssuer).toBe('https://id.example.test/realms/agro360');
    expect(isConfigured(c)).toBe(true);
    expect(loadConfig({ EXPO_PUBLIC_APP_ENV: 'production' }).env).toBe('production');
  });

  it('an unknown environment name falls back to dev', () => {
    expect(loadConfig({ EXPO_PUBLIC_APP_ENV: 'qa' }).env).toBe('dev');
  });
});

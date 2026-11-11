export type AppEnv = 'dev' | 'staging' | 'production';

export interface AppConfig {
  env: AppEnv;
  apiBaseUrl: string;
  oidcIssuer: string;
  oidcClientId: string;
  redirectScheme: string;
}

function envName(v: string | undefined): AppEnv {
  return v === 'staging' || v === 'production' ? v : 'dev';
}

/** All values come from EXPO_PUBLIC_* variables (see .env.example). No real value is kept in the code. */
export function loadConfig(e: Record<string, string | undefined> = process.env): AppConfig {
  return {
    env: envName(e.EXPO_PUBLIC_APP_ENV),
    apiBaseUrl: (e.EXPO_PUBLIC_API_BASE_URL ?? '').replace(/\/+$/, ''),
    oidcIssuer: (e.EXPO_PUBLIC_OIDC_ISSUER ?? '').replace(/\/+$/, ''),
    oidcClientId: e.EXPO_PUBLIC_OIDC_CLIENT_ID || 'agro360-mobile',
    redirectScheme: 'agro360',
  };
}

export const config = loadConfig();
export const isConfigured = (c: AppConfig = config) => c.apiBaseUrl !== '' && c.oidcIssuer !== '';

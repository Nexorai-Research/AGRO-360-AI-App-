export type AppEnv = 'dev' | 'staging' | 'production';

export interface AppConfig {
  env: AppEnv;
  apiBaseUrl: string;
  oidcIssuer: string;
  oidcClientId: string;
  redirectScheme: string;
  /** Test servers only: sign in with username and password instead of the browser. Never on in production. */
  passwordLogin: boolean;
}

function envName(v: string | undefined): AppEnv {
  return v === 'staging' || v === 'production' ? v : 'dev';
}

/** All values come from EXPO_PUBLIC_* variables (see .env.example). No real value is kept in the code. */
export function loadConfig(e: Record<string, string | undefined> = process.env): AppConfig {
  const env = envName(e.EXPO_PUBLIC_APP_ENV);
  return {
    env,
    passwordLogin: env !== 'production' && e.EXPO_PUBLIC_PASSWORD_LOGIN === 'true',
    apiBaseUrl: (e.EXPO_PUBLIC_API_BASE_URL ?? '').replace(/\/+$/, ''),
    oidcIssuer: (e.EXPO_PUBLIC_OIDC_ISSUER ?? '').replace(/\/+$/, ''),
    oidcClientId: e.EXPO_PUBLIC_OIDC_CLIENT_ID || 'agro360-mobile',
    redirectScheme: 'agro360',
  };
}

// Expo only fills EXPO_PUBLIC_* values into the app when they are written out one by one as process.env.NAME.
export const config = loadConfig({
  EXPO_PUBLIC_APP_ENV: process.env.EXPO_PUBLIC_APP_ENV,
  EXPO_PUBLIC_API_BASE_URL: process.env.EXPO_PUBLIC_API_BASE_URL,
  EXPO_PUBLIC_OIDC_ISSUER: process.env.EXPO_PUBLIC_OIDC_ISSUER,
  EXPO_PUBLIC_OIDC_CLIENT_ID: process.env.EXPO_PUBLIC_OIDC_CLIENT_ID,
  EXPO_PUBLIC_PASSWORD_LOGIN: process.env.EXPO_PUBLIC_PASSWORD_LOGIN,
});
export const isConfigured = (c: AppConfig = config) => c.apiBaseUrl !== '' && c.oidcIssuer !== '';

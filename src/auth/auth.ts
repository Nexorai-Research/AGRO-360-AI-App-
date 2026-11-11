import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { config } from '../config';
import { clearTokens, loadTokens, saveTokens, type Tokens } from './storage';

// Keycloak, public client, code + PKCE. No secret exists in the app. Tokens are only in secure storage (and memory).
WebBrowser.maybeCompleteAuthSession();

const EARLY_MS = 20_000; // refresh a little before the access token ends, like the web app

const discovery = (): AuthSession.DiscoveryDocument => ({
  authorizationEndpoint: `${config.oidcIssuer}/protocol/openid-connect/auth`,
  tokenEndpoint: `${config.oidcIssuer}/protocol/openid-connect/token`,
  endSessionEndpoint: `${config.oidcIssuer}/protocol/openid-connect/logout`,
});

export const redirectUri = () => AuthSession.makeRedirectUri({ scheme: config.redirectScheme, path: 'auth' });

let tokens: Tokens | null = null;
let refreshing: Promise<string | null> | null = null;

function fromResponse(r: AuthSession.TokenResponse, previous?: Tokens | null): Tokens {
  return {
    accessToken: r.accessToken,
    // Keycloak rotates the refresh token; keep the old one only if the server sent none.
    refreshToken: r.refreshToken ?? previous?.refreshToken,
    idToken: r.idToken ?? previous?.idToken,
    expiresAt: Date.now() + (r.expiresIn ?? 300) * 1000,
  };
}

/** Loads a saved session from secure storage. Returns true when there is one. */
export async function restore(): Promise<boolean> {
  tokens = await loadTokens();
  return tokens !== null;
}

export const isSignedIn = () => tokens !== null;

/**
 * Opens Keycloak in the system browser. `loginHint` is `<username>@<franchise code>` and only pre-fills the login page.
 * Returns true when signed in, false when the user cancelled.
 */
export async function signIn(loginHint?: string): Promise<boolean> {
  const request = new AuthSession.AuthRequest({
    clientId: config.oidcClientId,
    redirectUri: redirectUri(),
    scopes: ['openid'],
    usePKCE: true,
    responseType: AuthSession.ResponseType.Code,
    extraParams: loginHint ? { login_hint: loginHint } : undefined,
  });
  const result = await request.promptAsync(discovery());
  if (result.type !== 'success') return false;
  const response = await AuthSession.exchangeCodeAsync(
    {
      clientId: config.oidcClientId,
      code: result.params.code ?? '',
      redirectUri: redirectUri(),
      extraParams: request.codeVerifier ? { code_verifier: request.codeVerifier } : undefined,
    },
    discovery(),
  );
  tokens = fromResponse(response);
  await saveTokens(tokens);
  return true;
}

/**
 * Renews the tokens. One call at a time (refresh tokens are single use), so concurrent callers share the same promise.
 * Returns the new access token, or null. Tokens are cleared when the server refuses the refresh token; a network error keeps them.
 */
export function refresh(): Promise<string | null> {
  refreshing ??= (async () => {
    const current = tokens;
    if (!current?.refreshToken) {
      await signOutLocal();
      return null;
    }
    try {
      const response = await AuthSession.refreshAsync(
        { clientId: config.oidcClientId, refreshToken: current.refreshToken },
        discovery(),
      );
      tokens = fromResponse(response, current);
      await saveTokens(tokens);
      return tokens.accessToken;
    } catch (e) {
      // a TokenError carries a `code` (invalid_grant ...): the server said no. Anything else is a network problem.
      if (typeof (e as { code?: unknown } | null)?.code === 'string') await signOutLocal();
      return null;
    }
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

/** A valid access token, refreshing first when it is about to end. Null when signed out. */
export async function accessToken(): Promise<string | null> {
  if (!tokens) return null;
  if (tokens.expiresAt - Date.now() > EARLY_MS) return tokens.accessToken;
  return refresh();
}

async function signOutLocal(): Promise<void> {
  tokens = null;
  await clearTokens();
}

/** Clears everything on the phone, then ends the Keycloak session (best effort: the phone is already signed out). */
export async function signOut(): Promise<void> {
  const idToken = tokens?.idToken;
  await signOutLocal();
  try {
    const q = new URLSearchParams({
      client_id: config.oidcClientId,
      post_logout_redirect_uri: redirectUri(),
    });
    if (idToken) q.set('id_token_hint', idToken);
    await WebBrowser.openAuthSessionAsync(`${discovery().endSessionEndpoint}?${q.toString()}`, redirectUri());
  } catch {
    /* the local sign out is what matters */
  }
}

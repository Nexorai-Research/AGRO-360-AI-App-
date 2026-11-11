import * as SecureStore from 'expo-secure-store';

export interface Tokens {
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  /** epoch milliseconds */
  expiresAt: number;
}

const KEY = 'agro360.tokens';

export async function loadTokens(): Promise<Tokens | null> {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    const t = raw ? (JSON.parse(raw) as Tokens) : null;
    return t && typeof t.accessToken === 'string' ? t : null;
  } catch {
    return null;
  }
}

export async function saveTokens(t: Tokens): Promise<void> {
  await SecureStore.setItemAsync(KEY, JSON.stringify(t));
}

export async function clearTokens(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(KEY);
  } catch {
    /* nothing stored */
  }
}

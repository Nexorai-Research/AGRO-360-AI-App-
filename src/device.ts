import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import * as Application from 'expo-application';
import Constants from 'expo-constants';

const DEVICE_KEY = 'agro360.device';
let cached: string | null = null;

/** A random id created once per install. It identifies the phone for the backend; it holds no personal data. */
export async function getDeviceId(): Promise<string> {
  if (cached) return cached;
  let id: string | null = null;
  try {
    id = await SecureStore.getItemAsync(DEVICE_KEY);
  } catch {
    id = null;
  }
  if (!id) {
    id = Crypto.randomUUID();
    try {
      await SecureStore.setItemAsync(DEVICE_KEY, id);
    } catch {
      /* not saved: a new id next start */
    }
  }
  cached = id;
  return id;
}

export const getAppVersion = (): string =>
  Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? '0.0.0';

export const newId = (): string => Crypto.randomUUID();

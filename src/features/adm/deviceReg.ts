import * as SecureStore from 'expo-secure-store';

const KEY = 'agro360.registeredDevice';

/**
 * The registration the server made for this phone: its device id and the device key. The key is a secret: it goes to secure storage
 * and nowhere else. It is never shown, logged or put in a query cache. Nothing in the app sends it yet (see the tracker).
 */
export interface StoredRegistration {
  id: string;
  key: string;
}

export async function saveRegistration(r: StoredRegistration): Promise<boolean> {
  try {
    await SecureStore.setItemAsync(KEY, JSON.stringify(r));
    return true;
  } catch {
    return false;
  }
}

/** Only the id is handed out; the key stays inside secure storage. */
export async function readRegisteredId(): Promise<string | null> {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<StoredRegistration>;
    return typeof v.id === 'string' ? v.id : null;
  } catch {
    return null;
  }
}

export async function clearRegistration(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(KEY);
  } catch {
    /* nothing to clear */
  }
}

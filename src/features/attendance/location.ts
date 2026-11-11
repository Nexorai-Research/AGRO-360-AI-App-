import * as Location from 'expo-location';

export type Fix = { lat: number; lng: number };

/**
 * Asks the phone for permission and one position fix. Returns null when the user says no or the fix takes too long;
 * the check in or out then simply goes without a location. The coordinates are only handed to the caller:
 * they are never logged or stored here.
 */
export async function getFix(timeoutMs = 8000): Promise<Fix | null> {
  try {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (perm.status !== 'granted') return null;
    const pos = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);
    return pos ? { lat: pos.coords.latitude, lng: pos.coords.longitude } : null;
  } catch {
    return null;
  }
}

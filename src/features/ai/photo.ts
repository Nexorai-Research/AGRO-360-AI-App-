import * as DocumentPicker from 'expo-document-picker';

export const MAX_PHOTO_BYTES = 3 * 1024 * 1024;
export interface PickedPhoto {
  name: string;
  /** Size in bytes of the photo itself. */
  bytes: number;
  base64: string;
}
export type PhotoResult =
  { ok: true; photo: PickedPhoto } | { ok: false; reason: 'CANCELLED' | 'TOO_BIG' | 'NOT_IMAGE' };

/** Bytes behind a base64 text (no padding counted). */
export const base64Bytes = (b64: string): number =>
  Math.floor((b64.length * 3) / 4) - (b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0);

/** Picks a photo from the phone's files or gallery. The server checks the real file type again; this only saves a useless upload. */
export async function pickPhoto(): Promise<PhotoResult> {
  const r = await DocumentPicker.getDocumentAsync({
    type: ['image/jpeg', 'image/png', 'image/webp'],
    copyToCacheDirectory: true,
    base64: true,
    multiple: false,
  });
  if (r.canceled) return { ok: false, reason: 'CANCELLED' };
  const a = r.assets[0];
  if (!a || !a.base64) return { ok: false, reason: 'NOT_IMAGE' };
  const bytes = base64Bytes(a.base64);
  if (bytes > MAX_PHOTO_BYTES) return { ok: false, reason: 'TOO_BIG' };
  return { ok: true, photo: { name: a.name, bytes, base64: a.base64 } };
}

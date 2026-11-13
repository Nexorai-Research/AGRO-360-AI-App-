import * as DocumentPicker from 'expo-document-picker';
import { base64Bytes } from './photo';

export const MAX_FILE_BYTES = 4 * 1024 * 1024;
export interface PickedFile {
  name: string;
  mediaType: string;
  bytes: number;
  base64: string;
}
export type FileResult =
  { ok: true; file: PickedFile } | { ok: false; reason: 'CANCELLED' | 'TOO_BIG' | 'NOT_ALLOWED' };

/** Picks a PDF, PNG or JPEG up to 4 MB. The server checks the real type again. */
export async function pickScan(types: readonly string[]): Promise<FileResult> {
  const r = await DocumentPicker.getDocumentAsync({
    type: [...types],
    copyToCacheDirectory: true,
    base64: true,
    multiple: false,
  });
  if (r.canceled) return { ok: false, reason: 'CANCELLED' };
  const a = r.assets[0];
  const mediaType = a?.mimeType ?? '';
  if (!a || !a.base64 || !types.includes(mediaType)) return { ok: false, reason: 'NOT_ALLOWED' };
  const bytes = base64Bytes(a.base64);
  if (bytes > MAX_FILE_BYTES) return { ok: false, reason: 'TOO_BIG' };
  return { ok: true, file: { name: a.name, mediaType, bytes, base64: a.base64 } };
}
export const SCAN_TYPES = ['application/pdf', 'image/png', 'image/jpeg'] as const;
export const SHELF_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

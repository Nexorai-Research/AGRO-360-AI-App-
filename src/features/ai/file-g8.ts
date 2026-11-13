import * as DocumentPicker from 'expo-document-picker';
import { base64Bytes } from './photo';

export const MAX_DOC_BYTES = 4 * 1024 * 1024;
export type DocResult =
  | { ok: true; name: string; bytes: number; base64: string }
  | { ok: false; reason: 'CANCELLED' | 'TOO_BIG' | 'NOT_READ' };

/** A PDF, PNG or JPEG up to 4 MB, as base64. The server checks the real file type again. */
export async function pickDocument(): Promise<DocResult> {
  const r = await DocumentPicker.getDocumentAsync({
    type: ['application/pdf', 'image/png', 'image/jpeg'],
    copyToCacheDirectory: true,
    base64: true,
    multiple: false,
  });
  if (r.canceled) return { ok: false, reason: 'CANCELLED' };
  const a = r.assets[0];
  if (!a || !a.base64) return { ok: false, reason: 'NOT_READ' };
  const bytes = base64Bytes(a.base64);
  if (bytes > MAX_DOC_BYTES) return { ok: false, reason: 'TOO_BIG' };
  return { ok: true, name: a.name, bytes, base64: a.base64 };
}

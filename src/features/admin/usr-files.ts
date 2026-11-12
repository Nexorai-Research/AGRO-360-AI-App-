import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

export interface PickedFile {
  name: string;
  size: number | null;
  base64: string;
}

/** The phone's file picker. Returns null when the person cancelled. The file content is read as base64 by the picker. */
export async function pickFile(): Promise<PickedFile | null> {
  const r = await DocumentPicker.getDocumentAsync({
    copyToCacheDirectory: true,
    base64: true,
    multiple: false,
  });
  if (r.canceled) return null;
  const a = r.assets[0];
  if (!a || !a.base64) return null;
  return { name: a.name, size: a.size ?? null, base64: a.base64 };
}

/** Saves a downloaded file in the app's cache folder and opens the share sheet. Returns false when this phone cannot share. */
export async function saveAndShare(filename: string, contentType: string, base64: string): Promise<boolean> {
  const safe = filename.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 100) || 'document';
  const f = new File(Paths.cache, safe);
  f.create({ overwrite: true });
  await f.write(base64, { encoding: 'base64' });
  if (!(await Sharing.isAvailableAsync())) return false;
  await Sharing.shareAsync(f.uri, { mimeType: contentType });
  return true;
}

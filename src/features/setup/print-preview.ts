import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import type { ApiClient } from '@/api/client';

// Web parity 3.7 (apps/web/src/pages/settings.js preview): the server renders a sample document with the saved template.
// The web shows the HTML in a dialog; the phone has no web view, so it is turned into a PDF and opened in the share sheet.
export interface TemplatePreview {
  html: string;
  paper: string;
  widthMm: number;
}
export const fetchTemplatePreview = (c: ApiClient, docType: string) =>
  c.post<TemplatePreview>('/settings/print-templates:preview', { body: { docType } });

export async function previewTemplate(c: ApiClient, docType: string): Promise<'done' | 'noSharing'> {
  const p = await fetchTemplatePreview(c, docType);
  const { uri } = await Print.printToFileAsync({ html: p.html });
  if (!(await Sharing.isAvailableAsync())) return 'noSharing';
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
  return 'done';
}

import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import type { ApiClient } from '@/api/client';
import { fetchInvoiceHtml } from './api-more';

export type PrintResult = 'done' | 'noSharing';

/** Opens the phone's print dialog (any printer or "Save as PDF") for the server's invoice page. */
export async function printInvoice(c: ApiClient, id: string): Promise<void> {
  const html = await fetchInvoiceHtml(c, id, 'A4');
  await Print.printAsync({ html });
}

/** Makes a PDF file on the phone from the server's invoice page and opens the share sheet. The file stays in the app's cache folder. */
export async function shareInvoicePdf(c: ApiClient, id: string): Promise<PrintResult> {
  const html = await fetchInvoiceHtml(c, id, 'A4');
  const { uri } = await Print.printToFileAsync({ html });
  if (!(await Sharing.isAvailableAsync())) return 'noSharing';
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
  return 'done';
}

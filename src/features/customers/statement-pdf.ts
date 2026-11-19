import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import type { ApiClient } from '@/api/client';

// Web parity 9a.5: the printable statement (apps/web/src/pages/customers.js statement(); GET /customers/:id/statement.html,
// customer.ledger.view). The web opens the HTML in a new tab to print; the phone turns it into a PDF and shares it.
export const STATEMENT_PERM = 'customer.ledger.view';

export const fetchStatementHtml = (c: ApiClient, customerId: string, language: string) =>
  c.get<string>(`/customers/${encodeURIComponent(customerId)}/statement.html`, {
    as: 'text',
    ...(language ? { query: { language } } : {}),
  });

/** False when the phone cannot share files. */
export async function statementPdf(c: ApiClient, customerId: string, language: string): Promise<boolean> {
  const html = await fetchStatementHtml(c, customerId, language);
  const { uri } = await Print.printToFileAsync({ html });
  if (!(await Sharing.isAvailableAsync())) return false;
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
  return true;
}

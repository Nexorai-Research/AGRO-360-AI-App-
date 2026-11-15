const ACRONYMS = new Set(['upi', 'gst', 'gstin', 'hsn', 'pan', 'tds', 'tcs', 'sms', 'csv', 'pdf', 'ai', 'id', 'grn', 'grni']);

/** A server code such as SALE_RETURN_IN or bank_transfer as readable words ("Sale return in"; UPI stays UPI). Display only, never sent back. */
export function humanCode(code: string | null | undefined): string {
  if (!code) return '';
  const words = code
    .replace(/[_.-]+/g, ' ')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (ACRONYMS.has(w) ? w.toUpperCase() : w));
  const text = words.join(' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

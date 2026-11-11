import { dec, formatINR, type Amount } from '@/money';

/** 1,23,456 -> ₹1.23 L; 1,23,45,678 -> ₹1.23 Cr. Same rule as the web home, done with Decimal so a headline never overflows its card. */
export function formatINRShort(a: Amount): string {
  const n = dec(a);
  const abs = n.abs();
  const sign = n.isNegative() ? '-' : '';
  if (abs.gte(1e7)) return `${sign}₹${abs.div(1e7).toFixed(2)} Cr`;
  if (abs.gte(1e5)) return `${sign}₹${abs.div(1e5).toFixed(2)} L`;
  return formatINR(a, 0);
}

export function formatCount(a: Amount): string {
  return dec(a).toFixed(0);
}

export function formatPercent(a: Amount): string {
  return `${dec(a).toFixed(1)}%`;
}

export function formatClock(iso: string, lang: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return d.toLocaleTimeString(lang === 'en' ? 'en-IN' : `${lang}-IN-u-nu-latn`, { hour: '2-digit', minute: '2-digit' });
  } catch {
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  }
}

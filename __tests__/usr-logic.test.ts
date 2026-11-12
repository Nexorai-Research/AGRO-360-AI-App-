import {
  canGrant,
  extensionOk,
  groupByArea,
  normalizeMobile,
  sameSet,
  toggleId,
  validEmail,
  validExpiry,
  validLimit,
  validMobile,
  validUsername,
} from '../src/features/admin/usr-logic';
import { fileProblem } from '../src/features/admin/DocAdmin';
import { lastDays } from '../src/features/admin/usr-audit';
import parts from '../i18n-parts/usr.json';

describe('user rules', () => {
  test('mobile accepts the shapes the server accepts', () => {
    expect(normalizeMobile('+91 98765 43210')).toBe('9876543210');
    expect(normalizeMobile('919876543210')).toBe('9876543210');
    expect(normalizeMobile('09876543210')).toBe('9876543210');
    expect(validMobile('98765-43210')).toBe(true);
    expect(validMobile('5876543210')).toBe(false);
    expect(validMobile('9999999999')).toBe(false);
    expect(validMobile('98765')).toBe(false);
  });
  test('username and email', () => {
    expect(validUsername('ramesh.p-1')).toBe(true);
    expect(validUsername('ab')).toBe(false);
    expect(validUsername('has space')).toBe(false);
    expect(validEmail('')).toBe(true);
    expect(validEmail('a@b.in')).toBe(true);
    expect(validEmail('a@b')).toBe(false);
  });
  test('set helpers', () => {
    expect(sameSet(['a', 'b'], ['b', 'a'])).toBe(true);
    expect(sameSet(['a'], ['a', 'b'])).toBe(false);
    expect(toggleId(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleId(['a', 'b'], 'a')).toEqual(['b']);
  });
});

describe('role rules', () => {
  test('limits are decimals with 4 places; percentages stop at 100; empty means not set', () => {
    expect(validLimit('line_discount_pct', '')).toBe(true);
    expect(validLimit('line_discount_pct', '12.5')).toBe(true);
    expect(validLimit('line_discount_pct', '100.0001')).toBe(false);
    expect(validLimit('line_discount_pct', '101')).toBe(false);
    expect(validLimit('cash_refund_amount', '250000.5000')).toBe(true);
    expect(validLimit('cash_refund_amount', '1.23456')).toBe(false);
    expect(validLimit('cash_refund_amount', '-1')).toBe(false);
    expect(validLimit('cash_refund_amount', '1e3')).toBe(false);
  });
  test('permissions group by area and are grantable only when held and in the plan', () => {
    const items = [
      { code: 'sales.invoice.create', module: 'sales', description: '', enabled: true },
      { code: 'sales.invoice.view', module: 'sales', description: '', enabled: false },
      { code: 'stock.view', module: 'stock', description: '', enabled: true },
    ];
    expect(groupByArea(items).map(([a, l]) => [a, l.length])).toEqual([
      ['sales', 2],
      ['stock', 1],
    ]);
    const held = (c: string) => c !== 'stock.view';
    expect(canGrant(items[0]!, held)).toBe(true);
    expect(canGrant(items[1]!, held)).toBe(false);
    expect(canGrant(items[2]!, held)).toBe(false);
  });
});

describe('document and audit rules', () => {
  test('file type and size', () => {
    expect(extensionOk('Licence.PDF')).toBe(true);
    expect(extensionOk('run.exe')).toBe(false);
    expect(fileProblem({ name: 'a.pdf', size: 1000, base64: 'x' })).toBeNull();
    expect(fileProblem({ name: 'a.pdf', size: 5 * 1024 * 1024, base64: 'x' })).toBe('dcm.tooBig');
    expect(fileProblem({ name: 'a.exe', size: 10, base64: 'x' })).toBe('dcm.badType');
    expect(fileProblem({ name: 'a.pdf', size: null, base64: 'A'.repeat(6 * 1024 * 1024) })).toBe(
      'dcm.tooBig',
    );
  });
  test('expiry date', () => {
    expect(validExpiry('')).toBe(true);
    expect(validExpiry('2027-02-29')).toBe(false);
    expect(validExpiry('2027-03-31')).toBe(true);
  });
  test('quick audit ranges use the India day', () => {
    const now = new Date('2026-11-10T20:00:00Z'); // 11 Nov 01:30 in India
    expect(lastDays(1, now)).toEqual({ from: '2026-11-11', to: '2026-11-11' });
    expect(lastDays(7, now)).toEqual({ from: '2026-11-05', to: '2026-11-11' });
  });
});

describe('texts', () => {
  const flat = (o: unknown, p = ''): string[] =>
    Object.entries(o as Record<string, unknown>).flatMap(([k, v]) =>
      typeof v === 'object' && v ? flat(v, `${p}${k}.`) : [`${p}${k}`],
    );
  test('English, Hindi and Marathi have the same keys', () => {
    const en = flat(parts.en).sort();
    expect(flat(parts.hi).sort()).toEqual(en);
    expect(flat(parts.mr).sort()).toEqual(en);
    expect(en.length).toBeGreaterThan(100);
  });
});

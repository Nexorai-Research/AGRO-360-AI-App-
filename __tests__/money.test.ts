import { add, sub, mul, sum, cmp, isZero, formatINR } from '../src/money';

describe('money', () => {
  it('has no floating point error', () => {
    expect(add('0.1', '0.2')).toBe('0.30');
    expect(sub('0.3', '0.1')).toBe('0.20');
    expect(sum(['0.1', '0.2', '0.3'])).toBe('0.60');
    expect(sum([])).toBe('0.00');
  });

  it('mul rounds half up to the given places', () => {
    expect(mul('19.99', '3')).toBe('59.97');
    expect(mul('1.005', '1')).toBe('1.01');
    expect(mul('2.5', '3.333', 3)).toBe('8.333');
  });

  it('cmp and isZero work on strings', () => {
    expect(cmp('10.00', '9.99')).toBe(1);
    expect(cmp('1', '1.00')).toBe(0);
    expect(isZero('0.00')).toBe(true);
    expect(isZero('0.01')).toBe(false);
  });

  it('formatINR groups the Indian way', () => {
    expect(formatINR('1234567.5')).toBe('₹12,34,567.50');
    expect(formatINR('999')).toBe('₹999.00');
    expect(formatINR('1000')).toBe('₹1,000.00');
    expect(formatINR('100000')).toBe('₹1,00,000.00');
    expect(formatINR('0')).toBe('₹0.00');
    expect(formatINR('12345678.9')).toBe('₹1,23,45,678.90');
  });

  it('formatINR handles negatives and zero decimal places', () => {
    expect(formatINR('-1234.5')).toBe('-₹1,234.50');
    expect(formatINR('1234.5', 0)).toBe('₹1,235');
  });
});

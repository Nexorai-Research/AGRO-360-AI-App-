import { batchQuery, stockQuery } from '../src/features/stock/api';
import { expiryLevel, formatQty, hasQty } from '../src/features/stock/format';

describe('expiryLevel', () => {
  it('marks past, near and far expiry', () => {
    expect(expiryLevel(-1)).toBe('expired');
    expect(expiryLevel(0)).toBe('soon');
    expect(expiryLevel(30)).toBe('soon');
    expect(expiryLevel(31)).toBe('ok');
    expect(expiryLevel(null)).toBe('none');
  });
});

describe('formatQty', () => {
  it('trims zeros without float rounding', () => {
    expect(formatQty('12.500000')).toBe('12.5');
    expect(formatQty('3.000000')).toBe('3');
    expect(formatQty('0.100000')).toBe('0.1');
    expect(formatQty('1234567.123456')).toBe('1234567.123');
    expect(formatQty('0.000000')).toBe('0');
    expect(formatQty(null)).toBe('-');
  });
  it('knows a zero quantity', () => {
    expect(hasQty('0.000000')).toBe(false);
    expect(hasQty('0.5')).toBe(true);
    expect(hasQty(null)).toBe(false);
  });
});

describe('query builders', () => {
  it('drops empty filters and trims the search text', () => {
    expect(stockQuery({ q: '  urea ', branch: undefined }, 100)).toEqual({
      q: 'urea',
      branch: undefined,
      warehouse: undefined,
      product: undefined,
      limit: 50,
      offset: 100,
    });
    expect(stockQuery({ q: '   ' }, 0).q).toBeUndefined();
  });
  it('maps each batch view to the accepted flags', () => {
    expect(batchQuery('withStock', {}, 0).withStockOnly).toBe('true');
    expect(batchQuery('expiring', {}, 0).expiringWithinDays).toBe(60);
    expect(batchQuery('expired', {}, 0).expired).toBe('true');
    expect(batchQuery('expired', { product: 'p' }, 0).product).toBe('p');
  });
});

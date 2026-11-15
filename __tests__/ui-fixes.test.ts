import { humanCode } from '../src/format';
import { rupee } from '../src/features/ai/fmt';
import { formatQty } from '../src/features/stock/format';

describe('readable display helpers', () => {
  test('humanCode turns server codes into words', () => {
    expect(humanCode('SALE_RETURN_IN')).toBe('Sale return in');
    expect(humanCode('bank_transfer')).toBe('Bank transfer');
    expect(humanCode('users.create')).toBe('Users create');
    expect(humanCode('UPI')).toBe('UPI');
    expect(humanCode('CASH')).toBe('Cash');
    expect(humanCode('BANK_TRANSFER')).toBe('Bank transfer');
    expect(humanCode(null)).toBe('');
    expect(humanCode('')).toBe('');
  });

  test('a negative rupee estimate keeps the minus sign in front of the symbol', () => {
    expect(rupee(-1000381)).toBe('-₹10,00,381');
    expect(rupee(1500)).toBe('₹1,500');
    expect(rupee(null)).toBe('-');
  });

  test('quantities lose trailing zeros but keep real decimals', () => {
    expect(formatQty('10.000000')).toBe('10');
    expect(formatQty('-2.000')).toBe('-2');
    expect(formatQty('12.500000')).toBe('12.5');
    expect(formatQty(null)).toBe('-');
  });
});

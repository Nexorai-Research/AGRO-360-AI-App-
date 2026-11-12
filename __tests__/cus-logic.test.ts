import {
  buildRule,
  emptyVillage,
  isDecimal,
  retentionPct,
  tierBody,
  todayIST,
  validDate,
  validPurposeCode,
  validateCrop,
  validateEvent,
  validateGreeting,
  validateTier,
  validateVillage,
  villageBody,
} from '../src/features/customers/crm-logic';

describe('village checks', () => {
  test('needs district, taluka, name; state is 2 digits; PIN 6 digits when given', () => {
    expect(validateVillage(emptyVillage)).toMatchObject({
      district: 'text2',
      taluka: 'text2',
      name: 'text2',
    });
    expect(
      validateVillage({
        ...emptyVillage,
        stateCode: '2',
        district: 'Pune',
        taluka: 'Haveli',
        name: 'Uruli',
        pin: '',
      }).stateCode,
    ).toBe('state');
    expect(
      validateVillage({ ...emptyVillage, district: 'Pune', taluka: 'Haveli', name: 'Uruli', pin: '41204' })
        .pin,
    ).toBe('pin');
    expect(
      validateVillage({ ...emptyVillage, district: 'Pune', taluka: 'Haveli', name: 'Uruli', pin: '412204' }),
    ).toEqual({});
  });
  test('create sends only filled fields; edit sends only changed ones and null for a cleared PIN', () => {
    const d = { stateCode: '27', district: 'Pune', taluka: 'Haveli', name: ' Uruli ', pin: '' };
    expect(villageBody(d)).toEqual({ stateCode: '27', district: 'Pune', taluka: 'Haveli', name: 'Uruli' });
    const cur = { stateCode: '27', district: 'Pune', taluka: 'Haveli', name: 'Uruli', pin: '412204' };
    expect(villageBody({ ...d, name: 'Uruli', pin: '' }, cur)).toEqual({ pin: null });
    expect(villageBody({ ...d, name: 'Uruli', pin: '412204' }, cur)).toEqual({});
    expect(villageBody({ ...d, name: 'Phursungi', pin: '412204' }, cur)).toEqual({ name: 'Phursungi' });
  });
});

describe('loyalty tier checks', () => {
  const ok = { name: 'Silver', rank: '2', minSpend: '50000', minInvoices: '', discountPct: '2.5' };
  test('accepts decimals as strings and never turns money into a float', () => {
    expect(validateTier(ok)).toEqual({});
    expect(tierBody({ ...ok, benefits: ' Free delivery ' })).toEqual({
      name: 'Silver',
      rank: 2,
      minSpend: '50000',
      discountPct: '2.5',
      benefits: 'Free delivery',
    });
    expect(isDecimal('0.1', 2)).toBe(true);
    expect(isDecimal('1,000', 2)).toBe(false);
  });
  test('rejects bad rank, amount, percent and a tier with no threshold', () => {
    expect(validateTier({ ...ok, rank: '0' }).rank).toBe('rank');
    expect(validateTier({ ...ok, rank: '21' }).rank).toBe('rank');
    expect(validateTier({ ...ok, minSpend: '12.12345' }).minSpend).toBe('amount');
    expect(validateTier({ ...ok, discountPct: '100.01' }).discountPct).toBe('percent');
    expect(validateTier({ ...ok, minSpend: '', minInvoices: '' }).minSpend).toBe('tierNeed');
    expect(validateTier({ ...ok, minSpend: '', minInvoices: '10' })).toEqual({});
  });
});

describe('segment rules', () => {
  test('text, list, season, language, number, days and bool values', () => {
    expect(buildRule('crop', 'eq', ' Cotton ')).toEqual({
      rule: { field: 'crop', op: 'eq', value: 'Cotton' },
    });
    expect(buildRule('village', 'in', 'Uruli, Shirur ,')).toEqual({
      rule: { field: 'village', op: 'in', value: ['Uruli', 'Shirur'] },
    });
    expect(buildRule('season', 'eq', 'kharif')).toEqual({
      rule: { field: 'season', op: 'eq', value: 'KHARIF' },
    });
    expect(buildRule('language', 'eq', 'MR')).toEqual({ rule: { field: 'language', op: 'eq', value: 'mr' } });
    expect(buildRule('landAcres', 'gt', '2.5')).toEqual({
      rule: { field: 'landAcres', op: 'gt', value: 2.5 },
    });
    expect(buildRule('lastPurchaseOlderThanDays', 'gt', '90')).toEqual({
      rule: { field: 'lastPurchaseOlderThanDays', op: 'gt', value: 90 },
    });
    expect(buildRule('creditHold', 'eq', 'true')).toEqual({
      rule: { field: 'creditHold', op: 'eq', value: true },
    });
  });
  test('wrong operator or value gives an error', () => {
    expect(buildRule('crop', 'gt', 'x')).toEqual({ error: 'ruleOp' });
    expect(buildRule('nope', 'eq', 'x')).toEqual({ error: 'ruleOp' });
    expect(buildRule('season', 'eq', 'winter')).toEqual({ error: 'ruleValue' });
    expect(buildRule('landAcres', 'gt', 'abc')).toEqual({ error: 'ruleValue' });
    expect(buildRule('lastPurchaseOlderThanDays', 'gt', '1.5')).toEqual({ error: 'ruleValue' });
    expect(buildRule('creditHold', 'eq', 'yes')).toEqual({ error: 'ruleValue' });
    expect(buildRule('crop', 'eq', '')).toEqual({ error: 'ruleValue' });
  });
});

describe('engagement checks', () => {
  test('retention percent and dates', () => {
    expect(retentionPct([10, 5, 2], 1, 10)).toBe(50);
    expect(retentionPct([10], 3, 10)).toBe(0);
    expect(retentionPct([0], 0, 0)).toBe(0);
    expect(validDate('2026-02-29')).toBe(false);
    expect(validDate('2028-02-29')).toBe(true);
    expect(todayIST(new Date('2026-11-12T20:00:00Z'))).toBe('2026-11-13');
  });
  test('purpose code, event, greeting and crop', () => {
    expect(validPurposeCode('PROMO_SMS')).toBe(true);
    expect(validPurposeCode('promo')).toBe(false);
    expect(validateEvent({ title: 'Pola', startDate: '2026-09-01', endDate: '2026-08-31' }).endDate).toBe(
      'date',
    );
    expect(validateEvent({ title: 'Pola', startDate: '2026-09-01', endDate: '' })).toEqual({});
    expect(
      validateGreeting({ name: 'Diwali', occasion: 'DATE', month: '13', day: '', templateEn: 'Hi {name}' }),
    ).toMatchObject({ month: 'month', day: 'day' });
    expect(
      validateGreeting({
        name: 'Birthday',
        occasion: 'BIRTHDAY',
        month: '',
        day: '',
        templateEn: 'Hi {name}',
      }),
    ).toEqual({});
    expect(validateCrop({ name: 'Cotton', durationDays: '180' })).toEqual({});
    expect(validateCrop({ name: 'C', durationDays: '0' })).toMatchObject({
      name: 'text2',
      durationDays: 'days',
    });
  });
});

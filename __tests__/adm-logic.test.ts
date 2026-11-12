import {
  companyErrors,
  companyPatch,
  draftOf,
  mergeLabels,
  validDeviceName,
  validDeviceReason,
  validIncidentTitle,
  validIsoDate,
  validNote,
  validPolicyNumbers,
  validUserReason,
} from '../src/features/adm/logic';
import en from '../i18n-parts/adm.json';

describe('adm logic', () => {
  test('policy numbers stay at or above the system minimum', () => {
    expect(validPolicyNumbers('7', '3')).toEqual({ minLength: false, historyCount: true });
    expect(validPolicyNumbers('8', '2')).toEqual({ minLength: true, historyCount: false });
    expect(validPolicyNumbers('64', '24')).toEqual({ minLength: true, historyCount: true });
    expect(validPolicyNumbers('65', '25')).toEqual({ minLength: false, historyCount: false });
    expect(validPolicyNumbers('8.5', 'x')).toEqual({ minLength: false, historyCount: false });
  });

  test('text length rules match the server', () => {
    expect(validIncidentTitle('abcd')).toBe(false);
    expect(validIncidentTitle('abcde')).toBe(true);
    expect(validNote('  ')).toBe(false);
    expect(validDeviceName('a')).toBe(false);
    expect(validDeviceName('ab')).toBe(true);
    expect(validDeviceReason('four')).toBe(false);
    expect(validDeviceReason('x'.repeat(301))).toBe(false);
    expect(validUserReason('too short')).toBe(false);
    expect(validUserReason('long enough reason')).toBe(true);
  });

  test('company checks and patch', () => {
    const ok = { legalName: 'Patil Agro', gstin: '', pan: '', bankIfsc: '', contactEmail: '' };
    expect(companyErrors(ok)).toEqual({});
    expect(
      companyErrors({ ...ok, legalName: 'P', gstin: 'bad', pan: 'bad', bankIfsc: 'bad', contactEmail: 'x' }),
    ).toEqual({
      legalName: true,
      gstin: true,
      pan: true,
      bankIfsc: true,
      contactEmail: true,
    });
    expect(companyErrors({ ...ok, gstin: '27abcde1234f1z5' })).toEqual({});
    expect(
      companyPatch(
        { legalName: 'A', pan: null, address: 'x' },
        { legalName: 'A', pan: 'abcde1234f', address: ' ' },
      ),
    ).toEqual({
      pan: 'ABCDE1234F',
      address: null,
    });
  });

  test('dates', () => {
    expect(validIsoDate('2027-04-01')).toBe(true);
    expect(validIsoDate('2027-02-30')).toBe(false);
    expect(validIsoDate('01/04/2027')).toBe(false);
  });

  test('labels: empty drops the language, other languages are kept', () => {
    expect(draftOf({ en: 'A', ta: 'B' })).toEqual({ en: 'A', hi: '', mr: '' });
    expect(mergeLabels({ en: 'A', ta: 'B' }, { en: '', hi: ' नया ', mr: '' })).toEqual({
      ta: 'B',
      hi: 'नया',
    });
  });
});

describe('translation parts', () => {
  const flat = (o: Record<string, unknown>, p = ''): string[] =>
    Object.entries(o).flatMap(([k, v]) =>
      typeof v === 'object' && v !== null ? flat(v as Record<string, unknown>, `${p}${k}.`) : [`${p}${k}`],
    );
  test('English, Hindi and Marathi have the same keys', () => {
    const e = flat(en.en).sort();
    expect(flat(en.hi).sort()).toEqual(e);
    expect(flat(en.mr).sort()).toEqual(e);
    expect(e.length).toBeGreaterThan(150);
  });
  test('every new home entry has a nav title and a description', () => {
    const nav = Object.keys(en.en.nav).sort();
    expect(Object.keys(en.en.featureDesc).sort()).toEqual(nav);
  });
});

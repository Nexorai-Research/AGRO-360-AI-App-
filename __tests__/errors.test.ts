import { ApiError, errorMessage } from '../src/api/errors';

describe('errorMessage', () => {
  it('maps known backend codes to a translation key', () => {
    const m = errorMessage(new ApiError(409, { title: 'STOCK_FROZEN', correlationId: 'c1' }));
    expect(m.key).toBe('errors.STOCK_FROZEN');
    expect(m.params.correlationId).toBe('c1');
    expect(errorMessage(new ApiError(422, { title: 'CREDIT_LIMIT_EXCEEDED' })).key).toBe(
      'errors.CREDIT_LIMIT_EXCEEDED',
    );
    expect(errorMessage(new ApiError(422, { title: 'PRICE_LOCKED' })).key).toBe('errors.PRICE_LOCKED');
  });

  it('network failure and 401 have their own messages', () => {
    expect(errorMessage(new ApiError(0, null)).key).toBe('errors.NETWORK');
    expect(errorMessage(new ApiError(401, { title: 'WHATEVER' })).key).toBe('errors.UNAUTHENTICATED');
  });

  it('an unknown 403 becomes FORBIDDEN, a known 403 code keeps its message', () => {
    expect(errorMessage(new ApiError(403, { title: 'NO_PERMISSION' })).key).toBe('errors.FORBIDDEN');
    expect(errorMessage(new ApiError(403, { title: 'FRESH_AUTH_REQUIRED' })).key).toBe(
      'errors.FRESH_AUTH_REQUIRED',
    );
  });

  it('unknown codes get the generic message with the code and correlation id', () => {
    const m = errorMessage(new ApiError(500, { title: 'SOMETHING_NEW', correlationId: 'c2' }));
    expect(m.key).toBe('errors.generic');
    expect(m.params).toEqual({ code: 'SOMETHING_NEW', correlationId: 'c2' });
  });

  it('a non-ApiError is generic', () => {
    expect(errorMessage(new Error('x')).key).toBe('errors.generic');
  });
});

describe('ApiError', () => {
  it('uses detail, then title, then status for the message', () => {
    expect(new ApiError(400, { title: 'A', detail: 'd' }).message).toBe('d');
    expect(new ApiError(400, { title: 'A' }).message).toBe('A');
    expect(new ApiError(502, null).message).toBe('request failed (502)');
    expect(new ApiError(502, null).code).toBe('HTTP_502');
  });

  it('shift and day-end codes from the backend have their own translated text in all 3 languages', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const locales = ['en', 'hi', 'mr'].map(
      (l) => require(`../src/i18n/locales/${l}.json`).errors as Record<string, string>,
    );
    for (const code of [
      'SHIFT_CLOSED',
      'SHIFT_ALREADY_OPEN',
      'OPEN_SHIFTS',
      'DAY_ALREADY_CLOSED',
      'CASH_DIFFERENCE_NEEDS_APPROVAL',
    ]) {
      expect(errorMessage(new ApiError(409, { title: code })).key).toBe(`errors.${code}`);
      for (const errs of locales) expect(typeof errs[code]).toBe('string');
    }
  });
});

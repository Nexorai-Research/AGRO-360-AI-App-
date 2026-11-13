import { makeTools, rupees, runToolUses, shrink, SCREENS, type ToolCtx } from '../src/features/ai/tools';

jest.mock('../src/device', () => ({ newId: jest.fn(() => 'key-1') }));

const CID = '11111111-1111-4111-8111-111111111111';
const get = jest.fn();
const post = jest.fn();
let ctx: ToolCtx;
const confirm = jest.fn();
const go = jest.fn();
const openCustomer = jest.fn();
const setLang = jest.fn();
const signOut = jest.fn();
let perms: string[];

beforeEach(() => {
  [get, post, confirm, go, openCustomer, setLang, signOut].forEach((m) => m.mockReset());
  perms = ['customer.create', 'receipt.create'];
  confirm.mockResolvedValue(true);
  ctx = {
    client: { get, post } as unknown as ToolCtx['client'],
    can: (p) => perms.includes(p),
    confirm,
    go,
    openCustomer,
    setLang,
    signOut,
    today: () => '2026-11-13',
  };
});

describe('rupees', () => {
  test('accepts real amounts as 2-place decimal strings', () => {
    expect(rupees(500)).toBe('500.00');
    expect(rupees('1234.5')).toBe('1234.50');
    expect(rupees(0.1 + 0.2)).toBeNull(); // 0.30000000000000004 has too many places: no silent float rounding
  });
  test('refuses zero, negative, huge, text and 3 places', () => {
    for (const bad of [0, -5, 100_000_001, 'abc', '', '1.234', null, undefined, NaN, Infinity])
      expect(rupees(bad)).toBeNull();
  });
});

describe('shrink', () => {
  test('cuts long lists and says so', () => {
    const out = JSON.parse(shrink({ items: Array.from({ length: 40 }, (_, i) => ({ i })) }));
    expect(out.items).toHaveLength(26);
    expect(out.items[25].note).toBe('15 more rows not shown');
  });
  test('cuts a huge answer', () => {
    expect(shrink({ x: 'a'.repeat(9000) })).toContain('ask a narrower question');
  });
});

describe('get', () => {
  test('reads allowed areas with the signed-in client', async () => {
    get.mockResolvedValue({ items: [{ a: 1 }] });
    const t = makeTools(ctx);
    expect(await t.get!({ path: '/customers?q=ramesh&limit=5' })).toBe('{"items":[{"a":1}]}');
    expect(get).toHaveBeenCalledWith('/customers?q=ramesh&limit=5');
  });
  test.each([
    '/documents/1',
    '/customers/x/photos',
    '/sales/invoices/1/print',
    '/auth/token',
    'customers',
    '/customers/../users',
    '//evil',
    '/customers#x',
    '/reports/x:y',
  ])('refuses %s', async (path) => {
    const t = makeTools(ctx);
    await expect(t.get!({ path })).rejects.toThrow('cannot be read');
    expect(get).not.toHaveBeenCalled();
  });
});

describe('navigation and settings tools', () => {
  test('opens a known screen, says no to an unknown one', async () => {
    const t = makeTools(ctx);
    expect(await t.navigate!({ screen: 'customers' })).toContain('Opened');
    expect(go).toHaveBeenCalledWith(SCREENS.customers);
    expect(await t.navigate!({ screen: 'territories' })).toContain('does not have');
    expect(go).toHaveBeenCalledTimes(1);
  });
  test('open_customer needs a real id and reads the name from the API', async () => {
    get.mockResolvedValue({ id: CID, name: 'Ramesh' });
    const t = makeTools(ctx);
    await expect(t.open_customer!({ customerId: 'not-an-id' })).rejects.toThrow('not a valid id');
    expect(await t.open_customer!({ customerId: CID })).toBe('Opened Ramesh.');
    expect(openCustomer).toHaveBeenCalledWith(CID);
  });
  test('language: only the three the app has; theme and header are said to be unavailable', async () => {
    const t = makeTools(ctx);
    await t.set_language!({ code: 'hi' });
    expect(setLang).toHaveBeenCalledWith('hi');
    expect(await t.set_language!({ code: 'ta' })).toContain('English (en), Hindi (hi) and Marathi (mr) only');
    expect(setLang).toHaveBeenCalledTimes(1);
    expect(await t.set_theme!({ mode: 'dark' })).toContain('Not available');
    expect(await t.toggle_header!({ hidden: true })).toContain('Not available');
  });
  test('sign out only after a Yes', async () => {
    const t = makeTools(ctx);
    confirm.mockResolvedValueOnce(false);
    expect(await t.sign_out!({})).toContain('Staying signed in');
    expect(signOut).not.toHaveBeenCalled();
    await t.sign_out!({});
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});

describe('add_customer', () => {
  test('refused without permission, nothing asked or sent', async () => {
    perms = [];
    expect(await makeTools(ctx).add_customer!({ name: 'Ramesh', mobile: '9876543210' })).toContain('Refused');
    expect(confirm).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });
  test('bad mobile is not sent', async () => {
    expect(await makeTools(ctx).add_customer!({ name: 'Ramesh', mobile: '1234567890' })).toContain(
      'Not done',
    );
    expect(post).not.toHaveBeenCalled();
  });
  test('No keeps the data unchanged', async () => {
    confirm.mockResolvedValue(false);
    expect(await makeTools(ctx).add_customer!({ name: 'Ramesh', mobile: '9876543210' })).toContain(
      'Nothing was changed',
    );
    expect(post).not.toHaveBeenCalled();
  });
  test('Yes posts once with an Idempotency-Key and no tenant id', async () => {
    post.mockResolvedValue({ id: CID });
    const out = await makeTools(ctx).add_customer!({
      name: 'Ramesh',
      mobile: '9876543210',
      village: 'Sonai',
    });
    expect(out).toContain(CID);
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith('/customers', {
      body: { name: 'Ramesh', mobile: '9876543210', village: 'Sonai' },
      idempotencyKey: 'key-1',
    });
  });
});

describe('record_payment', () => {
  const branches = { items: [{ id: 'b-1', status: 'ACTIVE' }] };
  beforeEach(() => {
    get.mockImplementation((p: string) =>
      Promise.resolve(p === '/branches' ? branches : { id: CID, name: 'Ramesh', mobile: '9876543210' }),
    );
    post.mockResolvedValue({ id: 'r-1' });
  });
  test('refused without permission', async () => {
    perms = [];
    expect(await makeTools(ctx).record_payment!({ customerId: CID, amount: 500, mode: 'CASH' })).toContain(
      'Refused',
    );
    expect(post).not.toHaveBeenCalled();
  });
  test('bad amount or mode never reaches the server', async () => {
    const t = makeTools(ctx);
    expect(await t.record_payment!({ customerId: CID, amount: 0, mode: 'CASH' })).toContain('Not done');
    expect(await t.record_payment!({ customerId: CID, amount: 10.123, mode: 'CASH' })).toContain('Not done');
    expect(await t.record_payment!({ customerId: CID, amount: 10, mode: 'CREDIT' })).toContain(
      'payment mode',
    );
    expect(post).not.toHaveBeenCalled();
  });
  test('shows the name read from the API, and No changes nothing', async () => {
    confirm.mockResolvedValue(false);
    const out = await makeTools(ctx).record_payment!({ customerId: CID, amount: 500, mode: 'CASH' });
    expect(out).toContain('Nothing was changed');
    expect(confirm.mock.calls[0][0]).toContain('Ramesh');
    expect(confirm.mock.calls[0][1]).toContainEqual(['Amount', '₹500.00']);
    expect(post).not.toHaveBeenCalled();
  });
  test('Yes posts the amount as a string with the key, India date, first active branch', async () => {
    await makeTools(ctx).record_payment!({ customerId: CID, amount: 500, mode: 'UPI', reference: 'T1' });
    expect(post).toHaveBeenCalledWith('/receipts', {
      body: {
        customerId: CID,
        branchId: 'b-1',
        modeCode: 'UPI',
        amount: '500.00',
        receiptDate: '2026-11-13',
        reference: 'T1',
      },
      idempotencyKey: 'key-1',
    });
  });
});

describe('runToolUses', () => {
  test('returns a result per call, an error result for a failing or unknown tool', async () => {
    const tools = { ok: async () => 'fine', boom: async () => Promise.reject(new Error('refused')) };
    const out = await runToolUses(tools, [
      { type: 'text', text: 'hi' },
      { type: 'tool_use', id: 'a', name: 'ok', input: {} },
      { type: 'tool_use', id: 'b', name: 'boom', input: {} },
      { type: 'tool_use', id: 'c', name: 'toString', input: {} },
    ]);
    expect(out).toEqual([
      { type: 'tool_result', tool_use_id: 'a', content: 'fine' },
      { type: 'tool_result', tool_use_id: 'b', content: 'Error: refused', is_error: true },
      { type: 'tool_result', tool_use_id: 'c', content: 'Error: unknown tool toString', is_error: true },
    ]);
  });
});

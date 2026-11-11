import type { ApiClient } from '../src/api/client';
import { getCustomer360, getCustomerLedger, searchCustomers } from '../src/features/customers/api';

function fake() {
  const get = jest.fn(async (_p: string, _o?: unknown) => ({ items: [] as unknown[] }));
  return { client: { get } as unknown as ApiClient, get };
}

describe('customers api', () => {
  it('sends q and limit, and trims the query', async () => {
    const { client, get } = fake();
    await searchCustomers(client, { q: '  Patil ', limit: 50 });
    expect(get).toHaveBeenCalledWith('/customers', { query: { q: 'Patil', limit: 50 }, signal: undefined });
  });

  it('does not send an empty query', async () => {
    const { client, get } = fake();
    await searchCustomers(client, { q: '   ', limit: 50 });
    expect((get.mock.calls[0]![1] as { query: { q?: string } }).query.q).toBeUndefined();
  });

  it('never asks for more than the API allows (500)', async () => {
    const { client, get } = fake();
    await searchCustomers(client, { q: '', limit: 900 });
    expect((get.mock.calls[0]![1] as { query: { limit: number } }).query.limit).toBe(500);
  });

  it('reads the 360 view and the ledger by id, escaping the id', async () => {
    const { client, get } = fake();
    await getCustomer360(client, 'a/b');
    await getCustomerLedger(client, 'c1');
    expect(get.mock.calls[0]![0]).toBe('/customers/a%2Fb/360');
    expect(get.mock.calls[1]![0]).toBe('/customers/c1/ledger');
  });
});

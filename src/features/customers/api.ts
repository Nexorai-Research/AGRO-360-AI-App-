import type { ApiClient } from '../../api/client';
import type { Customer360, CustomerLedger, CustomerSummary } from './types';

export const PAGE = 50;
export const MAX_LIMIT = 500; // the API refuses more

/** GET /customers has no offset: it pages by raising `limit` (1..500). An empty query is not sent. */
export async function searchCustomers(
  client: ApiClient,
  p: { q: string; limit: number; signal?: AbortSignal },
) {
  const r = await client.get<{ items: CustomerSummary[] }>('/customers', {
    query: { q: p.q.trim() || undefined, limit: Math.min(p.limit, MAX_LIMIT) },
    signal: p.signal,
  });
  return r.items;
}

export const getCustomer360 = (client: ApiClient, id: string, signal?: AbortSignal) =>
  client.get<Customer360>(`/customers/${encodeURIComponent(id)}/360`, { signal });

export const getCustomerLedger = (client: ApiClient, id: string, signal?: AbortSignal) =>
  client.get<CustomerLedger>(`/customers/${encodeURIComponent(id)}/ledger`, { signal });

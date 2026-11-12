import type { ApiClient } from '../../api/client';
import type { CategoryLite, CustomerFull } from './form-logic';

export const CPERM = { create: 'customer.create', update: 'customer.update' } as const;

export const fetchCustomerFull = (c: ApiClient, id: string, signal?: AbortSignal) =>
  c.get<CustomerFull>(`/customers/${encodeURIComponent(id)}`, { signal });
export const fetchCustomerCategories = async (c: ApiClient, signal?: AbortSignal) =>
  (await c.get<{ items: CategoryLite[] }>('/customer-categories', { signal })).items.filter(
    (x) => x.status !== 'INACTIVE',
  );
/** The server answers with the saved customer. A duplicate name in the same village answers DUPLICATE_WARNING until `confirmDuplicate` is sent. */
export const createCustomer = (c: ApiClient, body: Record<string, unknown>, idempotencyKey: string) =>
  c.post<CustomerFull>('/customers', { body, idempotencyKey });
/** `version` goes as If-Match; a stale one is refused by the server. */
export const updateCustomer = (
  c: ApiClient,
  id: string,
  version: number,
  body: Record<string, unknown>,
  idempotencyKey: string,
) => c.patch<CustomerFull>(`/customers/${encodeURIComponent(id)}`, { body, version, idempotencyKey });

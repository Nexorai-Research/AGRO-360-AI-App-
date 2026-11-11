import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useAuth } from '../../auth/AuthProvider';
import { getCustomer360, getCustomerLedger, searchCustomers } from './api';

export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Cached data is keyed by tenant and user, so one franchise's customers are never shown to the next person who signs in on this phone. */
function useScope() {
  const { client, me } = useAuth();
  return { client, scope: [me?.tenantId ?? '', me?.userId ?? ''] as const };
}

export function useCustomerSearch(q: string, limit: number, enabled = true) {
  const { client, scope } = useScope();
  return useQuery({
    queryKey: ['customers', ...scope, 'search', q.trim(), limit],
    enabled: enabled && client !== null,
    queryFn: ({ signal }) => searchCustomers(client!, { q, limit, signal }),
    placeholderData: keepPreviousData,
  });
}

export function useCustomer360(id: string) {
  const { client, scope } = useScope();
  return useQuery({
    queryKey: ['customers', ...scope, '360', id],
    enabled: client !== null && id !== '',
    queryFn: ({ signal }) => getCustomer360(client!, id, signal),
  });
}

export function useCustomerLedger(id: string, enabled: boolean) {
  const { client, scope } = useScope();
  return useQuery({
    queryKey: ['customers', ...scope, 'ledger', id],
    enabled: enabled && client !== null && id !== '',
    queryFn: ({ signal }) => getCustomerLedger(client!, id, signal),
  });
}

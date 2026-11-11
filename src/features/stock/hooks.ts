import { useEffect, useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type { ApiClient } from '../../api/client';
import { ApiError } from '../../api/errors';
import { fetchBatches, fetchBranches, fetchStock, fetchWarehouses, type StockFilter } from './api';
import type { BatchView, Page } from './types';

// A 4xx answer (no permission, not found) will not get better by asking again; only a network or server fault is retried, once.
const retry = (n: number, e: unknown) =>
  !(e instanceof ApiError && e.status >= 400 && e.status < 500) && n < 1;

const nextOffset = <T>(last: Page<T>, all: Page<T>[]) => {
  const loaded = all.reduce((n, p) => n + p.items.length, 0);
  return last.items.length > 0 && loaded < last.total ? loaded : undefined;
};

export function useStock(client: ApiClient | null, filter: StockFilter, enabled = true) {
  return useInfiniteQuery({
    queryKey: ['stock', 'rows', filter],
    enabled: enabled && client !== null,
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) => fetchStock(client!, filter, pageParam, signal),
    getNextPageParam: nextOffset,
    retry,
  });
}

export function useBatches(
  client: ApiClient | null,
  view: BatchView,
  filter: Pick<StockFilter, 'warehouse' | 'product'>,
  enabled = true,
) {
  return useInfiniteQuery({
    queryKey: ['stock', 'batches', view, filter],
    enabled: enabled && client !== null,
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) => fetchBatches(client!, view, filter, pageParam, signal),
    getNextPageParam: nextOffset,
    retry,
  });
}

/** Branch and warehouse lists need the org.config.view permission. If the user lacks it the filter is simply hidden. */
export function useBranches(client: ApiClient | null) {
  return useQuery({
    queryKey: ['stock', 'branches'],
    enabled: client !== null,
    queryFn: () => fetchBranches(client!),
    staleTime: 10 * 60_000,
    retry: false,
  });
}

export function useWarehouses(client: ApiClient | null, branchId: string | undefined) {
  return useQuery({
    queryKey: ['stock', 'warehouses', branchId],
    enabled: client !== null && !!branchId,
    queryFn: () => fetchWarehouses(client!, branchId!),
    staleTime: 10 * 60_000,
    retry: false,
  });
}

export function useDebounced<T>(value: T, ms = 350): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

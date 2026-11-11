import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './errors';

/** Do not retry what a retry cannot fix (a 4xx answer); retry a bad network twice. */
export const shouldRetry = (count: number, e: unknown) =>
  !(e instanceof ApiError && e.status >= 400 && e.status < 500) && count < 2;

export const makeQueryClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: shouldRetry, staleTime: 30_000 } } });

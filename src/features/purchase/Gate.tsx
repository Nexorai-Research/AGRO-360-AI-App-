import type { ReactNode } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ApiError, errorMessage } from '@/api/errors';
import { StateView } from '../stock/StateView';

export const isNetwork = (e: unknown) => e instanceof ApiError && e.code === 'NETWORK';
export const retryNetworkOnce = (n: number, e: unknown) => isNetwork(e) && n < 1;

/**
 * Shows loading / offline / permission-denied / error / empty for one query, else its children.
 * Texts come from `<ns>.offline`, `<ns>.denied` and the given empty key.
 */
export function Gate({
  q,
  ns,
  emptyKey,
  isEmpty,
  children,
}: {
  q: UseQueryResult<unknown, unknown>;
  ns: string;
  emptyKey: string;
  isEmpty: boolean;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  if (q.isPending && q.fetchStatus !== 'idle') return <StateView state="loading" />;
  if (q.error && q.data === undefined) {
    const m = errorMessage(q.error);
    if (isNetwork(q.error)) return <StateView state="offline" message={t(`${ns}.offline`)} onRetry={() => void q.refetch()} />;
    if (m.key === 'errors.FORBIDDEN') return <StateView state="denied" message={t(`${ns}.denied`)} />;
    return <StateView state="error" message={t(m.key, { ...m.params, correlationId: m.params.correlationId ?? '-' })} onRetry={() => void q.refetch()} />;
  }
  if (q.data !== undefined && isEmpty) return <StateView state="empty" message={t(emptyKey)} />;
  return <>{children}</>;
}

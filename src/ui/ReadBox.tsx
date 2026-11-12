import type { ReactNode } from 'react';
import { Text } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { ApiClient } from '@/api/client';
import { Gate, isNetwork, kit } from '@/features/hr/kit';

/** One read-only query with the shared loading, offline, denied and error states. Retries a lost network once. */
export function ReadBox<T>({
  queryKey,
  client,
  enabled,
  load,
  deniedText,
  offlineText,
  children,
}: {
  queryKey: readonly unknown[];
  client: ApiClient | null;
  enabled: boolean;
  load: (c: ApiClient, signal: AbortSignal) => Promise<T>;
  deniedText: string;
  offlineText: string;
  children: (d: T) => ReactNode;
}) {
  const q = useQuery({
    queryKey,
    queryFn: ({ signal }) => load(client!, signal),
    enabled: enabled && client !== null,
    retry: (n, e) => isNetwork(e) && n < 1,
  });
  return (
    <Gate query={q} denied={!enabled} deniedText={deniedText} offlineText={offlineText}>
      {q.data ? children(q.data) : null}
    </Gate>
  );
}

/** "Showing the first N of M" under a list that the server returned only in part. */
export function MoreNote({ shown, total, textKey }: { shown: number; total: number; textKey: string }) {
  const { t } = useTranslation();
  return total > shown ? <Text style={kit.sub}>{t(textKey, { shown, count: total })}</Text> : null;
}

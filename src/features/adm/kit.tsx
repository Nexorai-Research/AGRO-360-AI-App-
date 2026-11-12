import { useState } from 'react';
import { Text } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { errorMessage, type ErrorMessage } from '@/api/errors';
import { Button } from '@/ui/Button';
import { Card, failText, isNetwork, k, useAccess, useIdemKey } from '../admin/kit';
import { admKey } from './api';

export { Card, failText, isNetwork, k, useAccess, useIdemKey };

/**
 * Runs one write at a time and keeps what the person must see: the done text or the error with its reference. The Idempotency-Key is kept
 * after a failure, so pressing the same button again is a retry of the same action; the caller clears it after a success.
 */
export function useRun(userId: string) {
  const qc = useQueryClient();
  const idem = useIdemKey();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [failure, setFailure] = useState<ErrorMessage | null>(null);

  async function run(fn: () => Promise<unknown>, done: string, refresh: string[] = []): Promise<boolean> {
    if (busy) return false;
    setBusy(true);
    setFailure(null);
    setMsg(null);
    try {
      await fn();
      idem.clear();
      setMsg(done);
      for (const part of refresh) void qc.invalidateQueries({ queryKey: admKey(userId, part) });
      return true;
    } catch (e) {
      setFailure(errorMessage(e));
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { idem, busy, msg, failure, run, clearMsg: () => (setMsg(null), setFailure(null)) };
}

export function Banner({ msg, failure }: { msg: string | null; failure: ErrorMessage | null }) {
  const { t } = useTranslation();
  return (
    <>
      {msg ? (
        <Text style={k.ok} accessibilityRole="alert">
          {msg}
        </Text>
      ) : null}
      {failure ? (
        <Text style={k.error} accessibilityRole="alert">
          {failText(t, failure)}
        </Text>
      ) : null}
    </>
  );
}

/** A small card for a part of a page that failed on its own, with a retry. */
export function PartFailed({
  error,
  onRetry,
  offline,
}: {
  error: unknown;
  onRetry: () => void;
  offline: string;
}) {
  const { t } = useTranslation();
  return (
    <Card>
      <Text style={k.sub}>{isNetwork(error) ? offline : failText(t, errorMessage(error))}</Text>
      <Button kind="ghost" label={t('common.retry')} onPress={onRetry} />
    </Card>
  );
}

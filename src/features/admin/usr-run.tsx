import { useState } from 'react';
import { Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { errorMessage, type ErrorMessage } from '@/api/errors';
import { failText, k, useIdemKey } from './kit';

/**
 * Runs one write at a time. On success the idempotency key is dropped and a message is shown; on failure the key is kept, so pressing
 * the same button again is a retry of the same action (same key), while a changed body gets a new key from keyFor().
 */
export function useRunner() {
  const idem = useIdemKey();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [failure, setFailure] = useState<ErrorMessage | null>(null);
  async function run(fn: () => Promise<unknown>, done: string): Promise<boolean> {
    if (busy) return false;
    setBusy(true);
    setFailure(null);
    setMsg(null);
    try {
      await fn();
      idem.clear();
      setMsg(done);
      return true;
    } catch (e) {
      setFailure(errorMessage(e));
      return false;
    } finally {
      setBusy(false);
    }
  }
  const clear = () => {
    setMsg(null);
    setFailure(null);
  };
  return { idem, busy, msg, failure, run, clear };
}

export function Result({ msg, failure }: { msg: string | null; failure: ErrorMessage | null }) {
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

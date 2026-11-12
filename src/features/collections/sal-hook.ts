import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthProvider';
import { useErrorText } from '../purchase/ui';

/** Shared by the sales and collections screens: permission check, one action at a time, success and error text, refresh of the lists. */
export function useSal() {
  const { me, client } = useAuth();
  const errText = useErrorText();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const lock = useRef(false);
  const can = (p: string) => me?.permissions === undefined || me.permissions.includes(p);

  async function act(done: string, fn: () => Promise<unknown>, after?: () => void): Promise<boolean> {
    if (lock.current) return false;
    lock.current = true;
    setBusy(true);
    setFailure(null);
    setMsg(null);
    try {
      await fn();
      after?.();
      setMsg(done);
      await qc.invalidateQueries({ queryKey: ['sal'] });
      await qc.invalidateQueries({ queryKey: ['followup'] });
      await qc.invalidateQueries({ queryKey: ['collections'] });
      return true;
    } catch (e) {
      setFailure(errText(e));
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return {
    me,
    client,
    userId: me?.userId ?? '',
    ready: client !== null && me !== null,
    can,
    act,
    busy,
    msg,
    failure,
    setMsg,
    setFailure,
  };
}

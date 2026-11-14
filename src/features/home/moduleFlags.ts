import { useCallback, useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';

const KEY = 'agro360.home.modules.off';

/** Which module cards the user switched off on the home screen. A preference only (not secret), kept on the phone; all on by default.
 *  Switching a card off only dims it here. It never changes what the server lets the user open. */
export function useModuleFlags(): { isOn: (id: string) => boolean; setOn: (id: string, on: boolean) => void } {
  const [off, setOff] = useState<string[]>([]);
  useEffect(() => {
    void SecureStore.getItemAsync(KEY)
      .then((raw) => {
        const list: unknown = raw ? JSON.parse(raw) : [];
        if (Array.isArray(list)) setOff(list.filter((x): x is string => typeof x === 'string'));
      })
      .catch(() => undefined);
  }, []);
  const setOn = useCallback((id: string, on: boolean) => {
    setOff((cur) => {
      const next = on ? cur.filter((x) => x !== id) : cur.includes(id) ? cur : [...cur, id];
      void SecureStore.setItemAsync(KEY, JSON.stringify(next)).catch(() => undefined);
      return next;
    });
  }, []);
  return { isOn: (id) => !off.includes(id), setOn };
}

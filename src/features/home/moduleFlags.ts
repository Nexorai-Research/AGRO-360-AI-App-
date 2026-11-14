import { useCallback, useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';

const OFF_KEY = 'agro360.home.modules.off';
const HIDDEN_KEY = 'agro360.home.modules.hidden';

export interface ModuleFlags {
  /** False when the user switched this one module card off. */
  isOn: (id: string) => boolean;
  setOn: (id: string, on: boolean) => void;
  /** False when the user hid all module cards with the master switch. */
  showAll: boolean;
  /** Off hides every module card. On shows every module again, including the ones switched off one by one. */
  setShowAll: (on: boolean) => void;
}

const save = (key: string, value: string) => void SecureStore.setItemAsync(key, value).catch(() => undefined);

/** What the user chose on the home screen, kept on the phone (a preference, not secret). Everything is on by default.
 *  It only changes what the home screen shows; it never changes what the server lets the user open. */
export function useModuleFlags(): ModuleFlags {
  const [off, setOff] = useState<string[]>([]);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    void SecureStore.getItemAsync(OFF_KEY)
      .then((raw) => {
        const list: unknown = raw ? JSON.parse(raw) : [];
        if (Array.isArray(list)) setOff(list.filter((x): x is string => typeof x === 'string'));
      })
      .catch(() => undefined);
    void SecureStore.getItemAsync(HIDDEN_KEY)
      .then((raw) => {
        if (raw === '1') setHidden(true);
      })
      .catch(() => undefined);
  }, []);
  const setOn = useCallback((id: string, on: boolean) => {
    setOff((cur) => {
      const next = on ? cur.filter((x) => x !== id) : cur.includes(id) ? cur : [...cur, id];
      save(OFF_KEY, JSON.stringify(next));
      return next;
    });
  }, []);
  const setShowAll = useCallback((on: boolean) => {
    setHidden(!on);
    save(HIDDEN_KEY, on ? '0' : '1');
    if (on) {
      setOff([]);
      save(OFF_KEY, '[]');
    }
  }, []);
  return { isOn: (id) => !off.includes(id), setOn, showAll: !hidden, setShowAll };
}

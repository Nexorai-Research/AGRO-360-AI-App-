import type { ReactNode } from 'react';
import { ScrollView, Share, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import type { Method } from '@/api/client';
import { Button } from '@/ui/Button';
import { Notice, kit, useAction, useActionKey } from '../hr/kit';
import { shiftMonth } from './api';

export { Card, Chips, Field, Gate, Line, Notice, isNetwork, kit, useCan } from '../hr/kit';

export function Screen({ title, children }: { title: string; children: ReactNode }) {
  return (
    <ScrollView contentContainerStyle={kit.page} keyboardShouldPersistTaps="handled">
      <Text style={kit.title} accessibilityRole="header">
        {title}
      </Text>
      {children}
    </ScrollView>
  );
}

/**
 * Every write of a screen goes through here: ONE Idempotency-Key per user action, made from the method, path and body, so tapping the
 * same button again after a lost answer sends the same key; a changed body is a new action with a new key. Edits pass `version` (If-Match).
 */
export function useWrite() {
  const { client } = useAuth();
  const keys = useActionKey();
  const act = useAction(keys);
  function send<T = unknown>(
    method: Method,
    path: string,
    body: unknown,
    done: string,
    after?: (r: T) => void,
    version?: number,
  ) {
    let out: T | undefined;
    return act.run(
      async () => {
        out = await client!.request<T>(method, path, {
          ...(body === undefined ? {} : { body }),
          idempotencyKey: keys.keyFor(`${method} ${path} ${version ?? ''} ${JSON.stringify(body ?? null)}`),
          ...(version === undefined ? {} : { version }),
        });
        return out;
      },
      done,
      () => after?.(out as T),
    );
  }
  return { ...act, send, newAction: keys.reset };
}

export function Banner({ w }: { w: { msg: string | null; failure: string | null } }) {
  return (
    <>
      {w.msg ? <Notice tone="ok" text={w.msg} /> : null}
      {w.failure ? <Notice tone="error" text={w.failure} /> : null}
    </>
  );
}

/** Previous and next month around a YYYY-MM value. */
export function MonthPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useTranslation();
  return (
    <View style={kit.row}>
      <Button kind="ghost" label={t('stf.prevMonth')} onPress={() => onChange(shiftMonth(value, -1))} />
      <Text style={kit.name} accessibilityLabel={t('stf.month')}>
        {value}
      </Text>
      <Button kind="ghost" label={t('stf.nextMonth')} onPress={() => onChange(shiftMonth(value, 1))} />
    </View>
  );
}

/** Hands a text file (CSV) to the phone's share sheet. Returns false when the sheet could not open. */
export async function shareText(fileName: string, content: string): Promise<boolean> {
  try {
    await Share.share({ title: fileName, message: content });
    return true;
  } catch {
    return false;
  }
}

export const yn = (v: boolean, t: (k: string) => string) => (v ? t('stf.yes') : t('stf.no'));

/** A decimal-looking amount as typed: digits and at most two places. Used before the server checks it again. */
export const isMoney = (v: string) => /^\d+(\.\d{1,2})?$/.test(v.trim()) && Number(v) > 0;
/** A positive or negative amount for a payroll adjustment. */
export const isSignedMoney = (v: string) =>
  /^-?\d+(\.\d{1,2})?$/.test(v.trim()) && !/^-?0+(\.0+)?$/.test(v.trim());

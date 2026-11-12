import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import type { ApiClient } from '@/api/client';
import { Button } from '@/ui/Button';
import { StateView } from '../stock/StateView';
import { Card, Chips, Field, Notice, kit, useAction, useActionKey, useCan } from '../hr/kit';

export { Card, Chips, Field, Notice, kit };
export { Button };

/** Who is signed in, the client and the permission check, for any finance screen. */
export function useFin() {
  const { me, client } = useAuth();
  const can = useCan();
  return { me, client, can, uid: me?.userId ?? '', ready: client !== null && me !== null };
}

/**
 * One write at a time with its own Idempotency-Key. `fp` describes the request (path + body): the same fp after a failure reuses the
 * key, a changed fp makes a new one. A success drops the key and refreshes every finance query.
 */
export function useWrite() {
  const keys = useActionKey();
  const act = useAction(keys);
  const qc = useQueryClient();
  const { client } = useAuth();
  return {
    ...act,
    go(fp: string, done: string, fn: (c: ApiClient, key: string) => Promise<unknown>, after?: () => void) {
      return act.run(
        () => fn(client!, keys.keyFor(fp)),
        done,
        () => {
          void qc.invalidateQueries({ queryKey: ['fin'] });
          after?.();
        },
      );
    },
  };
}

export function Page({ title, perm, children }: { title: string; perm: string; children: ReactNode }) {
  const { t } = useTranslation();
  const { can } = useFin();
  return (
    <ScrollView contentContainerStyle={kit.page} keyboardShouldPersistTaps="handled">
      <Text style={kit.title} accessibilityRole="header">
        {title}
      </Text>
      {can(perm) ? children : <StateView state="denied" message={t('fin.denied')} />}
    </ScrollView>
  );
}

export function Result({ w }: { w: { msg: string | null; failure: string | null } }) {
  return (
    <>
      {w.msg ? <Notice tone="ok" text={w.msg} /> : null}
      {w.failure ? <Notice tone="error" text={w.failure} /> : null}
    </>
  );
}

/** A text box for a reason or note, with confirm and cancel. The caller checks the length. */
export function Ask({
  label,
  confirm,
  min = 3,
  busy,
  onConfirm,
  onCancel,
}: {
  label: string;
  confirm: string;
  min?: number;
  busy?: boolean;
  onConfirm: (text: string) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const bad = text.trim().length > 0 && text.trim().length < min;
  return (
    <Card>
      <Field
        label={label}
        value={text}
        onChange={setText}
        error={bad ? t('fin.reasonShort', { count: min }) : null}
      />
      <View style={kit.row}>
        <Button
          label={confirm}
          disabled={busy || text.trim().length < min}
          onPress={() => onConfirm(text.trim())}
        />
        <Button kind="ghost" label={t('fin.cancel')} onPress={onCancel} />
      </View>
    </Card>
  );
}

export interface Opt {
  id: string;
  label: string;
}
/** Choose one item from a long list: a search box and the first matches. The chosen item always stays visible. */
export function Picker({
  label,
  options,
  value,
  onChange,
  blank,
}: {
  label: string;
  options: Opt[];
  value: string;
  onChange: (id: string) => void;
  blank?: string;
}) {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const long = options.length > 8;
  const f = q.trim().toLowerCase();
  const hits = f ? options.filter((o) => o.label.toLowerCase().includes(f)) : options;
  const shown = hits.slice(0, 8);
  const chosen = options.find((o) => o.id === value);
  if (chosen && !shown.some((o) => o.id === chosen.id)) shown.unshift(chosen);
  const list = blank ? [{ id: '', label: blank }, ...shown] : shown;
  return (
    <View style={{ gap: 6 }}>
      {long ? <Field label={t('fin.search', { what: label })} value={q} onChange={setQ} /> : null}
      <Chips label={label} options={list} value={value} onChange={onChange} />
    </View>
  );
}

/** A tappable card. */
export function Tap({
  label,
  onPress,
  children,
}: {
  label: string;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}>
      <Card>{children}</Card>
    </Pressable>
  );
}

import { useState, type ReactNode } from 'react';
import { Text, TextInput, StyleSheet, View, type KeyboardTypeOptions } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import type { ApiClient } from '@/api/client';
import { Button } from '@/ui/Button';
import { colors, radius } from '@/ui/theme';
import { Card, Check, Chips, Field, Notice, useActionKey } from '@/ui/kit';
import { Gate, isNetwork, useAction, useCan } from '../hr/kit';
import type { Errors } from './crm-logic';

/** What the signed-in person may do, the client, and the key prefix that keeps one franchise's data apart from the next sign-in. */
export function useCrm() {
  const { client, me } = useAuth();
  const can = useCan();
  const qc = useQueryClient();
  return {
    client,
    can,
    qc,
    scope: ['cus', me?.tenantId ?? '', me?.userId ?? ''] as const,
    reload: () => void qc.invalidateQueries({ queryKey: ['cus'] }),
  };
}

/** One read with the shared loading, offline, denied and error (with reference code) views. */
export function Panel<T>({
  name,
  load,
  enabled = true,
  children,
}: {
  name: readonly unknown[];
  load: (c: ApiClient, signal: AbortSignal) => Promise<T>;
  enabled?: boolean;
  children: (d: T) => ReactNode;
}) {
  const { t } = useTranslation();
  const { client, scope } = useCrm();
  const q = useQuery({
    queryKey: [...scope, ...name],
    queryFn: ({ signal }) => load(client!, signal),
    enabled: enabled && client !== null,
    retry: (n, e) => isNetwork(e) && n < 1,
  });
  return (
    <Gate query={q} denied={!enabled} deniedText={t('cus.denied')} offlineText={t('cus.offline')}>
      {q.data !== undefined ? children(q.data) : null}
    </Gate>
  );
}

export interface FieldDef {
  name: string;
  label: string;
  keyboard?: KeyboardTypeOptions;
  multiline?: boolean;
  /** When set the field is a single choice shown as chips (or several, comma-joined, with `multi`). */
  choices?: { id: string; label: string }[];
  multi?: boolean;
}

/**
 * A small form that runs one write. The Idempotency-Key is made once for the action and reused when the person taps again after a
 * lost answer; any change to the values makes a new action with a new key.
 */
export function FormCard({
  title,
  fields,
  initial,
  submitLabel,
  validate,
  run,
  doneText,
  onDone,
  resetOnDone = true,
}: {
  title?: string;
  fields: FieldDef[];
  initial?: Record<string, string>;
  submitLabel: string;
  validate?: (v: Record<string, string>) => Errors;
  run: (v: Record<string, string>, key: string) => Promise<unknown>;
  doneText: string;
  onDone?: () => void;
  resetOnDone?: boolean;
}) {
  const { t } = useTranslation();
  const { reload } = useCrm();
  const start = Object.fromEntries(fields.map((f) => [f.name, initial?.[f.name] ?? '']));
  const [v, setV] = useState<Record<string, string>>(start);
  const [errors, setErrors] = useState<Errors>({});
  const keys = useActionKey();
  const act = useAction(keys);
  const set = (n: string, x: string) => {
    setV((o) => ({ ...o, [n]: x }));
    setErrors((o) => ({ ...o, [n]: '' }));
    act.clear();
  };
  const submit = () => {
    const e = validate ? validate(v) : {};
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    void act.run(
      () => run(v, keys.keyFor(JSON.stringify(v))),
      doneText,
      () => {
        if (resetOnDone) setV(start);
        reload();
        onDone?.();
      },
    );
  };
  return (
    <Card>
      {title ? <Text style={s.h}>{title}</Text> : null}
      {fields.map((f) => {
        const err = errors[f.name] ? t(`cus.v.${errors[f.name]}`) : null;
        return f.choices && f.multi ? (
          <View key={f.name} style={{ gap: 6 }}>
            <Text style={s.label}>{f.label}</Text>
            {f.choices.map((c) => {
              const on = (v[f.name] ?? '').split(',').filter(Boolean);
              return (
                <Check
                  key={c.id}
                  label={c.label}
                  value={on.includes(c.id)}
                  onChange={(x) => set(f.name, (x ? [...on, c.id] : on.filter((i) => i !== c.id)).join(','))}
                />
              );
            })}
            {err ? <Text style={s.err}>{err}</Text> : null}
          </View>
        ) : f.choices ? (
          <View key={f.name}>
            <Chips
              label={f.label}
              options={f.choices}
              value={v[f.name] ?? ''}
              onChange={(id) => set(f.name, id)}
            />
            {err ? <Notice tone="error" text={err} /> : null}
          </View>
        ) : f.multiline ? (
          <View key={f.name} style={{ gap: 4 }}>
            <Text style={s.label}>{f.label}</Text>
            <TextInput
              value={v[f.name] ?? ''}
              onChangeText={(x) => set(f.name, x)}
              accessibilityLabel={f.label}
              multiline
              autoCorrect={false}
              style={[s.input, { minHeight: 96, textAlignVertical: 'top', paddingTop: 10 }]}
            />
            {err ? <Text style={s.err}>{err}</Text> : null}
          </View>
        ) : (
          <Field
            key={f.name}
            label={f.label}
            value={v[f.name] ?? ''}
            onChange={(x) => set(f.name, x)}
            keyboard={f.keyboard}
            error={err}
          />
        );
      })}
      {act.failure ? <Notice tone="error" text={act.failure} /> : null}
      {act.msg ? <Notice tone="ok" text={act.msg} /> : null}
      <Button label={act.busy ? t('common.loading') : submitLabel} disabled={act.busy} onPress={submit} />
    </Card>
  );
}

/**
 * A button that runs one write. With `confirm` the first tap asks, the second runs. The key is made once per action and kept when
 * the answer is lost, so a second tap is a retry of the same action.
 */
export function DoButton({
  label,
  run,
  doneText,
  confirm,
  fp,
  kind = 'ghost',
  onDone,
}: {
  label: string;
  run: (key: string) => Promise<unknown>;
  doneText: string;
  confirm?: string;
  fp: string;
  kind?: 'primary' | 'ghost';
  onDone?: () => void;
}) {
  const { t } = useTranslation();
  const { reload } = useCrm();
  const keys = useActionKey();
  const act = useAction(keys);
  const [asking, setAsking] = useState(false);
  const go = () => {
    setAsking(false);
    void act.run(
      () => run(keys.keyFor(fp)),
      doneText,
      () => {
        reload();
        onDone?.();
      },
    );
  };
  return (
    <View style={{ gap: 6 }}>
      {asking ? (
        <>
          <Notice tone="warn" text={confirm ?? ''} />
          <Button label={t('cus.confirmYes')} disabled={act.busy} onPress={go} />
          <Button kind="ghost" label={t('cus.cancel')} onPress={() => setAsking(false)} />
        </>
      ) : (
        <Button
          kind={kind}
          label={act.busy ? t('common.loading') : label}
          disabled={act.busy}
          onPress={confirm ? () => setAsking(true) : go}
        />
      )}
      {act.failure ? <Notice tone="error" text={act.failure} /> : null}
      {act.msg ? <Notice tone="ok" text={act.msg} /> : null}
    </View>
  );
}

/** A button that shows or hides a block (a form) under it. */
export function Reveal({
  label,
  children,
  start = false,
}: {
  label: string;
  children: ReactNode;
  start?: boolean;
}) {
  const [on, setOn] = useState(start);
  return (
    <View style={{ gap: 8 }}>
      <Button kind="ghost" label={label} onPress={() => setOn((x) => !x)} />
      {on ? children : null}
    </View>
  );
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
}) {
  const { t } = useTranslation();
  return <Chips label={t('cus.section')} options={tabs} value={value} onChange={onChange} />;
}

/** A plain text line with a bold first part. */
export function Row({ title, lines }: { title: string; lines: (string | null | undefined | false)[] }) {
  return (
    <>
      <Text style={s.name}>{title}</Text>
      {lines.filter(Boolean).map((l, i) => (
        <Text key={i} style={s.sub}>
          {l}
        </Text>
      ))}
    </>
  );
}

/** Shows "first N of M" under lists that are cut for the small screen. */
export function cut<T>(rows: T[], n = 50) {
  return { shown: rows.slice(0, n), more: Math.max(0, rows.length - n) };
}

export const s = StyleSheet.create({
  h: { fontSize: 17, fontWeight: '700', color: colors.ink },
  label: { fontSize: 14, color: colors.muted, fontWeight: '600' },
  name: { fontSize: 16, color: colors.ink, fontWeight: '600' },
  sub: { fontSize: 14, color: colors.muted },
  err: { fontSize: 14, color: colors.danger },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius,
    paddingHorizontal: 12,
    fontSize: 16,
    backgroundColor: '#fff',
    color: colors.ink,
  },
});

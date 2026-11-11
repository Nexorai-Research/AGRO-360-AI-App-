import { useRef, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type KeyboardTypeOptions } from 'react-native';
import { newId } from '@/device';
import { colors, radius } from './theme';

/**
 * One Idempotency-Key per user action. The same key comes back while the request (path + body) is unchanged, so a retry after a lost
 * answer never makes a second document; any change makes a new action with a new key; reset() after a success.
 */
export function useActionKey() {
  const k = useRef<{ key: string; fp: string } | null>(null);
  return {
    keyFor(fp: string): string {
      if (!k.current || k.current.fp !== fp) k.current = { key: newId(), fp };
      return k.current.key;
    },
    reset() {
      k.current = null;
    },
  };
}

export function Field({
  label,
  value,
  onChange,
  keyboard,
  placeholder,
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  keyboard?: KeyboardTypeOptions;
  placeholder?: string;
  error?: string | null;
}) {
  return (
    <View style={s.gap}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        accessibilityLabel={label}
        keyboardType={keyboard}
        autoCorrect={false}
        style={s.input}
      />
      {error ? <Text style={s.error}>{error}</Text> : null}
    </View>
  );
}

export function Chips<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { id: T; label: string }[];
  value: T | '';
  onChange: (id: T) => void;
}) {
  return (
    <View style={s.gap}>
      <Text style={s.label}>{label}</Text>
      <View accessibilityRole="radiogroup" accessibilityLabel={label} style={s.chips}>
        {options.map((o) => (
          <Pressable
            key={o.id}
            accessibilityRole="radio"
            accessibilityLabel={o.label}
            accessibilityState={{ selected: value === o.id }}
            onPress={() => onChange(o.id)}
            style={[s.chip, value === o.id && s.chipOn]}
          >
            <Text style={[s.chipTxt, value === o.id && s.chipTxtOn]}>{o.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export function Check({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked: value }}
      onPress={() => onChange(!value)}
      style={s.chip}
    >
      <Text style={s.chipTxt}>
        {value ? '☑ ' : '☐ '}
        {label}
      </Text>
    </Pressable>
  );
}

export function Card({ children }: { children: ReactNode }) {
  return <View style={s.card}>{children}</View>;
}
export function Notice({ text, tone }: { text: string; tone: 'ok' | 'error' | 'warn' }) {
  return (
    <Text accessibilityRole="alert" style={tone === 'ok' ? s.ok : tone === 'warn' ? s.warn : s.error}>
      {text}
    </Text>
  );
}

export const kit = StyleSheet.create({
  page: { padding: 16, gap: 10, backgroundColor: colors.bg },
  title: { fontSize: 22, fontWeight: '700', color: colors.ink },
  name: { fontSize: 16, color: colors.ink, fontWeight: '600' },
  sub: { fontSize: 14, color: colors.muted },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});

const s = StyleSheet.create({
  gap: { gap: 4 },
  label: { fontSize: 14, color: colors.muted, fontWeight: '600' },
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.line, borderRadius: radius, paddingHorizontal: 12, fontSize: 16, backgroundColor: '#fff', color: colors.ink },
  error: { fontSize: 14, color: colors.danger },
  ok: { fontSize: 16, color: colors.ok, fontWeight: '600' },
  warn: { fontSize: 15, color: colors.warn },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 48, paddingHorizontal: 14, borderRadius: radius, borderWidth: 1, borderColor: colors.line, justifyContent: 'center', backgroundColor: colors.card },
  chipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipTxt: { fontSize: 15, color: colors.ink },
  chipTxtOn: { color: colors.brandInk, fontWeight: '600' },
  card: { backgroundColor: colors.card, borderRadius: radius, borderWidth: 1, borderColor: colors.line, padding: 12, gap: 8 },
});

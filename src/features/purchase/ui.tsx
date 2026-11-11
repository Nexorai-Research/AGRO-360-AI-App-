import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '@/api/errors';
import { colors, radius } from '@/ui/theme';

export { useActionKey, Notice } from '@/ui/kit';

/** Translated text of an API error, with the reference number filled in. */
export function useErrorText() {
  const { t } = useTranslation();
  return (e: unknown): string => {
    const m = errorMessage(e);
    return t(m.key, { ...m.params, correlationId: m.params.correlationId ?? '-' });
  };
}

export function Field({
  label,
  value,
  onChange,
  keyboard,
  multiline,
  placeholder,
  error,
  autoCapitalize,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  keyboard?: 'default' | 'decimal-pad' | 'numeric' | 'phone-pad';
  multiline?: boolean;
  placeholder?: string;
  error?: string | null;
  autoCapitalize?: 'none' | 'sentences' | 'characters';
}) {
  return (
    <View style={k.field}>
      <Text style={k.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        accessibilityLabel={label}
        placeholder={placeholder}
        keyboardType={keyboard ?? 'default'}
        multiline={multiline}
        autoCapitalize={autoCapitalize}
        style={[k.input, multiline && k.multi]}
      />
      {error ? <Text style={k.error}>{error}</Text> : null}
    </View>
  );
}

export function Chips({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <View style={k.chips}>
      {options.map((o) => (
        <Pressable
          key={o.value}
          accessibilityRole="radio"
          accessibilityLabel={o.label}
          accessibilityState={{ selected: value === o.value }}
          onPress={() => onChange(o.value)}
          style={[k.chip, value === o.value && k.chipOn]}
        >
          <Text style={[k.chipTxt, value === o.value && k.chipTxtOn]}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export const k = StyleSheet.create({
  page: { padding: 16, gap: 10, backgroundColor: colors.bg },
  title: { fontSize: 22, fontWeight: '700', color: colors.ink },
  h2: { fontSize: 17, fontWeight: '700', color: colors.ink },
  card: { backgroundColor: colors.card, borderRadius: radius, borderWidth: 1, borderColor: colors.line, padding: 12, gap: 6 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  name: { fontSize: 16, color: colors.ink, fontWeight: '600' },
  sub: { fontSize: 14, color: colors.muted },
  ok: { fontSize: 16, color: colors.ok, fontWeight: '600' },
  warn: { fontSize: 15, color: colors.warn },
  error: { fontSize: 15, color: colors.danger },
  field: { gap: 4 },
  label: { fontSize: 14, color: colors.muted },
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.line, borderRadius: radius, paddingHorizontal: 12, fontSize: 16, backgroundColor: '#fff', color: colors.ink },
  multi: { minHeight: 96, textAlignVertical: 'top', paddingTop: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 48, paddingHorizontal: 14, borderRadius: radius, borderWidth: 1, borderColor: colors.line, justifyContent: 'center', backgroundColor: colors.card },
  chipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipTxt: { fontSize: 15, color: colors.ink },
  chipTxtOn: { color: colors.brandInk, fontWeight: '600' },
});

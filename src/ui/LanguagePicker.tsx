import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { setLanguage, type LangCode } from '@/i18n';
import { colors, radius } from './theme';

const LANGS: [string, string][] = [
  ['en', 'English'],
  ['hi', 'हिन्दी'],
  ['mr', 'मराठी'],
];

export function LanguagePicker() {
  const { i18n, t } = useTranslation();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={t('common.language')} style={s.row}>
      {LANGS.map(([code, label]) => {
        const on = i18n.language === code;
        return (
          <Pressable
            key={code}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            onPress={() => void setLanguage(code as LangCode)}
            style={[s.chip, on && s.chipOn]}
          >
            <Text style={[s.txt, on && s.txtOn]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, justifyContent: 'center' },
  chip: {
    minHeight: 44,
    paddingHorizontal: 16,
    justifyContent: 'center',
    borderRadius: radius,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
  },
  chipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  txt: { color: colors.ink, fontSize: 16 },
  txtOn: { color: colors.brandInk, fontWeight: '600' },
});

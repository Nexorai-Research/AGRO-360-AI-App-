import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { COVERAGE, LANGUAGES, setLanguage, type LangCode } from '@/i18n';
import { colors } from './theme';

/** English, Hindi and Marathi are always shown; the other 20 languages of the web open with "More". */
const FIRST = 3;

export function LanguagePicker() {
  const { i18n, t } = useTranslation();
  const current = LANGUAGES.findIndex((l) => l.code === i18n.language);
  const [more, setMore] = useState(current >= FIRST);
  const shown = more ? LANGUAGES : LANGUAGES.filter((l) => ['en', 'hi', 'mr'].includes(l.code));
  const partial = COVERAGE[i18n.language];
  return (
    <View style={s.wrap}>
      <View accessibilityRole="radiogroup" accessibilityLabel={t('common.language')} style={s.row}>
        {shown.map(({ code, label }) => {
          const on = i18n.language === code;
          return (
            <Pressable
              key={code}
              testID={`lang-${code}`}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={label}
              onPress={() => void setLanguage(code as LangCode)}
              style={[s.chip, on && s.chipOn]}
            >
              <Text style={[s.txt, on && s.txtOn]}>{label}</Text>
            </Pressable>
          );
        })}
        {!more ? (
          <Pressable
            testID="lang-more"
            accessibilityRole="button"
            onPress={() => setMore(true)}
            style={s.chip}
          >
            <Text style={s.txt}>+{LANGUAGES.length - FIRST}</Text>
          </Pressable>
        ) : null}
      </View>
      {partial !== undefined ? (
        // the added languages are partly translated and not yet checked by a native speaker; say so in the language picker
        <Text style={s.note}>{t('wp15.partial', { pct: partial })}</Text>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { gap: 6 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  chip: {
    minHeight: 44,
    paddingHorizontal: 16,
    justifyContent: 'center',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
  },
  chipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  txt: { color: colors.ink, fontSize: 16 },
  txtOn: { color: colors.brandInk, fontWeight: '600' },
  note: { color: colors.muted, fontSize: 12, textAlign: 'center' },
});

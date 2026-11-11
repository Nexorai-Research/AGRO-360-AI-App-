import { useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { isConfigured } from '@/config';
import { Button } from '@/ui/Button';
import { LanguagePicker } from '@/ui/LanguagePicker';
import { colors, radius } from '@/ui/theme';

export default function Login() {
  const { t } = useTranslation();
  const { signIn } = useAuth();
  const [hint, setHint] = useState('');
  return (
    <ScrollView contentContainerStyle={s.wrap} keyboardShouldPersistTaps="handled">
      <Image
        source={require('../assets/brand/medhavya-logo.jpg')}
        accessibilityLabel="Medhavya Systems"
        style={s.logo}
        resizeMode="contain"
      />
      <Text style={s.title}>{t('app.name')}</Text>
      <Text style={s.sub}>{t('login.title')}</Text>
      <TextInput
        value={hint}
        onChangeText={setHint}
        placeholder={t('login.hint')}
        accessibilityLabel={t('login.hint')}
        autoCapitalize="none"
        autoCorrect={false}
        style={s.input}
      />
      {!isConfigured() && <Text style={s.warn}>{t('login.notConfigured')}</Text>}
      <Button
        label={t('login.button')}
        disabled={!isConfigured()}
        onPress={() => void signIn(hint.trim() || undefined)}
      />
      <LanguagePicker />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap: { flexGrow: 1, justifyContent: 'center', padding: 24, gap: 16, backgroundColor: colors.bg },
  logo: { width: '100%', height: 120 },
  title: { fontSize: 28, fontWeight: '700', color: colors.ink, textAlign: 'center' },
  sub: { fontSize: 16, color: colors.muted, textAlign: 'center' },
  input: {
    minHeight: 48,
    borderRadius: radius,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    fontSize: 16,
    color: colors.ink,
  },
  warn: { color: colors.warn, textAlign: 'center' },
});

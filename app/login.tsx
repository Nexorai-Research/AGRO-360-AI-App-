import { useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { config, isConfigured } from '@/config';
import { LanguagePicker } from '@/ui/LanguagePicker';

// Same look as the web sign-in page (apps/web landing): misty hero, big headline, lime pill button, white sheet.
const LIME = '#d9f26b';
const LIME_INK = '#1c2a06';
const INK = '#0d1a12';
const INK2 = '#4c5a51';
const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' });

export default function Login() {
  const { t } = useTranslation();
  const { signIn, signInWithPassword } = useAuth();
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);
  const byPassword = config.passwordLogin;
  const ready = isConfigured() && !busy && (!byPassword || (name.trim() !== '' && password !== ''));

  const submit = async () => {
    if (!byPassword) {
      void signIn(name.trim() || undefined);
      return;
    }
    setBusy(true);
    setError('');
    const r = await signInWithPassword(name.trim(), password);
    setBusy(false);
    if (r !== 'ok') setError(t(`login.${r}`));
  };

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <View style={s.hero}>
          <View style={s.hillBack} />
          <View style={s.hillFront} />
          <View style={s.nav}>
            <Image source={require('../assets/icon.png')} style={s.mark} accessibilityIgnoresInvertColors />
            <Text style={s.brand}>{t('app.name')}</Text>
          </View>
          <View style={s.copy}>
            <Text style={s.tag}>{t('login.tag')}</Text>
            <Text style={s.h1} accessibilityRole="header">
              {t('login.headline')}
            </Text>
            <Text style={s.lead}>{t('login.lead')}</Text>
          </View>
        </View>

        <View style={s.sheet}>
          <Text style={s.sheetTitle}>{t('login.title')}</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder={byPassword ? t('login.username') : t('login.hint')}
            placeholderTextColor={INK2}
            accessibilityLabel={byPassword ? t('login.username') : t('login.hint')}
            autoCapitalize="none"
            autoCorrect={false}
            style={s.input}
          />
          {byPassword && (
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder={t('login.password')}
              placeholderTextColor={INK2}
              accessibilityLabel={t('login.password')}
              secureTextEntry={!show}
              autoCapitalize="none"
              autoCorrect={false}
              onSubmitEditing={() => ready && void submit()}
              style={s.input}
            />
          )}
          {byPassword && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t(show ? 'login.hide' : 'login.show')}
              onPress={() => setShow((v) => !v)}
            >
              <Text style={s.toggle}>{t(show ? 'login.hide' : 'login.show')}</Text>
            </Pressable>
          )}
          {error !== '' && (
            <Text style={s.error} accessibilityRole="alert">
              {error}
            </Text>
          )}
          {!isConfigured() && <Text style={s.error}>{t('login.notConfigured')}</Text>}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('login.button')}
            disabled={!ready}
            onPress={() => void submit()}
            style={[s.pill, !ready && s.pillOff]}
          >
            <Text style={s.pillTxt}>{busy ? t('login.signingIn') : t('login.cta')}</Text>
            <View style={s.arrow}>
              <Text style={s.arrowTxt}>→</Text>
            </View>
          </Pressable>

          <View style={s.specs}>
            {(['spec1', 'spec2', 'spec3'] as const).map((k) => (
              <View key={k} style={s.specRow}>
                <Text style={s.specTxt}>{t(`login.${k}`)}</Text>
                <Text style={s.specTxt}>+</Text>
              </View>
            ))}
          </View>

          <LanguagePicker />
          <Image
            source={require('../assets/brand/medhavya-logo.jpg')}
            accessibilityLabel="Medhavya Systems"
            style={s.logo}
            resizeMode="contain"
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#d7ddd9' },
  scroll: { flexGrow: 1 },
  hero: {
    backgroundColor: '#d7ddd9',
    paddingHorizontal: 24,
    paddingTop: 56,
    paddingBottom: 64,
    overflow: 'hidden',
  },
  hillBack: {
    position: 'absolute',
    left: -60,
    right: -60,
    bottom: -40,
    height: 170,
    borderRadius: 400,
    backgroundColor: '#9db0a3',
    opacity: 0.55,
  },
  hillFront: {
    position: 'absolute',
    left: -100,
    right: -20,
    bottom: -90,
    height: 170,
    borderRadius: 400,
    backgroundColor: '#7f9a86',
    opacity: 0.6,
  },
  nav: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  mark: { width: 34, height: 34, borderRadius: 8 },
  brand: { fontSize: 19, fontWeight: '700', color: INK, letterSpacing: -0.3 },
  copy: { marginTop: 36, gap: 14 },
  tag: {
    alignSelf: 'flex-start',
    fontFamily: MONO,
    fontSize: 11,
    letterSpacing: 1.2,
    color: LIME_INK,
    backgroundColor: LIME,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    overflow: 'hidden',
  },
  h1: { fontSize: 36, lineHeight: 38, fontWeight: '700', color: '#0b150f', letterSpacing: -1.2 },
  lead: { fontSize: 15, lineHeight: 23, color: '#243229' },
  sheet: {
    flex: 1,
    backgroundColor: '#fff',
    marginTop: -32,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    padding: 24,
    gap: 14,
    elevation: 8,
  },
  sheetTitle: { fontSize: 22, fontWeight: '700', color: INK, letterSpacing: -0.5 },
  input: {
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(13,26,18,0.16)',
    backgroundColor: '#f6f8f6',
    paddingHorizontal: 16,
    fontSize: 16,
    color: INK,
  },
  toggle: { color: INK2, fontSize: 14, fontWeight: '600', alignSelf: 'flex-end' },
  error: { color: '#b4232a', fontSize: 14 },
  pill: {
    minHeight: 54,
    borderRadius: 999,
    backgroundColor: LIME,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 24,
    paddingRight: 6,
  },
  pillOff: { opacity: 0.5 },
  pillTxt: { fontSize: 16, fontWeight: '700', color: LIME_INK },
  arrow: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: LIME_INK,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowTxt: { color: LIME, fontSize: 20, fontWeight: '700' },
  specs: { marginTop: 6, padding: 14, borderRadius: 14, backgroundColor: '#f1f4f2', gap: 10 },
  specRow: { flexDirection: 'row', justifyContent: 'space-between' },
  specTxt: { fontFamily: MONO, fontSize: 11, letterSpacing: 1.1, color: INK },
  logo: { width: '100%', height: 70, marginTop: 4 },
});

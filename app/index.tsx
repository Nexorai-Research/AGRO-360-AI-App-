import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/ui/Button';
import { LanguagePicker } from '@/ui/LanguagePicker';
import { colors, radius } from '@/ui/theme';

export default function Home() {
  const { t } = useTranslation();
  const { me, status, signOut } = useAuth();
  if (status === 'loading' || !me) return <Text style={s.loading}>{t('common.loading')}</Text>;
  const perms = me.permissions ?? [];
  return (
    <ScrollView contentContainerStyle={s.wrap}>
      <Text style={s.title}>{t('home.hello', { name: me.userId })}</Text>
      <Text style={s.sub}>{me.roles.join(', ')}</Text>
      <View style={s.card}>
        <Text style={s.h}>{t('home.permissions')} ({perms.length})</Text>
        {perms.map((p) => (
          <Text key={p} style={s.perm}>{p}</Text>
        ))}
      </View>
      <LanguagePicker />
      <Button kind="ghost" label={t('home.signOut')} onPress={() => void signOut()} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  loading: { padding: 24, color: colors.muted },
  wrap: { padding: 24, gap: 16, backgroundColor: colors.bg, flexGrow: 1 },
  title: { fontSize: 24, fontWeight: '700', color: colors.ink },
  sub: { color: colors.muted },
  card: { backgroundColor: colors.card, borderRadius: radius, borderWidth: 1, borderColor: colors.line, padding: 16, gap: 4 },
  h: { fontWeight: '600', color: colors.ink, marginBottom: 6 },
  perm: { color: colors.muted, fontSize: 13 },
});

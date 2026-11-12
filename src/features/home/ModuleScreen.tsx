import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { colors } from '@/ui/theme';
import { findModule, tint, type Feature } from './modules';

function FeatureCard({ f, color }: { f: Feature; color: string }) {
  const { t } = useTranslation();
  const title = t(`nav.${f.key}`);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      testID={`feature-${f.key}`}
      onPress={() => router.push(f.href as never)}
      android_ripple={{ color: tint(color, '22') }}
      style={({ pressed }) => [s.card, pressed && s.pressed]}
    >
      <View style={[s.iconBox, { backgroundColor: tint(color, '22') }]}>
        <Text style={s.icon}>{f.icon}</Text>
      </View>
      <Text style={s.title} numberOfLines={2}>
        {title}
      </Text>
      <Text style={s.desc} numberOfLines={3}>
        {t(`featureDesc.${f.key}`)}
      </Text>
      <Text style={[s.go, { color }]}>{t('modules.open')} ›</Text>
    </Pressable>
  );
}

/** The screens inside one module, as cards. */
export function ModuleScreen({ id }: { id: string | undefined }) {
  const { t } = useTranslation();
  const m = findModule(id);
  const back = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('modules.back')}
      onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      hitSlop={12}
      style={s.back}
    >
      <Text style={s.backTxt}>‹ {t('modules.back')}</Text>
    </Pressable>
  );
  if (!m) {
    return (
      <View style={s.page}>
        <View style={[s.hero, { backgroundColor: colors.brand }]}>{back}</View>
        <Text style={s.empty}>{t('modules.notFound')}</Text>
      </View>
    );
  }
  return (
    <ScrollView style={s.page} contentContainerStyle={s.content} stickyHeaderIndices={[]}>
      <View style={[s.hero, { backgroundColor: m.color }]}>
        {back}
        <View style={s.heroRow}>
          <View style={s.heroIcon}>
            <Text style={s.heroEmoji}>{m.icon}</Text>
          </View>
          <View style={s.heroText}>
            <Text style={s.heroTitle} accessibilityRole="header">
              {t(`modules.${m.id}.title`)}
            </Text>
            <Text style={s.heroSub}>{t(`modules.${m.id}.sub`)}</Text>
          </View>
        </View>
      </View>
      <View style={s.grid}>
        {m.features.map((f) => (
          <FeatureCard key={f.key} f={f} color={m.color} />
        ))}
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  content: { paddingBottom: 32 },
  hero: {
    paddingTop: 48,
    paddingHorizontal: 20,
    paddingBottom: 28,
    gap: 16,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  back: { alignSelf: 'flex-start', paddingVertical: 4 },
  backTxt: { color: '#fff', fontSize: 16, fontWeight: '600' },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  heroIcon: {
    width: 60,
    height: 60,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroEmoji: { fontSize: 30 },
  heroText: { flex: 1, gap: 2 },
  heroTitle: { color: '#fff', fontSize: 24, fontWeight: '700', letterSpacing: -0.5 },
  heroSub: { color: 'rgba(255,255,255,0.88)', fontSize: 14, lineHeight: 20 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, padding: 16 },
  card: {
    width: '47.8%',
    flexGrow: 1,
    backgroundColor: '#fff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
    gap: 6,
    minHeight: 160,
    elevation: 2,
    shadowColor: '#0d1a12',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  iconBox: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  icon: { fontSize: 23 },
  title: { fontSize: 15, fontWeight: '700', color: colors.ink, marginTop: 4 },
  desc: { fontSize: 12, lineHeight: 17, color: colors.muted, flexGrow: 1 },
  go: { fontSize: 13, fontWeight: '700', marginTop: 2 },
  empty: { padding: 24, color: colors.muted, textAlign: 'center' },
});

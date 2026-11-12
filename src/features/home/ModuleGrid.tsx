import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { colors } from '@/ui/theme';
import { MODULES, moduleTarget, tint, type AppModule } from './modules';

function ModuleCard({ m }: { m: AppModule }) {
  const { t } = useTranslation();
  const title = t(`modules.${m.id}.title`);
  const meta =
    m.features.length === 1 ? t('modules.open') : t('modules.screens', { count: m.features.length });
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${meta}`}
      testID={`module-${m.id}`}
      onPress={() => router.push(moduleTarget(m) as never)}
      android_ripple={{ color: tint(m.color, '22') }}
      style={({ pressed }) => [s.card, { borderTopColor: m.color }, pressed && s.pressed]}
    >
      <View style={[s.iconBox, { backgroundColor: tint(m.color, '22') }]}>
        <Text style={s.icon}>{m.icon}</Text>
      </View>
      <Text style={s.title} numberOfLines={2}>
        {title}
      </Text>
      <Text style={s.sub} numberOfLines={2}>
        {t(`modules.${m.id}.sub`)}
      </Text>
      <View style={[s.chip, { backgroundColor: tint(m.color) }]}>
        <Text style={[s.chipTxt, { color: m.color }]}>{meta} ›</Text>
      </View>
    </Pressable>
  );
}

/** The home menu: one card per module, like the web top menu. */
export function ModuleGrid() {
  const { t } = useTranslation();
  return (
    <View style={s.wrap}>
      <Text style={s.heading} accessibilityRole="header">
        {t('modules.all')}
      </Text>
      <View style={s.grid}>
        {MODULES.map((m) => (
          <ModuleCard key={m.id} m={m} />
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { gap: 10, marginBottom: 8 },
  heading: { fontSize: 18, fontWeight: '700', color: colors.ink, letterSpacing: -0.3 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  card: {
    width: '47.8%',
    flexGrow: 1,
    backgroundColor: '#fff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.line,
    borderTopWidth: 4,
    padding: 14,
    gap: 6,
    minHeight: 168,
    elevation: 2,
    shadowColor: '#0d1a12',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  iconBox: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  icon: { fontSize: 24 },
  title: { fontSize: 16, fontWeight: '700', color: colors.ink, marginTop: 4, letterSpacing: -0.2 },
  sub: { fontSize: 12, lineHeight: 17, color: colors.muted, flexGrow: 1 },
  chip: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginTop: 4,
  },
  chipTxt: { fontSize: 12, fontWeight: '700' },
});

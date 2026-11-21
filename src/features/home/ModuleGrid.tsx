import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { colors } from '@/ui/theme';
import { useAuth } from '@/auth/AuthProvider';
import { useModuleFlags } from './moduleFlags';
import { moduleTarget, tint, visibleModules, type AppModule } from './modules';

function ModuleCard({ m, on, onToggle }: { m: AppModule; on: boolean; onToggle: (v: boolean) => void }) {
  const { t } = useTranslation();
  const title = t(`modules.${m.id}.title`);
  const meta = !on
    ? t('modules.off')
    : m.features.length === 1
      ? t('modules.open')
      : t('modules.screens', { count: m.features.length });
  return (
    <View style={s.cell}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${title}, ${meta}`}
        accessibilityState={{ disabled: !on }}
        testID={`module-${m.id}`}
        disabled={!on}
        onPress={() => router.push(moduleTarget(m) as never)}
        android_ripple={{ color: tint(m.color, '22') }}
        style={({ pressed }) => [s.card, !on && s.cardOff, pressed && s.pressed]}
      >
        <View pointerEvents="none" style={[s.glow, { backgroundColor: tint(m.color, '1a') }]} />
        <View
          style={[
            s.iconBox,
            { backgroundColor: tint(m.color, '1f'), borderColor: tint(m.color, '33') },
            !on && s.dim,
          ]}
        >
          <Text style={s.icon}>{m.icon}</Text>
        </View>
        <Text style={[s.title, !on && s.dim]} numberOfLines={2}>
          {title}
        </Text>
        <Text style={[s.sub, !on && s.dim]} numberOfLines={2}>
          {t(`modules.${m.id}.sub`)}
        </Text>
        <View style={[s.chip, { backgroundColor: tint(m.color) }, !on && s.dim]}>
          <Text style={[s.chipTxt, { color: m.color }]}>{on ? `${meta} ›` : meta}</Text>
        </View>
      </Pressable>
      <Switch
        testID={`module-switch-${m.id}`}
        style={s.toggle}
        value={on}
        onValueChange={onToggle}
        accessibilityLabel={t('modules.toggle', { name: title })}
        trackColor={{ false: '#c3d0d3', true: m.color }}
        thumbColor="#fff"
      />
    </View>
  );
}

/** The roles of the signed-in user, or none outside the sign-in provider (the menu only adjusts what it shows). */
export function useRoles(): unknown[] {
  try {
    const me = useAuth().me;
    return Array.isArray(me?.roles) ? me.roles : [];
  } catch {
    return [];
  }
}

/** The home menu: one card per module, like the web top menu. */
export function ModuleGrid() {
  const { t } = useTranslation();
  const { isOn, setOn, showAll, setShowAll } = useModuleFlags();
  const roles = useRoles();
  // a module tied to roles (the platform console) is shown only to those roles; the server refuses everyone else anyway
  const visible = visibleModules(roles);
  return (
    <View style={s.wrap}>
      <View style={s.headRow}>
        <Text style={s.heading} accessibilityRole="header">
          {t('modules.all')}
        </Text>
        <Switch
          testID="modules-master-switch"
          value={showAll}
          onValueChange={setShowAll}
          accessibilityLabel={t('modules.showAll')}
          trackColor={{ false: '#c3d0d3', true: colors.brand }}
          thumbColor="#fff"
        />
      </View>
      {showAll ? (
        <View style={s.grid}>
          {visible.map((m) => (
            <ModuleCard key={m.id} m={m} on={isOn(m.id)} onToggle={(v) => setOn(m.id, v)} />
          ))}
        </View>
      ) : (
        <View style={s.hiddenNote} testID="modules-hidden-note">
          <Text style={s.hiddenTxt}>{t('modules.hiddenNote')}</Text>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { gap: 12, marginBottom: 8 },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heading: { fontSize: 20, fontWeight: '800', color: colors.ink, letterSpacing: -0.4, marginTop: 4 },
  hiddenNote: {
    backgroundColor: '#fff',
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    padding: 16,
  },
  hiddenTxt: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  cell: { width: '47.8%', flexGrow: 1 },
  // Dimming the whole cell with opacity draws a box around the elevation shadow on Android, so only the contents are dimmed.
  cardOff: { backgroundColor: '#eaf0f1', elevation: 0, shadowOpacity: 0 },
  dim: { opacity: 0.45 },
  // The card has an elevation, and Android hands touches to the highest elevation first: the switch must sit above the card.
  toggle: { position: 'absolute', top: 6, right: 4, zIndex: 10, elevation: 10, transform: [{ scale: 0.8 }] },
  card: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    padding: 16,
    gap: 6,
    minHeight: 176,
    overflow: 'hidden',
    elevation: 4,
    shadowColor: '#0d1a12',
    shadowOpacity: 0.1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
  },
  glow: { position: 'absolute', top: -34, right: -34, width: 110, height: 110, borderRadius: 55 },
  pressed: { opacity: 0.88, transform: [{ scale: 0.97 }] },
  iconBox: {
    width: 52,
    height: 52,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: { fontSize: 26 },
  title: { fontSize: 17, fontWeight: '800', color: colors.ink, marginTop: 8, letterSpacing: -0.3 },
  sub: { fontSize: 12.5, lineHeight: 18, color: colors.muted, flexGrow: 1 },
  chip: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginTop: 6,
  },
  chipTxt: { fontSize: 12, fontWeight: '700' },
});

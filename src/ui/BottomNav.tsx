import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { moduleTarget, visibleModules } from '@/features/home/modules';
import { useRoles } from '@/features/home/ModuleGrid';
import { colors } from './theme';

function NavButton({
  icon,
  label,
  active,
  onPress,
  testID,
}: {
  icon: string;
  label: string;
  active?: boolean;
  onPress: () => void;
  testID: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!active }}
      onPress={onPress}
      hitSlop={6}
      style={s.btn}
    >
      <View style={[s.pill, active && s.pillOn]}>
        <Text style={[s.icon, active && s.iconOn]}>{icon}</Text>
      </View>
      <Text style={[s.label, active && s.labelOn]}>{label}</Text>
    </Pressable>
  );
}

/** Back, Home and Menu on every signed-in screen. Menu opens the list of all modules. */
export function BottomNav() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const [menu, setMenu] = useState(false);
  const roles = useRoles();
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/'));
  return (
    <>
      <View style={[s.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        <NavButton testID="nav-back" icon="‹" label={t('bottomNav.back')} onPress={goBack} />
        <NavButton
          testID="nav-home"
          icon="⌂"
          label={t('bottomNav.home')}
          active={pathname === '/'}
          onPress={() => router.replace('/')}
        />
        <NavButton
          testID="nav-menu"
          icon="☰"
          label={t('bottomNav.menu')}
          active={menu}
          onPress={() => setMenu(true)}
        />
      </View>
      <Modal visible={menu} transparent animationType="slide" onRequestClose={() => setMenu(false)}>
        <Pressable style={s.scrim} onPress={() => setMenu(false)} accessibilityLabel={t('bottomNav.close')} />
        <View style={[s.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={s.grab} />
          <Text style={s.sheetTitle} accessibilityRole="header">
            {t('bottomNav.menuTitle')}
          </Text>
          <ScrollView contentContainerStyle={s.list}>
            {visibleModules(roles).map((m) => (
              <Pressable
                key={m.id}
                testID={`menu-${m.id}`}
                accessibilityRole="button"
                accessibilityLabel={t(`modules.${m.id}.title`)}
                onPress={() => {
                  setMenu(false);
                  router.push(moduleTarget(m) as never);
                }}
                style={s.row}
              >
                <View style={[s.rowIcon, { backgroundColor: `${m.color}1f` }]}>
                  <Text style={s.rowEmoji}>{m.icon}</Text>
                </View>
                <Text style={s.rowTitle}>{t(`modules.${m.id}.title`)}</Text>
                <Text style={[s.chev, { color: m.color }]}>›</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: colors.deep,
    paddingTop: 8,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderTopWidth: 2,
    borderTopColor: colors.gold,
    elevation: 12,
  },
  btn: { alignItems: 'center', gap: 2, minWidth: 72 },
  pill: { width: 52, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  pillOn: { backgroundColor: 'rgba(212,168,75,0.22)' },
  icon: { color: 'rgba(255,255,255,0.8)', fontSize: 20, fontWeight: '700' },
  iconOn: { color: colors.gold },
  label: { color: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: '600' },
  labelOn: { color: colors.gold },
  scrim: { flex: 1, backgroundColor: 'rgba(7,59,76,0.55)' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '75%',
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  grab: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.line,
    marginBottom: 12,
  },
  sheetTitle: { fontSize: 20, fontWeight: '800', color: colors.ink, marginBottom: 8, letterSpacing: -0.3 },
  list: { gap: 6, paddingBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  rowIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  rowEmoji: { fontSize: 22 },
  rowTitle: { flex: 1, fontSize: 16, fontWeight: '600', color: colors.ink },
  chev: { fontSize: 24, fontWeight: '700' },
});

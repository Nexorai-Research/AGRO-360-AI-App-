import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthProvider';
import { signedInName } from '@/auth/auth';
import { LanguagePicker } from '@/ui/LanguagePicker';
import { colors } from '@/ui/theme';
import { groupPermissions, initials, splitRoles } from './profile-logic';

const MONO = 'monospace';

function Stat({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <View style={[s.stat, { borderColor: `${color}55`, backgroundColor: `${color}12` }]}>
      <Text style={[s.statValue, { color }]}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

function PermissionGroupRow({ title, items, open, onToggle }: { title: string; items: string[]; open: boolean; onToggle: () => void }) {
  return (
    <View style={s.group}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${title}, ${items.length}`}
        onPress={onToggle}
        style={s.groupHead}
      >
        <Text style={s.groupTitle}>{title}</Text>
        <View style={s.count}>
          <Text style={s.countTxt}>{items.length}</Text>
        </View>
        <Text style={s.chev}>{open ? '⌃' : '⌄'}</Text>
      </Pressable>
      {open ? (
        <View style={s.perms}>
          {items.map((p) => (
            <Text key={p} style={s.perm}>
              {p}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** Who is signed in, their roles, what they may do (grouped and searchable), the language and sign out. */
export function ProfileCard() {
  const { t } = useTranslation();
  const { me, signOut } = useAuth();
  const queryClient = useQueryClient();
  const [showPerms, setShowPerms] = useState(false);
  const [query, setQuery] = useState('');
  const [openGroups, setOpenGroups] = useState<string[]>([]);
  const perms = useMemo(() => me?.permissions ?? [], [me?.permissions]);
  const roles = useMemo(() => splitRoles(me?.roles ?? []), [me?.roles]);
  const groups = useMemo(() => groupPermissions(perms, query), [perms, query]);
  if (!me) return null;
  const name = signedInName();
  const searching = query.trim() !== '';
  const toggle = (prefix: string) =>
    setOpenGroups((cur) => (cur.includes(prefix) ? cur.filter((x) => x !== prefix) : [...cur, prefix]));

  return (
    <View style={s.card} testID="profile-card">
      <View style={s.banner}>
        <View pointerEvents="none" style={[s.eye, s.eyeA]} />
        <View pointerEvents="none" style={[s.eye, s.eyeB]} />
        <View style={s.avatar}>
          <Text style={s.avatarTxt}>{initials(name)}</Text>
        </View>
        <View style={s.who}>
          <Text style={s.small}>{t('profile.signedInAs')}</Text>
          <Text style={s.name} numberOfLines={1}>
            {name ?? t('profile.account')}
          </Text>
        </View>
      </View>

      <View style={s.body}>
        <View style={s.stats}>
          <Stat value={roles.business.length + roles.system.length} label={t('home.roles')} color={colors.sapphire} />
          <Stat value={perms.length} label={t('profile.permissions')} color={colors.brand2} />
        </View>

        {roles.business.length > 0 ? (
          <View style={s.chips}>
            {roles.business.map((r) => (
              <View key={r} style={s.role}>
                <Text style={s.roleTxt}>{r}</Text>
              </View>
            ))}
          </View>
        ) : null}
        {roles.system.length > 0 ? (
          <Text style={s.system}>
            {t('profile.systemRoles')}: {roles.system.join(', ')}
          </Text>
        ) : null}

        {perms.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={showPerms ? t('home.hidePermissions') : t('home.showPermissions')}
            onPress={() => setShowPerms((v) => !v)}
            style={s.outline}
          >
            <Text style={s.outlineTxt}>{showPerms ? t('home.hidePermissions') : t('home.showPermissions')}</Text>
          </Pressable>
        ) : null}

        {showPerms ? (
          <View style={s.permBox}>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={t('profile.search')}
              placeholderTextColor={colors.muted}
              accessibilityLabel={t('profile.search')}
              autoCapitalize="none"
              autoCorrect={false}
              style={s.search}
            />
            {groups.length === 0 ? (
              <Text style={s.none}>{t('profile.noMatch', { q: query.trim() })}</Text>
            ) : (
              groups.map((g) => (
                <PermissionGroupRow
                  key={g.prefix}
                  title={g.title}
                  items={g.items}
                  open={searching || openGroups.includes(g.prefix)}
                  onToggle={() => toggle(g.prefix)}
                />
              ))
            )}
          </View>
        ) : null}

        <LanguagePicker />

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('home.signOut')}
          onPress={() => {
            // another user on this phone must never see this user's cached numbers
            queryClient.clear();
            void signOut();
          }}
          style={s.signOut}
        >
          <Text style={s.signOutTxt}>{t('home.signOut')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 26,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    overflow: 'hidden',
    elevation: 4,
    shadowColor: '#0d1a12',
    shadowOpacity: 0.1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
  },
  banner: {
    backgroundColor: colors.deep,
    paddingHorizontal: 20,
    paddingVertical: 22,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    overflow: 'hidden',
  },
  eye: { position: 'absolute', borderRadius: 999 },
  eyeA: { width: 120, height: 120, right: -34, top: -40, backgroundColor: colors.gold, opacity: 0.85 },
  eyeB: { width: 74, height: 74, right: -10, top: -18, backgroundColor: colors.brand2 },
  avatar: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: colors.plum,
    borderWidth: 3,
    borderColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarTxt: { color: '#fff', fontSize: 22, fontWeight: '800', letterSpacing: 0.5 },
  who: { flex: 1, gap: 2 },
  small: { color: 'rgba(255,255,255,0.7)', fontSize: 12, letterSpacing: 0.6 },
  name: { color: '#fff', fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  body: { padding: 18, gap: 14 },
  stats: { flexDirection: 'row', gap: 12 },
  stat: { flex: 1, borderWidth: 1, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 14, gap: 2 },
  statValue: { fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
  statLabel: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  role: { backgroundColor: `${colors.sapphire}1a`, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  roleTxt: { color: colors.sapphire, fontSize: 13, fontWeight: '700' },
  system: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  outline: {
    minHeight: 48,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outlineTxt: { color: colors.brand, fontSize: 15, fontWeight: '700' },
  permBox: { gap: 10 },
  search: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: '#f4f8f8',
    paddingHorizontal: 14,
    fontSize: 15,
    color: colors.ink,
  },
  none: { color: colors.muted, fontSize: 14, paddingVertical: 6 },
  group: { borderRadius: 14, backgroundColor: '#f4f8f8', overflow: 'hidden' },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, minHeight: 48 },
  groupTitle: { flex: 1, color: colors.ink, fontSize: 15, fontWeight: '700' },
  count: { backgroundColor: `${colors.brand2}22`, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  countTxt: { color: colors.brand2, fontSize: 12, fontWeight: '800' },
  chev: { color: colors.muted, fontSize: 18, fontWeight: '700', width: 18, textAlign: 'center' },
  perms: { paddingHorizontal: 14, paddingBottom: 12, gap: 4 },
  perm: { fontFamily: MONO, fontSize: 11.5, color: colors.muted },
  signOut: {
    minHeight: 50,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: `${colors.danger}66`,
    backgroundColor: `${colors.danger}0d`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signOutTxt: { color: colors.danger, fontSize: 15, fontWeight: '800' },
});

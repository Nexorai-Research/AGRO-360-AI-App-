import { useEffect, useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { isPlatformUser } from '@/features/platform/roles';
import { colors } from '@/ui/theme';
import { setTelemetryOff, startTelemetry, telemetryOff } from './telemetry';

/** "Share usage with my franchise": on by default, like the web; switching it off stops reporting at once and is remembered on this phone. */
export function TelemetrySwitch() {
  const { t } = useTranslation();
  const { me, client } = useAuth();
  const [on, setOn] = useState(true);
  useEffect(() => {
    let live = true;
    void telemetryOff().then((off) => live && setOn(!off));
    return () => {
      live = false;
    };
  }, []);
  if (isPlatformUser(me?.roles)) return null; // a platform operator is never reported, so there is nothing to switch
  return (
    <View style={s.row}>
      <View style={s.text}>
        <Text style={s.title}>{t('wp13.title')}</Text>
        <Text style={s.hint}>{t(on ? 'wp13.onHint' : 'wp13.offHint')}</Text>
      </View>
      <Switch
        testID="telemetry-switch"
        value={on}
        accessibilityLabel={t('wp13.title')}
        onValueChange={(v) => {
          setOn(v);
          void setTelemetryOff(!v);
          if (v && client) startTelemetry(client);
        }}
        trackColor={{ false: '#c3d0d3', true: colors.brand }}
        thumbColor="#fff"
      />
    </View>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#f4f8f8',
    borderRadius: 14,
    padding: 14,
  },
  text: { flex: 1, gap: 2 },
  title: { color: colors.ink, fontSize: 15, fontWeight: '700' },
  hint: { color: colors.muted, fontSize: 12.5, lineHeight: 17 },
});

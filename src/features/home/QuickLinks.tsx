import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@/ui/Button';

const LINKS = [
  ['nav.pos', '/pos'],
  ['nav.invoices', '/invoices'],
  ['nav.shifts', '/shifts'],
  ['nav.stock', '/stock'],
  ['nav.customers', '/customers'],
  ['nav.collections', '/collections'],
  ['nav.attendance', '/attendance'],
] as const;

/** One tap to each screen. The server still decides what the user may open; a denied screen shows its own message. */
export function QuickLinks() {
  const { t } = useTranslation();
  return (
    <View style={s.row}>
      {LINKS.map(([key, href]) => (
        <Button key={href} label={t(key)} onPress={() => router.push(href as never)} />
      ))}
    </View>
  );
}

const s = StyleSheet.create({ row: { gap: 8, marginBottom: 8 } });

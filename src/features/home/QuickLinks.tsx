import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@/ui/Button';

const LINKS = [
  ['nav.pos', '/pos'],
  ['nav.invoices', '/invoices'],
  ['nav.shifts', '/shifts'],
  ['nav.products', '/products'],
  ['nav.adjustments', '/adjustments'],
  ['nav.transfers', '/transfers'],
  ['nav.batches', '/batches'],
  ['nav.stock', '/stock'],
  ['nav.stockReports', '/stock-reports'],
  ['nav.customers', '/customers'],
  ['nav.collections', '/collections'],
  ['nav.attendance', '/attendance'],
  ['nav.leave', '/leave'],
  ['nav.payslips', '/payslips'],
  ['nav.visits', '/visits'],
  ['nav.advances', '/advances'],
  ['nav.reports', '/reports'],
  ['nav.accounts', '/accounts'],
  ['nav.compliance', '/compliance'],
  ['nav.account', '/account'],
  ['nav.users', '/users'],
  ['nav.roles', '/roles'],
  ['nav.audit', '/audit'],
  ['nav.documents', '/documents'],
  ['nav.settings', '/settings'],
  ['nav.purchase', '/purchase'],
  ['nav.purchaseMoney', '/purchase-money'],
  ['nav.complaints', '/complaints'],
  ['nav.followup', '/collections/follow-up'],
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

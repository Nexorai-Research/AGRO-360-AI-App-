import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { formatINR } from '../../money';
import { colors, radius } from '../../ui/theme';
import { expiryLevel, formatQty, hasQty } from './format';
import type { BatchRow, StockRow } from './types';

/** Expiry is shown as colour AND words, so it is readable without colour. */
export function ExpiryBadge({ days, date }: { days: number | null; date: string | null }) {
  const { t } = useTranslation();
  const level = expiryLevel(days);
  if (level === 'none' || days === null)
    return date ? <Text style={s.muted}>{t('stock.expiresOn', { date })}</Text> : null;
  const text =
    level === 'expired'
      ? t('stock.expiredAgo', { days: Math.abs(days), date })
      : t('stock.expiresIn', { days, date });
  return (
    <View
      style={[s.badge, level === 'expired' ? s.expired : level === 'soon' ? s.soon : s.ok]}
      testID={`expiry-${level}`}
    >
      <Text style={[s.badgeTxt, level === 'expired' ? s.expiredTxt : level === 'soon' ? s.soonTxt : s.okTxt]}>
        {text}
      </Text>
    </View>
  );
}

function Qty({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={s.qty}>
      <Text style={s.qtyLabel}>{label}</Text>
      <Text style={[s.qtyValue, strong && s.qtyStrong]}>{value}</Text>
    </View>
  );
}

export const StockItem = memo(function StockItem({ row }: { row: StockRow }) {
  const { t } = useTranslation();
  return (
    <View
      style={s.card}
      accessible
      accessibilityLabel={`${row.skuName}, ${t('stock.available')} ${formatQty(row.available)}`}
    >
      <Text style={s.name}>{row.skuName}</Text>
      <Text style={s.muted}>
        {row.skuCode} · {row.branchName} / {row.warehouseCode}
        {row.sellable ? '' : ` · ${t('stock.notSellable')}`}
      </Text>
      {row.batchNo ? (
        <View style={s.batchRow}>
          <Text style={s.muted}>
            {t('stock.batch')} {row.batchNo}
          </Text>
          <ExpiryBadge days={row.daysToExpiry} date={row.expiryDate} />
        </View>
      ) : null}
      <View style={s.qtyRow}>
        <Qty label={t('stock.onHand')} value={formatQty(row.onHand)} />
        <Qty label={t('stock.reserved')} value={formatQty(row.reserved)} />
        <Qty label={t('stock.available')} value={formatQty(row.available)} strong />
        {hasQty(row.inTransit) ? <Qty label={t('stock.inTransit')} value={formatQty(row.inTransit)} /> : null}
      </View>
      {row.value !== null ? (
        <Text style={s.muted}>
          {t('stock.value')}: {formatINR(row.value)}
        </Text>
      ) : null}
    </View>
  );
});

export const BatchItem = memo(function BatchItem({ row }: { row: BatchRow }) {
  const { t } = useTranslation();
  return (
    <View style={s.card} accessible accessibilityLabel={`${row.skuName}, ${t('stock.batch')} ${row.batchNo}`}>
      <Text style={s.name}>{row.skuName}</Text>
      <Text style={s.muted}>
        {row.skuCode} · {t('stock.batch')} {row.batchNo} · {row.status}
      </Text>
      <ExpiryBadge days={row.daysToExpiry} date={row.expiryDate} />
      <View style={s.qtyRow}>
        <Qty label={t('stock.onHand')} value={formatQty(row.onHand)} />
        <Qty label={t('stock.available')} value={formatQty(row.available)} strong />
      </View>
      {row.valueAtRisk !== null ? (
        <Text style={s.muted}>
          {t('stock.valueAtRisk')}: {formatINR(row.valueAtRisk)}
        </Text>
      ) : null}
    </View>
  );
});

const s = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
    gap: 6,
    marginBottom: 10,
  },
  name: { fontSize: 16, fontWeight: '600', color: colors.ink },
  muted: { color: colors.muted, fontSize: 13 },
  batchRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  qtyRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 4 },
  qty: { minWidth: 64 },
  qtyLabel: { color: colors.muted, fontSize: 12 },
  qtyValue: { color: colors.ink, fontSize: 16 },
  qtyStrong: { fontWeight: '700', color: colors.ok },
  badge: { alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  badgeTxt: { fontSize: 12, fontWeight: '600' },
  expired: { backgroundColor: '#f8d7d9' },
  expiredTxt: { color: colors.danger },
  soon: { backgroundColor: '#fbe9c8' },
  soonTxt: { color: colors.warn },
  ok: { backgroundColor: colors.brandSoft },
  okTxt: { color: colors.ok },
});

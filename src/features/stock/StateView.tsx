import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Button } from '../../ui/Button';
import { colors, radius } from '../../ui/theme';

export type ViewState = 'loading' | 'empty' | 'error' | 'offline' | 'denied';

export function StateView({
  state,
  message,
  onRetry,
}: {
  state: ViewState;
  message?: string;
  onRetry?: () => void;
}) {
  const { t } = useTranslation();
  const text =
    message ??
    (state === 'loading'
      ? t('common.loading')
      : state === 'offline'
        ? t('stock.offline')
        : state === 'denied'
          ? t('stock.denied')
          : state === 'empty'
            ? t('stock.empty')
            : t('errors.generic', { code: 'UNKNOWN', correlationId: '-' }));
  return (
    <View
      style={s.box}
      accessibilityRole={state === 'error' || state === 'denied' ? 'alert' : undefined}
      testID={`state-${state}`}
    >
      <Text style={s.txt}>{text}</Text>
      {onRetry && state !== 'denied' && state !== 'loading' ? (
        <Button kind="ghost" label={t('common.retry')} onPress={onRetry} />
      ) : null}
    </View>
  );
}

/** A thin line above a list: stale data from the cache, or a failed refresh. Never lets an old number look live. */
export function Banner({ text, tone }: { text: string; tone: 'warn' | 'danger' | 'info' }) {
  return (
    <View
      style={[s.banner, { borderColor: colors[tone] }]}
      accessibilityRole="alert"
      testID={`banner-${tone}`}
    >
      <Text style={[s.bannerTxt, { color: colors[tone] }]}>{text}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  box: { padding: 24, gap: 12, alignItems: 'center' },
  txt: { color: colors.muted, fontSize: 16, textAlign: 'center' },
  banner: {
    borderWidth: 1,
    borderRadius: radius,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 8,
    backgroundColor: colors.card,
  },
  bannerTxt: { fontSize: 14 },
});

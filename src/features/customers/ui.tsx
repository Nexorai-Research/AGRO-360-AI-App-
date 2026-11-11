import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ApiError, errorMessage } from '../../api/errors';
import { Button } from '../../ui/Button';
import { colors, radius } from '../../ui/theme';

/** 403 means "not allowed" (except a request for a fresh password, which is a different message). */
export const isDenied = (e: unknown) =>
  e instanceof ApiError && e.status === 403 && e.code !== 'FRESH_AUTH_REQUIRED';
export const isNetwork = (e: unknown) => e instanceof ApiError && e.code === 'NETWORK';

export function useErrorText() {
  const { t } = useTranslation();
  return (e: unknown) => {
    const m = errorMessage(e);
    return t(m.key, m.params);
  };
}

export function StateView({
  kind,
  error,
  onRetry,
}: {
  kind: 'loading' | 'empty' | 'error' | 'denied';
  error?: unknown;
  onRetry?: () => void;
}) {
  const { t } = useTranslation();
  const text = useErrorText();
  if (kind === 'loading') {
    return (
      <View style={s.box} accessibilityLiveRegion="polite">
        <ActivityIndicator color={colors.brand} />
        <Text style={s.txt}>{t('common.loading')}</Text>
      </View>
    );
  }
  const msg =
    kind === 'empty' ? t('customers.empty') : kind === 'denied' ? t('customers.denied') : text(error);
  return (
    <View style={s.box} accessibilityLiveRegion="polite">
      <Text style={[s.txt, kind === 'error' && s.err]}>{msg}</Text>
      {kind === 'error' && onRetry ? (
        <Button kind="ghost" label={t('common.retry')} onPress={onRetry} />
      ) : null}
    </View>
  );
}

const hhmm = (ms: number) => {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** Shown when a refresh failed but older data is on screen. Never present old numbers as live. */
export function StaleBanner({ error, updatedAt }: { error: unknown; updatedAt: number }) {
  const { t } = useTranslation();
  const text = useErrorText();
  const time = hhmm(updatedAt);
  return (
    <View style={s.banner} accessibilityRole="alert">
      <Text style={s.bannerTxt}>
        {isNetwork(error)
          ? t('customers.offline', { time })
          : `${text(error)} ${t('customers.asOf', { time })}`}
      </Text>
    </View>
  );
}

export const fmtDate = (d: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d.slice(8)}-${d.slice(5, 7)}-${d.slice(0, 4)}` : d;

const s = StyleSheet.create({
  box: { padding: 24, alignItems: 'center', gap: 12 },
  txt: { color: colors.muted, fontSize: 16, textAlign: 'center' },
  err: { color: colors.danger },
  banner: {
    backgroundColor: '#fff4d6',
    borderRadius: radius,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.warn,
  },
  bannerTxt: { color: colors.warn, fontSize: 14 },
});

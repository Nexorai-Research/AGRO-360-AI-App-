import { ScrollView, Text, View } from 'react-native';
import { router, type ErrorBoundaryProps } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { recordError } from '@/errors/global';
import { useEffect } from 'react';
import { Button } from './Button';
import { kit } from './kit';

// Found while testing the running app (20 November 2026): a screen that got an answer it did not expect (a missing field) threw while
// drawing, and with nothing to catch it the whole app went down and had to be started again. Expo Router wraps every screen of the
// Stack with this (`unstable_screenErrorBoundary` in app/_layout.tsx): only that screen shows "could not be shown", the person can
// try again or go back, and the menu keeps working. The message is the program's own, cut short; no personal data is in it.

export function ScreenErrorFallback({ error, retry }: ErrorBoundaryProps) {
  const { t } = useTranslation();
  useEffect(() => {
    recordError(error, 'script');
  }, [error]);
  return (
    <ScrollView contentContainerStyle={kit.page} accessibilityRole="alert">
      <Text style={kit.title}>{t('wp24.title')}</Text>
      <Text style={kit.sub}>{t('wp24.hint')}</Text>
      <View style={{ gap: 8 }}>
        <Button label={t('wp24.retry')} onPress={() => void retry()} />
        <Button
          kind="ghost"
          label={t('wp24.back')}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        />
      </View>
      <Text style={kit.sub} selectable>
        {t('wp24.detail', { message: String(error?.message ?? error).slice(0, 200) })}
      </Text>
    </ScrollView>
  );
}

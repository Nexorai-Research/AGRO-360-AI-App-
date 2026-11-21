import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClientProvider } from '@tanstack/react-query';
import { makeQueryClient } from '@/api/queryClient';
import { AuthProvider, useAuth } from '@/auth/AuthProvider';
import { initI18n } from '@/i18n';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomNav } from '@/ui/BottomNav';
import { colors } from '@/ui/theme';
import { useTelemetry } from '@/telemetry/useTelemetry';
import { useOfflineSync } from '@/features/offline/useOfflineSync';
import { ScreenErrorFallback } from '@/ui/ScreenErrorBoundary';
import { installGlobalErrorHandling } from '@/errors/global';

const queryClient = makeQueryClient();
void initI18n(); // picks the saved language, else the phone language, else English
installGlobalErrorHandling(); // errors nothing else caught are recorded for support (src/errors/global.ts)

function Gate() {
  const { status } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  useOfflineSync(); // bills saved without network are sent when it is back (web parity 14)
  useTelemetry(); // usage reporting for the observability screens (web parity 13); off for platform operators and when switched off
  // The phone draws under the status bar (edge to edge). Home and login paint their own header there; every other screen starts below it.
  const atHome = (segments as string[]).length === 0;
  const topGap = atHome || segments[0] === 'login' ? 0 : insets.top;
  const onLogin = segments[0] === 'login';
  // Until the saved session is checked (and the redirect has happened) show a plain background, never a flash of the wrong screen.
  const covering =
    status === 'loading' || (status === 'signedOut' && !onLogin) || (status === 'signedIn' && onLogin);
  useEffect(() => {
    if (status === 'loading') return;
    if (status === 'signedOut' && !onLogin) router.replace('/login');
    if (status === 'signedIn' && onLogin) router.replace('/');
  }, [status, segments, router, onLogin]);
  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1, paddingTop: topGap }}>
        {/* each screen has its own error boundary: one that breaks while drawing shows "could not be shown", the app keeps working */}
        <Stack screenOptions={{ headerShown: false }} unstable_screenErrorBoundary={ScreenErrorFallback} />
      </View>
      {covering ? (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg }]} />
      ) : null}
      {status === 'signedIn' && !onLogin && !covering ? <BottomNav /> : null}
    </View>
  );
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <StatusBar style="dark" />
        <Gate />
      </AuthProvider>
    </QueryClientProvider>
  );
}

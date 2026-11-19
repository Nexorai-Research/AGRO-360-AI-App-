import { useEffect, useRef } from 'react';
import { usePathname } from 'expo-router';
import { useAuth } from '@/auth/AuthProvider';
import { isPlatformUser } from '@/features/platform/roles';
import { startTelemetry, stopTelemetry, telemetryOff, telemetryOn, trackScreen } from './telemetry';

/** Like the web: reporting runs for a signed-in franchise user (not a platform operator) who has not switched it off. */
export function useTelemetry() {
  const { status, me, client } = useAuth();
  const pathname = usePathname();
  const platform = isPlatformUser(me?.roles);
  useEffect(() => {
    if (status !== 'signedIn' || !client || platform) {
      stopTelemetry();
      return;
    }
    let live = true;
    void telemetryOff().then((off) => {
      if (live && !off) startTelemetry(client);
    });
    return () => {
      live = false;
    };
  }, [status, client, platform]);

  // Each screen: from the moment the path changes until its first frame has been drawn (two animation frames later).
  const opened = useRef(0);
  useEffect(() => {
    if (status !== 'signedIn' || pathname === '/login') return;
    opened.current = Date.now();
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        if (telemetryOn()) trackScreen(pathname, Date.now() - opened.current);
      });
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [pathname, status]);
}

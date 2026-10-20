import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

// Native phone notifications (banner / lock screen / notification shade) —
// replaces the old in-app bell icon. Show them even while the app is open.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

let permissionAsked = false;

export async function ensureNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'KiwiFix',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (permissionAsked || !current.canAskAgain) return false;
  permissionAsked = true;
  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted;
}

export async function notifyNow(title: string, body: string, data?: Record<string, unknown>) {
  if (!(await ensureNotificationPermission())) return;
  await Notifications.scheduleNotificationAsync({
    content: { title, body, data },
    trigger: null,
  });
}

// Fires a native notification whenever a count goes UP between polls. The
// first value seen is only remembered (so opening the app with 3 existing
// unread items doesn't buzz 3 times). Lives in whichever screen already
// polls the number.
export function useNotifyOnIncrease(count: number | undefined, title: string, bodyFor: (n: number) => string) {
  const prev = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (count === undefined) return;
    if (prev.current !== undefined && count > prev.current) {
      notifyNow(title, bodyFor(count - prev.current));
    }
    prev.current = count;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count]);
}

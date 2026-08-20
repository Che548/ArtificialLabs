import { useMutation } from 'convex/react';
import { useRouter } from 'expo-router';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { Linking, Platform } from 'react-native';

import { api } from '../convex/_generated/api';
import { useHealthStore } from './health-store';
import {
  addNotificationResponseListener,
  clearHealthNotifications,
  getExpoPushToken,
  reconcileHealthNotifications,
  requestNotificationPermission,
  scheduleTestNotification,
} from './notifications';
import type { NotificationTone } from '../shared/notification-copy';

type EnableResult = 'enabled' | 'local-only' | 'denied' | 'disabled';
type NotificationManagerValue = {
  busy: boolean;
  message?: string;
  setEnabled: (enabled: boolean) => Promise<EnableResult>;
  sendTest: (tone: NotificationTone) => Promise<boolean>;
  openSystemSettings: () => Promise<void>;
};

const NotificationManagerContext =
  createContext<NotificationManagerValue | null>(null);

export function NotificationManagerProvider({
  children,
}: {
  children: ReactNode;
}) {
  const router = useRouter();
  const {
    preferences,
    profile,
    readOnly,
    reminders,
    savePreferences,
    viewerEmail,
  } = useHealthStore();
  const registerToken = useMutation(api.notifications.registerToken);
  const setRemoteEnabled = useMutation(api.notifications.setEnabled);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const stored = preferences.find((item) => !item.deletedAt);
  const tone = stored?.notificationTone ?? 'formal';

  useEffect(() => {
    const subscription = addNotificationResponseListener((url) => {
      router.push(url as never);
    });
    return () => subscription.remove();
  }, [router]);

  useEffect(() => {
    if (Platform.OS === 'web' || !stored) return;
    void reconcileHealthNotifications({
      enabled: stored.notificationsEnabled,
      journalEnabled: stored.journalNotifications,
      profile,
      reminders,
      resultsEnabled: stored.resultNotifications,
      tone,
    }).catch(() => {
      // Scheduling is local best-effort. The saved preference remains the source
      // of truth and the next launch retries without dropping health data.
    });
  }, [profile, reminders, stored, tone]);

  useEffect(() => {
    if (
      Platform.OS === 'web' ||
      !stored?.notificationsEnabled ||
      !viewerEmail ||
      readOnly
    )
      return;
    void (async () => {
      const pushToken = await getExpoPushToken().catch(() => null);
      if (!pushToken) return;
      await registerToken({ pushToken });
      await setRemoteEnabled({ enabled: true });
    })().catch(() => {
      // Offline/server failures are retried on the next authenticated launch.
    });
  }, [
    readOnly,
    registerToken,
    setRemoteEnabled,
    stored?.notificationsEnabled,
    viewerEmail,
  ]);

  const setEnabled = useCallback(
    async (enabled: boolean): Promise<EnableResult> => {
      setBusy(true);
      setMessage(undefined);
      try {
        if (!enabled) {
          await savePreferences({ notificationsEnabled: false });
          await clearHealthNotifications();
          if (viewerEmail && !readOnly) {
            void setRemoteEnabled({ enabled: false }).catch(() => undefined);
          }
          setMessage('Уведомления выключены. Локальные данные не изменены.');
          return 'disabled';
        }

        if (!(await requestNotificationPermission())) {
          await savePreferences({ notificationsEnabled: false });
          setMessage(
            'Системное разрешение не выдано. Его можно включить в настройках устройства.',
          );
          return 'denied';
        }

        await savePreferences({ notificationsEnabled: true });
        const pushToken = await getExpoPushToken().catch(() => null);
        if (!pushToken) {
          setMessage(
            'Локальные уведомления включены. Удалённые push станут доступны после настройки EAS.',
          );
          return 'local-only';
        }

        try {
          await registerToken({ pushToken });
          await setRemoteEnabled({ enabled: true });
          setMessage('Локальные и удалённые уведомления включены.');
          return 'enabled';
        } catch {
          setMessage(
            'Локальные уведомления включены. Сервер недоступен — push зарегистрируется при следующем запуске.',
          );
          return 'local-only';
        }
      } finally {
        setBusy(false);
      }
    },
    [readOnly, registerToken, savePreferences, setRemoteEnabled, viewerEmail],
  );

  const sendTest = useCallback(async (selectedTone: NotificationTone) => {
    setBusy(true);
    try {
      const ok = await scheduleTestNotification(selectedTone);
      setMessage(
        ok
          ? 'Тестовое уведомление появится через пару секунд.'
          : 'Не удалось показать уведомление. Проверьте системное разрешение.',
      );
      return ok;
    } catch {
      setMessage('Не удалось запланировать уведомление. Попробуйте ещё раз.');
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  const value = useMemo<NotificationManagerValue>(
    () => ({
      busy,
      message,
      setEnabled,
      sendTest,
      openSystemSettings: () => Linking.openSettings(),
    }),
    [busy, message, sendTest, setEnabled],
  );

  return (
    <NotificationManagerContext.Provider value={value}>
      {children}
    </NotificationManagerContext.Provider>
  );
}

export function useNotificationManager() {
  const value = useContext(NotificationManagerContext);
  if (!value)
    throw new Error(
      'useNotificationManager must be used within NotificationManagerProvider',
    );
  return value;
}

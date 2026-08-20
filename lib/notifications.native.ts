import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { LocalProfile, Reminder } from './health-types';
import { planHealthNotifications } from './notification-schedule';
import {
  getNotificationCopy,
  type NotificationTone,
} from '../shared/notification-copy';

const CHANNEL_ID = 'health-reminders';
const OWNER = 'artificiallabs';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Напоминания о здоровье',
    description: 'Цикл, дневник, анализы и системные уведомления',
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 200],
    lightColor: '#EA4087',
  });
}

export async function requestNotificationPermission() {
  await ensureAndroidChannel();
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

export async function notificationPermissionGranted() {
  return (await Notifications.getPermissionsAsync()).granted;
}

export async function clearHealthNotifications() {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((notification) => notification.content.data?.owner === OWNER)
      .map((notification) =>
        Notifications.cancelScheduledNotificationAsync(notification.identifier),
      ),
  );
}

export async function reconcileHealthNotifications({
  enabled,
  journalEnabled,
  profile,
  reminders,
  resultsEnabled,
  tone,
}: {
  enabled: boolean;
  journalEnabled: boolean;
  profile: LocalProfile | null;
  reminders: Reminder[];
  resultsEnabled: boolean;
  tone: NotificationTone;
}) {
  await clearHealthNotifications();
  if (!enabled || !(await notificationPermissionGranted())) return 0;
  await ensureAndroidChannel();

  const planned = planHealthNotifications({
    profile,
    reminders,
    tone,
    journalEnabled,
    resultsEnabled,
  });
  await Promise.all(
    planned.map((notification) =>
      Notifications.scheduleNotificationAsync({
        content: {
          title: notification.title,
          body: notification.body,
          data: {
            owner: OWNER,
            eventKey: notification.eventKey,
            url: notification.route,
            sourceId: notification.sourceId,
          },
          sound: 'default',
        },
        trigger:
          notification.sourceId === 'journal-daily'
            ? {
                type: Notifications.SchedulableTriggerInputTypes.DAILY,
                hour: 20,
                minute: 0,
                channelId: Platform.OS === 'android' ? CHANNEL_ID : undefined,
              }
            : {
                type: Notifications.SchedulableTriggerInputTypes.DATE,
                date: notification.at,
                channelId: Platform.OS === 'android' ? CHANNEL_ID : undefined,
              },
      }),
    ),
  );
  return planned.length;
}

export async function scheduleTestNotification(tone: NotificationTone) {
  if (!(await requestNotificationPermission())) return false;
  const copy = getNotificationCopy('journalDaily', tone);
  await Notifications.scheduleNotificationAsync({
    content: {
      title: copy.title,
      body: copy.body,
      data: { owner: OWNER, eventKey: 'journalDaily', url: copy.route },
      sound: 'default',
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 2,
      channelId: Platform.OS === 'android' ? CHANNEL_ID : undefined,
    },
  });
  return true;
}

export async function getExpoPushToken(): Promise<string | null> {
  if (!Device.isDevice || !(await notificationPermissionGranted())) return null;
  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;
  if (!projectId) return null;
  return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
}

export function addNotificationResponseListener(
  listener: (url: string) => void,
) {
  return Notifications.addNotificationResponseReceivedListener((response) => {
    const url = response.notification.request.content.data?.url;
    if (typeof url === 'string' && url.startsWith('/')) listener(url);
  });
}

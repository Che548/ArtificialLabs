import type { LocalProfile, Reminder } from './health-types';
import type { NotificationTone } from '../shared/notification-copy';

export async function requestNotificationPermission() {
  return false;
}
export async function notificationPermissionGranted() {
  return false;
}
export async function clearHealthNotifications() {}
export async function scheduleTestNotification(_tone: NotificationTone) {
  return false;
}
export async function scheduleAgentPlanUpdateNotification() {
  return false;
}
export async function getExpoPushToken() {
  return null;
}
export async function reconcileHealthNotifications(_input: {
  agentEnabled: boolean;
  enabled: boolean;
  journalEnabled: boolean;
  profile: LocalProfile | null;
  reminders: Reminder[];
  resultsEnabled: boolean;
  tone: NotificationTone;
}) {
  return 0;
}
export function addNotificationResponseListener(
  _listener: (url: string) => void,
) {
  return { remove() {} };
}

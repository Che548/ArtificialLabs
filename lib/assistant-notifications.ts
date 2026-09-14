import type { Reminder } from './health-types';

/** Only reminders that have arrived belong in the notification inbox. */
export function assistantInboxReminders(reminders: Reminder[], now: number) {
  return reminders
    .filter((reminder) => !reminder.deletedAt && reminder.dueAt <= now)
    .sort((left, right) => right.dueAt - left.dueAt)
    .slice(0, 100);
}

export function assistantReminderRoute(reminder: Reminder) {
  if (reminder.type === 'journal') return '/scan' as const;
  if (reminder.type === 'system') return '/profile' as const;
  return '/analyses' as const;
}

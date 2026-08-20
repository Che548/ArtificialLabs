import type { LocalProfile, Reminder } from './health-types';
import {
  getNotificationCopy,
  type NotificationEventKey,
  type NotificationTone,
} from '../shared/notification-copy';

export type PlannedNotification = ReturnType<typeof getNotificationCopy> & {
  eventKey: NotificationEventKey;
  at: Date;
  sourceId: string;
};

const DAY = 86_400_000;

function atHour(timestamp: number, hour = 9) {
  const date = new Date(timestamp);
  date.setHours(hour, 0, 0, 0);
  return date;
}

export function planHealthNotifications({
  now = new Date(),
  profile,
  reminders,
  tone,
  journalEnabled,
  resultsEnabled,
}: {
  now?: Date;
  profile: LocalProfile | null;
  reminders: Reminder[];
  tone: NotificationTone;
  journalEnabled: boolean;
  resultsEnabled: boolean;
}): PlannedNotification[] {
  const planned: PlannedNotification[] = [];
  const add = (eventKey: NotificationEventKey, at: Date, sourceId: string) => {
    if (at.getTime() <= now.getTime()) return;
    planned.push({
      eventKey,
      at,
      sourceId,
      ...getNotificationCopy(eventKey, tone),
    });
  };

  if (profile?.lastPeriodStartAt && profile.cycleLengthDays) {
    let nextPeriod = profile.lastPeriodStartAt + profile.cycleLengthDays * DAY;
    while (nextPeriod <= now.getTime())
      nextPeriod += profile.cycleLengthDays * DAY;
    add('periodSoon', atHour(nextPeriod - 3 * DAY), 'cycle-period-soon');
    add('periodTomorrow', atHour(nextPeriod - DAY), 'cycle-period-tomorrow');
    add('periodToday', atHour(nextPeriod), 'cycle-period-today');

    const ovulation = nextPeriod - 14 * DAY;
    add('fertileWindowStarted', atHour(ovulation - 5 * DAY), 'fertility-start');
    add(
      'conceptionProbabilityIncreased',
      atHour(ovulation - 3 * DAY),
      'fertility-increased',
    );
    add('ovulationTestDue', atHour(ovulation - DAY), 'fertility-test');
    add('ovulationExpected', atHour(ovulation), 'fertility-ovulation');
    add('fertileWindowEnded', atHour(ovulation + DAY), 'fertility-end');
  }

  if (resultsEnabled) {
    for (const reminder of reminders) {
      if (reminder.deletedAt || reminder.readAt) continue;
      const eventKey: NotificationEventKey =
        reminder.type === 'result' ? 'resultExpiring' : 'analysisApproaching';
      add(eventKey, new Date(reminder.dueAt), `reminder-${reminder.localId}`);
    }
  }

  // The recurring journal reminder is scheduled by the native adapter.
  if (journalEnabled) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(20, 0, 0, 0);
    add('journalDaily', tomorrow, 'journal-daily');
  }

  return planned.sort((a, b) => a.at.getTime() - b.at.getTime()).slice(0, 48);
}

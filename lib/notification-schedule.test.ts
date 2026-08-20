import assert from 'node:assert/strict';
import test from 'node:test';

import { planHealthNotifications } from './notification-schedule';
import {
  NOTIFICATION_COPY,
  getNotificationCopy,
} from '../shared/notification-copy';

test('catalog contains all 40 approved events in both tones', () => {
  assert.equal(Object.keys(NOTIFICATION_COPY).length, 40);
  for (const key of Object.keys(NOTIFICATION_COPY) as Array<
    keyof typeof NOTIFICATION_COPY
  >) {
    const formal = getNotificationCopy(key, 'formal');
    const cute = getNotificationCopy(key, 'cute');
    assert.ok(formal.title.length > 0);
    assert.ok(formal.body.length > 0);
    assert.ok(cute.title.length > 0);
    assert.ok(cute.body.length > 0);
    assert.notEqual(formal.body, cute.body);
  }
});

test('cycle plan is future-only, ordered, and uses selected tone', () => {
  const now = new Date('2026-08-05T08:00:00+03:00');
  const plan = planHealthNotifications({
    now,
    profile: {
      displayName: 'E2E',
      goal: 'planning',
      onboardingCompleted: true,
      lastPeriodStartAt: new Date('2026-08-01T09:00:00+03:00').getTime(),
      cycleLengthDays: 28,
      updatedAt: now.getTime(),
    },
    reminders: [],
    tone: 'cute',
    journalEnabled: false,
    resultsEnabled: false,
  });
  assert.ok(plan.some((item) => item.eventKey === 'periodToday'));
  assert.ok(plan.some((item) => item.eventKey === 'fertileWindowStarted'));
  assert.ok(plan.every((item) => item.at.getTime() > now.getTime()));
  assert.ok(
    plan.every(
      (item) => item.body === NOTIFICATION_COPY[item.eventKey].body.cute,
    ),
  );
  assert.deepEqual(
    plan,
    [...plan].sort((a, b) => a.at.getTime() - b.at.getTime()),
  );
});

test('result reminders respect category opt-out and skip deleted/read rows', () => {
  const now = new Date('2026-08-20T08:00:00+03:00');
  const reminders = [
    {
      localId: 'future',
      type: 'result' as const,
      title: 'Result',
      body: 'Body',
      dueAt: now.getTime() + 10_000,
      updatedAt: now.getTime(),
    },
    {
      localId: 'read',
      type: 'checkup' as const,
      title: 'Read',
      body: 'Body',
      dueAt: now.getTime() + 20_000,
      readAt: now.getTime(),
      updatedAt: now.getTime(),
    },
  ];
  assert.equal(
    planHealthNotifications({
      now,
      profile: null,
      reminders,
      tone: 'formal',
      journalEnabled: false,
      resultsEnabled: false,
    }).length,
    0,
  );
  const enabled = planHealthNotifications({
    now,
    profile: null,
    reminders,
    tone: 'formal',
    journalEnabled: false,
    resultsEnabled: true,
  });
  assert.deepEqual(
    enabled.map((item) => item.sourceId),
    ['reminder-future'],
  );
});

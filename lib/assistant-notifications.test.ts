import assert from 'node:assert/strict';
import test from 'node:test';
import { assistantInboxReminders, assistantReminderRoute } from './assistant-notifications';
import type { Reminder } from './health-types';

function reminder(localId: string, dueAt: number, fields: Partial<Reminder> = {}): Reminder {
  return { localId, dueAt, title: 'Synthetic reminder', body: 'Synthetic body', type: 'checkup', updatedAt: 1, ...fields };
}

test('inbox shows arrived reminders, retains read history, and excludes future/deleted items', () => {
  const input = [reminder('future', 101), reminder('old', 10), reminder('read', 90, { readAt: 95 }), reminder('deleted', 80, { deletedAt: 99 }), reminder('now', 100)];
  const inbox = assistantInboxReminders(input, 100);
  assert.deepEqual(inbox.map(item => item.localId), ['now', 'read', 'old']);
  assert.deepEqual(inbox.filter(item => !item.readAt).map(item => item.localId), ['now', 'old']);
  assert.equal(input[0].localId, 'future');
  assert.equal(assistantInboxReminders(input, 101)[0].localId, 'future');
});

test('notification inbox stays bounded and links each kind to its existing screen', () => {
  assert.equal(assistantInboxReminders(Array.from({ length: 150 }, (_, n) => reminder(String(n), n)), 200).length, 100);
  for (const [type, route] of [['journal', '/scan'], ['result', '/analyses'], ['checkup', '/analyses'], ['system', '/profile']] as const) {
    assert.equal(assistantReminderRoute(reminder(type, 1, { type })), route);
  }
});

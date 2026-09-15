import assert from 'node:assert/strict';
import test from 'node:test';
import { assistantFeedAtEnd, assistantMessagesChronologically, assistantReadCandidates } from './assistant-feed-position';
import type { Reminder } from './health-types';
const reminder = (localId: string, dueAt: number, extra: Partial<Reminder> = {}): Reminder => ({
  localId, dueAt, title: 'Test', body: 'Test', type: 'system', updatedAt: 1, ...extra,
});
test('latest delivered message is at the bottom without mutating the inbox', () => {
  const rows = [reminder('new', 30), reminder('old', 10), reminder('middle', 20)];
  assert.deepEqual(assistantMessagesChronologically(rows).map(item => item.localId), ['old', 'middle', 'new']);
  assert.equal(rows[0].localId, 'new');
});
test('end detection waits for layout and handles short feeds', () => {
  assert.equal(assistantFeedAtEnd(0, 0, 0), false);
  assert.equal(assistantFeedAtEnd(0, 700, 300), true);
  assert.equal(assistantFeedAtEnd(1000, 700, 1700), true);
  assert.equal(assistantFeedAtEnd(800, 700, 1700), false);
});
test('read-through only covers the delivered snapshot and preserves future/deleted/read reminders', () => {
  const rows = [reminder('old', 10), reminder('new', 20), reminder('future', 101), reminder('read', 5, { readAt: 6 }), reminder('deleted', 5, { deletedAt: 7 })];
  const ids = new Set(['old', 'future', 'read', 'deleted']);
  assert.deepEqual(assistantReadCandidates(rows, ids, 100).map(item => item.localId), ['old']);
});

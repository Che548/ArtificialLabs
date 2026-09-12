import assert from 'node:assert/strict';
import test from 'node:test';
import { toggleCalendarPeriodDays } from './calendar-period-selection';
import { cycleDateKey } from './cycle-insights';
const keys = (...dates: Date[]) => dates.map(cycleDateKey);

test('selecting today includes the following four days', () => {
  const today = new Date();
  const expected = Array.from(
    { length: 5 },
    (_, offset) =>
      new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset),
  );
  assert.deepEqual(
    [...toggleCalendarPeriodDays(new Set(), today)],
    keys(...expected),
  );
});
test('range crosses month and year boundaries', () => {
  assert.deepEqual(
    [...toggleCalendarPeriodDays(new Set(), new Date(2026, 11, 30))],
    keys(
      new Date(2026, 11, 30),
      new Date(2026, 11, 31),
      new Date(2027, 0, 1),
      new Date(2027, 0, 2),
      new Date(2027, 0, 3),
    ),
  );
});
test('range includes leap day', () => {
  assert.equal(
    toggleCalendarPeriodDays(new Set(), new Date(2028, 1, 27)).has(
      cycleDateKey(new Date(2028, 1, 29)),
    ),
    true,
  );
});
test('individual days can be removed without changing the other four or the original set', () => {
  const original = toggleCalendarPeriodDays(new Set(), new Date(2026, 8, 12));
  const next = toggleCalendarPeriodDays(original, new Date(2026, 8, 14));
  assert.equal(original.size, 5);
  assert.equal(next.size, 4);
  assert.equal(next.has(cycleDateKey(new Date(2026, 8, 14))), false);
});
test('adding another range preserves existing dates and merges overlaps', () => {
  const original = toggleCalendarPeriodDays(new Set(), new Date(2026, 8, 12));
  const next = toggleCalendarPeriodDays(original, new Date(2026, 8, 10));
  assert.equal(next.size, 7);
  for (const key of original) assert.equal(next.has(key), true);
});

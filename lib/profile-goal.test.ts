import assert from 'node:assert/strict';
import { test } from 'node:test';
import { profileGoalPatch } from './profile-goal';

const now = new Date(2026, 8, 11).getTime();
const date = now - 86400000;

test('pregnancy requires an explicit valid date and ignores cycle fields', () => {
  for (const missing of [undefined, NaN, Infinity, now + 1]) {
    assert.equal(
      profileGoalPatch('pregnancy', '28', date, missing, now),
      undefined,
    );
  }
  assert.deepEqual(profileGoalPatch('pregnancy', '', undefined, date, now), {
    goal: 'pregnancy',
    pregnancyStartAt: date,
  });
});

for (const goal of ['cycle', 'planning'] as const) {
  test(`${goal} requires both menstrual date and integer cycle length`, () => {
    for (const length of ['', '19', '46', '28.5', 'abc']) {
      assert.equal(
        profileGoalPatch(goal, length, date, undefined, now),
        undefined,
      );
    }
    for (const missing of [undefined, NaN, Infinity, now + 1]) {
      assert.equal(profileGoalPatch(goal, '28', missing, date, now), undefined);
    }
    for (const length of ['20', '28', '45']) {
      assert.deepEqual(profileGoalPatch(goal, length, date, undefined, now), {
        goal,
        lastPeriodStartAt: date,
        cycleLengthDays: Number(length),
      });
    }
  });
}

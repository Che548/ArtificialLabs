import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CARE_PLAN_LIMITS,
  withinCarePlanLimits,
  withinCarePlanGrowthLimits,
} from './care-plan-policy';

test('new plans allow fewer recommendations, never require filler', () => {
  assert.deepEqual(CARE_PLAN_LIMITS, { current: 3, upcoming: 5 });
  for (const [current, upcoming] of [
    [0, 0],
    [0, 5],
    [1, 0],
    [3, 5],
  ])
    assert.equal(withinCarePlanLimits(current, upcoming), true);
  for (const [current, upcoming] of [
    [4, 5],
    [3, 6],
    [-1, 0],
    [1.5, 2],
    [NaN, 0],
  ])
    assert.equal(withinCarePlanLimits(current, upcoming), false);
});
test('grandfathers accepted plans without allowing further excess', () => {
  const previous = { current: 5, upcoming: 10 };
  assert.equal(withinCarePlanGrowthLimits(5, 10, previous), true);
  assert.equal(withinCarePlanGrowthLimits(4, 9, previous), true);
  assert.equal(withinCarePlanGrowthLimits(6, 10, previous), false);
  assert.equal(withinCarePlanGrowthLimits(5, 11, previous), false);
  assert.equal(
    withinCarePlanGrowthLimits(4, 5, { current: 0, upcoming: 0 }),
    false,
  );
});

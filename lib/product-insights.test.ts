import assert from 'node:assert/strict';
import test from 'node:test';

import { calculateCompletionScore } from './product-insights';

test('analysis score follows completed current plans', () => {
  assert.equal(calculateCompletionScore([], new Set()), 0);
  assert.equal(calculateCompletionScore(['a', 'b'], new Set()), 0);
  assert.equal(calculateCompletionScore(['a', 'b'], new Set(['a'])), 50);
  assert.equal(
    calculateCompletionScore(['a', 'b', 'c'], new Set(['a', 'c'])),
    67,
  );
  assert.equal(calculateCompletionScore(['a'], new Set(['future'])), 0);
});

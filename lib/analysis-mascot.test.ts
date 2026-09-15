import assert from 'node:assert/strict';
import test from 'node:test';
import { analysisMascotMood } from './analysis-mascot';

test('mascot changes at the displayed care score boundaries', () => {
  for (const score of [0, 1, 14, 15]) assert.equal(analysisMascotMood(score), 'sad');
  for (const score of [15.1, 16, 59, 60]) assert.equal(analysisMascotMood(score), 'neutral');
  for (const score of [60.1, 61, 99, 100]) assert.equal(analysisMascotMood(score), 'happy');
});

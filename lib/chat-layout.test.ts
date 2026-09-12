import assert from 'node:assert/strict';
import test from 'node:test';
import { chatComposerInset, chatEmptyHeroFits } from './chat-layout';

test('closed-keyboard inset clears floating tabs without double-compensating an open keyboard', () => {
  assert.equal(chatComposerInset('ios', 0, false), 84);
  assert.equal(chatComposerInset('ios', 34, false), 106);
  assert.equal(chatComposerInset('android', 24, false), 96);
  for (const platform of ['ios', 'android', 'web']) assert.equal(chatComposerInset(platform, 34, true), 8);
});

test('decorative chat hero cannot overlap the measured dock on short screens', () => {
  assert.equal(chatEmptyHeroFits(667, 20, 84, 300, false), false);
  assert.equal(chatEmptyHeroFits(701, 24, 96, 300, false), false);
  assert.equal(chatEmptyHeroFits(874, 62, 106, 200, false), true);
  assert.equal(chatEmptyHeroFits(874, 62, 106, 360, false), true);
  assert.equal(chatEmptyHeroFits(1200, 24, 8, 150, true), false);
  assert.equal(chatEmptyHeroFits(1200, 24, 96, 150, false, true), false);
  assert.equal(chatEmptyHeroFits(874, 62, 106, 200, false, true), false);
});

 test('consent panel leaves room for the compact greeting on iPhone', () => {
  assert.equal(chatEmptyHeroFits(852, 59, 106, 320, false), true);
  assert.equal(chatEmptyHeroFits(852, 59, 106, 320, true), false);
});

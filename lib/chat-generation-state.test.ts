import assert from 'node:assert/strict';
import test from 'node:test';

import {
  chatGenerationErrorText,
  transitionChatGeneration,
} from './chat-generation-state';

test('chat generation transitions through thinking, complete, error, and retry', () => {
  assert.equal(transitionChatGeneration('idle', 'start'), 'thinking');
  assert.equal(transitionChatGeneration('thinking', 'succeed'), 'complete');
  assert.equal(transitionChatGeneration('complete', 'start'), 'thinking');
  assert.equal(transitionChatGeneration('thinking', 'fail'), 'error');
  assert.equal(transitionChatGeneration('error', 'start'), 'thinking');
});

test('rate-limit errors expose a safe rounded retry delay', () => {
  assert.match(chatGenerationErrorText('RATE_LIMITED', 1_001), /2 сек/);
  assert.doesNotMatch(
    chatGenerationErrorText('PROVIDER_UNAVAILABLE'),
    /provider|yandex|api/i,
  );
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

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

test('disabled chat explains how to enable it in settings', () => {
  assert.match(chatGenerationErrorText('USER_DISABLED'), /Разрешения и данные/);
});

test('explicit outside tap dismisses the native keyboard even when cached focus is false', () => {
  const source = readFileSync(new URL('../app/chat.tsx', import.meta.url), 'utf8');
  const body = /const dismissComposer = \(\) => \{([\s\S]*?)\n  \};/.exec(source)?.[1];
  assert.ok(body, 'The real screen dismissal handler must be covered');
  const invoke = new Function('Keyboard', 'setComposerFocused', 'composerFocused', body);
  for (const cachedFocus of [false, true]) {
    const calls: unknown[] = [];
    invoke({ dismiss: () => calls.push('dismiss') }, (value: boolean) => calls.push(value), cachedFocus);
    assert.deepEqual(calls, ['dismiss', false]);
  }
});

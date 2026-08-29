import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyServiceIssue, retryDelayMs } from './service-errors';

test('offline state takes precedence over an opaque transport error', () => {
  assert.deepEqual(classifyServiceIssue(new Error('unknown'), true), {
    kind: 'offline',
    message: 'Нет подключения к интернету. Изменения сохранены на устройстве.',
    retryable: true,
  });
});

test('server transport failures are retryable without exposing internals', () => {
  for (const error of [
    new Error('WebSocket connection closed'),
    new Error('Client disconnected'),
    new Error('Connection reset without closing handshake'),
    new Error('Client is not connected'),
  ]) {
    const issue = classifyServiceIssue(error);
    assert.equal(issue.kind, 'server');
    assert.equal(issue.retryable, true);
    assert.doesNotMatch(issue.message, /WebSocket|disconnected|handshake/);
  }
});

test('authentication and validation failures are not retried', () => {
  assert.equal(
    classifyServiceIssue(new Error('Unauthenticated')).retryable,
    false,
  );
  assert.equal(
    classifyServiceIssue(new Error('Invalid field kind')).retryable,
    false,
  );
});

test('retry backoff is bounded', () => {
  assert.equal(retryDelayMs(0), 5_000);
  assert.equal(retryDelayMs(3), 60_000);
  assert.equal(retryDelayMs(99), 120_000);
});

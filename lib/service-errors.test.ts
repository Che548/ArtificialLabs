import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyServiceIssue, retryDelayMs } from './service-errors';
import { updateRequired, readUpdateRequired } from '../shared/client-compatibility';

test('explicit update requirement wins over offline and strips untrusted metadata', () => {
  const payload = { ...updateRequired('profileSync', 1), token: 'secret-marker', message: 'private-marker' };
  const issue = classifyServiceIssue({ data: payload }, true);
  assert.equal(issue.kind, 'update-required');
  assert.equal(issue.retryable, false);
  assert.deepEqual(issue.update, updateRequired('profileSync', 1));
  assert.doesNotMatch(JSON.stringify(issue), /secret-marker|private-marker|сохранены/);
  assert.equal(classifyServiceIssue(new Error('CLIENT_UPDATE_REQUIRED'), true).kind, 'update-required');
  assert.equal(readUpdateRequired({ data: { ...payload, feature: 'arbitrary-secret' } }), undefined);
  const circular: { cause?: unknown } = {};
  circular.cause = circular;
  assert.equal(readUpdateRequired(circular), undefined);
});

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

test('sync conflicts, revoked consent and bad clocks stay local and never retry automatically', () => {
  for (const code of ['PROFILE_SYNC_CONFLICT', 'RECORD_SYNC_CONFLICT', 'RECORD_DELETED_REMOTELY', 'CLOUD_SYNC_CONSENT_REVOKED', 'SYNC_CLOCK_INVALID']) {
    const issue = classifyServiceIssue(new Error(`${code} private-payload-marker`));
    assert.equal(issue.retryable, false);
    assert.doesNotMatch(issue.message, /private-payload-marker|PROFILE_SYNC|RECORD_SYNC/);
  }
});


test('account deletion explains the administrator restriction', () => {
  const issue = classifyServiceIssue(new Error('REVOKE_ADMIN_BEFORE_ACCOUNT_DELETION'));
  assert.equal(issue.retryable, false);
  assert.match(issue.message, /права администратора/);
  assert.doesNotMatch(issue.message, /REVOKE_ADMIN/);
});

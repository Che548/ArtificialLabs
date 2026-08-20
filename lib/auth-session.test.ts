import assert from 'node:assert/strict';
import test from 'node:test';

import { userIdFromAuthToken } from './auth-session';

function tokenWithPayload(payload: unknown) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `header.${encoded}.signature`;
}

test('reads the Convex user id without retaining the session id', () => {
  assert.equal(
    userIdFromAuthToken(
      tokenWithPayload({ sub: 'user_123|session_456', exp: 123 }),
    ),
    'user_123',
  );
});

test('rejects absent or malformed cached auth tokens', () => {
  assert.equal(userIdFromAuthToken(null), undefined);
  assert.equal(userIdFromAuthToken('not-a-token'), undefined);
  assert.equal(userIdFromAuthToken(tokenWithPayload({ sub: 42 })), undefined);
  assert.equal(
    userIdFromAuthToken(tokenWithPayload({ sub: '|session' })),
    undefined,
  );
});

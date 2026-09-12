import assert from 'node:assert/strict';
import test from 'node:test';
import {
  resolveChatAvailability,
  type ChatAvailabilityInput,
} from './chat-availability';

const ready: ChatAvailabilityInput = {
  web: false,
  authLoading: false,
  authenticated: true,
  readOnly: false,
  cloudSyncEnabled: true,
  cloudProfileReady: true,
  localReady: true,
  offline: false,
  backendUnavailable: false,
  statusError: false,
  status: { enabled: true, consentAccepted: true },
};

test('ordinary text chat can be local-only but still requires explicit AI consent', () => {
  const input = {
    ...ready,
    requiresCloudSync: false,
    cloudSyncEnabled: false,
    cloudProfileReady: false,
  };
  assert.equal(resolveChatAvailability(input).reason, 'ready');
  assert.equal(
    resolveChatAvailability({
      ...input,
      status: { enabled: true, consentAccepted: false },
    }).reason,
    'consent',
  );
  assert.equal(
    resolveChatAvailability({ ...input, requiresCloudSync: true }).reason,
    'sync',
  );
});

test('explicit user disable blocks sending and points to settings', () => {
  const result = resolveChatAvailability({
    ...ready,
    status: { enabled: true, consentAccepted: true, userEnabled: false },
  });
  assert.equal(result.reason, 'user-disabled');
  assert.equal(result.canSend, false);
  assert.equal(result.action, 'profile');
});
for (const [reason, override, action] of [
  ['web', { web: true }, undefined],
  ['loading', { authLoading: true }, undefined],
  ['auth', { authenticated: false }, 'profile'],
  ['auth', { readOnly: true }, 'profile'],
  ['sync', { cloudSyncEnabled: false, cloudProfileReady: false }, 'profile'],
  ['loading', { cloudProfileReady: false }, undefined],
  ['loading', { localReady: false }, undefined],
  ['loading', { status: undefined }, undefined],
  ['offline', { offline: true }, undefined],
  ['server', { backendUnavailable: true }, 'retry'],
  ['server', { statusError: true }, 'retry'],
  [
    'disabled',
    { status: { enabled: false, consentAccepted: false } },
    undefined,
  ],
] as const) {
  test(`explains ${reason}: ${JSON.stringify(override)}`, () => {
    const result = resolveChatAvailability({ ...ready, ...override });
    assert.equal(result.reason, reason);
    assert.equal(result.action, action);
    assert.equal(result.canSend, false);
    assert.ok(result.message);
  });
}
test('consent remains reachable before sending; accepted consent removes the notice', () => {
  const result = resolveChatAvailability({
    ...ready,
    status: { enabled: true, consentAccepted: false },
  });
  assert.equal(result.canSend, true);
  assert.equal(result.action, 'consent');
  assert.equal(resolveChatAvailability(ready).message, undefined);
});
test('offline and server errors cannot be masked by stale status', () => {
  assert.equal(
    resolveChatAvailability({
      ...ready,
      offline: true,
      backendUnavailable: true,
    }).reason,
    'offline',
  );
  assert.equal(
    resolveChatAvailability({ ...ready, status: undefined, statusError: true })
      .reason,
    'server',
  );
});

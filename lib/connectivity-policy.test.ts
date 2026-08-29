import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveConnectivity } from './connectivity-policy';

const connected = {
  isAndroidReversedE2E: false,
  networkIsConnected: true,
  networkIsInternetReachable: true,
  convexHasEverConnected: true,
  convexIsWebSocketConnected: true,
  convexConnectionRetries: 0,
};

test('does not report no internet when only Convex is unavailable', () => {
  assert.deepEqual(
    resolveConnectivity({
      ...connected,
      convexIsWebSocketConnected: false,
      convexConnectionRetries: 10,
    }),
    { isKnown: true, isOffline: false },
  );
});

test('reports offline when the device network is unavailable', () => {
  assert.equal(
    resolveConnectivity({ ...connected, networkIsInternetReachable: false })
      .isOffline,
    true,
  );
});

test('uses the reversed Convex connection only in hermetic Android E2E', () => {
  assert.equal(
    resolveConnectivity({
      ...connected,
      isAndroidReversedE2E: true,
      networkIsInternetReachable: false,
      convexIsWebSocketConnected: true,
    }).isOffline,
    false,
  );
  assert.equal(
    resolveConnectivity({
      ...connected,
      isAndroidReversedE2E: true,
      networkIsInternetReachable: false,
      convexIsWebSocketConnected: false,
      convexConnectionRetries: 2,
    }).isOffline,
    true,
  );
});

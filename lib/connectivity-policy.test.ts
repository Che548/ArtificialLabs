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
    resolveConnectivity({
      ...connected,
      networkIsInternetReachable: false,
      convexIsWebSocketConnected: false,
    })
      .isOffline,
    true,
  );
});

test('a live backend overrides negative OS network signals', () => {
  for (const signals of [
    { networkIsConnected: false },
    { networkIsInternetReachable: false },
    { networkIsConnected: false, networkIsInternetReachable: false },
  ]) {
    assert.deepEqual(resolveConnectivity({ ...connected, ...signals }), {
      isKnown: true,
      isOffline: false,
    });
  }
});

test('unknown network stays unknown until a connection is established', () => {
  const unknown = {
    ...connected,
    networkIsConnected: undefined,
    networkIsInternetReachable: null,
    convexHasEverConnected: false,
    convexIsWebSocketConnected: false,
  };
  assert.deepEqual(resolveConnectivity(unknown), { isKnown: false, isOffline: false });
  assert.deepEqual(
    resolveConnectivity({ ...unknown, convexIsWebSocketConnected: true }),
    { isKnown: true, isOffline: false },
  );
});

test('reconnecting clears offline even if OS reachability remains negative', () => {
  const offline = {
    ...connected,
    networkIsConnected: false,
    convexIsWebSocketConnected: false,
    convexConnectionRetries: 3,
  };
  assert.equal(resolveConnectivity(offline).isOffline, true);
  assert.equal(
    resolveConnectivity({ ...offline, convexIsWebSocketConnected: true }).isOffline,
    false,
  );
  // A previous successful connection does not hide a later real disconnection.
  assert.equal(resolveConnectivity(offline).isOffline, true);
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

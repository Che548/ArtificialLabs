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
    {
      isKnown: true,
      isOffline: false,
      networkStatus: 'online',
      backendStatus: 'unavailable',
    },
  );
});

test('reports offline when the device network is unavailable', () => {
  assert.equal(
    resolveConnectivity({
      ...connected,
      networkIsInternetReachable: false,
      convexIsWebSocketConnected: false,
    }).isOffline,
    true,
  );
});

test('a working backend contradicts a failed OS internet probe', () => {
  const result = resolveConnectivity({
    ...connected,
    networkIsInternetReachable: false,
  });
  assert.equal(result.isOffline, false);
  assert.equal(result.isKnown, false);
  assert.equal(result.networkStatus, 'unknown');
  assert.equal(result.backendStatus, 'connected');
});

test('startup unknown is not offline and reconnect clears offline', () => {
  assert.equal(
    resolveConnectivity({ ...connected, networkIsInternetReachable: undefined })
      .networkStatus,
    'unknown',
  );
  const initial = resolveConnectivity({
    ...connected,
    networkIsConnected: undefined,
    networkIsInternetReachable: undefined,
    convexHasEverConnected: false,
    convexIsWebSocketConnected: false,
  });
  assert.equal(initial.isOffline, false);
  assert.equal(initial.networkStatus, 'unknown');
  assert.equal(initial.backendStatus, 'connecting');
  assert.equal(
    resolveConnectivity({
      ...connected,
      networkIsConnected: false,
      convexIsWebSocketConnected: false,
    }).isOffline,
    true,
  );
  assert.equal(resolveConnectivity(connected).isOffline, false);
});

test('legacy E2E flag cannot change production connectivity semantics', () => {
  for (const networkIsInternetReachable of [true, false, undefined]) {
    for (const convexIsWebSocketConnected of [true, false]) {
      const input = { ...connected, networkIsInternetReachable, convexIsWebSocketConnected, convexConnectionRetries: 2 };
      assert.deepEqual(resolveConnectivity({ ...input, isAndroidReversedE2E: true }), resolveConnectivity({ ...input, isAndroidReversedE2E: false }));
    }
  }
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

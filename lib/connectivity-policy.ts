export type ConnectivityPolicyInput = {
  isAndroidReversedE2E: boolean;
  networkIsConnected?: boolean | null;
  networkIsInternetReachable?: boolean | null;
  convexHasEverConnected: boolean;
  convexIsWebSocketConnected: boolean;
  convexConnectionRetries: number;
};

export function resolveConnectivity({
  isAndroidReversedE2E,
  networkIsConnected,
  networkIsInternetReachable,
  convexHasEverConnected,
  convexIsWebSocketConnected,
  convexConnectionRetries,
}: ConnectivityPolicyInput) {
  const isKnown =
    typeof networkIsConnected === 'boolean' ||
    typeof networkIsInternetReachable === 'boolean';

  // Production network reachability and Convex availability are different
  // signals. A backend/WebSocket outage must not disable OTA, sign-in, or any
  // other service that is still reachable over the public internet.
  const networkIsOffline =
    networkIsConnected === false || networkIsInternetReachable === false;

  // Hermetic Android E2E reaches Convex through adb reverse while the AVD may
  // report its synthetic network as unreachable. In that one test-only mode,
  // the reversed WebSocket is the authoritative connectivity signal.
  const reversedBackendIsOffline =
    convexHasEverConnected &&
    !convexIsWebSocketConnected &&
    convexConnectionRetries > 1;

  return {
    isKnown,
    isOffline: isAndroidReversedE2E
      ? reversedBackendIsOffline
      : networkIsOffline,
  };
}

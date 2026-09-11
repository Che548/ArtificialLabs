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
    convexIsWebSocketConnected ||
    typeof networkIsConnected === 'boolean' ||
    typeof networkIsInternetReachable === 'boolean';

  // A live backend connection proves connectivity even when the OS reports
  // unreachable (for example, with a VPN). The inverse is not true: a backend
  // outage alone must not disable other reachable services.
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
      : networkIsOffline && !convexIsWebSocketConnected,
  };
}

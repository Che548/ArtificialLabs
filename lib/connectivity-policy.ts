export type ConnectivityPolicyInput = {
  /** Legacy input, deliberately ignored: QA and production use one policy. */
  isAndroidReversedE2E?: boolean;
  networkIsConnected?: boolean | null;
  networkIsInternetReachable?: boolean | null;
  convexHasEverConnected: boolean;
  convexIsWebSocketConnected: boolean;
  convexConnectionRetries: number;
};

export function resolveConnectivity({
  networkIsConnected,
  networkIsInternetReachable,
  convexIsWebSocketConnected,
  convexConnectionRetries,
}: ConnectivityPolicyInput) {
  const networkKnown =
    networkIsConnected === false ||
    typeof networkIsInternetReachable === 'boolean';

  // A live backend connection proves connectivity even when the OS reports
  // unreachable (for example, with a VPN). The inverse is not true: a backend
  // outage alone must not disable other reachable services.
  const networkIsOffline =
    networkIsConnected === false || networkIsInternetReachable === false;

  // A live backend connection contradicts a negative OS reachability probe
  // (VPNs and captive-network probes can fail independently). Do not infer
  // global internet access from a socket, but do not block working requests.
  const conflict = networkIsOffline && convexIsWebSocketConnected;
  const isOffline = networkIsOffline && !conflict;
  return {
    isKnown: networkKnown && !conflict,
    isOffline,
    networkStatus: isOffline
      ? ('offline' as const)
      : conflict || !networkKnown
        ? ('unknown' as const)
        : ('online' as const),
    backendStatus: convexIsWebSocketConnected
      ? ('connected' as const)
      : convexConnectionRetries > 1
        ? ('unavailable' as const)
        : ('connecting' as const),
  };
}

import { useConvexConnectionState } from 'convex/react';
import { useNetworkState } from 'expo-network';
import { createContext, useContext, useMemo } from 'react';
import type { PropsWithChildren } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type ConnectivityValue = {
  isOffline: boolean;
  isKnown: boolean;
};

const ConnectivityContext = createContext<ConnectivityValue>({
  isOffline: false,
  isKnown: false,
});

export function ConnectivityProvider({ children }: PropsWithChildren) {
  const network = useNetworkState();
  const convexConnection = useConvexConnectionState();
  const value = useMemo<ConnectivityValue>(() => {
    const isKnown =
      typeof network.isConnected === 'boolean' ||
      typeof network.isInternetReachable === 'boolean';
    return {
      isKnown,
      isOffline:
        network.isConnected === false ||
        network.isInternetReachable === false ||
        (convexConnection.hasEverConnected &&
          !convexConnection.isWebSocketConnected &&
          convexConnection.connectionRetries > 0),
    };
  }, [
    convexConnection.connectionRetries,
    convexConnection.hasEverConnected,
    convexConnection.isWebSocketConnected,
    network.isConnected,
    network.isInternetReachable,
  ]);

  return (
    <ConnectivityContext.Provider value={value}>
      {children}
    </ConnectivityContext.Provider>
  );
}

export function useConnectivity() {
  return useContext(ConnectivityContext);
}

export function ConnectivityBanner() {
  const { isOffline } = useConnectivity();
  const insets = useSafeAreaInsets();
  if (!isOffline || Platform.OS === 'web') return null;

  return (
    <View
      accessibilityLiveRegion="polite"
      pointerEvents="none"
      style={[styles.banner, { top: Math.max(insets.top, 8) + 6 }]}
    >
      <Text style={styles.title}>Нет подключения</Text>
      <Text style={styles.message}>
        Можно продолжать работу — изменения сохранятся на устройстве.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    zIndex: 1000,
    left: 14,
    right: 14,
    minHeight: 50,
    justifyContent: 'center',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(198, 135, 22, 0.28)',
    backgroundColor: 'rgba(255, 247, 224, 0.97)',
    paddingHorizontal: 16,
    paddingVertical: 9,
    shadowColor: '#4A3210',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 5,
  },
  title: {
    color: '#6D470B',
    fontFamily: 'SFProDisplay-Semibold',
    fontSize: 13,
    lineHeight: 16,
  },
  message: {
    color: '#735C38',
    fontFamily: 'SFProDisplay-Regular',
    fontSize: 12,
    lineHeight: 15,
  },
});

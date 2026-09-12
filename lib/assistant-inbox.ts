import { useEffect, useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const welcomeReadKey = 'sferka.assistant.welcome.v1.read';
const welcomeCreatedAtKey = 'sferka.assistant.welcome.v1.createdAt';
let welcomeCreatedAt: number | null = null;
let unread = false;
let loaded = false;
let loading: Promise<void> | undefined;
const listeners = new Set<() => void>();

function publish(value: boolean) {
  unread = value;
  listeners.forEach((listener) => listener());
}

function load() {
  if (!loading) {
    loading = (async () => {
      let read: string | null = null;
      try {
        read =
          Platform.OS === 'web'
            ? window.localStorage.getItem(welcomeReadKey)
            : await SecureStore.getItemAsync(welcomeReadKey);
      } catch {
        // The example remains readable when local preferences are unavailable.
      }
      try {
        const stored = Platform.OS === 'web'
          ? window.localStorage.getItem(welcomeCreatedAtKey)
          : await SecureStore.getItemAsync(welcomeCreatedAtKey);
        const parsed = Number(stored);
        welcomeCreatedAt = Number.isFinite(parsed) && parsed > 0 ? parsed : Date.now();
        if (!stored || !Number.isFinite(parsed) || parsed <= 0) {
          if (Platform.OS === 'web') {
            window.localStorage.setItem(welcomeCreatedAtKey, String(welcomeCreatedAt));
          } else {
            await SecureStore.setItemAsync(welcomeCreatedAtKey, String(welcomeCreatedAt), {
              keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
            });
          }
        }
      } catch {
        welcomeCreatedAt ??= Date.now();
      }
      loaded = true;
      publish(read !== '1');
    })();
  }
  return loading;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useAssistantUnread() {
  const value = useSyncExternalStore(
    subscribe,
    () => unread,
    () => false,
  );
  useEffect(() => {
    void load();
  }, []);
  return value;
}

export function markAssistantWelcomeRead() {
  if (!loaded || !unread) return;
  publish(false);
  if (Platform.OS === 'web') {
    try {
      window.localStorage.setItem(welcomeReadKey, '1');
    } catch {
      /* Session only. */
    }
  } else {
    void SecureStore.setItemAsync(welcomeReadKey, '1', {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    }).catch(() => {
      /* Keep the read state for this session. */
    });
  }
}

export function useAssistantWelcomeCreatedAt() {
  const value = useSyncExternalStore(subscribe, () => welcomeCreatedAt, () => null);
  useEffect(() => { void load(); }, []);
  return value;
}

import { useEffect, useState, useSyncExternalStore } from 'react';
import { AppState, Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

import { useHealthStore } from './health-store';
import { assistantInboxReminders } from './assistant-notifications';

const welcomeReadKey = 'sferka.assistant.welcome.v1.read';
const welcomeCreatedAtKey = 'sferka.assistant.welcome.v1.createdAt';
let welcomeCreatedAt: number | null = null;
let unread = false;
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
        const stored =
          Platform.OS === 'web'
            ? window.localStorage.getItem(welcomeCreatedAtKey)
            : await SecureStore.getItemAsync(welcomeCreatedAtKey);
        const parsed = Number(stored);
        welcomeCreatedAt =
          Number.isFinite(parsed) && parsed > 0 ? parsed : Date.now();
        if (!stored || !Number.isFinite(parsed) || parsed <= 0) {
          if (Platform.OS === 'web') {
            window.localStorage.setItem(
              welcomeCreatedAtKey,
              String(welcomeCreatedAt),
            );
          } else {
            await SecureStore.setItemAsync(
              welcomeCreatedAtKey,
              String(welcomeCreatedAt),
              {
                keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
              },
            );
          }
        }
      } catch {
        welcomeCreatedAt ??= Date.now();
      }
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

export function useAssistantReminders() {
  const { reminders } = useHealthStore();
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setNow(Date.now());
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, []);
  return assistantInboxReminders(reminders, now);
}

export function useAssistantUnread() {
  const reminders = useAssistantReminders();
  const value = useSyncExternalStore(
    subscribe,
    () => unread,
    () => false,
  );
  useEffect(() => {
    void load();
  }, []);
  return value || reminders.some((reminder) => !reminder.readAt);
}

export async function markAssistantWelcomeRead() {
  await load();
  if (!unread) return;
  publish(false);
  if (Platform.OS === 'web') {
    try {
      window.localStorage.setItem(welcomeReadKey, '1');
    } catch {
      /* Session only. */
    }
  } else {
    await SecureStore.setItemAsync(welcomeReadKey, '1', {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    }).catch(() => {
      /* Keep the read state for this session. */
    });
  }
}

export function useAssistantWelcomeCreatedAt() {
  const value = useSyncExternalStore(
    subscribe,
    () => welcomeCreatedAt,
    () => null,
  );
  useEffect(() => {
    void load();
  }, []);
  return value;
}

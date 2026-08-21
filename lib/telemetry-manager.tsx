import { useConvexAuth, useMutation } from 'convex/react';
import { useCallback, useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';

import { api } from '../convex/_generated/api';
import { useConnectivity } from './connectivity';
import {
  acknowledgeTelemetryEvents,
  loadPendingTelemetryEvents,
  markTelemetryAttempt,
  loadLocalSetting,
  saveLocalSetting,
} from './local-database';

export function TelemetryManager() {
  const { isAuthenticated } = useConvexAuth();
  const { isOffline } = useConnectivity();
  const ingest = useMutation(api.telemetry.ingest);
  const heartbeat = useMutation(api.telemetry.heartbeat);
  const running = useRef<Promise<void> | null>(null);

  const flush = useCallback(() => {
    if (
      Platform.OS === 'web' ||
      !isAuthenticated ||
      isOffline ||
      running.current
    ) {
      return running.current ?? Promise.resolve();
    }

    running.current = (async () => {
      const pending = await loadPendingTelemetryEvents(50);
      if (pending.length === 0) return;
      const events = pending.map(({ attempts: _attempts, ...event }) => event);
      try {
        await ingest({ events });
        await acknowledgeTelemetryEvents(events.map((event) => event.eventId));
      } catch {
        await markTelemetryAttempt(events.map((event) => event.eventId));
      }
    })().finally(() => {
      running.current = null;
    });
    return running.current;
  }, [ingest, isAuthenticated, isOffline]);

  useEffect(() => {
    if (Platform.OS !== 'web' && isAuthenticated && !isOffline) {
      const today = new Date().toISOString().slice(0, 10);
      void loadLocalSetting<string>('analyticsHeartbeatDay.v1').then(
        async (lastDay) => {
          if (lastDay === today) return;
          try {
            await heartbeat({});
            await saveLocalSetting('analyticsHeartbeatDay.v1', today);
          } catch {
            // A service/configuration failure is retried on the next app activation.
          }
        },
      );
    }
    void flush();
    const interval = setInterval(() => void flush(), 30_000);
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active' || state === 'background') void flush();
    });
    return () => {
      clearInterval(interval);
      appState.remove();
    };
  }, [flush, heartbeat, isAuthenticated, isOffline]);

  return null;
}

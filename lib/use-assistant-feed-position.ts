import { useEffect, useRef, useState } from 'react';
import { AppState, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent, type ScrollView } from 'react-native';
import { assistantFeedAtEnd, assistantReadCandidates } from './assistant-feed-position';
import type { Reminder } from './health-types';

/** Opens at the latest message and acknowledges a delivered snapshot after a visible dwell. */
export function useAssistantFeedPosition({ active, ready, readOnly, reminders, contentKey, markReminderRead, markWelcomeRead }: {
  active: boolean; ready: boolean; readOnly: boolean; reminders: readonly Reminder[]; contentKey: string;
  markReminderRead: (reminder: Reminder) => Promise<void>;
  markWelcomeRead: () => Promise<void>;
}) {
  const scrollRef = useRef<ScrollView>(null);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [positioned, setPositioned] = useState(false);
  const metrics = useRef({ offset: 0, viewport: 0, content: 0 });
  const followEnd = useRef(true);
  const initial = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const frame = useRef<number | undefined>(undefined);
  const pending = useRef(new Set<string>());
  const latest = useRef({ active: false, ready, readOnly, reminders, markReminderRead, markWelcomeRead });
  latest.current = { active: active && foreground, ready, readOnly, reminders, markReminderRead, markWelcomeRead };

  const cancelRead = () => { if (timer.current) clearTimeout(timer.current); timer.current = undefined; };
  const atEnd = () => assistantFeedAtEnd(metrics.current.offset, metrics.current.viewport, metrics.current.content);
  const scheduleRead = () => {
    cancelRead();
    if (!latest.current.active || !latest.current.ready || !atEnd()) return;
    const deliveredIds = new Set(latest.current.reminders.map((item) => item.localId));
    timer.current = setTimeout(() => {
      timer.current = undefined;
      if (!latest.current.active || !latest.current.ready || !atEnd()) return;
      void latest.current.markWelcomeRead().catch(() => undefined);
      if (latest.current.readOnly) return;
      const candidates = assistantReadCandidates(latest.current.reminders, deliveredIds, Date.now());
      void (async () => {
        for (const candidate of candidates) {
          if (!latest.current.active || latest.current.readOnly || !atEnd()) break;
          const current = latest.current.reminders.find((item) => item.localId === candidate.localId);
          if (!current || current.readAt || current.deletedAt || pending.current.has(current.localId)) continue;
          pending.current.add(current.localId);
          try { await latest.current.markReminderRead(current); }
          catch { /* Keep unread on failure; retry on the next visit or scroll. */ }
          finally { pending.current.delete(current.localId); }
        }
      })();
    }, 700);
  };
  const revealEnd = () => {
    if (!latest.current.active || !latest.current.ready || metrics.current.viewport <= 0 || metrics.current.content <= 0) return;
    if (!initial.current && !followEnd.current) return;
    cancelRead();
    if (frame.current !== undefined) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      frame.current = undefined;
      if (!latest.current.active) return;
      scrollRef.current?.scrollToEnd({ animated: false });
      if (atEnd()) {
        initial.current = false;
        setPositioned(true);
        scheduleRead();
      }
    });
  };

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') { latest.current.active = false; cancelRead(); }
      setForeground(state === 'active');
    });
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    if (!active || !foreground) { cancelRead(); return; }
    initial.current = true;
    followEnd.current = true;
    setPositioned(false);
    revealEnd();
    return cancelRead;
  }, [active, foreground]);
  useEffect(() => {
    // A later local-store hydration or message layout must also land at the end.
    revealEnd();
  }, [ready, contentKey]);
  useEffect(() => () => {
    latest.current.active = false;
    cancelRead();
    if (frame.current !== undefined) cancelAnimationFrame(frame.current);
  }, []);

  return {
    scrollRef, positioned,
    onLayout: (event: LayoutChangeEvent) => {
      metrics.current.viewport = event.nativeEvent.layout.height;
      revealEnd();
    },
    onContentSizeChange: (_width: number, height: number) => {
      metrics.current.content = height;
      revealEnd();
    },
    onScrollBeginDrag: () => { initial.current = false; followEnd.current = false; cancelRead(); },
    onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
      metrics.current = { offset: contentOffset.y, viewport: layoutMeasurement.height, content: contentSize.height };
      if (atEnd()) {
        initial.current = false;
        followEnd.current = true;
        setPositioned(true);
        scheduleRead();
      } else {
        cancelRead();
        if (!initial.current) followEnd.current = false;
      }
    },
  };
}

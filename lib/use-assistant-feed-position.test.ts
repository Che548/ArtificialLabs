import { afterEach, beforeEach, expect, test, vi } from 'vitest';
const lifecycle = vi.hoisted(() => ({
  effects: [] as Array<() => void | (() => void)>,
  onAppState: (_state: string) => {},
}));
vi.mock('react', () => ({
  useRef: (current: unknown) => ({ current }),
  useState: (initial: unknown) => [typeof initial === 'function' ? initial() : initial, vi.fn()],
  useEffect: (effect: () => void | (() => void)) => lifecycle.effects.push(effect),
}));
vi.mock('react-native', () => ({
  AppState: { currentState: 'active', addEventListener: (_event: string, listener: (state: string) => void) => {
    lifecycle.onAppState = listener;
    return { remove: vi.fn() };
  } },
}));
import { useAssistantFeedPosition } from './use-assistant-feed-position';

let cleanup: Array<() => void> = [];
const markReminderRead = vi.fn(async () => {});
const markWelcomeRead = vi.fn(async () => {});
const scrollToEnd = vi.fn();
function mount(overrides = {}) {
  const feed = useAssistantFeedPosition({ active: true, ready: true, readOnly: false, contentKey: 'loaded',
    reminders: [{ localId: 'message', dueAt: 1, title: 'Test', body: 'Test', type: 'system', updatedAt: 1 }],
    markReminderRead, markWelcomeRead, ...overrides });
  feed.scrollRef.current = { scrollToEnd } as any;
  cleanup = lifecycle.effects.map(fn => fn()).filter((fn): fn is () => void => typeof fn === 'function');
  return feed;
}
function scroll(feed: ReturnType<typeof mount>, offset: number) {
  feed.onScroll({ nativeEvent: { contentOffset: { y: offset }, contentSize: { height: 1600 }, layoutMeasurement: { height: 600 } } } as any);
}
beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks(); lifecycle.effects = []; cleanup = [];
  vi.stubGlobal('requestAnimationFrame', (cb: () => void) => setTimeout(cb, 16));
  vi.stubGlobal('cancelAnimationFrame', (id: any) => clearTimeout(id));
});
afterEach(() => { cleanup.forEach(fn => fn()); vi.useRealTimers(); vi.unstubAllGlobals(); });
test('waits for measured content, jumps to latest, then acknowledges after visible dwell', async () => {
  const feed = mount();
  feed.onLayout({ nativeEvent: { layout: { height: 600 } } } as any);
  await vi.advanceTimersByTimeAsync(20);
  expect(scrollToEnd).not.toHaveBeenCalled();
  feed.onContentSizeChange(400, 1600);
  await vi.advanceTimersByTimeAsync(20);
  expect(scrollToEnd).toHaveBeenCalledWith({ animated: false });
  expect(markReminderRead).not.toHaveBeenCalled();
  scroll(feed, 1000);
  await vi.advanceTimersByTimeAsync(699);
  expect(markReminderRead).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(markReminderRead).toHaveBeenCalledTimes(1);
  expect(markWelcomeRead).toHaveBeenCalledTimes(1);
});
test('backgrounding cancels the read receipt', async () => {
  const feed = mount(); scroll(feed, 1000);
  await vi.advanceTimersByTimeAsync(300);
  lifecycle.onAppState('background');
  await vi.advanceTimersByTimeAsync(1000);
  expect(markReminderRead).not.toHaveBeenCalled();
  expect(markWelcomeRead).not.toHaveBeenCalled();
});
test('reading older messages prevents auto-scroll and acknowledgement', async () => {
  const feed = mount(); scroll(feed, 1000);
  feed.onScrollBeginDrag(); scroll(feed, 100);
  feed.onContentSizeChange(400, 1800);
  await vi.advanceTimersByTimeAsync(1000);
  expect(scrollToEnd).not.toHaveBeenCalled();
  expect(markReminderRead).not.toHaveBeenCalled();
});
test('hidden assistant cannot acknowledge a native layout or scroll event', async () => {
  const feed = mount({ active: false }); scroll(feed, 1000);
  await vi.advanceTimersByTimeAsync(1000);
  expect(markReminderRead).not.toHaveBeenCalled();
});
test('read-only previews never write reminders', async () => {
  const feed = mount({ readOnly: true }); scroll(feed, 1000);
  await vi.advanceTimersByTimeAsync(700);
  expect(markReminderRead).not.toHaveBeenCalled();
});
test('failed write can retry after the next view without an unhandled rejection', async () => {
  markReminderRead.mockRejectedValueOnce(new Error('local write failed'));
  const feed = mount(); scroll(feed, 1000);
  await vi.advanceTimersByTimeAsync(700);
  scroll(feed, 1000);
  await vi.advanceTimersByTimeAsync(700);
  expect(markReminderRead).toHaveBeenCalledTimes(2);
});

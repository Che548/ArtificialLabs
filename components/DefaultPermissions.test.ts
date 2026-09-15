import { beforeEach, afterEach, expect, test, vi } from 'vitest';
const fixture = vi.hoisted(() => ({
  effect: undefined as undefined | (() => void | (() => void)),
  settings: new Map<string, boolean>(),
  owner: 'user-a',
  cloud: vi.fn(), preferences: vi.fn(), mutation: vi.fn(),
  pending: false, onboarded: true,
}));
vi.mock('react', () => ({ useRef: (current: unknown) => ({ current }), useEffect: (effect: () => void) => { fixture.effect = effect; } }));
vi.mock('@convex-dev/auth/react', () => ({ useAuthToken: () => fixture.owner }));
vi.mock('convex/react', () => ({ useConvex: () => ({ mutation: fixture.mutation }) }));
vi.mock('../lib/auth-session', () => ({ userIdFromAuthToken: (value: string) => value }));
vi.mock('../lib/health-store', () => ({ useHealthStore: () => ({ ready: true, readOnly: false, profile: { onboardingCompleted: fixture.onboarded }, accountDeletion: { pendingDeletion: fixture.pending }, setCloudSyncEnabled: fixture.cloud, savePreferences: fixture.preferences }) }));
vi.mock('../lib/local-database', () => ({ loadLocalSetting: async (key: string) => fixture.settings.get(key), saveLocalSetting: async (key: string, value: boolean) => { fixture.settings.set(key, value); } }));
import { DefaultPermissions } from './DefaultPermissions';
const settle = async () => { for (let i = 0; i < 100; i++) await Promise.resolve(); };
beforeEach(() => {
  vi.useFakeTimers(); fixture.settings.clear(); fixture.owner = 'user-a'; fixture.pending = false; fixture.onboarded = true;
  fixture.cloud.mockReset().mockResolvedValue(undefined);
  fixture.preferences.mockReset().mockResolvedValue(undefined);
  fixture.mutation.mockReset().mockResolvedValue(undefined);
});
afterEach(() => vi.useRealTimers());
function mount() { DefaultPermissions(); return fixture.effect?.(); }
test('initializes every internal permission once, preserving later disabled choices on restart', async () => {
  const stop = mount(); await settle();
  expect(fixture.cloud).toHaveBeenCalledWith(true);
  expect(fixture.preferences).toHaveBeenCalledWith(expect.objectContaining({ anonymousAnalytics: true, medicalRecommendations: true, notificationsEnabled: true }));
  expect(fixture.mutation).toHaveBeenCalledTimes(6);
  stop?.(); mount(); await settle();
  expect(fixture.cloud).toHaveBeenCalledTimes(1);
  expect(fixture.preferences).toHaveBeenCalledTimes(1);
  expect(fixture.mutation).toHaveBeenCalledTimes(6);
});
test('retries only a failed permission without replaying successful settings', async () => {
  fixture.mutation.mockRejectedValueOnce(new Error('offline'));
  mount(); await settle();
  await vi.advanceTimersByTimeAsync(60_000); await settle();
  expect(fixture.mutation).toHaveBeenCalledTimes(7);
  expect(fixture.cloud).toHaveBeenCalledTimes(1);
  expect(fixture.preferences).toHaveBeenCalledTimes(1);
});
test('never initializes an account pending deletion', async () => {
  fixture.pending = true; mount(); await settle();
  expect(fixture.cloud).not.toHaveBeenCalled(); expect(fixture.mutation).not.toHaveBeenCalled();
});
test('cancellation stops queued operations and another user has separate defaults', async () => {
  const stop = mount(); stop?.(); await settle();
  expect(fixture.mutation).not.toHaveBeenCalled();
  mount(); await settle();
  fixture.owner = 'user-b'; mount(); await settle();
  expect(fixture.cloud).toHaveBeenCalledTimes(2);
});

test('enables cloud before loading the profile on a new device', async () => {
  fixture.onboarded = false;
  const stop = mount(); await settle();
  expect(fixture.cloud).toHaveBeenCalledWith(true);
  expect(fixture.preferences).not.toHaveBeenCalled();
  stop?.(); fixture.onboarded = true; mount(); await settle();
  expect(fixture.preferences).toHaveBeenCalledTimes(1);
  expect(fixture.mutation).toHaveBeenCalledTimes(6);
});

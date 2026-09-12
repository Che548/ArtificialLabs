import { beforeEach, expect, test, vi } from 'vitest';
import { createEmptySnapshot } from './health-types';
import { reconcileCarePlan } from './care-plan';

const state = vi.hoisted(() => ({ payload: '', run: vi.fn(async () => ({ changes: 1 })) }));
vi.mock('expo-crypto', () => ({}));
vi.mock('expo-file-system/legacy', () => ({}));
vi.mock('expo-secure-store', () => ({ getItemAsync: async () => '00'.repeat(32) }));
vi.mock('expo-sqlite', () => ({ openDatabaseAsync: async () => ({
  execAsync: async () => {},
  getFirstAsync: async (sql: string) => sql.includes('SELECT payload FROM records')
    ? { payload: state.payload } : { value: '1' },
  runAsync: state.run,
}) }));
import { saveLocalRecord } from './local-database.native';

function trigger() {
  const snapshot = createEmptySnapshot();
  snapshot.profile = { displayName: 'QA', goal: 'cycle', onboardingCompleted: true, updatedAt: Date.now() };
  snapshot.preferences = [{ localId: 'preferences', medicalRecommendations: true, updatedAt: Date.now(), notificationsEnabled: false, journalNotifications: false, resultNotifications: false, notificationTone: 'formal', anonymousAnalytics: false, language: 'ru', region: 'RU' }];
  return reconcileCarePlan(snapshot).triggers[0];
}
beforeEach(() => state.run.mockClear());

test('an older remote trigger cannot roll back a completed local run or its outbox', async () => {
  const remote = trigger();
  state.payload = JSON.stringify({ ...remote, status: 'completed', runCount: 1, updatedAt: remote.updatedAt + 1000 });
  await expect(saveLocalRecord('agentTriggers', remote, false)).resolves.toBeUndefined();
  expect(state.run).not.toHaveBeenCalled();
});

test('current remote and local attempts still enforce trigger immutability', async () => {
  const original = trigger();
  state.payload = JSON.stringify({ ...original, status: 'completed', runCount: 1, updatedAt: original.updatedAt + 1000 });
  await expect(saveLocalRecord('agentTriggers', { ...original, updatedAt: original.updatedAt + 1000 }, false)).rejects.toThrow('AGENT_TRIGGER_IMMUTABLE');
  await expect(saveLocalRecord('agentTriggers', original)).rejects.toThrow('AGENT_TRIGGER_IMMUTABLE');
  expect(state.run).not.toHaveBeenCalled();
});

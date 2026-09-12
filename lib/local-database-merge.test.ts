import { beforeEach, expect, test, vi } from 'vitest';
import { createEmptySnapshot } from './health-types';
import { reconcileCarePlan } from './care-plan';

const state = vi.hoisted(() => ({ payload: '', run: vi.fn(async (..._args: unknown[]) => ({ changes: 1 })) }));
vi.mock('expo-crypto', () => ({}));
vi.mock('expo-file-system/legacy', () => ({}));
vi.mock('expo-secure-store', () => ({ getItemAsync: async () => '00'.repeat(32) }));
vi.mock('expo-sqlite', () => ({ openDatabaseAsync: async () => ({
  execAsync: async () => {},
  getFirstAsync: async (sql: string) => sql.includes('SELECT payload FROM records')
    ? { payload: state.payload } : { value: '1' },
  runAsync: state.run,
}) }));
import { acknowledgeOutbox, saveLocalRecord, saveUpdateChatDraft } from './local-database.native';

test('update draft save is owner-checked and writes only encrypted settings', async () => {
  await expect(saveUpdateChatDraft('not-owner', { text: 'Synthetic' })).rejects.toThrow('LOCAL_OWNER_CHANGED');
  expect(state.run.mock.calls.some(call => String(call[0]).startsWith('INSERT INTO settings'))).toBe(false);
  await saveUpdateChatDraft('1', { text: 'Synthetic', conversationId: 'synthetic-id' });
  const inserts = state.run.mock.calls.filter(call => String(call[0]).startsWith('INSERT'));
  expect(inserts).toHaveLength(1);
  expect(inserts[0][0]).toContain('settings');
  expect(inserts[0][1]).toBe('updateChatDraft.v1');
  expect(JSON.parse(String(inserts[0][2]))).toMatchObject({ ownerId: '1', text: 'Synthetic' });
});

function trigger() {
  const snapshot = createEmptySnapshot();
  snapshot.profile = { displayName: 'QA', goal: 'cycle', onboardingCompleted: true, updatedAt: Date.now() };
  snapshot.preferences = [{ localId: 'preferences', medicalRecommendations: true, updatedAt: Date.now(), notificationsEnabled: false, journalNotifications: false, resultNotifications: false, notificationTone: 'formal', anonymousAnalytics: false, language: 'ru', region: 'RU' }];
  return reconcileCarePlan(snapshot).triggers[0];
}
beforeEach(() => state.run.mockClear());

test('acknowledgement matches the sent payload rather than deleting a newer edit by ID', async () => {
  const payload = trigger();
  await acknowledgeOutbox([17], [{ id: 17, entity: 'agentTriggers', payload }]);
  expect(state.run).toHaveBeenCalledWith(
    'DELETE FROM outbox WHERE id = ? AND updated_at = ? AND payload = ?',
    17, payload.updatedAt, JSON.stringify(payload),
  );
});

test('an older remote trigger cannot roll back a completed local run or its outbox', async () => {
  const remote = trigger();
  state.payload = JSON.stringify({ ...remote, status: 'completed', runCount: 1, lastRunAt: remote.updatedAt + 1000, updatedAt: remote.updatedAt + 1000 });
  await expect(saveLocalRecord('agentTriggers', remote, false)).resolves.toBeUndefined();
  expect(state.run.mock.calls.every(([sql]) => !String(sql).includes('INSERT INTO outbox'))).toBe(true);
});

test('remote policy edits and local reactivation still enforce trigger immutability', async () => {
  const original = trigger();
  state.payload = JSON.stringify({ ...original, status: 'completed', runCount: 1, updatedAt: original.updatedAt + 1000 });
  await expect(saveLocalRecord('agentTriggers', { ...original, maxRuns: original.maxRuns + 1, updatedAt: original.updatedAt + 1000 }, false)).rejects.toThrow('AGENT_TRIGGER_IMMUTABLE');
  await expect(saveLocalRecord('agentTriggers', original)).rejects.toThrow('AGENT_TRIGGER_IMMUTABLE');
  expect(state.run).not.toHaveBeenCalled();
});

test('remote terminal conflict merges safely without deleting or enqueuing outbox records', async () => {
  const original = trigger();
  state.payload = JSON.stringify({ ...original, status: 'suspended' });
  await saveLocalRecord('agentTriggers', { ...original, status: 'expired', updatedAt: original.updatedAt + 1 }, false);
  expect(state.run).toHaveBeenCalled();
  expect(state.run.mock.calls.every(([sql]) => !String(sql).includes('outbox'))).toBe(true);
});

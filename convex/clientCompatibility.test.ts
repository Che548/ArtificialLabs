import { convexTest } from 'convex-test';
import { afterEach, expect, test, vi } from 'vitest';
import { ConvexError } from 'convex/values';
import { requireClientProtocol } from './lib/clientCompatibility';
import { classifyServiceIssue } from '../lib/service-errors';
import { api } from './_generated/api';
import schema from './schema';
import { synchronizeMedicalCloud } from '../lib/cloud-sync';
const modules = import.meta.glob('./**/*.ts');
afterEach(() => vi.unstubAllEnvs());

test('update rejection leaves queued rows unacknowledged and does not loop', async () => {
  const acknowledge = vi.fn(async () => {});
  const pushBatch = vi.fn(async () => { requireClientProtocol('healthSync', undefined, 1); });
  const row = { id: 7, entity: 'journalEntries' as const, payload: { localId: 'synthetic', kind: 'note' as const, label: 'Synthetic', source: 'manual' as const, occurredAt: 1, updatedAt: 1 } };
  await expect(synchronizeMedicalCloud({ profile: { displayName: 'Synthetic', goal: 'cycle', onboardingCompleted: true, updatedAt: 1 },
    saveProfile: async () => {}, loadPendingOutbox: async () => [row], pushBatch, acknowledge })).rejects.toThrow('CLIENT_UPDATE_REQUIRED');
  expect(pushBatch).toHaveBeenCalledTimes(1);
  expect(acknowledge).not.toHaveBeenCalled();
  expect(row.payload.label).toBe('Synthetic');
});

test('bounded reusable contract rejects missing/old/invalid protocols, accepts current and newer', () => {
  for (const version of [undefined, 0, -1, 0.5, NaN, Infinity]) {
    try { requireClientProtocol('healthSync', version, 1); throw new Error('EXPECTED_REJECTION'); }
    catch (error) {
      expect(error).toBeInstanceOf(ConvexError);
      expect(classifyServiceIssue(error, true)).toMatchObject({ kind: 'update-required', retryable: false,
        update: { code: 'CLIENT_UPDATE_REQUIRED', feature: 'healthSync', requiredProtocol: 1 } });
    }
  }
  for (const version of [1, 2]) expect(() => requireClientProtocol('healthSync', version, 1)).not.toThrow();
});

test('auth legacy errors are recognized without exposing payloads or claiming saved data', () => {
  const issue = classifyServiceIssue(new ConvexError('CONTACT_CLIENT_UPDATE_REQUIRED'), true);
  expect(issue).toMatchObject({ kind: 'update-required', retryable: false, update: { feature: 'emailVerification' } });
  expect(issue.message).not.toMatch(/сохранены|CONTACT/);
  expect(classifyServiceIssue(new Error('RECORD_SYNC_CONFLICT'))).toMatchObject({ conflict: true });
});

test('rollout is off by default; enforcement follows auth and does not mutate data', async () => {
  vi.stubEnv('SYNC_PROTOCOL_REQUIRED', '0');
  const t = convexTest(schema, modules);
  const id = await t.run(ctx => ctx.db.insert('users', { email: 'protocol@example.test' }));
  const user = t.withIdentity({ subject: `${id}|test-session` });
  const profile = { displayName: 'Synthetic', goal: 'cycle' as const, onboardingCompleted: true, updatedAt: 100, consentToCloudSyncAt: 90 };
  await user.mutation(api.profile.save, profile);
  vi.stubEnv('SYNC_PROTOCOL_REQUIRED', '1');
  await expect(t.mutation(api.profile.save, profile)).rejects.not.toThrow('CLIENT_UPDATE_REQUIRED');
  await expect(user.mutation(api.profile.save, { ...profile, displayName: 'Not written' })).rejects.toThrow('CLIENT_UPDATE_REQUIRED');
  expect((await user.query(api.profile.current, {}))?.displayName).toBe('Synthetic');
  await user.mutation(api.profile.save, { ...profile, protocolVersion: 1 });
  await expect(user.mutation(api.profile.save, { ...profile, protocolVersion: 1, displayName: 'Divergent without base' })).rejects.toThrow('PROFILE_SYNC_CONFLICT');
  const batch = { programs: [], journalEntries: [], labResults: [], scanResults: [], reminders: [], medicalConditions: [], medications: [], allergyRisks: [], documents: [], chatConversations: [], chatMessages: [], preferences: [] };
  await expect(user.mutation(api.health.syncBatch, batch)).rejects.toThrow('CLIENT_UPDATE_REQUIRED');
  expect(await user.mutation(api.health.syncBatch, { ...batch, protocolVersion: 1 })).toMatchObject({ accepted: 0 });
});

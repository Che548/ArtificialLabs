import { convexTest } from 'convex-test';
import { afterEach, expect, test, vi } from 'vitest';
import { ConvexError } from 'convex/values';
import { requireClientProtocol, requireSyncProtocol, legacySyncCompatibilityEnabled } from './lib/clientCompatibility';
import { classifyServiceIssue } from '../lib/service-errors';
import { api } from './_generated/api';
import schema from './schema';
import { synchronizeMedicalCloud } from '../lib/cloud-sync';
const modules = import.meta.glob('./**/*.ts');
afterEach(() => vi.unstubAllEnvs());

const legacyProfile = { displayName: 'Synthetic', goal: 'cycle' as const, onboardingCompleted: true,
  heightCm: 160, weightKg: 60, updatedAt: 100, consentToCloudSyncAt: 90 };
const legacyBatch = () => ({ programs: [], journalEntries: [], labResults: [], scanResults: [], reminders: [],
  medicalConditions: [], medications: [], allergyRisks: [], documents: [], chatConversations: [], chatMessages: [], preferences: [] });
const legacyNote = { localId: 'legacy-note', kind: 'note' as const, label: 'Initial', source: 'manual' as const, occurredAt: 100, updatedAt: 100 };

async function legacySetup() {
  vi.stubEnv('SYNC_PROTOCOL_REQUIRED', '0');
  vi.stubEnv('SYNC_LEGACY_COMPAT_ENABLED', '1');
  const t = convexTest(schema, modules);
  const id = await t.run(ctx => ctx.db.insert('users', { email: 'legacy@example.test' }));
  const old = t.withIdentity({ subject: `${id}|legacy-session` });
  const modern = t.withIdentity({ subject: `${id}|modern-session` });
  await old.mutation(api.profile.save, legacyProfile);
  await modern.mutation(api.profile.save, { ...legacyProfile, protocolVersion: 1 });
  return { t, old, modern };
}

test('temporary legacy flag defaults safe-on and can disable both legacy write endpoints', async () => {
  vi.stubEnv('SYNC_LEGACY_COMPAT_ENABLED', undefined);
  vi.stubEnv('SYNC_PROTOCOL_REQUIRED', '0');
  expect(legacySyncCompatibilityEnabled()).toBe(true);
  expect(() => requireSyncProtocol('profileSync')).not.toThrow();
  const { old, modern } = await legacySetup();
  await old.mutation(api.health.syncBatch, { ...legacyBatch(), journalEntries: [legacyNote] });
  vi.stubEnv('SYNC_LEGACY_COMPAT_ENABLED', '0');
  await expect(old.mutation(api.profile.save, { ...legacyProfile, displayName: 'Rejected', updatedAt: 120 })).rejects.toThrow('CLIENT_UPDATE_REQUIRED');
  await expect(old.mutation(api.health.syncBatch, { ...legacyBatch(), journalEntries: [{ ...legacyNote, label: 'Rejected', updatedAt: 120 }] })).rejects.toThrow('CLIENT_UPDATE_REQUIRED');
  expect(await old.query(api.profile.current, {})).toMatchObject({ displayName: 'Synthetic' });
  expect((await old.query(api.health.snapshot, {})).journalEntries[0].label).toBe('Initial');
  await expect(modern.mutation(api.health.syncBatch, { ...legacyBatch(), protocolVersion: 1 })).resolves.toMatchObject({ accepted: 0 });
  vi.stubEnv('SYNC_LEGACY_COMPAT_ENABLED', '1');
  await expect(old.mutation(api.health.syncBatch, legacyBatch())).resolves.toMatchObject({ accepted: 0 });
  vi.stubEnv('SYNC_PROTOCOL_REQUIRED', '1');
  expect(() => requireSyncProtocol('healthSync')).toThrow('CLIENT_UPDATE_REQUIRED');
});

test('protocol 0 edits an existing profile repeatedly without base and keeps deployed timestamp precedence', async () => {
  const { old } = await legacySetup();
  for (const updatedAt of [110, 120]) {
    await old.mutation(api.profile.save, { ...legacyProfile, displayName: `Edit ${updatedAt}`, updatedAt });
    expect(await old.query(api.profile.current, {})).toMatchObject({ displayName: `Edit ${updatedAt}`, updatedAt });
  }
  await old.mutation(api.profile.save, { ...legacyProfile, displayName: 'Delayed', updatedAt: 115 });
  expect(await old.query(api.profile.current, {})).toMatchObject({ displayName: 'Edit 120', updatedAt: 120 });
});

test('legacy batches ignore returned revision receipts but can edit and delete again; modern stale revisions still fail', async () => {
  const { old, modern } = await legacySetup();
  await old.mutation(api.health.syncBatch, { ...legacyBatch(), journalEntries: [legacyNote] });
  await old.mutation(api.health.syncBatch, { ...legacyBatch(), journalEntries: [{ ...legacyNote, label: 'Old edit', updatedAt: 110 }] });
  const remote = (await modern.query(api.health.snapshot, {})).journalEntries[0];
  expect(remote).toMatchObject({ label: 'Old edit', syncRevision: 2 });
  await modern.mutation(api.health.syncBatch, { ...legacyBatch(), protocolVersion: 1,
    journalEntries: [{ ...legacyNote, label: 'Modern edit', updatedAt: 120, syncRevision: 2 }] });
  await old.mutation(api.health.syncBatch, { ...legacyBatch(), journalEntries: [{ ...legacyNote, label: 'Later old edit', updatedAt: 130 }] });
  await expect(modern.mutation(api.health.syncBatch, { ...legacyBatch(), protocolVersion: 1,
    journalEntries: [{ ...legacyNote, label: 'Stale modern', updatedAt: 140, syncRevision: 3 }] })).rejects.toThrow('RECORD_SYNC_CONFLICT');
  await old.mutation(api.health.syncBatch, { ...legacyBatch(), journalEntries: [{ ...legacyNote, label: 'Later old edit', updatedAt: 150, deletedAt: 150 }] });
  await old.mutation(api.health.syncBatch, { ...legacyBatch(), journalEntries: [{ ...legacyNote, updatedAt: 140 }] });
  expect((await old.query(api.health.snapshot, {})).journalEntries[0]).toMatchObject({ deletedAt: 150, updatedAt: 150, syncRevision: 5 });
});

test('mixed profile clients merge disjoint fields but reject modern stale same-field edits', async () => {
  const { old, modern } = await legacySetup();
  const { consentToCloudSyncAt: _receipt, ...base } = legacyProfile;
  await old.mutation(api.profile.save, { ...legacyProfile, heightCm: 170, updatedAt: 110 });
  await modern.mutation(api.profile.save, { ...legacyProfile, protocolVersion: 1, base, weightKg: 65, updatedAt: 120 });
  expect(await old.query(api.profile.current, {})).toMatchObject({ heightCm: 170, weightKg: 65 });
  await expect(modern.mutation(api.profile.save, { ...legacyProfile, protocolVersion: 1, base, heightCm: 180, updatedAt: 130 })).rejects.toThrow('PROFILE_SYNC_CONFLICT');
});

test('legacy coordinator completes twice without revision handling; rejection does not acknowledge its queue', async () => {
  const { old } = await legacySetup();
  const { consentToCloudSyncAt, ...profile } = legacyProfile;
  let pending = [{ id: 1, entity: 'journalEntries' as const, payload: legacyNote }];
  const acknowledge = vi.fn(async () => { pending = []; });
  const sync = () => synchronizeMedicalCloud({ profile, consentedAt: consentToCloudSyncAt,
    saveProfile: input => old.mutation(api.profile.save, input), loadPendingOutbox: async () => pending,
    pushBatch: batch => old.mutation(api.health.syncBatch, batch as never), acknowledge });
  expect(await sync()).toBe(1);
  pending = [{ id: 2, entity: 'journalEntries', payload: { ...legacyNote, label: 'Edited again', updatedAt: 110 } }];
  expect(await sync()).toBe(1);
  pending = [{ id: 3, entity: 'journalEntries', payload: { ...legacyNote, label: 'Keep locally', updatedAt: 120 } }];
  vi.stubEnv('SYNC_PROTOCOL_REQUIRED', '1');
  await expect(sync()).rejects.toThrow('CLIENT_UPDATE_REQUIRED');
  expect(acknowledge).toHaveBeenCalledTimes(2);
  expect(pending[0].payload.label).toBe('Keep locally');
});

test('protocol 0 never bypasses auth, session consent or revocation', async () => {
  const { t, old, modern } = await legacySetup();
  await expect(t.mutation(api.health.syncBatch, legacyBatch())).rejects.toThrow();
  await old.mutation(api.profile.revokeCloudSync, {});
  await expect(old.mutation(api.profile.save, legacyProfile)).rejects.toThrow('CLOUD_SYNC_CONSENT_REVOKED');
  await expect(old.mutation(api.health.syncBatch, legacyBatch())).rejects.toThrow('CLOUD_SYNC_CONSENT_REQUIRED');
  await modern.mutation(api.health.syncBatch, { ...legacyBatch(), protocolVersion: 1, journalEntries: [legacyNote] });
  expect((await old.query(api.health.snapshot, {})).journalEntries).toHaveLength(0);
  expect((await modern.query(api.health.snapshot, {})).journalEntries).toHaveLength(1);
});

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

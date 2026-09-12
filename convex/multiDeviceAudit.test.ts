// Regression cases derived from the multi-device characterization audit.
// All accounts and records exist only in convex-test's disposable memory store.
import { convexTest } from 'convex-test';
import { expect, test } from 'vitest';
import { api } from './_generated/api';
import { hasAnyCloudConsent } from './lib/cloudConsent';
import { synchronizeMedicalCloud, type CloudOutboxRow } from '../lib/cloud-sync';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
const profile = { displayName: 'Synthetic', goal: 'cycle' as const, onboardingCompleted: true, updatedAt: 100, consentToCloudSyncAt: 90, heightCm: 160, weightKg: 60 };
const { consentToCloudSyncAt: _receipt, ...base } = profile;
const note = { localId: 'synthetic-note', kind: 'note' as const, label: 'Original', source: 'manual' as const, occurredAt: 100, updatedAt: 100 };
const emptyBatch = () => ({ programs: [], journalEntries: [], labResults: [], scanResults: [], reminders: [], medicalConditions: [], medications: [], allergyRisks: [], documents: [], chatConversations: [], chatMessages: [], preferences: [] });
async function setup() {
  const t = convexTest(schema, modules);
  const user = await t.run(ctx => ctx.db.insert('users', { email: 'multi-device@example.test' }));
  const a = t.withIdentity({ subject: `${user}|device-a` });
  const b = t.withIdentity({ subject: `${user}|device-b` });
  await a.mutation(api.profile.save, profile);
  await b.mutation(api.profile.save, profile);
  return { t, a, b };
}

test('conflict review is bounded, owned and requires session consent', async () => {
  const { t, a, b } = await setup();
  await a.mutation(api.health.syncBatch, { ...emptyBatch(), journalEntries: [note] });
  const args = { records: [{ entity: 'journalEntries' as const, localId: note.localId }] };
  const rows = await b.query(api.health.conflictRecords, args);
  expect(rows[0].record).toMatchObject({ label: 'Original', syncRevision: 1 });
  expect(rows[0].record).not.toHaveProperty('profileId');
  expect(rows[0].record).not.toHaveProperty('_id');
  await expect(t.query(api.health.conflictRecords, args)).rejects.toThrow();
  await expect(a.query(api.health.conflictRecords, { records: Array(31).fill(args.records[0]) })).rejects.toThrow('SYNC_REVIEW_LIMIT');
  const other = await t.run(ctx => ctx.db.insert('users', { email: 'other-conflict@example.test' }));
  const stranger = t.withIdentity({ subject: `${other}|other-session` });
  await stranger.mutation(api.profile.save, profile);
  expect((await stranger.query(api.health.conflictRecords, args))[0].record).toBeNull();
  await a.mutation(api.profile.revokeCloudSync, {});
  await expect(a.query(api.health.conflictRecords, args)).rejects.toThrow('CLOUD_SYNC_CONSENT_REQUIRED');
});

test('scheduled work loses cloud permission only when all device receipts are revoked', async () => {
  const { t, a, b } = await setup();
  const userId = (await a.query(api.profile.current, {}))!.userId;
  expect(await t.run(ctx => hasAnyCloudConsent(ctx, userId))).toBe(true);
  await a.mutation(api.profile.revokeCloudSync, {});
  expect(await t.run(ctx => hasAnyCloudConsent(ctx, userId))).toBe(true);
  await b.mutation(api.profile.revokeCloudSync, {});
  expect(await t.run(ctx => hasAnyCloudConsent(ctx, userId))).toBe(false);
});

test('client coordinator preserves a rejected batch and sends only the explicitly rebased edit', async () => {
  const { a, b } = await setup();
  await a.mutation(api.health.syncBatch, { ...emptyBatch(), journalEntries: [note] });
  let pending: CloudOutboxRow[] = [{ id: 1, entity: 'journalEntries', payload: { ...note, label: 'Offline edit', updatedAt: 200 } }];
  const run = () => synchronizeMedicalCloud({
    profile: base, consentedAt: profile.consentToCloudSyncAt,
    saveProfile: input => b.mutation(api.profile.save, input),
    loadPendingOutbox: async () => pending,
    pushBatch: batch => b.mutation(api.health.syncBatch, batch as never),
    acknowledge: async (ids, sent, receipts) => {
      expect(receipts?.[0].revision).toBe(2);
      pending = pending.filter(row => !sent.some(item => ids.includes(row.id) && item.payload === row.payload));
    },
  });
  await expect(run()).rejects.toThrow('RECORD_SYNC_CONFLICT');
  expect(pending[0].payload).toMatchObject({ label: 'Offline edit' });
  expect((await a.query(api.health.snapshot, {}))?.journalEntries[0].label).toBe('Original');
  const reviewed = (await b.query(api.health.conflictRecords, { records: [{ entity: 'journalEntries', localId: note.localId }] }))[0].record!;
  pending = [{ ...pending[0], payload: { ...pending[0].payload, syncRevision: reviewed.syncRevision, updatedAt: Date.now() } }];
  await expect(run()).resolves.toBe(1);
  expect(pending).toHaveLength(0);
  expect((await a.query(api.health.snapshot, {}))?.journalEntries[0].label).toBe('Offline edit');
});

test('an upgraded legacy profile resolves explicitly and a later concurrent write conflicts again', async () => {
  const { a, b } = await setup();
  await a.mutation(api.profile.save, { ...profile, heightCm: 170, base });
  await expect(b.mutation(api.profile.save, { ...profile, heightCm: 180, updatedAt: Date.now() })).rejects.toThrow('PROFILE_SYNC_CONFLICT');
  const reviewed = await b.query(api.profile.current, {});
  const { _id, _creationTime, userId, createdAt, consentToCloudSyncAt, ...reviewBase } = reviewed!;
  await b.mutation(api.profile.save, { ...profile, heightCm: 180, updatedAt: Date.now(), base: reviewBase });
  expect((await b.query(api.profile.current, {}))?.heightCm).toBe(180);
  await expect(a.mutation(api.profile.save, { ...profile, heightCm: 190, updatedAt: Date.now(), base: reviewBase })).rejects.toThrow('PROFILE_SYNC_CONFLICT');
});

test('revocation blocks stale receipts from that session but leaves the other device enabled', async () => {
  const { a, b } = await setup();
  await a.mutation(api.profile.revokeCloudSync, {});
  await expect(a.mutation(api.profile.save, profile)).rejects.toThrow('CLOUD_SYNC_CONSENT_REVOKED');
  await b.mutation(api.profile.save, profile);
  await b.mutation(api.health.syncBatch, { ...emptyBatch(), journalEntries: [note] });
  expect((await a.query(api.health.snapshot, {}))?.journalEntries).toHaveLength(0);
  expect((await b.query(api.health.snapshot, {}))?.journalEntries).toHaveLength(1);
});

test('revoked session cannot upload ordinary records or read medical snapshots', async () => {
  const { a, b } = await setup();
  await a.mutation(api.profile.revokeCloudSync, {});
  await expect(a.mutation(api.health.syncBatch, { ...emptyBatch(), journalEntries: [note] })).rejects.toThrow('CLOUD_SYNC_CONSENT_REQUIRED');
  expect((await a.query(api.health.snapshot, {}))?.journalEntries).toHaveLength(0);
});

test('independent offline profile edits merge without losing the other field', async () => {
  const { a, b } = await setup();
  await a.mutation(api.profile.save, { ...profile, heightCm: 170, updatedAt: 110, base });
  await b.mutation(api.profile.save, { ...profile, weightKg: 65, updatedAt: 120, base });
  const current = await a.query(api.profile.current, {});
  expect(current).toMatchObject({ heightCm: 170, weightKg: 65 });
  await expect(b.mutation(api.profile.save, { ...profile, heightCm: 180, updatedAt: 130, base })).rejects.toThrow('PROFILE_SYNC_CONFLICT');
});

test('equal-time profile edits advance a server revision and merge disjoint fields', async () => {
  const { a, b } = await setup();
  await a.mutation(api.profile.save, { ...profile, heightCm: 170, base });
  await b.mutation(api.profile.save, { ...profile, weightKg: 65, base });
  const remote = await a.query(api.profile.current, {});
  expect(remote).toMatchObject({ heightCm: 170, weightKg: 65 });
  // The actual profile merge effect ignores remote.updatedAt <= local.updatedAt.
  expect(remote!.updatedAt).toBeGreaterThan(profile.updatedAt);
});

test('future-clock writes are rejected before they can poison normal writes', async () => {
  const { a, b } = await setup();
  const now = Date.now();
  await expect(a.mutation(api.health.syncBatch, { ...emptyBatch(), journalEntries: [{ ...note, label: 'Future clock', updatedAt: now + 86_400_000 }] })).rejects.toThrow('SYNC_CLOCK_INVALID');
  await b.mutation(api.health.syncBatch, { ...emptyBatch(), journalEntries: [{ ...note, label: 'Later real edit', updatedAt: now + 1000 }] });
  expect((await a.query(api.health.snapshot, {}))?.journalEntries[0]?.label).toBe('Later real edit');
});

test('a delayed older edit of a deleted journal record stays pending for review', async () => {
  const { a, b } = await setup();
  await a.mutation(api.health.syncBatch, { ...emptyBatch(), journalEntries: [{ ...note, deletedAt: 120, updatedAt: 120 }] });
  await expect(b.mutation(api.health.syncBatch, { ...emptyBatch(), journalEntries: [{ ...note, label: 'Offline', updatedAt: 110 }] })).rejects.toThrow('RECORD_DELETED_REMOTELY');
  expect((await a.query(api.health.snapshot, {}))?.journalEntries[0]).toMatchObject({ deletedAt: 120, label: 'Original' });
});

test('newer offline edit of a deleted record produces an explicit conflict', async () => {
  const { a, b } = await setup();
  await a.mutation(api.health.syncBatch, { ...emptyBatch(), journalEntries: [{ ...note, deletedAt: 120, updatedAt: 120 }] });
  await expect(b.mutation(api.health.syncBatch, { ...emptyBatch(), journalEntries: [{ ...note, label: 'Offline', updatedAt: 130 }] })).rejects.toThrow('RECORD_DELETED_REMOTELY');
  expect((await a.query(api.health.snapshot, {}))?.journalEntries[0]).toMatchObject({ deletedAt: 120, updatedAt: 120, label: 'Original' });
});

test('bounded history pagination restores records outside the initial 200-row snapshot', async () => {
  const { a } = await setup();
  for (let start = 0; start < 201; start += 50) {
    const entries = Array.from({ length: Math.min(50, 201 - start) }, (_, i) => ({ ...note, localId: `synthetic-${start + i}`, occurredAt: start + i }));
    await a.mutation(api.health.syncBatch, { ...emptyBatch(), journalEntries: entries });
  }
  expect((await a.query(api.health.snapshot, {}))?.journalEntries).toHaveLength(200);
  const ids = new Set<string>();
  let cursor: string | null = null;
  for (;;) {
    const page: { page: { localId: string }[]; isDone: boolean; continueCursor: string } = await a.query(api.health.historyPage, { entity: 'journalEntries', paginationOpts: { cursor, numItems: 100 } });
    expect(page.page.length).toBeLessThanOrEqual(100);
    for (const row of page.page) ids.add(row.localId);
    if (page.isDone) break;
    cursor = page.continueCursor;
  }
  expect(ids.size).toBe(201);
});

test('PASS: guest and another account cannot read the shared account snapshot', async () => {
  const { t, a } = await setup();
  await a.mutation(api.health.syncBatch, { ...emptyBatch(), journalEntries: [note] });
  await expect(t.query(api.health.snapshot, {})).rejects.toThrow();
  const other = await t.run(ctx => ctx.db.insert('users', { email: 'other@example.test' }));
  const c = t.withIdentity({ subject: `${other}|device-c` });
  await c.mutation(api.profile.save, profile);
  expect((await c.query(api.health.snapshot, {}))?.journalEntries).toHaveLength(0);
  expect((await c.query(api.health.historyPage, { entity: 'journalEntries', paginationOpts: { cursor: null, numItems: 100 } })).page).toHaveLength(0);
});

test('record revisions reject a newer timestamp based on an obsolete device copy', async () => {
  const { a, b } = await setup();
  const first = await a.mutation(api.health.syncBatch, { ...emptyBatch(), journalEntries: [note] });
  expect(first.syncRevisions[0].revision).toBe(1);
  const repeat = await a.mutation(api.health.syncBatch, { ...emptyBatch(), journalEntries: [note] });
  expect(repeat.syncRevisions[0].revision).toBe(1);
  await a.mutation(api.health.syncBatch, { ...emptyBatch(), journalEntries: [{ ...note, syncRevision: 1, label: 'Device A', updatedAt: 110 }] });
  await expect(b.mutation(api.health.syncBatch, { ...emptyBatch(), journalEntries: [{ ...note, syncRevision: 1, label: 'Device B', updatedAt: 120 }] })).rejects.toThrow('RECORD_SYNC_CONFLICT');
  expect((await a.query(api.health.snapshot, {}))?.journalEntries[0]?.label).toBe('Device A');
});

test('explicit fresh consent on the revoked device works; old receipts still fail', async () => {
  const { a } = await setup();
  await a.mutation(api.profile.revokeCloudSync, {});
  const revoked = (await a.query(api.profile.viewer, {})).cloudSyncRevokedAt!;
  await a.mutation(api.profile.save, { ...profile, consentToCloudSyncAt: revoked + 1 });
  await a.mutation(api.health.syncBatch, { ...emptyBatch(), journalEntries: [note] });
  expect((await a.query(api.health.snapshot, {}))?.journalEntries).toHaveLength(1);
  await expect(a.mutation(api.profile.save, profile)).rejects.toThrow('CLOUD_SYNC_CONSENT_REVOKED');
});

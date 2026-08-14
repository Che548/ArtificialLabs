import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';

import { api, internal } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

const emptyBatch = () => ({
  programs: [],
  journalEntries: [],
  labResults: [],
  scanResults: [],
  reminders: [],
  medicalConditions: [],
  medications: [],
  allergyRisks: [],
  documents: [],
  chatConversations: [],
  chatMessages: [],
  preferences: [],
});

async function createUser(
  t: ReturnType<typeof convexTest>,
  email: string,
) {
  const userId = await t.run((ctx) => ctx.db.insert('users', { email }));
  const client = t.withIdentity({ subject: `${userId}|test-session`, email });
  await client.mutation(api.profile.save, {
    displayName: email,
    goal: 'planning',
    onboardingCompleted: true,
    updatedAt: 1,
  });
  return { userId, client };
}

describe('health ownership and sync', () => {
  test('isolates complete CRUD snapshots between users', async () => {
    const t = convexTest(schema, modules);
    const alice = await createUser(t, 'alice@example.test');
    const bob = await createUser(t, 'bob@example.test');

    await alice.client.mutation(api.health.syncBatch, {
      ...emptyBatch(),
      programs: [{
        localId: 'program-1',
        type: 'planning',
        title: 'Подготовка',
        status: 'active',
        startedAt: 10,
        updatedAt: 10,
      }],
      journalEntries: [{
        localId: 'journal-1',
        occurredAt: 10,
        kind: 'note',
        label: 'Запись',
        source: 'manual',
        updatedAt: 10,
      }],
      labResults: [{
        localId: 'lab-1',
        catalogKey: 'blood',
        title: 'Анализ',
        collectedAt: 10,
        status: 'unreviewed',
        analytes: [],
        hasLocalSourceDocument: true,
        updatedAt: 10,
      }],
      scanResults: [{
        localId: 'scan-1',
        testSystemKey: 'strip',
        capturedAt: 10,
        confirmedValue: 'negative',
        resultSource: 'stripcv',
        confidence: 0.9,
        qualityFlags: [],
        algorithmVersion: 'stripcv-0.3.1',
        analysisStatus: 'valid',
        confirmedByUser: true,
        hasLocalImage: true,
        updatedAt: 10,
      }],
      reminders: [{
        localId: 'reminder-1',
        type: 'journal',
        title: 'Дневник',
        body: 'Заполнить',
        dueAt: 10,
        updatedAt: 10,
      }],
      medicalConditions: [{
        localId: 'condition-1',
        title: 'Состояние',
        status: 'active',
        updatedAt: 10,
      }],
      medications: [{
        localId: 'medication-1',
        name: 'Препарат',
        active: true,
        updatedAt: 10,
      }],
      allergyRisks: [{
        localId: 'allergy-1',
        allergen: 'Аллерген',
        severity: 'unknown',
        updatedAt: 10,
      }],
      documents: [{
        localId: 'document-1',
        title: 'Заключение',
        category: 'medical',
        documentDate: 10,
        hasLocalFile: true,
        updatedAt: 10,
      }],
      chatConversations: [{
        localId: 'conversation-1',
        title: 'Чат',
        createdAt: 10,
        lastMessageAt: 10,
        updatedAt: 10,
      }],
      chatMessages: [{
        localId: 'message-1',
        conversationLocalId: 'conversation-1',
        role: 'assistant',
        source: 'demo',
        text: 'Демонстрационный ответ',
        sentAt: 10,
        attachments: [{
          localId: 'attachment-1',
          kind: 'document',
          name: 'local.pdf',
          availableLocally: true,
        }],
        updatedAt: 10,
      }],
      preferences: [{
        localId: 'preferences',
        notificationsEnabled: false,
        journalNotifications: false,
        resultNotifications: false,
        anonymousAnalytics: false,
        medicalRecommendations: false,
        language: 'ru',
        region: 'RU',
        updatedAt: 10,
      }],
    });

    const aliceSnapshot = await alice.client.query(api.health.snapshot, {});
    for (const [key, rows] of Object.entries(aliceSnapshot)) {
      if (key !== 'profile') expect(rows).toHaveLength(1);
    }

    const bobSnapshot = await bob.client.query(api.health.snapshot, {});
    for (const [key, rows] of Object.entries(bobSnapshot)) {
      if (key !== 'profile') expect(rows).toHaveLength(0);
    }
  });

  test('uses updatedAt for conflicts and propagates tombstones', async () => {
    const t = convexTest(schema, modules);
    const { client } = await createUser(t, 'conflict@example.test');
    const medication = {
      localId: 'medication-1',
      name: 'Новая версия',
      active: true,
      updatedAt: 20,
    } as const;
    await client.mutation(api.health.syncBatch, {
      ...emptyBatch(),
      medications: [medication],
    });
    await client.mutation(api.health.syncBatch, {
      ...emptyBatch(),
      medications: [{ ...medication, name: 'Старая версия', updatedAt: 10 }],
    });
    let snapshot = await client.query(api.health.snapshot, {});
    expect(snapshot.medications[0]?.name).toBe('Новая версия');

    await client.mutation(api.health.syncBatch, {
      ...emptyBatch(),
      medications: [{ ...medication, deletedAt: 30, updatedAt: 30 }],
    });
    snapshot = await client.query(api.health.snapshot, {});
    expect(snapshot.medications[0]?.deletedAt).toBe(30);
  });

  test('blocks deleted accounts, restores them, then purges after deadline', async () => {
    const t = convexTest(schema, modules);
    const { userId, client } = await createUser(t, 'delete@example.test');
    const requested = await client.mutation(api.account.requestDeletion, {});
    await expect(client.query(api.health.snapshot, {})).rejects.toThrow(
      'ACCOUNT_PENDING_DELETION',
    );
    expect((await client.query(api.account.status, {})).pendingDeletion).toBe(true);

    await client.mutation(api.account.restore, {});
    await expect(client.query(api.health.snapshot, {})).resolves.toBeDefined();
    const requestedAgain = await client.mutation(api.account.requestDeletion, {});
    await t.mutation(internal.account.purgeExpired, {
      now: requestedAgain.scheduledDeletionAt + 1,
    });
    expect(await t.run((ctx) => ctx.db.get(userId))).toBeNull();
    expect(requested.scheduledDeletionAt - requested.deletionRequestedAt).toBe(
      30 * 24 * 60 * 60 * 1000,
    );
  });

  test('rejects unauthenticated reads and writes', async () => {
    const t = convexTest(schema, modules);
    await expect(t.query(api.health.snapshot, {})).rejects.toThrow(
      'UNAUTHENTICATED',
    );
    await expect(
      t.mutation(api.health.syncBatch, emptyBatch()),
    ).rejects.toThrow('UNAUTHENTICATED');
  });
});

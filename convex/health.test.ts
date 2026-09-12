import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';

import { api, internal } from './_generated/api';
import schema from './schema';
import { reconcileCarePlan } from '../lib/care-plan';
import { createEmptySnapshot } from '../lib/health-types';

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

async function createUser(t: ReturnType<typeof convexTest>, email: string) {
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
  test('plan reminders converge after disable, enable and cloud round trips', async () => {
    const t = convexTest(schema, modules);
    const { client } = await createUser(t, 'plan-sync@example.test');
    const now = Date.UTC(2026, 8, 12);
    const snapshot = createEmptySnapshot();
    snapshot.profile = {
      displayName: 'Synthetic',
      goal: 'cycle',
      onboardingCompleted: true,
      updatedAt: 1,
    };
    snapshot.preferences = [
      {
        localId: 'preferences',
        medicalRecommendations: true,
        updatedAt: 1,
        notificationsEnabled: false,
        journalNotifications: false,
        resultNotifications: false,
        notificationTone: 'formal',
        anonymousAnalytics: false,
        language: 'ru',
        region: 'RU',
      },
    ];
    snapshot.carePlanItems = [
      {
        localId: 'synthetic-plan',
        catalogKey: 'catalog-13b9fcd436cb',
        title: 'Synthetic',
        category: 'test',
        description: '',
        status: 'upcoming',
        riskTier: 'low',
        dueAt: now + 90 * 86400000,
        scheduleBasis: 'user',
        confidence: 1,
        provisional: false,
        requiresClinician: true,
        evidenceRefs: [],
        rationale: '',
        policyVersion: 'test',
        catalogVersion: 'test',
        updatedAt: 1,
      },
    ];
    const syncReminders = async (at: number) => {
      const changes = reconcileCarePlan(snapshot, at).reminders;
      await client.mutation(api.health.syncBatch, {
        ...emptyBatch(),
        reminders: changes,
      });
      snapshot.reminders = (await client.query(
        api.health.snapshot,
        {},
      ))!.reminders.map(
        ({ _id, _creationTime, profileId, ...record }) => record,
      );
      return changes;
    };
    expect(await syncReminders(now)).toHaveLength(1);
    for (let cycle = 1; cycle <= 2; cycle++) {
      snapshot.preferences[0].medicalRecommendations = false;
      expect(await syncReminders(now + cycle * 1000)).toHaveLength(1);
      expect(snapshot.reminders[0].deletedAt).toBeDefined();
      snapshot.preferences[0].medicalRecommendations = true;
      expect(await syncReminders(now + cycle * 1000 + 100)).toHaveLength(1);
      expect(snapshot.reminders[0].deletedAt).toBeUndefined();
      expect(snapshot.reminders).toHaveLength(1);
      expect(await syncReminders(now + cycle * 1000 + 200)).toHaveLength(0);
    }
  });

  test('stale or duplicate plan reminder writes cannot undo newer deletion', async () => {
    const t = convexTest(schema, modules);
    const alice = await createUser(t, 'reminder-alice@example.test');
    const bob = await createUser(t, 'reminder-bob@example.test');
    const reminder = {
      localId: 'agent-prep_test',
      type: 'checkup' as const,
      title: 'Synthetic',
      body: '',
      dueAt: 100,
      updatedAt: 10,
    };
    await alice.client.mutation(api.health.syncBatch, {
      ...emptyBatch(),
      reminders: [{ ...reminder, deletedAt: 20, updatedAt: 20 }],
    });
    for (const updatedAt of [10, 20]) {
      await alice.client.mutation(api.health.syncBatch, {
        ...emptyBatch(),
        reminders: [{ ...reminder, updatedAt }],
      });
      expect(
        (await alice.client.query(api.health.snapshot, {}))!.reminders[0]
          .deletedAt,
      ).toBe(20);
    }
    await bob.client.mutation(api.health.syncBatch, {
      ...emptyBatch(),
      reminders: [{ ...reminder, updatedAt: 30 }],
    });
    expect(
      (await alice.client.query(api.health.snapshot, {}))!.reminders[0]
        .deletedAt,
    ).toBe(20);
    await alice.client.mutation(api.health.syncBatch, {
      ...emptyBatch(),
      reminders: [{ ...reminder, updatedAt: 30 }],
    });
    expect(
      (await alice.client.query(api.health.snapshot, {}))!.reminders[0]
        .deletedAt,
    ).toBeUndefined();
  });

  test('isolates complete CRUD snapshots between users', async () => {
    const t = convexTest(schema, modules);
    const alice = await createUser(t, 'alice@example.test');
    const bob = await createUser(t, 'bob@example.test');

    await alice.client.mutation(api.health.syncBatch, {
      ...emptyBatch(),
      programs: [
        {
          localId: 'program-1',
          type: 'planning',
          title: 'Подготовка',
          status: 'active',
          startedAt: 10,
          updatedAt: 10,
        },
      ],
      journalEntries: [
        {
          localId: 'journal-1',
          occurredAt: 10,
          kind: 'note',
          label: 'Запись',
          source: 'manual',
          updatedAt: 10,
        },
      ],
      labResults: [
        {
          localId: 'lab-1',
          catalogKey: 'blood',
          title: 'Анализ',
          collectedAt: 10,
          status: 'unreviewed',
          analytes: [],
          hasLocalSourceDocument: true,
          updatedAt: 10,
        },
      ],
      scanResults: [
        {
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
        },
      ],
      reminders: [
        {
          localId: 'reminder-1',
          type: 'journal',
          title: 'Дневник',
          body: 'Заполнить',
          dueAt: 10,
          updatedAt: 10,
        },
      ],
      medicalConditions: [
        {
          localId: 'condition-1',
          title: 'Состояние',
          status: 'active',
          updatedAt: 10,
        },
      ],
      medications: [
        {
          localId: 'medication-1',
          name: 'Препарат',
          active: true,
          updatedAt: 10,
        },
      ],
      allergyRisks: [
        {
          localId: 'allergy-1',
          allergen: 'Аллерген',
          severity: 'unknown',
          updatedAt: 10,
        },
      ],
      documents: [
        {
          localId: 'document-1',
          title: 'Заключение',
          category: 'medical',
          documentDate: 10,
          hasLocalFile: true,
          updatedAt: 10,
        },
      ],
      chatConversations: [
        {
          localId: 'conversation-1',
          title: 'Чат',
          createdAt: 10,
          lastMessageAt: 10,
          updatedAt: 10,
        },
      ],
      chatMessages: [
        {
          localId: 'message-1',
          conversationLocalId: 'conversation-1',
          role: 'assistant',
          source: 'demo',
          text: 'Демонстрационный ответ',
          sentAt: 10,
          attachments: [
            {
              localId: 'attachment-1',
              kind: 'document',
              name: 'local.pdf',
              availableLocally: true,
            },
          ],
          updatedAt: 10,
        },
      ],
      preferences: [
        {
          localId: 'preferences',
          notificationsEnabled: false,
          journalNotifications: false,
          resultNotifications: false,
          anonymousAnalytics: false,
          medicalRecommendations: false,
          language: 'ru',
          region: 'RU',
          updatedAt: 10,
        },
      ],
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

  test('accepts both legacy demo messages and model generation metadata', async () => {
    const t = convexTest(schema, modules);
    const { client } = await createUser(t, 'chat-schema@example.test');
    await client.mutation(api.health.syncBatch, {
      ...emptyBatch(),
      chatMessages: [
        {
          localId: 'legacy-demo',
          conversationLocalId: 'conversation-1',
          role: 'assistant',
          source: 'demo',
          text: 'Старый ответ',
          sentAt: 1,
          attachments: [],
          updatedAt: 1,
        },
        {
          localId: 'model-response',
          conversationLocalId: 'conversation-1',
          role: 'assistant',
          source: 'model',
          text: 'Новый ответ',
          sentAt: 2,
          generation: {
            provider: 'yandex-ai-studio',
            model: 'deepseek-v4-flash/latest',
            responseId: 'response-1',
            inputTokens: 10,
            outputTokens: 5,
            totalTokens: 15,
            durationMs: 30,
            truncated: false,
          },
          attachments: [],
          updatedAt: 2,
        },
      ],
    });

    const snapshot = await client.query(api.health.snapshot, {});
    expect(snapshot.chatMessages).toHaveLength(2);
    expect(
      snapshot.chatMessages.find((message) => message.localId === 'legacy-demo')
        ?.source,
    ).toBe('demo');
    expect(
      snapshot.chatMessages.find(
        (message) => message.localId === 'model-response',
      )?.generation?.totalTokens,
    ).toBe(15);
  });

  test('does not let a stale device overwrite a newer profile', async () => {
    const t = convexTest(schema, modules);
    const { client } = await createUser(t, 'profile-conflict@example.test');
    await client.mutation(api.profile.save, {
      displayName: 'Новый профиль',
      goal: 'pregnancy',
      onboardingCompleted: true,
      updatedAt: 200,
    });
    await client.mutation(api.profile.save, {
      displayName: 'Старый профиль',
      goal: 'cycle',
      onboardingCompleted: true,
      consentToCloudSyncAt: 250,
      updatedAt: 100,
    });

    const viewer = await client.query(api.profile.viewer, {});
    expect(viewer.profile?.displayName).toBe('Новый профиль');
    expect(viewer.profile?.goal).toBe('pregnancy');
    expect(viewer.profile?.updatedAt).toBe(200);
    expect(viewer.profile?.consentToCloudSyncAt).toBe(250);
  });

  test('blocks deleted accounts, restores them, then purges after deadline', async () => {
    const t = convexTest(schema, modules);
    const { userId, client } = await createUser(t, 'delete@example.test');
    const requested = await client.mutation(api.account.requestDeletion, {});
    await expect(client.query(api.health.snapshot, {})).rejects.toThrow(
      'ACCOUNT_PENDING_DELETION',
    );
    expect((await client.query(api.account.status, {})).pendingDeletion).toBe(
      true,
    );

    await client.mutation(api.account.restore, {});
    await expect(client.query(api.health.snapshot, {})).resolves.toBeDefined();
    const requestedAgain = await client.mutation(
      api.account.requestDeletion,
      {},
    );
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

  test('purges only explicitly named E2E accounts', async () => {
    const t = convexTest(schema, modules);
    const e2e = await createUser(t, 'artificiallabs-e2e+12345678@example.test');
    const ordinary = await createUser(t, 'ordinary@example.test');

    await expect(
      t.mutation(internal.testing.purgeE2EAccount, {
        email: 'ordinary@example.test',
      }),
    ).rejects.toThrow('E2E_EMAIL_REQUIRED');
    await t.mutation(internal.testing.purgeE2EAccount, {
      email: 'artificiallabs-e2e+12345678@example.test',
    });

    expect(await t.run((ctx) => ctx.db.get(e2e.userId))).toBeNull();
    expect(await t.run((ctx) => ctx.db.get(ordinary.userId))).not.toBeNull();
  });
});
test('trigger immutability survives transport object-key ordering', async () => {
  const { reconcileCarePlan, isAllowedAgentTriggerMutation } = await import('../lib/care-plan');
  const { createEmptySnapshot } = await import('../lib/health-types');
  const snapshot = createEmptySnapshot();
  snapshot.profile = { displayName: 'Synthetic QA', goal: 'cycle', onboardingCompleted: true, updatedAt: Date.now() };
  snapshot.preferences = [{ localId: 'preferences', medicalRecommendations: true, updatedAt: Date.now(), notificationsEnabled: false, journalNotifications: false, resultNotifications: false, notificationTone: 'formal', anonymousAnalytics: false, language: 'ru', region: 'RU' }];
  const original = reconcileCarePlan(snapshot).triggers[0];
  expect(original).toBeDefined();
  const reordered = JSON.parse(JSON.stringify(original, (_key, value) =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)))
      : value));
  expect(isAllowedAgentTriggerMutation(original, reordered)).toBe(true);
  expect(isAllowedAgentTriggerMutation(original, { ...reordered, maxRuns: original.maxRuns + 1 })).toBe(false);
  expect(isAllowedAgentTriggerMutation(original, { ...reordered, conditions: [{ ...reordered.conditions[0], value: false }] })).toBe(false);
  expect(isAllowedAgentTriggerMutation(original, { ...reordered, evidenceRefs: [{ ...reordered.evidenceRefs[0], localId: 'different' }] })).toBe(false);
});

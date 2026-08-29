import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

import { ConvexHttpClient } from 'convex/browser';

import { api, internal } from '../../convex/_generated/api';

const backendUrl =
  process.env.CONVEX_SELF_HOSTED_URL ?? process.env.EXPO_PUBLIC_CONVEX_URL;
const adminKey = process.env.CONVEX_SELF_HOSTED_ADMIN_KEY;
const reportDir = process.env.E2E_REPORT_DIR ?? 'output/e2e';

if (!backendUrl) throw new Error('CONVEX_SELF_HOSTED_URL is required');
if (!adminKey) throw new Error('CONVEX_SELF_HOSTED_ADMIN_KEY is required');

const runId = (process.env.E2E_RUN_ID ?? randomUUID())
  .toLowerCase()
  .replace(/[^a-z0-9-]/g, '-')
  .slice(0, 60);
const password = `E2e!${randomUUID()}aA1`;
const emails = [
  `artificiallabs-e2e+${runId}-a@example.test`,
  `artificiallabs-e2e+${runId}-b@example.test`,
] as const;

type Step = {
  name: string;
  durationMs: number;
  status: 'passed' | 'failed';
  error?: string;
};
const steps: Step[] = [];

async function step(name: string, task: () => Promise<void>) {
  const startedAt = Date.now();
  try {
    await task();
    steps.push({ name, durationMs: Date.now() - startedAt, status: 'passed' });
  } catch (error) {
    steps.push({
      name,
      durationMs: Date.now() - startedAt,
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

async function authenticatedClient(email: string, flow: 'signUp' | 'signIn') {
  const client = new ConvexHttpClient(backendUrl!);
  const result = await client.action(api.auth.signIn, {
    provider: 'password',
    params: { email, password, flow },
  });
  assert(
    result.tokens?.token,
    `Password ${flow} did not return an access token`,
  );
  client.setAuth(result.tokens.token);
  return client;
}

function emptyBatch() {
  return {
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
  };
}

function fullBatch(now: number) {
  return {
    ...emptyBatch(),
    programs: [
      {
        localId: `${runId}-program`,
        type: 'planning' as const,
        title: 'E2E программа',
        status: 'active' as const,
        startedAt: now,
        updatedAt: now,
      },
    ],
    journalEntries: [
      {
        localId: `${runId}-journal`,
        occurredAt: now,
        kind: 'note' as const,
        label: 'E2E журнал',
        textValue: 'cross-client',
        source: 'manual' as const,
        updatedAt: now,
      },
    ],
    labResults: [
      {
        localId: `${runId}-lab`,
        catalogKey: 'e2e-blood',
        title: 'E2E анализ',
        collectedAt: now,
        status: 'unreviewed' as const,
        analytes: [{ name: 'hCG', value: '10', unit: 'mIU/mL' }],
        hasLocalSourceDocument: true,
        updatedAt: now,
      },
    ],
    scanResults: [
      {
        localId: `${runId}-scan`,
        testSystemKey: 'e2e-strip',
        capturedAt: now,
        confirmedValue: 'negative' as const,
        resultSource: 'stripcv' as const,
        confidence: 0.91,
        qualityFlags: [],
        algorithmVersion: 'stripcv-0.3.1',
        analysisStatus: 'valid' as const,
        signalRatio: 0.42,
        confirmedByUser: true,
        hasLocalImage: true,
        updatedAt: now,
      },
    ],
    reminders: [
      {
        localId: `${runId}-reminder`,
        type: 'journal' as const,
        title: 'E2E напоминание',
        body: 'Проверить журнал',
        dueAt: now,
        updatedAt: now,
      },
    ],
    medicalConditions: [
      {
        localId: `${runId}-condition`,
        title: 'E2E состояние',
        status: 'active' as const,
        diagnosedAt: now,
        notes: 'test',
        updatedAt: now,
      },
    ],
    medications: [
      {
        localId: `${runId}-medication`,
        name: 'E2E препарат',
        dosage: '1',
        frequency: 'daily',
        active: true,
        updatedAt: now,
      },
    ],
    allergyRisks: [
      {
        localId: `${runId}-allergy`,
        allergen: 'E2E аллерген',
        severity: 'mild' as const,
        reaction: 'test',
        updatedAt: now,
      },
    ],
    documents: [
      {
        localId: `${runId}-document`,
        title: 'E2E документ',
        category: 'medical' as const,
        documentDate: now,
        hasLocalFile: true,
        mimeType: 'application/pdf',
        size: 128,
        updatedAt: now,
      },
    ],
    chatConversations: [
      {
        localId: `${runId}-conversation`,
        title: 'E2E чат',
        createdAt: now,
        lastMessageAt: now,
        updatedAt: now,
      },
    ],
    chatMessages: [
      {
        localId: `${runId}-message`,
        conversationLocalId: `${runId}-conversation`,
        role: 'assistant' as const,
        source: 'demo' as const,
        text: 'E2E demo response',
        sentAt: now,
        attachments: [
          {
            localId: `${runId}-attachment`,
            kind: 'document' as const,
            name: 'fixture.pdf',
            mimeType: 'application/pdf',
            size: 128,
            availableLocally: false,
          },
        ],
        updatedAt: now,
      },
    ],
    preferences: [
      {
        localId: 'preferences' as const,
        notificationsEnabled: false,
        journalNotifications: false,
        resultNotifications: false,
        notificationTone: 'formal' as const,
        anonymousAnalytics: false,
        medicalRecommendations: false,
        language: 'ru' as const,
        region: 'RU',
        updatedAt: now,
      },
    ],
  };
}

async function cleanup() {
  const admin = new ConvexHttpClient(backendUrl!);
  (admin as unknown as { setAdminAuth: (token: string) => void }).setAdminAuth(
    adminKey!,
  );
  const adminMutation = admin.mutation.bind(admin) as unknown as (
    reference: unknown,
    args: { email: string },
  ) => Promise<unknown>;
  for (const email of emails) {
    await adminMutation(internal.testing.purgeE2EAccount, { email });
  }
}

async function invalidateE2ESessions(email: string) {
  const admin = new ConvexHttpClient(backendUrl!);
  (admin as unknown as { setAdminAuth: (token: string) => void }).setAdminAuth(
    adminKey!,
  );
  const adminMutation = admin.mutation.bind(admin) as unknown as (
    reference: unknown,
    args: { email: string },
  ) => Promise<{ invalidated: number }>;
  return await adminMutation(internal.testing.invalidateE2ESessions, { email });
}

async function main() {
  const startedAt = Date.now();
  let failure: unknown;

  try {
    let alice!: ConvexHttpClient;
    let bob!: ConvexHttpClient;
    const now = Date.now();
    const batch = fullBatch(now);

    await step('unauthenticated access is rejected', async () => {
      const client = new ConvexHttpClient(backendUrl);
      await assert.rejects(
        client.query(api.health.snapshot, {}),
        /UNAUTHENTICATED/,
      );
    });

    await step('password signup and signin', async () => {
      alice = await authenticatedClient(emails[0], 'signUp');
      bob = await authenticatedClient(emails[1], 'signUp');
      await authenticatedClient(emails[0], 'signIn');
    });

    await step('profiles are owned and initialized', async () => {
      await alice.mutation(api.profile.save, {
        displayName: 'E2E Alice',
        goal: 'planning',
        onboardingCompleted: true,
        updatedAt: now,
      });
      await bob.mutation(api.profile.save, {
        displayName: 'E2E Bob',
        goal: 'cycle',
        onboardingCompleted: true,
        updatedAt: now,
      });
    });

    await step(
      'server session revocation blocks refresh and requires login after token expiry',
      async () => {
        const expiringClient = new ConvexHttpClient(backendUrl!);
        const signInResult = await expiringClient.action(api.auth.signIn, {
          provider: 'password',
          params: { email: emails[0], password, flow: 'signIn' },
        });
        assert(signInResult.tokens?.token);
        assert(signInResult.tokens.refreshToken);
        expiringClient.setAuth(signInResult.tokens.token);
        const result = await invalidateE2ESessions(emails[0]);
        assert(result.invalidated > 0, 'No E2E session was invalidated');

        // Convex Auth access JWTs remain valid until their short expiry.
        await expiringClient.query(api.health.snapshot, {});
        const refreshResult = await expiringClient.action(api.auth.signIn, {
          refreshToken: signInResult.tokens.refreshToken,
        });
        assert.equal(refreshResult.tokens, null);
        alice = await authenticatedClient(emails[0], 'signIn');
      },
    );

    await step('all structured entities sync', async () => {
      const accepted = await alice.mutation(api.health.syncBatch, batch);
      assert.equal(accepted.accepted, 12);
      const snapshot = await alice.query(api.health.snapshot, {});
      for (const [key, rows] of Object.entries(snapshot)) {
        if (key !== 'profile') {
          assert(Array.isArray(rows), key);
          assert.equal(rows.length, 1, key);
        }
      }
    });

    await step('ownership isolates a second user', async () => {
      const snapshot = await bob.query(api.health.snapshot, {});
      for (const [key, rows] of Object.entries(snapshot)) {
        if (key !== 'profile') {
          assert(Array.isArray(rows), key);
          assert.equal(rows.length, 0, key);
        }
      }
    });

    await step('replay is idempotent', async () => {
      await alice.mutation(api.health.syncBatch, batch);
      const snapshot = await alice.query(api.health.snapshot, {});
      assert.equal(snapshot.medications.length, 1);
      assert.equal(snapshot.chatMessages.length, 1);
    });

    await step(
      'push component is owner-scoped and safe without a token',
      async () => {
        const status = await alice.query(api.notifications.status, {});
        assert.deepEqual(status, { hasToken: false, paused: false });
        assert.deepEqual(
          await alice.mutation(api.notifications.sendTest, { tone: 'cute' }),
          { queued: false },
        );
        await assert.rejects(
          alice.mutation(api.notifications.registerToken, {
            pushToken: 'not-a-token',
          }),
          /INVALID_EXPO_PUSH_TOKEN/,
        );
      },
    );

    await step('updatedAt conflict and tombstone converge', async () => {
      await alice.mutation(api.health.syncBatch, {
        ...emptyBatch(),
        medications: [
          { ...batch.medications[0], name: 'stale', updatedAt: now - 1 },
        ],
      });
      let snapshot = await alice.query(api.health.snapshot, {});
      assert.equal(snapshot.medications[0]?.name, 'E2E препарат');
      await alice.mutation(api.health.syncBatch, {
        ...emptyBatch(),
        medications: [
          { ...batch.medications[0], deletedAt: now + 2, updatedAt: now + 2 },
        ],
      });
      snapshot = await alice.query(api.health.snapshot, {});
      assert.equal(snapshot.medications[0]?.deletedAt, now + 2);
    });

    await step('device-only URI fields are rejected and absent', async () => {
      await assert.rejects(
        alice.mutation(api.health.syncBatch, {
          ...emptyBatch(),
          scanResults: [
            {
              ...batch.scanResults[0],
              localImageUri: 'file:///private/e2e.png',
            },
          ],
        } as never),
        /Object contains extra field|localImageUri/,
      );
      const snapshot = await alice.query(api.health.snapshot, {});
      const serialized = JSON.stringify(snapshot);
      assert.equal(serialized.includes('file:///'), false);
      assert.equal(
        snapshot.chatMessages[0]?.attachments[0]?.availableLocally,
        false,
      );
    });

    await step(
      'account deletion blocks data and restore recovers it',
      async () => {
        await alice.mutation(api.account.requestDeletion, {});
        await assert.rejects(
          alice.query(api.health.snapshot, {}),
          /ACCOUNT_PENDING_DELETION/,
        );
        assert.equal(
          (await alice.query(api.account.status, {})).pendingDeletion,
          true,
        );
        assert.equal(
          (await alice.mutation(api.account.restore, {})).restored,
          true,
        );
        await alice.query(api.health.snapshot, {});
      },
    );
  } catch (error) {
    failure = error;
  } finally {
    try {
      await step('exact E2E account cleanup', cleanup);
    } catch (cleanupError) {
      failure ??= cleanupError;
    }
    await mkdir(reportDir, { recursive: true });
    await writeFile(
      `${reportDir}/backend-${runId}.json`,
      JSON.stringify(
        {
          runId,
          backendUrl,
          startedAt,
          durationMs: Date.now() - startedAt,
          status: failure ? 'failed' : 'passed',
          steps,
        },
        null,
        2,
      ),
    );
  }

  if (failure) throw failure;
  console.log(`Live backend E2E passed (${runId})`);
}

void main();

import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

import { ConvexHttpClient } from 'convex/browser';

import { api, internal } from '../../convex/_generated/api';

const command = process.argv[2];
const backendUrl =
  process.env.CONVEX_SELF_HOSTED_URL ?? process.env.EXPO_PUBLIC_CONVEX_URL;
const adminKey = process.env.CONVEX_SELF_HOSTED_ADMIN_KEY;
const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;
const reportDir = process.env.E2E_REPORT_DIR ?? 'output/e2e';
const snapshotTimeoutMs = Number(process.env.E2E_SNAPSHOT_TIMEOUT_MS ?? 30_000);

if (!backendUrl) throw new Error('CONVEX_SELF_HOSTED_URL is required');
if (!email || !password) throw new Error('E2E_EMAIL and E2E_PASSWORD are required');

async function userClient() {
  const client = new ConvexHttpClient(backendUrl!);
  const result = await client.action(api.auth.signIn, {
    provider: 'password',
    params: { email, password, flow: 'signIn' },
  });
  assert(result.tokens?.token, 'E2E account sign in failed');
  client.setAuth(result.tokens.token);
  return client;
}

async function snapshot() {
  const client = await userClient();
  const deadline = Date.now() + snapshotTimeoutMs;
  let viewer: Awaited<ReturnType<typeof client.query<typeof api.profile.viewer>>>;
  let health: Awaited<ReturnType<typeof client.query<typeof api.health.snapshot>>>;
  let lastError: unknown;
  for (;;) {
    try {
      viewer = await client.query(api.profile.viewer, {});
      assert(viewer.profile?.onboardingCompleted, 'Cloud profile is incomplete');
      health = await client.query(api.health.snapshot, {});
      assert(health.programs.length >= 1, 'No monitoring program reached Convex');
      assert(health.reminders.length >= 1, 'No reminder reached Convex');
      break;
    } catch (error) {
      lastError = error;
      if (Date.now() >= deadline) {
        throw new Error(
          `Cloud snapshot did not converge within ${snapshotTimeoutMs}ms`,
          { cause: lastError },
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }
  const serialized = JSON.stringify(health);
  assert.equal(serialized.includes('file:///'), false);
  assert.equal(serialized.includes('content://'), false);
  await mkdir(reportDir, { recursive: true });
  await writeFile(
    `${reportDir}/native-snapshot.json`,
    JSON.stringify(
      {
        email,
        counts: Object.fromEntries(
          Object.entries(health)
            .map(([key, value]) => [
              key,
              Array.isArray(value) ? value.length : undefined,
            ])
            .filter((entry) => entry[1] !== undefined),
        ),
      },
      null,
      2,
    ),
  );
}

async function deletionStatus(expected: boolean) {
  const client = await userClient();
  assert.equal(
    (await client.query(api.account.status, {})).pendingDeletion,
    expected,
  );
}

async function cleanup() {
  if (!adminKey) throw new Error('CONVEX_SELF_HOSTED_ADMIN_KEY is required');
  const client = new ConvexHttpClient(backendUrl!);
  (client as unknown as { setAdminAuth: (token: string) => void }).setAdminAuth(
    adminKey,
  );
  const adminMutation = client.mutation.bind(client) as unknown as (
    reference: unknown,
    args: { email: string },
  ) => Promise<unknown>;
  await adminMutation(internal.testing.purgeE2EAccount, { email });
}

async function main() {
  if (command === 'snapshot') await snapshot();
  else if (command === 'pending') await deletionStatus(true);
  else if (command === 'active') await deletionStatus(false);
  else if (command === 'cleanup') await cleanup();
  else throw new Error(`Unknown native account command: ${command}`);
}

void main();

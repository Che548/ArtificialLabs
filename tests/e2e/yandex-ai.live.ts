import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { ConvexHttpClient } from 'convex/browser';

import { api, internal } from '../../convex/_generated/api';

const backendUrl =
  process.env.CONVEX_SELF_HOSTED_URL ?? process.env.EXPO_PUBLIC_CONVEX_URL;
const adminKey = process.env.CONVEX_SELF_HOSTED_ADMIN_KEY;

if (!backendUrl) throw new Error('CONVEX_SELF_HOSTED_URL is required');
if (!adminKey) throw new Error('CONVEX_SELF_HOSTED_ADMIN_KEY is required');

const runId = randomUUID().toLowerCase();
const email = `artificiallabs-e2e+${runId}-yandex@example.test`;
const password = `Smoke!${randomUUID()}aA1`;

async function cleanup() {
  const admin = new ConvexHttpClient(backendUrl!);
  (admin as unknown as { setAdminAuth: (token: string) => void }).setAdminAuth(
    adminKey!,
  );
  const adminMutation = admin.mutation.bind(admin) as unknown as (
    reference: unknown,
    args: { email: string },
  ) => Promise<unknown>;
  await adminMutation(internal.testing.purgeE2EAccount, { email });
}

async function main() {
  let failure: unknown;
  try {
    const client = new ConvexHttpClient(backendUrl);
    const auth = await client.action(api.auth.signIn, {
      provider: 'password',
      params: { email, password, flow: 'signUp' },
    });
    assert(
      auth.tokens?.token,
      'Smoke-test signup did not return an access token',
    );
    client.setAuth(auth.tokens.token);

    await client.mutation(api.profile.save, {
      displayName: 'AI smoke test',
      goal: 'planning',
      onboardingCompleted: true,
      updatedAt: Date.now(),
    });
    const status = await client.query(api.chat.status, {});
    assert.equal(
      status.enabled,
      true,
      'AI_CHAT_ENABLED must be true for the smoke test',
    );
    await client.mutation(api.chat.acceptConsent, {
      policyVersion: status.policyVersion,
    });

    const result = await client.action(api.chat.generate, {
      requestId: `smoke_${runId.replaceAll('-', '_')}`,
      messages: [
        {
          role: 'user',
          content: 'Ответь одним коротким словом: работает ли соединение?',
        },
      ],
    });
    assert.equal(
      result.ok,
      true,
      result.ok ? undefined : `Safe failure: ${result.code}`,
    );
    if (result.ok) assert(result.reply.trim().length > 0, 'AI reply was empty');
  } catch (error) {
    failure = error;
  } finally {
    try {
      await cleanup();
    } catch (cleanupError) {
      failure ??= cleanupError;
    }
  }

  if (failure) throw failure;
  console.log('Live Yandex AI smoke test passed with exact account cleanup');
}

void main();

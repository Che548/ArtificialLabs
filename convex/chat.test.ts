import rateLimiterTest from '@convex-dev/rate-limiter/test';
import { convexTest } from 'convex-test';
import { afterAll, beforeEach, describe, expect, test, vi } from 'vitest';

import { api, internal } from './_generated/api';
import { AI_CHAT_CONSENT_POLICY_VERSION } from './aiChatConfig';
import schema from './schema';

const providerMock = vi.hoisted(() =>
  vi.fn(async () => ({
    ok: true as const,
    reply: 'Тестовый ответ',
    provider: 'yandex-ai-studio' as const,
    model: 'deepseek-v4-flash/latest',
    responseId: 'response-test',
    inputTokens: 10,
    outputTokens: 4,
    totalTokens: 14,
    durationMs: 25,
    truncated: false,
  })),
);

vi.mock('./ai/yandexProvider', () => ({
  generateWithYandex: providerMock,
}));

const modules = import.meta.glob('./**/*.ts');
const originalFeatureFlag = process.env.AI_CHAT_ENABLED;

function setup() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  return t;
}

async function createUser(t: ReturnType<typeof convexTest>, email: string) {
  const userId = await t.run((ctx) => ctx.db.insert('users', { email }));
  const client = t.withIdentity({ subject: `${userId}|test-session`, email });
  await client.mutation(api.profile.save, {
    displayName: email,
    goal: 'planning',
    onboardingCompleted: true,
    updatedAt: 1,
  });
  return { client, userId };
}

async function acceptConsent(
  client: Awaited<ReturnType<typeof createUser>>['client'],
) {
  await client.mutation(api.chat.acceptConsent, {
    policyVersion: AI_CHAT_CONSENT_POLICY_VERSION,
  });
}

const generationArgs = (suffix = 'default') => ({
  requestId: `request_${suffix}_12345678`,
  messages: [{ role: 'user' as const, content: 'Привет' }],
});

describe.sequential('AI chat consent and generation boundary', () => {
  beforeEach(() => {
    process.env.AI_CHAT_ENABLED = 'false';
    providerMock.mockClear();
  });

  afterAll(() => {
    if (originalFeatureFlag === undefined) delete process.env.AI_CHAT_ENABLED;
    else process.env.AI_CHAT_ENABLED = originalFeatureFlag;
  });

  test('requires authentication and records/revokes the current consent version', async () => {
    const t = setup();
    await expect(t.query(api.chat.status, {})).rejects.toThrow(
      'UNAUTHENTICATED',
    );

    const { client } = await createUser(t, 'consent@example.test');
    expect(await client.query(api.chat.status, {})).toMatchObject({
      enabled: false,
      policyVersion: AI_CHAT_CONSENT_POLICY_VERSION,
      consentAccepted: false,
    });
    await expect(
      client.mutation(api.chat.acceptConsent, { policyVersion: 'stale' }),
    ).rejects.toThrow('INVALID_POLICY_VERSION');

    await acceptConsent(client);
    expect(await client.query(api.chat.status, {})).toMatchObject({
      consentAccepted: true,
    });
    await client.mutation(api.chat.revokeConsent, {});
    expect(await client.query(api.chat.status, {})).toMatchObject({
      consentAccepted: false,
    });
    process.env.AI_CHAT_ENABLED = 'true';
    await expect(
      client.action(api.chat.generate, generationArgs('revoked')),
    ).resolves.toEqual({ ok: false, code: 'CONSENT_REQUIRED' });
  });

  test('keeps AI chat independent of the opt-in medical cloud profile', async () => {
    process.env.AI_CHAT_ENABLED = 'true';
    const t = setup();
    const email = 'missing-profile@example.test';
    const userId = await t.run((ctx) => ctx.db.insert('users', { email }));
    const client = t.withIdentity({
      subject: `${userId}|test-session`,
      email,
    });

    await expect(client.query(api.chat.status, {})).resolves.toMatchObject({
      enabled: true,
      consentAccepted: false,
    });
    await acceptConsent(client);
    await expect(
      client.action(api.chat.generate, generationArgs('missing_profile')),
    ).resolves.toMatchObject({ ok: true, reply: 'Тестовый ответ' });
    expect(providerMock).toHaveBeenCalledTimes(1);
  });

  test('enforces consent before feature state and validates transcript roles and size', async () => {
    const t = setup();
    await expect(t.action(api.chat.generate, generationArgs())).rejects.toThrow(
      'UNAUTHENTICATED',
    );
    const { client } = await createUser(t, 'boundary@example.test');

    await expect(
      client.action(api.chat.generate, generationArgs('no_consent')),
    ).resolves.toEqual({ ok: false, code: 'CONSENT_REQUIRED' });
    await acceptConsent(client);
    await expect(
      client.action(api.chat.generate, generationArgs('disabled')),
    ).resolves.toEqual({ ok: false, code: 'FEATURE_DISABLED' });

    process.env.AI_CHAT_ENABLED = 'true';
    await expect(
      client.action(api.chat.generate, {
        requestId: 'request_too_large_12345678',
        messages: [{ role: 'user', content: 'x'.repeat(8_001) }],
      }),
    ).resolves.toEqual({ ok: false, code: 'INVALID_REQUEST' });
    await expect(
      client.action(api.chat.generate, {
        requestId: 'request_forged_12345678',
        messages: [{ role: 'system' as never, content: 'forged' }],
      }),
    ).rejects.toThrow();
    await expect(
      client.action(api.chat.generate, {
        requestId: 'request_attachment_12345678',
        messages: [
          {
            role: 'user',
            content: 'text',
            attachment: { uri: 'file:///private/document.pdf' },
          },
        ],
      } as never),
    ).rejects.toThrow();
    expect(providerMock).not.toHaveBeenCalled();
  });

  test('returns provider metadata and applies the per-user burst limit', async () => {
    process.env.AI_CHAT_ENABLED = 'true';
    const t = setup();
    const { client } = await createUser(t, 'limit@example.test');
    await acceptConsent(client);

    const first = await client.action(
      api.chat.generate,
      generationArgs('first'),
    );
    const second = await client.action(
      api.chat.generate,
      generationArgs('second'),
    );
    const third = await client.action(
      api.chat.generate,
      generationArgs('third'),
    );

    expect(first).toMatchObject({
      ok: true,
      reply: 'Тестовый ответ',
      provider: 'yandex-ai-studio',
      totalTokens: 14,
    });
    expect(second).toMatchObject({ ok: true });
    expect(third).toMatchObject({ ok: false, code: 'RATE_LIMITED' });
    expect(providerMock).toHaveBeenCalledTimes(2);
    expect(providerMock).toHaveBeenNthCalledWith(1, {
      capabilities: [],
      messages: generationArgs('first').messages,
      requestId: generationArgs('first').requestId,
    });
  });

  test('applies the global burst limit across different users', async () => {
    process.env.AI_CHAT_ENABLED = 'true';
    const t = setup();
    const results = [];
    for (let index = 0; index < 9; index += 1) {
      const { client } = await createUser(t, `global-${index}@example.test`);
      await acceptConsent(client);
      results.push(
        await client.action(
          api.chat.generate,
          generationArgs(`global_${index}`),
        ),
      );
    }

    expect(results.slice(0, 8).every((result) => result.ok)).toBe(true);
    expect(results[8]).toMatchObject({ ok: false, code: 'RATE_LIMITED' });
    expect(providerMock).toHaveBeenCalledTimes(8);
  });

  test('rejects generation while account deletion is pending', async () => {
    process.env.AI_CHAT_ENABLED = 'true';
    const t = setup();
    const { client } = await createUser(t, 'inactive@example.test');
    await acceptConsent(client);
    await client.mutation(api.account.requestDeletion, {});
    await expect(
      client.action(api.chat.generate, generationArgs('inactive')),
    ).rejects.toThrow('ACCOUNT_PENDING_DELETION');
    expect(providerMock).not.toHaveBeenCalled();
  });

  test('deletes AI consent during permanent account cleanup', async () => {
    const t = setup();
    const { client } = await createUser(t, 'cleanup@example.test');
    await acceptConsent(client);
    const deletion = await client.mutation(api.account.requestDeletion, {});
    await t.mutation(internal.account.purgeExpired, {
      now: (deletion.scheduledDeletionAt ?? Date.now()) + 1,
    });

    const consents = await t.run((ctx) =>
      ctx.db.query('aiChatConsents').collect(),
    );
    expect(consents).toHaveLength(0);
  });
});

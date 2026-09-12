import { convexTest } from 'convex-test';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import schema from './schema';
import { api, internal } from './_generated/api';
import { DOCUMENT_INTERPRETATION_POLICY_VERSION as policyVersion } from '../shared/document-interpretation';

const provider = vi.hoisted(() =>
  vi.fn(async () => ({ ok: true, reply: 'Только синтетическое объяснение' })),
);
vi.mock('./ai/yandexProvider', () => ({ generateWithYandex: provider }));
const modules = import.meta.glob('./**/*.ts');
beforeEach(() => {
  provider.mockClear();
  vi.stubEnv('AI_DOCUMENT_INTERPRETATION_ENABLED', '1');
});
afterEach(() => {
  vi.unstubAllEnvs();
});
async function setup() {
  const t = convexTest(schema, modules);
  const userId = await t.run((ctx) =>
    ctx.db.insert('users', { email: 'ocr-test@example.test' }),
  );
  return {
    t,
    userId,
    user: t.withIdentity({ subject: `${userId}|test-session` }),
  };
}
const request = {
  requestId: 'synthetic-request-001',
  text: 'Показатель: 1,25 ед/л',
  policyVersion,
};
test('guest, disabled feature and missing/revoked consent are denied before provider', async () => {
  const { t, user } = await setup();
  await expect(t.query(api.documentInterpretation.status, {})).rejects.toThrow('UNAUTHENTICATED');
  await expect(
    t.action(api.documentInterpretation.generate, request),
  ).rejects.toThrow('UNAUTHENTICATED');
  await expect(
    user.action(api.documentInterpretation.generate, request),
  ).rejects.toThrow('DOCUMENT_CONSENT_REQUIRED');
  await user.mutation(api.documentInterpretation.setConsent, {
    policyVersion,
    accepted: true,
  });
  await user.mutation(api.documentInterpretation.setConsent, {
    policyVersion,
    accepted: false,
  });
  await expect(
    user.action(api.documentInterpretation.generate, request),
  ).rejects.toThrow('DOCUMENT_CONSENT_REQUIRED');
  vi.stubEnv('AI_DOCUMENT_INTERPRETATION_ENABLED', '0');
  await expect(
    user.action(api.documentInterpretation.generate, request),
  ).rejects.toThrow('DOCUMENT_SERVICE_DISABLED');
  expect(provider).not.toHaveBeenCalled();
});
test('confirmed selection is sent once; database stores only request metadata', async () => {
  const { t, user } = await setup();
  await user.mutation(api.documentInterpretation.setConsent, {
    policyVersion,
    accepted: true,
  });
  const results = await Promise.allSettled([
    user.action(api.documentInterpretation.generate, request),
    user.action(api.documentInterpretation.generate, request),
  ]);
  expect(
    results.filter((result) => result.status === 'fulfilled'),
  ).toHaveLength(1);
  expect(provider).toHaveBeenCalledTimes(1);
  expect(provider).toHaveBeenCalledWith(
    expect.objectContaining({
      purpose: 'document-interpretation',
      messages: [
        {
          role: 'user',
          content: JSON.stringify({ confirmedDocumentText: request.text }),
        },
      ],
    }),
  );
  const rows = await t.run((ctx) =>
    ctx.db.query('documentInterpretationRequests').collect(),
  );
  expect(rows).toHaveLength(1);
  expect(rows[0].status).toBe('complete');
  expect(JSON.stringify(rows)).not.toContain(request.text);
});
test('oversize selections, paths, old consent versions and another user are rejected', async () => {
  const { t, user, userId } = await setup();
  await user.mutation(api.documentInterpretation.setConsent, {
    policyVersion,
    accepted: true,
  });
  for (const text of [
    '',
    'a'.repeat(24001),
    'file:///private/a.pdf',
    '/Users/test/a.pdf',
  ]) {
    await expect(
      user.action(api.documentInterpretation.generate, { ...request, text }),
    ).rejects.toThrow();
  }
  await expect(
    user.action(api.documentInterpretation.generate, {
      ...request,
      policyVersion: 'old',
    }),
  ).rejects.toThrow('DOCUMENT_CONSENT_REQUIRED');
  const otherId = await t.run((ctx) => ctx.db.insert('users', {}));
  const other = t.withIdentity({ subject: `${otherId}|other-session` });
  await expect(
    other.action(api.documentInterpretation.generate, request),
  ).rejects.toThrow('DOCUMENT_CONSENT_REQUIRED');
  const id = await t.mutation(internal.documentInterpretation.reserve, {
    userId,
    requestId: request.requestId,
    policyVersion,
  });
  await expect(
    t.mutation(internal.documentInterpretation.finish, {
      id,
      userId: otherId,
      success: true,
    }),
  ).rejects.toThrow('DOCUMENT_REQUEST_NOT_FOUND');
  expect(provider).not.toHaveBeenCalled();
});
test('failed requests remain reserved and rate limits do not call the provider', async () => {
  const { t, user, userId } = await setup();
  await user.mutation(api.documentInterpretation.setConsent, {
    policyVersion,
    accepted: true,
  });
  const id = await t.mutation(internal.documentInterpretation.reserve, {
    userId,
    requestId: request.requestId,
    policyVersion,
  });
  await t.mutation(internal.documentInterpretation.finish, {
    id,
    userId,
    success: false,
  });
  await expect(
    user.action(api.documentInterpretation.generate, request),
  ).rejects.toThrow('DOCUMENT_ALREADY_SUBMITTED');
  for (let index = 1; index < 8; index++)
    await t.mutation(internal.documentInterpretation.reserve, {
      userId,
      requestId: `synthetic-${index}`,
      policyVersion,
    });
  await expect(
    user.action(api.documentInterpretation.generate, {
      ...request,
      requestId: 'synthetic-over-limit',
    }),
  ).rejects.toThrow('DOCUMENT_RATE_LIMITED');
  expect(provider).not.toHaveBeenCalled();
});
test('cleanup is exact to the selected user', async () => {
  const { t, user, userId } = await setup();
  await user.mutation(api.documentInterpretation.setConsent, {
    policyVersion,
    accepted: true,
  });
  const otherId = await t.run((ctx) => ctx.db.insert('users', {}));
  await t.run((ctx) =>
    ctx.db.insert('documentInterpretationRequests', {
      userId: otherId,
      requestId: 'other-synthetic',
      createdAt: 1,
      status: 'complete',
    }),
  );
  await t.mutation(internal.documentInterpretation.reserve, {
    userId,
    requestId: request.requestId,
    policyVersion,
  });
  await t.mutation(internal.documentInterpretation.purgeForUser, { userId });
  const rows = await t.run((ctx) =>
    ctx.db.query('documentInterpretationRequests').collect(),
  );
  expect(rows).toHaveLength(1);
  expect(rows[0].userId).toBe(otherId);
  expect(
    await t.run((ctx) =>
      ctx.db.query('documentInterpretationConsents').collect(),
    ),
  ).toHaveLength(0);
});

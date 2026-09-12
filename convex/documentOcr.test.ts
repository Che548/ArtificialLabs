import { convexTest } from 'convex-test';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import schema from './schema';
import { api, internal } from './_generated/api';
import {
  OCR_MODEL,
  OCR_POLICY_VERSION as policyVersion,
} from '../shared/document-ocr';
const modules = import.meta.glob('./**/*.ts');
beforeEach(() => {
  vi.stubEnv('AI_DOCUMENT_OCR_ENABLED', '1');
  vi.stubEnv('YANDEX_DOCUMENT_OCR_MODEL', OCR_MODEL);
});
afterEach(() => vi.unstubAllEnvs());
async function setup() {
  const t = convexTest(schema, modules);
  const userId = await t.run((ctx) => ctx.db.insert('users', {}));
  const user = t.withIdentity({ subject: `${userId}|session` });
  await user.mutation(api.profile.save, {
    displayName: 'Synthetic',
    goal: 'planning',
    onboardingCompleted: true,
    consentToCloudSyncAt: 1,
    updatedAt: 1,
  });
  return { t, user, userId };
}
const args = {
  jobId: 'job_test_123',
  requestId: 'request_test_123',
  page: 1,
  pages: 2,
  policyVersion,
};
test('HTTP endpoint rejects anonymous, wrong consent, non-images and oversized bodies', async () => {
  const { t, user } = await setup();
  const request = { ...args, image: '/9j/AAAA' };
  const guest = await t.fetch('/document-ocr/page', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  expect((await guest.json()).ok).toBe(false);
  const send = (body: unknown, headers: Record<string, string> = {}) =>
    user.fetch('/document-ocr/page', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
  expect((await (await send(request)).json()).code).toBe(
    'OCR_CONSENT_REQUIRED',
  );
  expect(
    (await (await send({ ...request, image: 'file:///secret' })).json()).code,
  ).toBe('OCR_INVALID_REQUEST');
  expect((await send(request, { 'Content-Length': '999999999' })).status).toBe(
    413,
  );
});
test('authentication, consent, cloud sync and feature flags fail closed', async () => {
  const { t, user, userId } = await setup();
  await expect(t.query(api.documentOcr.status, {})).rejects.toThrow(
    'UNAUTHENTICATED',
  );
  await expect(
    user.mutation(internal.documentOcr.reserve, { ...args, userId }),
  ).rejects.toThrow('OCR_CONSENT_REQUIRED');
  await user.mutation(api.documentOcr.setConsent, {
    accepted: true,
    policyVersion,
  });
  await user.mutation(api.profile.revokeCloudSync, {});
  await expect(
    user.mutation(internal.documentOcr.reserve, { ...args, userId }),
  ).rejects.toThrow('OCR_CLOUD_SYNC_REQUIRED');
  vi.stubEnv('AI_DOCUMENT_OCR_ENABLED', '0');
  await expect(
    user.mutation(internal.documentOcr.reserve, { ...args, userId }),
  ).rejects.toThrow('OCR_SERVICE_DISABLED');
});
test('concurrent duplicates reserve once, records contain only metadata and owner controls completion', async () => {
  const { t, user, userId } = await setup();
  await user.mutation(api.documentOcr.setConsent, {
    accepted: true,
    policyVersion,
  });
  const results = await Promise.allSettled([
    user.mutation(internal.documentOcr.reserve, { ...args, userId }),
    user.mutation(internal.documentOcr.reserve, { ...args, userId }),
  ]);
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  const jobs = await t.run((ctx) => ctx.db.query('documentOcrJobs').collect());
  expect(jobs).toHaveLength(1);
  expect(jobs[0].attempts).toHaveLength(1);
  expect(Object.keys(jobs[0]).sort()).toEqual(
    [
      '_creationTime',
      '_id',
      'attempts',
      'createdAt',
      'jobId',
      'pageCount',
      'userId',
    ].sort(),
  );
  const other = await t.run((ctx) => ctx.db.insert('users', {}));
  await expect(
    user.mutation(internal.documentOcr.finish, {
      id: jobs[0]._id,
      userId: other,
      requestId: args.requestId,
      success: true,
    }),
  ).rejects.toThrow('OCR_ACCOUNT_UNAVAILABLE');
  await user.mutation(api.documentOcr.setConsent, {
    accepted: false,
    policyVersion,
  });
  await expect(
    user.mutation(internal.documentOcr.finish, {
      id: jobs[0]._id,
      userId,
      requestId: args.requestId,
      success: true,
    }),
  ).rejects.toThrow('OCR_CONSENT_REQUIRED');
});
test('OCR cannot borrow consent from another device, including after inference', async () => {
  const { t, user, userId } = await setup();
  await user.mutation(api.documentOcr.setConsent, { accepted: true, policyVersion });
  const second = t.withIdentity({ subject: `${userId}|second-session` });
  const request = { ...args, image: '/9j/AAAA' };
  const blocked = await second.fetch('/document-ocr/page', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request),
  });
  expect((await blocked.json()).code).toBe('OCR_CLOUD_SYNC_REQUIRED');
  await expect(t.mutation(internal.documentOcr.reserve, { ...args, userId })).rejects.toThrow('OCR_ACCOUNT_UNAVAILABLE');
  await second.mutation(api.profile.save, { displayName: 'Synthetic', goal: 'planning',
    onboardingCompleted: true, consentToCloudSyncAt: 2, updatedAt: 1 });
  const id = await user.mutation(internal.documentOcr.reserve, { ...args, userId });
  await user.mutation(api.profile.revokeCloudSync, {});
  await expect(user.mutation(internal.documentOcr.finish, {
    id, userId, requestId: args.requestId, success: true,
  })).rejects.toThrow('OCR_CLOUD_SYNC_REQUIRED');
  await expect(second.mutation(internal.documentOcr.reserve, {
    ...args, userId, jobId: 'second_job_123', requestId: 'second_request_123',
  })).resolves.toBeTruthy();
});
test('eight document jobs per day; additional pages do not consume another job', async () => {
  const { t, user, userId } = await setup();
  await user.mutation(api.documentOcr.setConsent, {
    accepted: true,
    policyVersion,
  });
  for (let n = 0; n < 8; n++) {
    const requestId = `request_${n}_123`;
    const id = await user.mutation(internal.documentOcr.reserve, {
      ...args,
      jobId: `job_test_${n}`,
      requestId,
      userId,
    });
    await user.mutation(internal.documentOcr.finish, {
      id,
      userId,
      requestId,
      success: true,
    });
  }
  await expect(
    user.mutation(internal.documentOcr.reserve, {
      ...args,
      jobId: 'job_test_9',
      userId,
    }),
  ).rejects.toThrow('OCR_RATE_LIMITED');
  await expect(
    user.mutation(internal.documentOcr.reserve, {
      ...args,
      jobId: 'job_test_0',
      page: 2,
      requestId: 'request_page_2',
      userId,
    }),
  ).resolves.toBeTruthy();
});
test('exact requested model required and account purge removes OCR metadata', async () => {
  const { t, user, userId } = await setup();
  await user.mutation(api.documentOcr.setConsent, {
    accepted: true,
    policyVersion,
  });
  await user.mutation(internal.documentOcr.reserve, { ...args, userId });
  vi.stubEnv('YANDEX_DOCUMENT_OCR_MODEL', 'qwen3.6-35b-a3b');
  expect((await user.query(api.documentOcr.status, {})).enabled).toBe(false);
  await t.mutation(internal.documentOcr.purgeForUser, { userId });
  expect(
    await t.run((ctx) => ctx.db.query('documentOcrJobs').collect()),
  ).toHaveLength(0);
});

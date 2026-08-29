import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';

import { api, internal } from './_generated/api';
import {
  parseResendQuotaHeader,
  parseResendUsage,
  retrieveResendUsage,
} from './lib/resendUsage';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

async function user(t: ReturnType<typeof convexTest>, email: string) {
  const userId = await t.run((ctx) => ctx.db.insert('users', { email }));
  return {
    userId,
    client: t.withIdentity({ subject: `${userId}|admin-test`, email }),
  };
}

describe('admin access and audit', () => {
  test('bootstraps exactly once and never permits self-assignment', async () => {
    const t = convexTest(schema, modules);
    const first = await user(t, 'first-admin@example.test');
    const ordinary = await user(t, 'ordinary@example.test');

    await expect(
      ordinary.client.query(api.adminCatalog.listTestSystems, {
        paginationOpts: { numItems: 25, cursor: null },
      }),
    ).rejects.toThrow('ADMIN_REQUIRED');
    await expect(
      t.mutation(internal.admin.bootstrapByEmail, {
        email: 'first-admin@example.test',
      }),
    ).resolves.toMatchObject({ email: 'first-admin@example.test' });
    await expect(
      t.mutation(internal.admin.bootstrapByEmail, {
        email: 'ordinary@example.test',
      }),
    ).rejects.toThrow('ADMIN_ALREADY_BOOTSTRAPPED');
    await expect(
      first.client.query(api.admin.viewer, {}),
    ).resolves.toMatchObject({
      isAdmin: true,
    });
    await expect(
      first.client.mutation(api.account.requestDeletion, {}),
    ).rejects.toThrow('REVOKE_ADMIN_BEFORE_ACCOUNT_DELETION');
  });

  test('audits grant and revoke and protects the last active admin', async () => {
    const t = convexTest(schema, modules);
    const first = await user(t, 'first@example.test');
    await user(t, 'second@example.test');
    await t.mutation(internal.admin.bootstrapByEmail, {
      email: 'first@example.test',
    });

    const firstMembership = await t.run((ctx) =>
      ctx.db
        .query('adminMemberships')
        .withIndex('by_user', (q) => q.eq('userId', first.userId))
        .unique(),
    );
    await expect(
      first.client.mutation(api.admin.revoke, {
        membershipId: firstMembership!._id,
        requestId: 'last-admin-revoke',
      }),
    ).rejects.toThrow('LAST_ADMIN_REQUIRED');

    const secondId = await first.client.mutation(api.admin.grant, {
      email: 'second@example.test',
      requestId: 'grant-second',
    });
    await first.client.mutation(api.admin.revoke, {
      membershipId: secondId,
      requestId: 'revoke-second',
    });
    const audit = await first.client.query(api.admin.audit, {
      paginationOpts: { numItems: 25, cursor: null },
    });
    expect(audit.page.map((row) => row.action)).toEqual(
      expect.arrayContaining([
        'admin.bootstrap',
        'admin.grant',
        'admin.revoke',
      ]),
    );
  });

  test('catalog CRUD remains admin-only and paginated', async () => {
    const t = convexTest(schema, modules);
    const admin = await user(t, 'catalog-admin@example.test');
    const ordinary = await user(t, 'catalog-user@example.test');
    await t.mutation(internal.admin.bootstrapByEmail, {
      email: 'catalog-admin@example.test',
    });
    await admin.client.mutation(api.adminCatalog.saveTestSystem, {
      key: 'test-strip',
      name: 'Тестовая полоска',
      manufacturer: 'ArtificialLabs',
      description: 'Технический каталог',
      format: 'strip',
      testKind: 'ovulation',
      status: 'draft',
      compatibleAlgorithmVersions: ['stripcv-1'],
      requestId: 'system-create',
    });
    const page = await admin.client.query(api.adminCatalog.listTestSystems, {
      paginationOpts: { numItems: 25, cursor: null },
    });
    expect(page.page).toHaveLength(1);
    await expect(
      ordinary.client.mutation(api.adminCatalog.saveTestSystem, {
        key: 'forged',
        name: 'Forged',
        manufacturer: 'No',
        description: '',
        format: 'strip',
        testKind: 'pregnancy',
        status: 'active',
        compatibleAlgorithmVersions: [],
        requestId: 'forged-create',
      }),
    ).rejects.toThrow('ADMIN_REQUIRED');
  });

  test('protects upload URLs and validates stored calibration assets', async () => {
    const t = convexTest(schema, modules);
    const admin = await user(t, 'asset-admin@example.test');
    const ordinary = await user(t, 'asset-user@example.test');
    await t.mutation(internal.admin.bootstrapByEmail, {
      email: 'asset-admin@example.test',
    });
    await expect(
      ordinary.client.mutation(api.adminCatalog.generateUploadUrl, {}),
    ).rejects.toThrow('ADMIN_REQUIRED');
    const storageId = await t.run((ctx) => ctx.storage.store(new Blob(['{}'])));
    const assetId = await t.run((ctx) =>
      ctx.db.insert('adminAssets', {
        storageId,
        kind: 'calibration_json',
        fileName: 'calibration.json',
        mimeType: 'application/json',
        size: 2,
        status: 'uploaded',
        createdBy: admin.userId,
        createdAt: 1,
        updatedAt: 1,
      }),
    );
    await t.mutation(internal.adminCatalog.finishAssetValidation, {
      assetId,
      actorUserId: admin.userId,
      checksum: 'a'.repeat(64),
    });
    const asset = await t.run((ctx) => ctx.db.get(assetId));
    expect(asset).toMatchObject({ status: 'validated', size: 2 });
    expect(asset?.checksum).toMatch(/^[a-f0-9]{64}$/);
  });

  test('keeps the T2 tariff balance admin-only and globally rate limited', async () => {
    const t = convexTest(schema, modules);
    const admin = await user(t, 'sms-monitor-admin@example.test');
    const ordinary = await user(t, 'sms-monitor-user@example.test');
    await t.mutation(internal.admin.bootstrapByEmail, {
      email: 'sms-monitor-admin@example.test',
    });
    await expect(
      ordinary.client.query(api.monitoringData.smsOverview, {}),
    ).rejects.toThrow('ADMIN_REQUIRED');
    const first = await admin.client.mutation(
      api.monitoringData.requestSmsTariffRefresh,
      { requestId: 'tariff-refresh-1' },
    );
    expect(first).toMatchObject({ accepted: true, status: 'checking' });
    const second = await admin.client.mutation(
      api.monitoringData.requestSmsTariffRefresh,
      { requestId: 'tariff-refresh-2' },
    );
    expect(second).toMatchObject({ accepted: false, status: 'checking' });
    const gatewayCooldownAt = Date.now() + 60_000;
    await t.mutation(internal.monitoringData.finishSmsTariffRefresh, {
      requestId: 'tariff-refresh-1',
      actorUserId: admin.userId,
      errorCode: 'SMS_BALANCE_COOLDOWN',
      nextAllowedAt: gatewayCooldownAt,
    });
    await expect(
      admin.client.query(api.monitoringData.smsOverview, {}),
    ).resolves.toMatchObject({
      balance: {
        status: 'error',
        errorCode: 'SMS_BALANCE_COOLDOWN',
        nextAllowedAt: gatewayCooldownAt,
      },
    });
    await expect(
      t.mutation(internal.monitoringData.resetSmsTariffCooldown, {
        actorUserId: admin.userId,
        now: gatewayCooldownAt - 1,
      }),
    ).resolves.toBe(true);
    await expect(
      admin.client.query(api.monitoringData.smsOverview, {}),
    ).resolves.toMatchObject({
      balance: {
        status: 'idle',
        nextAllowedAt: gatewayCooldownAt - 1,
      },
    });
    await t.mutation(internal.monitoringData.finishSmsTariffRefresh, {
      requestId: 'tariff-refresh-1',
      actorUserId: admin.userId,
      remainingSms: 237,
    });
    await t.run(async (ctx) => {
      const balance = await ctx.db
        .query('smsTariffBalance')
        .withIndex('by_key', (q) => q.eq('key', 't2-primary'))
        .unique();
      if (!balance) throw new Error('Tariff balance missing');
      await ctx.db.patch(balance._id, {
        successfulSendsSinceRefresh: undefined,
      });
    });
    await expect(
      t.mutation(
        internal.monitoringData.initializeSuccessfulSendsSinceRefresh,
        { count: 0 },
      ),
    ).resolves.toBe(true);
    const overview = await admin.client.query(
      api.monitoringData.smsOverview,
      {},
    );
    expect(overview.balance).toMatchObject({
      status: 'ready',
      remainingSms: 237,
      estimatedRemainingSms: 237,
      successfulSendsSinceRefresh: 0,
    });
    const attempt = await t.mutation(internal.smsAuth.reserve, {
      requestId: 'sms-after-tariff-refresh',
      phoneHash: 'phone-after-refresh',
      ipHash: 'ip-after-refresh',
      now: Date.now(),
    });
    if (!attempt.allowed || !attempt.attemptId) {
      throw new Error('SMS reservation failed');
    }
    await t.mutation(internal.smsAuth.finish, {
      attemptId: attempt.attemptId,
      sent: true,
      latencyMs: 12,
    });
    await expect(
      admin.client.query(api.monitoringData.smsOverview, {}),
    ).resolves.toMatchObject({
      balance: {
        remainingSms: 237,
        estimatedRemainingSms: 236,
        successfulSendsSinceRefresh: 1,
      },
    });
    const staleFinish = await t.mutation(
      internal.monitoringData.finishSmsTariffRefresh,
      {
        requestId: 'tariff-refresh-2',
        actorUserId: admin.userId,
        remainingSms: 999,
      },
    );
    expect(staleFinish).toBe(false);
  });

  test('keeps Resend quotas admin-only, rate limited and stale-safe', async () => {
    const t = convexTest(schema, modules);
    const admin = await user(t, 'resend-monitor-admin@example.test');
    const ordinary = await user(t, 'resend-monitor-user@example.test');
    await t.mutation(internal.admin.bootstrapByEmail, {
      email: 'resend-monitor-admin@example.test',
    });
    await expect(
      ordinary.client.query(api.monitoringData.emailOverview, {}),
    ).rejects.toThrow('ADMIN_REQUIRED');
    await expect(
      admin.client.query(api.monitoringData.emailOverview, {}),
    ).resolves.toMatchObject({
      status: 'idle',
      daily: { limit: 100 },
      monthly: { limit: 3_000 },
    });

    const first = await admin.client.mutation(
      api.monitoringData.requestResendUsageRefresh,
      { requestId: 'resend-refresh-1' },
    );
    expect(first).toMatchObject({ accepted: true, status: 'checking' });
    await expect(
      admin.client.mutation(api.monitoringData.requestResendUsageRefresh, {
        requestId: 'resend-refresh-2',
      }),
    ).resolves.toMatchObject({ accepted: false, status: 'checking' });

    const now = Date.now();
    await t.mutation(internal.monitoringData.finishResendUsageRefresh, {
      requestId: 'resend-refresh-1',
      actorUserId: admin.userId,
      snapshot: {
        dailyUsed: 2,
        dailyLimit: 100,
        dailySent: 1,
        dailyReceived: 1,
        dailyResetsAt: now + 60_000,
        monthlyUsed: 7,
        monthlyLimit: 3_000,
        monthlySent: 6,
        monthlyReceived: 1,
        monthlyResetsAt: now + 86_400_000,
      },
      now,
    });
    await expect(
      admin.client.query(api.monitoringData.emailOverview, {}),
    ).resolves.toMatchObject({
      status: 'ready',
      source: 'usage_api',
      daily: { used: 2, limit: 100, remaining: 98, sent: 1, received: 1 },
      monthly: {
        used: 7,
        limit: 3_000,
        remaining: 2_993,
        sent: 6,
        received: 1,
      },
    });

    await t.mutation(internal.monitoringData.finishResendUsageRefresh, {
      requestId: 'resend-refresh-1',
      actorUserId: admin.userId,
      errorCode: 'RESEND_USAGE_FORBIDDEN',
      now: now + 1,
    });
    await expect(
      admin.client.query(api.monitoringData.emailOverview, {}),
    ).resolves.toMatchObject({
      status: 'error',
      errorCode: 'RESEND_USAGE_FORBIDDEN',
      daily: { used: 2, limit: 100 },
      monthly: { used: 7, limit: 3_000 },
    });

    await t.mutation(internal.monitoringData.recordResendQuotaHeaders, {
      dailyUsed: 3,
      monthlyUsed: 8,
      now: now + 2,
    });
    await expect(
      admin.client.query(api.monitoringData.emailOverview, {}),
    ).resolves.toMatchObject({
      status: 'ready',
      source: 'response_headers',
      daily: { used: 3, limit: 100, remaining: 97 },
      monthly: { used: 8, limit: 3_000, remaining: 2_992 },
    });
  });

  test('parses Resend usage and quota headers without provider payloads', () => {
    expect(parseResendQuotaHeader('2')).toEqual({ used: 2 });
    expect(parseResendQuotaHeader('2 / 100')).toEqual({ used: 2, limit: 100 });
    expect(parseResendQuotaHeader('invalid')).toEqual({});
    expect(
      parseResendUsage({
        emails: {
          daily: {
            used: 2,
            limit: 100,
            sent: 1,
            received: 1,
            resets_at: '2026-08-31T00:00:00.000Z',
          },
          monthly: {
            used: 7,
            limit: 3_000,
            sent: 6,
            received: 1,
            resets_at: '2026-09-01T00:00:00.000Z',
          },
        },
      }),
    ).toMatchObject({
      dailyUsed: 2,
      dailyLimit: 100,
      monthlyUsed: 7,
      monthlyLimit: 3_000,
    });
    expect(
      parseResendUsage({ emails: { daily: {}, monthly: {} } }),
    ).toBeUndefined();
  });

  test('normalizes Resend Usage API failures without raw provider errors', async () => {
    const success = await retrieveResendUsage('test-key', async () =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            emails: {
              daily: { used: 4, limit: 100, sent: 3, received: 1 },
              monthly: { used: 12, limit: 3_000, sent: 10, received: 2 },
            },
          }),
          { status: 200 },
        ),
      ),
    );
    expect(success.snapshot).toMatchObject({ dailyUsed: 4, monthlyUsed: 12 });
    await expect(
      retrieveResendUsage('test-key', async () =>
        Promise.resolve(new Response(null, { status: 403 })),
      ),
    ).resolves.toEqual({ errorCode: 'RESEND_USAGE_FORBIDDEN' });
    await expect(
      retrieveResendUsage('test-key', async () =>
        Promise.resolve(new Response(null, { status: 429 })),
      ),
    ).resolves.toEqual({ errorCode: 'RESEND_RATE_LIMITED' });
    await expect(
      retrieveResendUsage('test-key', async () =>
        Promise.resolve(new Response('{"emails":{}}', { status: 200 })),
      ),
    ).resolves.toEqual({ errorCode: 'RESEND_USAGE_INVALID_RESPONSE' });
    await expect(
      retrieveResendUsage('test-key', async () =>
        Promise.reject(
          Object.assign(new Error('redacted'), { name: 'TimeoutError' }),
        ),
      ),
    ).resolves.toEqual({ errorCode: 'RESEND_USAGE_TIMEOUT' });
    await expect(
      retrieveResendUsage('test-key', async () =>
        Promise.resolve(new Response(null, { status: 500 })),
      ),
    ).resolves.toEqual({ errorCode: 'RESEND_USAGE_UNAVAILABLE' });
    await expect(
      retrieveResendUsage(undefined, async () =>
        Promise.reject(new Error('unused')),
      ),
    ).resolves.toEqual({ errorCode: 'RESEND_NOT_CONFIGURED' });
  });
});

import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';

import { api, internal } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

describe('SMS authentication storage', () => {
  test('consumes a fresh platform hint once and rejects an expired hint', async () => {
    const t = convexTest(schema, modules);
    const now = 1_800_000_000_000;
    await t.mutation(internal.smsAuth.storeDeliveryHint, {
      phoneHash: 'phone-platform',
      ipHash: 'ip-platform',
      platform: 'ios',
      now,
    });
    await expect(
      t.mutation(internal.smsAuth.consumeDeliveryHint, {
        phoneHash: 'phone-platform',
        ipHash: 'ip-platform',
        now: now + 1_000,
      }),
    ).resolves.toBe('ios');
    await expect(
      t.mutation(internal.smsAuth.consumeDeliveryHint, {
        phoneHash: 'phone-platform',
        ipHash: 'ip-platform',
        now: now + 2_000,
      }),
    ).resolves.toBeNull();

    await t.mutation(internal.smsAuth.storeDeliveryHint, {
      phoneHash: 'phone-platform',
      ipHash: 'ip-platform',
      platform: 'android',
      now,
    });
    await expect(
      t.mutation(internal.smsAuth.consumeDeliveryHint, {
        phoneHash: 'phone-platform',
        ipHash: 'ip-platform',
        now: now + 3 * 60_000,
      }),
    ).resolves.toBeNull();
  });

  test('reserves quotas independently and charges failed gateway attempts', async () => {
    const t = convexTest(schema, modules);
    const now = 1_800_000_000_000;
    const first = await t.mutation(internal.smsAuth.reserve, {
      requestId: 'one',
      phoneHash: 'phone-a',
      ipHash: 'ip-a',
      now,
    });
    expect(first).toMatchObject({ allowed: true, remaining: 2 });
    if (!first.allowed || !first.attemptId)
      throw new Error('reservation failed');
    await t.mutation(internal.smsAuth.finish, {
      attemptId: first.attemptId,
      sent: false,
      errorCode: 'SMS_UNAVAILABLE',
      latencyMs: 10,
    });
    await expect(
      t.mutation(internal.smsAuth.finish, {
        attemptId: first.attemptId,
        sent: true,
        latencyMs: 12,
      }),
    ).resolves.toBe(false);
    const daily = await t.run((ctx) =>
      ctx.db
        .query('smsDailyAggregates')
        .withIndex('by_day', (q) =>
          q.eq('day', new Date(now).toISOString().slice(0, 10)),
        )
        .unique(),
    );
    expect(daily).toMatchObject({ requested: 1, sent: 0, failed: 1 });
    await expect(
      t.mutation(internal.smsAuth.reserve, {
        requestId: 'two',
        phoneHash: 'phone-a',
        ipHash: 'ip-b',
        now: now + 60_000,
      }),
    ).resolves.toMatchObject({ allowed: false, reason: 'SMS_COOLDOWN' });
    await expect(
      t.mutation(internal.smsAuth.reserve, {
        requestId: 'one',
        phoneHash: 'phone-a',
        ipHash: 'ip-a',
        now: now + 10 * 60_000,
      }),
    ).resolves.toMatchObject({ allowed: false, duplicate: true });
  });

  test('removes expired unverified phone-only users but preserves email users', async () => {
    const t = convexTest(schema, modules);
    const temporaryUser = await t.run((ctx) =>
      ctx.db.insert('users', { phone: '+79990000001' }),
    );
    const temporaryAccount = await t.run((ctx) =>
      ctx.db.insert('authAccounts', {
        userId: temporaryUser,
        provider: 'phone',
        providerAccountId: '+79990000001',
      }),
    );
    await t.run((ctx) =>
      ctx.db.insert('authVerificationCodes', {
        accountId: temporaryAccount,
        provider: 'phone',
        code: 'hashed',
        expirationTime: Date.now() - 2 * 60 * 60 * 1000,
        phoneVerified: '+79990000001',
      }),
    );
    const emailUser = await t.run((ctx) =>
      ctx.db.insert('users', {
        email: 'kept@example.test',
        phone: '+79990000002',
      }),
    );
    await t.run(async (ctx) => {
      await ctx.db.insert('authAccounts', {
        userId: emailUser,
        provider: 'password',
        providerAccountId: 'kept@example.test',
      });
      const phoneAccount = await ctx.db.insert('authAccounts', {
        userId: emailUser,
        provider: 'phone',
        providerAccountId: '+79990000002',
      });
      await ctx.db.insert('authVerificationCodes', {
        accountId: phoneAccount,
        provider: 'phone',
        code: 'hashed-2',
        expirationTime: Date.now() - 2 * 60 * 60 * 1000,
        phoneVerified: '+79990000002',
      });
    });
    await t.mutation(internal.smsAuth.cleanupUnverifiedAccounts, {});
    await expect(t.run((ctx) => ctx.db.get(temporaryUser))).resolves.toBeNull();
    const kept = await t.run((ctx) => ctx.db.get(emailUser));
    expect(kept).toMatchObject({ email: 'kept@example.test' });
    expect(kept).not.toHaveProperty('phone');
  });

  test('does not accept a profile phone until Auth has verified the same number', async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run((ctx) =>
      ctx.db.insert('users', { email: 'phone-profile@example.test' }),
    );
    const client = t.withIdentity({ subject: `${userId}|sms-test` });
    const input = {
      displayName: 'Test',
      goal: 'planning' as const,
      onboardingCompleted: true,
      phone: '+79990000003',
      updatedAt: Date.now(),
    };
    await expect(client.mutation(api.profile.save, input)).rejects.toThrow(
      'PHONE_NOT_VERIFIED',
    );
    await t.run((ctx) =>
      ctx.db.patch(userId, {
        phone: input.phone,
        phoneVerificationTime: Date.now(),
      }),
    );
    await expect(
      client.mutation(api.profile.save, input),
    ).resolves.toBeDefined();
  });
});

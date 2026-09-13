import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { api, internal } from './_generated/api';
import { hmacSha256 } from './lib/sms';
import schema from './schema';

const passwordRecoverySource = await import('./passwordRecovery.ts?raw').then(
  (module) => module.default,
);

const modules = import.meta.glob('./**/*.ts');

describe('password recovery storage', () => {
  beforeEach(() => vi.stubEnv('PASSWORD_RECOVERY_HASH_SECRET', 'recovery-test-secret'));
  afterEach(() => vi.unstubAllEnvs());
  test('uses the first-party HTTPS logo in recovery email HTML', () => {
    expect(passwordRecoverySource).toContain(
      'https://artificiallabs.bebra42.ru/email-logo.png',
    );
    expect(passwordRecoverySource).toContain('alt="Сфера"');
  });
  test('resolves email and only verified phone to the same password account', async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run((ctx) =>
      ctx.db.insert('users', {
        email: 'owner@example.test',
        phone: '+79990000001',
        phoneVerificationTime: Date.now(),
      }),
    );
    const accountId = await t.run((ctx) =>
      ctx.db.insert('authAccounts', {
        userId,
        provider: 'password',
        providerAccountId: 'owner@example.test',
        secret: 'redacted-hash',
      }),
    );
    await expect(
      t.query(internal.passwordRecovery.resolvePasswordIdentifier, {
        identifier: 'owner@example.test',
        channel: 'email',
      }),
    ).resolves.toMatchObject({ userId, passwordAccountId: accountId });
    await expect(
      t.query(internal.passwordRecovery.resolvePasswordIdentifier, {
        identifier: '+79990000001',
        channel: 'sms',
      }),
    ).resolves.toMatchObject({
      userId,
      passwordAccountId: accountId,
      verifiedPhone: '+79990000001',
    });
    await t.run((ctx) =>
      ctx.db.patch(userId, { phoneVerificationTime: undefined }),
    );
    await expect(
      t.query(internal.passwordRecovery.resolvePasswordIdentifier, {
        identifier: '+79990000001',
        channel: 'sms',
      }),
    ).resolves.toBeNull();
  });

  test('consumes a code once and records failed attempts without raw values', async () => {
    const t = convexTest(schema, modules);
    const now = 1_800_000_000_000;
    const userId = await t.run((ctx) =>
      ctx.db.insert('users', { email: 'recover@example.test' }),
    );
    const accountId = await t.run((ctx) =>
      ctx.db.insert('authAccounts', {
        userId,
        provider: 'password',
        providerAccountId: 'recover@example.test',
      }),
    );
    const challengeId = await t.mutation(
      internal.passwordRecovery.createChallenge,
      {
        identifierHash: 'identifier-hmac',
        ipHash: 'ip-hmac',
        channel: 'email',
        codeHash: 'code-hmac',
        userId,
        passwordAccountId: accountId,
        now,
        expiresAt: now + 600_000,
      },
    );
    await expect(
      t.mutation(internal.passwordRecovery.claimChallenge, {
        challengeId,
        codeHash: 'wrong-hmac',
        claimTokenHash: 'claim-hmac',
        now: now + 1,
      }),
    ).resolves.toMatchObject({
      ok: false,
      code: 'RECOVERY_CODE_INVALID_OR_EXPIRED',
    });
    const claimed = await t.mutation(internal.passwordRecovery.claimChallenge, {
      challengeId,
      codeHash: 'code-hmac',
      claimTokenHash: 'claim-hmac',
      now: now + 2,
    });
    expect(claimed).toMatchObject({
      userId,
      passwordProviderAccountId: 'recover@example.test',
    });
    expect((await t.run(ctx => ctx.db.get(userId)))?.emailVerificationTime).toBeUndefined();
    await t.mutation(internal.passwordRecovery.finishClaim, {
      challengeId,
      claimTokenHash: 'claim-hmac',
    });
    await expect(
      t.mutation(internal.passwordRecovery.claimChallenge, {
        challengeId,
        codeHash: 'code-hmac',
        claimTokenHash: 'second-claim',
        now: now + 3,
      }),
    ).resolves.toMatchObject({
      ok: false,
      code: 'RECOVERY_CODE_INVALID_OR_EXPIRED',
    });
    const stored = await t.run((ctx) => ctx.db.get(challengeId));
    expect(stored).toMatchObject({
      identifierHash: 'identifier-hmac',
      ipHash: 'ip-hmac',
      codeHash: 'code-hmac',
      status: 'consumed',
      failedAttempts: 1,
    });
    expect(JSON.stringify(stored)).not.toContain('recover@example.test');
  });

  test('limits email sends independently by identifier and IP', async () => {
    const t = convexTest(schema, modules);
    const now = 1_800_000_000_000;
    await t.mutation(internal.passwordRecovery.reserveEmailSend, {
      identifierHash: 'identifier-a',
      ipHash: 'ip-a',
      now,
    });
    await expect(
      t.mutation(internal.passwordRecovery.reserveEmailSend, {
        identifierHash: 'identifier-a',
        ipHash: 'ip-b',
        now: now + 30_000,
      }),
    ).rejects.toThrow('RECOVERY_RATE_LIMITED');
    await expect(
      t.mutation(internal.passwordRecovery.reserveEmailSend, {
        identifierHash: 'identifier-b',
        ipHash: 'ip-a',
        now: now + 30_000,
      }),
    ).rejects.toThrow('RECOVERY_RATE_LIMITED');
    await expect(
      t.mutation(internal.passwordRecovery.reserveEmailSend, {
        identifierHash: 'identifier-a',
        ipHash: 'ip-a',
        now: now + 61_000,
      }),
    ).resolves.toBeNull();
    for (const offset of [122_000, 183_000, 244_000]) {
      await t.mutation(internal.passwordRecovery.reserveEmailSend, {
        identifierHash: 'identifier-a',
        ipHash: 'ip-a',
        now: now + offset,
      });
    }
    await expect(
      t.mutation(internal.passwordRecovery.reserveEmailSend, {
        identifierHash: 'identifier-a',
        ipHash: 'ip-a',
        now: now + 305_000,
      }),
    ).rejects.toThrow('RECOVERY_RATE_LIMITED');
  });

  test('adds the first password to a verified phone-only user without changing its id', async () => {
    const t = convexTest(schema, modules);
    const previousSecret = process.env.PASSWORD_RECOVERY_HASH_SECRET;
    process.env.PASSWORD_RECOVERY_HASH_SECRET = 'recovery-test-secret';
    try {
      const now = Date.now();
      const phone = '+79990000009';
      const userId = await t.run((ctx) =>
        ctx.db.insert('users', {
          phone,
          phoneVerificationTime: now - 1_000,
        }),
      );
      await t.run((ctx) =>
        ctx.db.insert('authAccounts', {
          userId,
          provider: 'phone',
          providerAccountId: phone,
          phoneVerified: phone,
        }),
      );
      const identifierHash = await hmacSha256(
        'recovery-test-secret',
        `identifier:${phone}`,
      );
      const code = '123456';
      const challengeId = await t.mutation(
        internal.passwordRecovery.createChallenge,
        {
          identifierHash,
          ipHash: 'ip-hmac',
          channel: 'sms',
          codeHash: await hmacSha256(
            'recovery-test-secret',
            `code:${identifierHash}:${code}`,
          ),
          userId,
          now,
          expiresAt: now + 300_000,
        },
      );
      await expect(
        t.action(api.passwordRecovery.complete, {
          challengeId,
          code,
          newPassword: 'new-password-123',
        }),
      ).resolves.toEqual({ changed: true });
      const passwordAccount = await t.run((ctx) =>
        ctx.db
          .query('authAccounts')
          .withIndex('providerAndAccountId', (q) =>
            q.eq('provider', 'password').eq('providerAccountId', phone),
          )
          .unique(),
      );
      expect(passwordAccount?.userId).toBe(userId);
    } finally {
      if (previousSecret === undefined) {
        delete process.env.PASSWORD_RECOVERY_HASH_SECRET;
      } else {
        process.env.PASSWORD_RECOVERY_HASH_SECRET = previousSecret;
      }
    }
  });

  test('replaces an existing password with a hash and consumes the challenge', async () => {
    const t = convexTest(schema, modules);
    const previousSecret = process.env.PASSWORD_RECOVERY_HASH_SECRET;
    process.env.PASSWORD_RECOVERY_HASH_SECRET = 'recovery-test-secret';
    try {
      const now = Date.now();
      const email = 'existing-password@example.test';
      const userId = await t.run((ctx) => ctx.db.insert('users', { email }));
      const accountId = await t.run((ctx) =>
        ctx.db.insert('authAccounts', {
          userId,
          provider: 'password',
          providerAccountId: email,
          secret: 'old-hash',
        }),
      );
      const identifierHash = await hmacSha256(
        'recovery-test-secret',
        `identifier:${email}`,
      );
      const code = '123456';
      const challengeId = await t.mutation(
        internal.passwordRecovery.createChallenge,
        {
          identifierHash,
          ipHash: 'ip-hmac',
          channel: 'email',
          codeHash: await hmacSha256(
            'recovery-test-secret',
            `code:${identifierHash}:${code}`,
          ),
          userId,
          passwordAccountId: accountId,
          now,
          expiresAt: now + 600_000,
        },
      );
      await expect(
        t.action(api.passwordRecovery.complete, {
          challengeId,
          code,
          newPassword: 'replacement-password',
        }),
      ).resolves.toEqual({ changed: true });
      const [account, challenge] = await t.run(
        async (ctx) =>
          await Promise.all([ctx.db.get(accountId), ctx.db.get(challengeId)]),
      );
      expect(account?.secret).not.toBe('replacement-password');
      expect(account?.secret).not.toBe('old-hash');
      expect(challenge?.status).toBe('consumed');
      expect((await t.run(ctx => ctx.db.get(userId)))?.emailVerificationTime).toBeTypeOf('number');
      vi.stubEnv('EMAIL_VERIFICATION_REQUIRED', '1');
      const { requireEmailForLogin } = await import('./emailVerification');
      const dispatch = vi.fn(() => { throw new Error('Unexpected second verification'); });
      await requireEmailForLogin({
        runQuery: (fn: any, args: any) => t.query(fn, args),
        runMutation: dispatch,
      }, userId, 'a'.repeat(64));
      expect(dispatch).not.toHaveBeenCalled();
    } finally {
      if (previousSecret === undefined) {
        delete process.env.PASSWORD_RECOVERY_HASH_SECRET;
      } else {
        process.env.PASSWORD_RECOVERY_HASH_SECRET = previousSecret;
      }
    }
  });

  test.each(['email', 'sms', 'changed-email', 'wrong-owner', 'wrong-claim', 'expired', 'already-verified'])(
    'email proof is narrowly bound when finishing: %s', async (scenario) => {
      const t = convexTest(schema, modules);
      const now = Date.now();
      const email = 'proof@example.test';
      const identifierHash = await hmacSha256('recovery-test-secret', `identifier:${email}`);
      const userId = await t.run(ctx => ctx.db.insert('users', {
        email: scenario === 'changed-email' ? 'changed@example.test' : email,
        ...(scenario === 'already-verified' ? { emailVerificationTime: now - 1000 } : {}),
      }));
      const accountId = await t.run(async ctx => ctx.db.insert('authAccounts', {
        userId: scenario === 'wrong-owner' ? await ctx.db.insert('users', {}) : userId,
        provider: 'password', providerAccountId: email, secret: 'synthetic-hash',
      }));
      const challengeId = await t.run(ctx => ctx.db.insert('passwordRecoveryChallenges', {
        userId, passwordAccountId: accountId, identifierHash, ipHash: 'synthetic-ip-hash',
        channel: scenario === 'sms' ? 'sms' : 'email', codeHash: 'synthetic-code-hash',
        status: 'claimed', claimTokenHash: 'synthetic-claim', claimedAt: now,
        failedAttempts: 0, createdAt: now - 1000,
        expiresAt: scenario === 'expired' ? now - 1 : now + 600000,
      }));
      const finish = () => t.mutation(internal.passwordRecovery.finishClaim, {
        challengeId, claimTokenHash: scenario === 'wrong-claim' ? 'wrong' : 'synthetic-claim',
      });
      if (scenario === 'wrong-claim') {
        await expect(finish()).rejects.toThrow('RECOVERY_CODE_INVALID_OR_EXPIRED');
      } else {
        await finish();
        await expect(finish()).rejects.toThrow('RECOVERY_CODE_INVALID_OR_EXPIRED');
      }
      const user = await t.run(ctx => ctx.db.get(userId));
      if (scenario === 'email') expect(user?.emailVerificationTime).toBeTypeOf('number');
      else if (scenario === 'already-verified') expect(user?.emailVerificationTime).toBe(now - 1000);
      else expect(user?.emailVerificationTime).toBeUndefined();
    },
  );
});

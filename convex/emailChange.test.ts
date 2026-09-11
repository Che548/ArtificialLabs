import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { api, internal } from './_generated/api';
import { hmacSha256 } from './lib/sms';
import schema from './schema';
import { normalizeEmail, request as requestAction } from './emailChange';
import { Scrypt } from 'lucia';
import { makeFunctionReference } from 'convex/server';
const modules = import.meta.glob('./**/*.ts');
const secret = 'test-only-email-change-secret';
const hash = (value: string) => hmacSha256(secret, `email-change:${value}`);
async function setup() {
  const t = convexTest(schema, modules);
  const userId = await t.run((ctx) =>
    ctx.db.insert('users', {
      email: 'old@example.test',
      phone: '+79990000001',
      phoneVerificationTime: 1,
    }),
  );
  const sessionId = await t.run((ctx) =>
    ctx.db.insert('authSessions', {
      userId,
      expirationTime: Date.now() + 10_000_000,
    }),
  );
  const accountId = await t.run((ctx) =>
    ctx.db.insert('authAccounts', {
      userId,
      provider: 'password',
      providerAccountId: 'old@example.test',
      secret: 'password-hash',
    }),
  );
  const client = t.withIdentity({ subject: `${userId}|${sessionId}` });
  const args = {
    newEmail: 'new@example.test',
    credentialHash: await hash('credential:password-hash'),
    ipHash: 'test-ip-hmac',
    codeHash: await hash('code:generation:123456'),
    generation: 'generation',
  };
  const reserve = () => client.mutation(internal.emailChange.reserve, args);
  const ready = async () => {
    const result = await reserve();
    await t.mutation(internal.emailChange.delivery, {
      challengeId: result.challengeId,
      generation: args.generation,
      ok: true,
    });
    return result;
  };
  return { t, client, userId, sessionId, accountId, args, reserve, ready };
}
beforeEach(() => {
  vi.stubEnv('PASSWORD_RECOVERY_HASH_SECRET', secret);
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe('email change', () => {
  test('request checks the actual password before delivery and sends only to the new mailbox', async () => {
    const s = await setup();
    const passwordHash = await new Scrypt().hash('TestPassword123!');
    await s.t.run((ctx) => ctx.db.patch(s.accountId, { secret: passwordHash }));
    const send = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', send);
    vi.stubEnv('RESEND_API_KEY', 'test-only-key');
    // Convex-test does not provide this self-hosted deployment's ctx.meta extension.
    const ctx = {
      meta: {
        getRequestMetadata: async () => ({
          ip: '192.0.2.1',
          requestId: 'test',
        }),
      },
      runQuery: (ref: any, args: any) => s.client.query(ref, args),
      runMutation: (ref: any, args: any) =>
        s.client.mutation(
          typeof ref === 'string' ? makeFunctionReference(ref) : ref,
          args,
        ),
    };
    const invoke = (password: string) =>
      (requestAction as any)._handler(ctx, {
        newEmail: 'NEW@example.test',
        currentPassword: password,
      });
    await expect(invoke('WrongPassword123!')).rejects.toThrow(
      'INVALID_PASSWORD',
    );
    expect(send).not.toHaveBeenCalled();
    const result = await invoke('TestPassword123!');
    expect(send).toHaveBeenCalledTimes(1);
    const body = JSON.parse((send.mock.calls[0] as any)[1].body);
    expect(body.to).toEqual(['new@example.test']);
    const code = body.text.match(/\b\d{6}\b/)[0];
    const row = await s.t.run((ctx) => ctx.db.get(result.challengeId));
    expect(JSON.stringify(row)).not.toContain(code);
    await expect(
      s.client.action(api.emailChange.confirm, {
        challengeId: result.challengeId,
        code,
      }),
    ).resolves.toEqual({ changed: true });
  });
  test('a delivery failure keeps old identity and consumes the send budget', async () => {
    const s = await setup();
    const passwordHash = await new Scrypt().hash('TestPassword123!');
    await s.t.run((ctx) => ctx.db.patch(s.accountId, { secret: passwordHash }));
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 503 })),
    );
    vi.stubEnv('RESEND_API_KEY', 'test-only-key');
    const ctx = {
      meta: { getRequestMetadata: async () => ({ ip: '192.0.2.1' }) },
      runQuery: (ref: any, args: any) => s.client.query(ref, args),
      runMutation: (ref: any, args: any) =>
        s.client.mutation(
          typeof ref === 'string' ? makeFunctionReference(ref) : ref,
          args,
        ),
    };
    await expect(
      (requestAction as any)._handler(ctx, {
        newEmail: 'new@example.test',
        currentPassword: 'TestPassword123!',
      }),
    ).rejects.toThrow('UNAVAILABLE');
    const rows = await s.t.run((ctx) =>
      ctx.db.query('emailChangeChallenges').collect(),
    );
    expect(rows[0].status).toBe('failed');
    expect((await s.t.run((ctx) => ctx.db.get(s.userId)))?.email).toBe(
      'old@example.test',
    );
    const attempts = await s.t.run((ctx) =>
      ctx.db.query('emailChangeAttempts').collect(),
    );
    expect(
      attempts.filter((row) => row.bucket.startsWith('send:')),
    ).toHaveLength(3);
    await expect(
      s.client.mutation(internal.emailChange.reserve, {
        ...s.args,
        credentialHash: await hash(`credential:${passwordHash}`),
      }),
    ).rejects.toThrow('RATE_LIMITED');
  });
  test('normalizes addresses and rejects malformed input', () => {
    expect(normalizeEmail(' NEW@Example.Test ')).toBe('new@example.test');
    expect(() => normalizeEmail('no email')).toThrow('INVALID_EMAIL');
  });
  test('requires an active session and rejects changed credentials', async () => {
    const s = await setup();
    await expect(
      s.t.mutation(internal.emailChange.reserve, s.args),
    ).rejects.toThrow();
    await expect(
      s.client.mutation(internal.emailChange.reserve, {
        ...s.args,
        credentialHash: 'wrong',
      }),
    ).rejects.toThrow('REAUTHENTICATE');
    await s.t.run((ctx) => ctx.db.delete(s.sessionId));
    await expect(s.reserve()).rejects.toThrow('UNAUTHENTICATED');
  });
  test('rejects an address owned by another account', async () => {
    const s = await setup();
    await s.t.run((ctx) =>
      ctx.db.insert('users', { email: 'new@example.test' }),
    );
    await expect(s.reserve()).rejects.toThrow('EMAIL_UNAVAILABLE');
  });
  test('atomically changes both login identities, preserves password and phone, consumes once', async () => {
    const s = await setup();
    const { challengeId } = await s.ready();
    const recoveryId = await s.t.mutation(
      internal.passwordRecovery.createChallenge,
      {
        userId: s.userId,
        passwordAccountId: s.accountId,
        identifierHash: await hmacSha256(secret, 'identifier:old@example.test'),
        ipHash: 'hmac',
        channel: 'email',
        codeHash: 'hmac',
        now: Date.now(),
        expiresAt: Date.now() + 600000,
      },
    );
    for (let i = 0; i < 2; i++)
      expect(
        await s.client.action(api.emailChange.confirm, {
          challengeId,
          code: '123456',
        }),
      ).toEqual({ changed: true });
    const result = await s.t.run(async (ctx) => ({
      user: await ctx.db.get(s.userId),
      account: await ctx.db.get(s.accountId),
      recovery: await ctx.db.get(recoveryId),
      row: await ctx.db.get(challengeId),
    }));
    expect(result.user).toMatchObject({
      email: 'new@example.test',
      phone: '+79990000001',
      phoneVerificationTime: 1,
    });
    expect(result.account).toMatchObject({
      providerAccountId: 'new@example.test',
      secret: 'password-hash',
      userId: s.userId,
      emailVerified: 'new@example.test',
    });
    expect(result.recovery?.status).toBe('failed');
    expect(result.row?.codeHash).toBe('');
    expect(
      await s.t.query(internal.passwordRecovery.resolvePasswordIdentifier, {
        identifier: 'old@example.test',
        channel: 'email',
      }),
    ).toBeNull();
    expect(
      await s.t.query(internal.passwordRecovery.resolvePasswordIdentifier, {
        identifier: 'new@example.test',
        channel: 'email',
      }),
    ).toMatchObject({ userId: s.userId });
  });
  test('wrong codes commit the failure count and lock after five attempts', async () => {
    const s = await setup();
    const { challengeId } = await s.ready();
    for (let i = 0; i < 5; i++)
      await expect(
        s.client.action(api.emailChange.confirm, {
          challengeId,
          code: '000000',
        }),
      ).rejects.toThrow('INVALID_CODE');
    expect(
      (await s.t.run((ctx) => ctx.db.get(challengeId)))?.failedAttempts,
    ).toBe(5);
    await expect(
      s.client.action(api.emailChange.confirm, { challengeId, code: '123456' }),
    ).rejects.toThrow('INVALID_CODE');
  });
  test('expired and undelivered codes cannot change identity', async () => {
    const s = await setup();
    const { challengeId } = await s.reserve();
    await expect(
      s.client.action(api.emailChange.confirm, { challengeId, code: '123456' }),
    ).rejects.toThrow('INVALID_CODE');
    await s.t.mutation(internal.emailChange.delivery, {
      challengeId,
      generation: s.args.generation,
      ok: false,
    });
    await expect(
      s.client.action(api.emailChange.confirm, { challengeId, code: '123456' }),
    ).rejects.toThrow('INVALID_CODE');
    await s.t.run((ctx) =>
      ctx.db.patch(challengeId, {
        status: 'pending',
        expiresAt: Date.now() - 1,
      }),
    );
    await expect(
      s.client.action(api.emailChange.confirm, { challengeId, code: '123456' }),
    ).rejects.toThrow('INVALID_CODE');
  });
  test('a different session or user cannot use the challenge', async () => {
    const s = await setup();
    const { challengeId } = await s.ready();
    const anotherSession = await s.t.run((ctx) =>
      ctx.db.insert('authSessions', {
        userId: s.userId,
        expirationTime: Date.now() + 100000,
      }),
    );
    await expect(
      s.t
        .withIdentity({ subject: `${s.userId}|${anotherSession}` })
        .action(api.emailChange.confirm, { challengeId, code: '123456' }),
    ).rejects.toThrow('INVALID_CODE');
  });
  test('resend invalidates previous code, preserves failed attempts and enforces cooldown', async () => {
    const s = await setup();
    const { challengeId } = await s.ready();
    await expect(
      s.client.mutation(internal.emailChange.reserve, {
        ...s.args,
        challengeId,
      }),
    ).rejects.toThrow('RATE_LIMITED');
    await s.client.mutation(internal.emailChange.commit, {
      challengeId,
      codeHash: 'bad',
    });
    vi.advanceTimersByTime(60001);
    await s.client.mutation(internal.emailChange.reserve, {
      ...s.args,
      challengeId,
      generation: 'second',
      codeHash: await hash('code:second:654321'),
    });
    await s.t.mutation(internal.emailChange.delivery, {
      challengeId,
      generation: 'second',
      ok: true,
    });
    expect(
      (await s.t.run((ctx) => ctx.db.get(challengeId)))?.failedAttempts,
    ).toBe(1);
    await expect(
      s.client.action(api.emailChange.confirm, { challengeId, code: '123456' }),
    ).rejects.toThrow('INVALID_CODE');
    expect(
      await s.client.action(api.emailChange.confirm, {
        challengeId,
        code: '654321',
      }),
    ).toEqual({ changed: true });
  });
  test('send limit survives resends and address changes', async () => {
    const s = await setup();
    for (let i = 0; i < 5; i++) {
      await s.client.mutation(internal.emailChange.reserve, {
        ...s.args,
        newEmail: `target${i}@example.test`,
      });
      vi.advanceTimersByTime(60001);
    }
    await expect(s.reserve()).rejects.toThrow('RATE_LIMITED');
  });
  test('rechecks address availability and credentials at commit', async () => {
    const s = await setup();
    const { challengeId } = await s.ready();
    const other = await s.t.run((ctx) =>
      ctx.db.insert('users', { email: s.args.newEmail }),
    );
    await expect(
      s.client.action(api.emailChange.confirm, { challengeId, code: '123456' }),
    ).rejects.toThrow('EMAIL_UNAVAILABLE');
    expect((await s.t.run((ctx) => ctx.db.get(s.userId)))?.email).toBe(
      'old@example.test',
    );
    await s.t.run((ctx) => ctx.db.delete(other));
    await s.t.run((ctx) =>
      ctx.db.patch(s.accountId, { secret: 'new-password-hash' }),
    );
    await expect(
      s.client.action(api.emailChange.confirm, { challengeId, code: '123456' }),
    ).rejects.toThrow('REAUTHENTICATE');
  });
  test('two accounts competing for one address cannot both claim it', async () => {
    const s = await setup();
    const first = await s.ready();
    const other = await s.t.run(async (ctx) => {
      const userId = await ctx.db.insert('users', {
        email: 'second@example.test',
      });
      const sessionId = await ctx.db.insert('authSessions', {
        userId,
        expirationTime: Date.now() + 10000000,
      });
      await ctx.db.insert('authAccounts', {
        userId,
        provider: 'password',
        providerAccountId: 'second@example.test',
        secret: 'password-hash',
      });
      return { userId, sessionId };
    });
    const client = s.t.withIdentity({
      subject: `${other.userId}|${other.sessionId}`,
    });
    await expect(
      client.action(api.emailChange.confirm, {
        challengeId: first.challengeId,
        code: '123456',
      }),
    ).rejects.toThrow('INVALID_CODE');
    vi.advanceTimersByTime(60001);
    const second = await client.mutation(internal.emailChange.reserve, {
      ...s.args,
      ipHash: 'another-ip-hmac',
    });
    await s.t.mutation(internal.emailChange.delivery, {
      challengeId: second.challengeId,
      generation: s.args.generation,
      ok: true,
    });
    const results = await Promise.allSettled([
      s.client.action(api.emailChange.confirm, {
        challengeId: first.challengeId,
        code: '123456',
      }),
      client.action(api.emailChange.confirm, {
        challengeId: second.challengeId,
        code: '123456',
      }),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    const owners = await s.t.run((ctx) =>
      ctx.db
        .query('users')
        .withIndex('email', (q) => q.eq('email', s.args.newEmail))
        .collect(),
    );
    expect(owners).toHaveLength(1);
  });
  test.each(['email', 'ip'] as const)(
    'enforces the independent %s daily bucket',
    async (kind) => {
      const s = await setup();
      const bucket =
        kind === 'email'
          ? `send:email:${await hash(`email:${s.args.newEmail}`)}`
          : `send:ip:${s.args.ipHash}`;
      await s.t.run(async (ctx) => {
        for (let i = 1; i <= 5; i++)
          await ctx.db.insert('emailChangeAttempts', {
            bucket,
            attemptedAt: Date.now() - i * 120000,
            expiresAt: Date.now() + 86400000,
          });
      });
      await expect(s.reserve()).rejects.toThrow('RATE_LIMITED');
    },
  );
  test('notification failure does not undo the change; only current session survives', async () => {
    const s = await setup();
    const { challengeId } = await s.ready();
    const otherSession = await s.t.run((ctx) =>
      ctx.db.insert('authSessions', {
        userId: s.userId,
        expirationTime: Date.now() + 100000,
      }),
    );
    await s.client.action(api.emailChange.confirm, {
      challengeId,
      code: '123456',
    });
    await s.t.finishAllScheduledFunctions(() => vi.runAllTimers());
    expect(await s.t.run((ctx) => ctx.db.get(s.sessionId))).not.toBeNull();
    expect(await s.t.run((ctx) => ctx.db.get(otherSession))).toBeNull();
    expect((await s.t.run((ctx) => ctx.db.get(s.userId)))?.email).toBe(
      'new@example.test',
    );
  });
});

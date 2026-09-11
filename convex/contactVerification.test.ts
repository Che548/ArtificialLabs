import { convexTest } from 'convex-test';
import { beforeEach, afterEach, expect, test, vi } from 'vitest';
import schema from './schema';
import { api, internal } from './_generated/api';
import { contactHash } from './lib/contactVerification';
import { requireEmailForLogin, finishEmailLogin } from './emailVerification';
import { VerifiedPasswordProvider, PhonePasswordProvider } from './auth';
import { makeFunctionReference } from 'convex/server';
import { Scrypt } from 'lucia';
import { request as phoneRequest } from './phoneChange';
const modules = import.meta.glob('./**/*.ts');
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv('PASSWORD_RECOVERY_HASH_SECRET', 'test-only-contact-secret');
  vi.stubEnv('EMAIL_VERIFICATION_REQUIRED', '1');
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
async function setup() {
  const t = convexTest(schema, modules);
  const userId = await t.run((ctx) =>
    ctx.db.insert('users', {
      email: 'contact@example.test',
      phone: '+79990000001',
      phoneVerificationTime: 1,
    }),
  );
  const accountId = await t.run((ctx) =>
    ctx.db.insert('authAccounts', {
      userId,
      provider: 'password',
      providerAccountId: 'contact@example.test',
      secret: 'hash',
    }),
  );
  const sessionId = await t.run((ctx) =>
    ctx.db.insert('authSessions', {
      userId,
      expirationTime: Date.now() + 10000000,
    }),
  );
  const client = t.withIdentity({ subject: `${userId}|${sessionId}` });
  const credentialHash = await contactHash('credential:hash');
  const token = 'a'.repeat(64),
    tokenHash = await contactHash(`token:${token}`);
  const codeHash = await contactHash('code:one:123456');
  const login = async () => {
    const result = await t.mutation(internal.emailVerification.reserve, {
      userId,
      accountId,
      credentialHash,
      tokenHash,
      ipHash: 'ip-hmac',
      codeHash,
      generation: 'one',
    });
    await t.mutation(internal.emailVerification.delivery, {
      challengeId: result.challengeId,
      generation: 'one',
      ok: true,
    });
    return result;
  };
  const phone = async () => {
    const result = await client.mutation(internal.phoneChange.reserve, {
      newPhone: '+79990000002',
      credentialHash,
      codeHash,
      generation: 'one',
    });
    await t.mutation(internal.phoneChange.delivery, {
      challengeId: result.challengeId,
      generation: 'one',
      ok: true,
      retryAt: result.retryAt,
    });
    return result;
  };
  const actionCtx = {
    meta: { getRequestMetadata: async () => ({ ip: '192.0.2.1' }) },
    runQuery: (ref: any, args: any) => t.query(ref, args),
    runMutation: (ref: any, args: any) => t.mutation(ref, args),
  };
  return {
    t,
    userId,
    accountId,
    sessionId,
    client,
    credentialHash,
    token,
    tokenHash,
    codeHash,
    login,
    phone,
    actionCtx,
  };
}
test('phone request checks real password even for a reviewer; delivery failure does not change the number', async () => {
  const s = await setup(), password = 'FixturePassword123!';
  await s.t.run(async ctx => ctx.db.patch(s.accountId, { secret: await new Scrypt().hash(password) }));
  await s.t.mutation(internal.reviewAccess.configure, { userId: s.userId, email: 'contact@example.test', store: 'google', active: true, consoleAccountVerified: true, reason: 'fixture console match' });
  const ctx: any = { meta: { getRequestMetadata: async () => ({ ip: '192.0.2.1', requestId: 'fixture' }) }, runQuery: (ref: any, args: any) => s.client.query(ref, args), runMutation: (ref: any, args: any) => s.client.mutation(typeof ref === 'string' ? makeFunctionReference(ref) : ref, args) };
  const fetchSpy = vi.fn(); vi.stubGlobal('fetch', fetchSpy); vi.stubEnv('SMS_AUTH_ENABLED', '0');
  await expect((phoneRequest as any)._handler(ctx, { newPhone: '+79990000002', currentPassword: 'WrongPassword123!', platform: 'android' })).rejects.toThrow('INVALID_PASSWORD');
  const result = await (phoneRequest as any)._handler(ctx, { newPhone: '+79990000002', currentPassword: password, platform: 'android' });
  expect(result.deliveryFailed).toBe(true);
  expect(fetchSpy).not.toHaveBeenCalled();
  expect((await s.t.run(ctx => ctx.db.get(s.userId)))?.phone).toBe('+79990000001');
  await expect(s.client.action(api.phoneChange.confirm, { challengeId: result.challengeId, code: '123456' })).rejects.toThrow('INVALID_CODE');
});
test('legacy phone provider cannot replace or clear an already verified phone', async () => {
  const s = await setup();
  for (const phone of ['+79990000002', '+79990000001']) await expect(s.client.action(api.auth.signIn, { provider: 'phone', params: { phone } })).rejects.toThrow('PHONE_CHANGE_PASSWORD_REQUIRED');
  expect((await s.t.run(ctx => ctx.db.get(s.userId)))?.phone).toBe('+79990000001');
});
test('email resend invalidates the old code without resetting the error count, and expiry requires a new password proof', async () => {
  const s = await setup(), first = await s.login();
  await s.t.mutation(internal.emailVerification.consume, { challengeId: first.challengeId, tokenHash: s.tokenHash, codeHash: 'wrong' });
  const args = { userId: s.userId, accountId: s.accountId, credentialHash: s.credentialHash, tokenHash: s.tokenHash, ipHash: 'ip-hmac', codeHash: await contactHash('code:two:654321'), generation: 'two', challengeId: first.challengeId };
  await expect(s.t.mutation(internal.emailVerification.reserve, args)).rejects.toThrow('RATE_LIMITED');
  vi.advanceTimersByTime(60001);
  await s.t.mutation(internal.emailVerification.reserve, args);
  await s.t.mutation(internal.emailVerification.delivery, { challengeId: first.challengeId, generation: 'two', ok: true });
  expect((await s.t.run(ctx => ctx.db.get(first.challengeId)))?.failedAttempts).toBe(1);
  expect(await s.t.mutation(internal.emailVerification.consume, { challengeId: first.challengeId, tokenHash: s.tokenHash, codeHash: s.codeHash })).toEqual({ error: 'INVALID_CODE' });
  vi.advanceTimersByTime(600000);
  expect(await s.t.mutation(internal.emailVerification.consume, { challengeId: first.challengeId, tokenHash: s.tokenHash, codeHash: args.codeHash })).toEqual({ error: 'INVALID_CODE' });
});
test.each(['user', 'address', 'ip'])('email daily %s limit is independent', async kind => {
  const s = await setup();
  const bucket = kind === 'user' ? `email:user:${s.userId}` : kind === 'address' ? `email:address:${await contactHash('contact@example.test')}` : 'email:ip:ip-hmac';
  await s.t.run(async ctx => { for (let i = 1; i <= 5; i++) await ctx.db.insert('contactVerificationAttempts', { bucket, at: Date.now() - i * 120000, expiresAt: Date.now() + 86400000 }); });
  await expect(s.login()).rejects.toThrow('RATE_LIMITED');
});
test('phone daily user quota and competing confirmations cannot overwrite another owner', async () => {
  const s = await setup(), first = await s.phone();
  const secondUser = await s.t.run(async ctx => {
    const userId = await ctx.db.insert('users', { email: 'second@example.test', phone: '+79990000003', phoneVerificationTime: 1 });
    await ctx.db.insert('authAccounts', { userId, provider: 'password', providerAccountId: 'second@example.test', secret: 'hash' });
    const sessionId = await ctx.db.insert('authSessions', { userId, expirationTime: Date.now() + 10000000 });
    return { userId, sessionId };
  });
  const second = s.t.withIdentity({ subject: `${secondUser.userId}|${secondUser.sessionId}` });
  const request = await second.mutation(internal.phoneChange.reserve, { newPhone: '+79990000002', credentialHash: s.credentialHash, codeHash: s.codeHash, generation: 'one' });
  await s.t.mutation(internal.phoneChange.delivery, { challengeId: request.challengeId, generation: 'one', ok: true, retryAt: request.retryAt });
  const results = await Promise.allSettled([s.client.action(api.phoneChange.confirm, { challengeId: first.challengeId, code: '123456' }), second.action(api.phoneChange.confirm, { challengeId: request.challengeId, code: '123456' })]);
  expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
  await s.t.run(async ctx => { for (let i = 1; i <= 3; i++) await ctx.db.insert('contactVerificationAttempts', { bucket: `phone:user:${s.userId}`, at: Date.now() - i * 400000, expiresAt: Date.now() + 86400000 }); });
  await expect(s.client.mutation(internal.phoneChange.reserve, { newPhone: '+79990000004', credentialHash: s.credentialHash, codeHash: s.codeHash, generation: 'other' })).rejects.toThrow('RATE_LIMITED');
});
test('mandatory verification is off by default and applies to unverified legacy users when enabled', async () => {
  const s = await setup();
  expect(
    (
      await s.t.query(internal.emailVerification.loginState, {
        userId: s.userId,
      })
    ).required,
  ).toBe(true);
  vi.stubEnv('EMAIL_VERIFICATION_REQUIRED', '0');
  expect(
    (
      await s.t.query(internal.emailVerification.loginState, {
        userId: s.userId,
      })
    ).required,
  ).toBe(false);
  vi.stubEnv('EMAIL_VERIFICATION_REQUIRED', '1');
  await s.t.run((ctx) => ctx.db.patch(s.userId, { emailVerificationTime: 1 }));
  expect(
    (
      await s.t.query(internal.emailVerification.loginState, {
        userId: s.userId,
      })
    ).required,
  ).toBe(false);
});
test('real password providers gate registration and both login identifiers; review exemption still requires password', async () => {
  const s = await setup();
  const password = 'FixturePassword123!';
  await s.t.run(async (ctx) =>
    ctx.db.patch(s.accountId, { secret: await new Scrypt().hash(password) }),
  );
  const ctx: any = {
    ...s.actionCtx,
    runMutation: (ref: any, args: any) =>
      s.t.mutation(
        typeof ref === 'string' ? makeFunctionReference(ref) : ref,
        args,
      ),
  };
  vi.stubEnv('RESEND_API_KEY', 'fixture');
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('{}', { status: 200 })),
  );
  await expect(
    VerifiedPasswordProvider.authorize(
      {
        email: 'contact@example.test',
        password: 'WrongPassword123!',
        flow: 'signIn',
        emailTicketToken: s.token,
      },
      ctx,
    ),
  ).rejects.toThrow();
  await expect(
    VerifiedPasswordProvider.authorize(
      {
        email: 'contact@example.test',
        password,
        flow: 'signIn',
        emailTicketToken: s.token,
      },
      ctx,
    ),
  ).rejects.toThrow('EMAIL_VERIFICATION_REQUIRED');
  vi.advanceTimersByTime(60001);
  await expect(
    PhonePasswordProvider.authorize(
      { phone: '+79990000001', password, emailTicketToken: s.token },
      ctx,
    ),
  ).rejects.toThrow('EMAIL_VERIFICATION_REQUIRED');
  vi.advanceTimersByTime(60001);
  await expect(
    VerifiedPasswordProvider.authorize(
      {
        email: 'signup@example.test',
        password,
        flow: 'signUp',
        emailTicketToken: s.token,
      },
      ctx,
    ),
  ).rejects.toThrow('EMAIL_VERIFICATION_REQUIRED');
  expect(
    await s.t.run((ctx) => ctx.db.query('authSessions').collect()),
  ).toHaveLength(1);
  await s.t.mutation(internal.reviewAccess.configure, {
    userId: s.userId,
    email: 'contact@example.test',
    store: 'apple',
    active: true,
    consoleAccountVerified: true,
    reason: 'fixture verified',
  });
  await expect(
    VerifiedPasswordProvider.authorize(
      { email: 'contact@example.test', password, flow: 'signIn' },
      ctx,
    ),
  ).resolves.toMatchObject({ userId: s.userId });
  await expect(
    PhonePasswordProvider.authorize(
      { phone: '+79990000001', password: 'WrongPassword123!' },
      ctx,
    ),
  ).rejects.toThrow();
});
test('a password-authenticated login returns a non-secret challenge, no session, and sends a real-format code', async () => {
  const s = await setup();
  vi.stubEnv('RESEND_API_KEY', 'fixture');
  const send = vi.fn(async () => new Response('{}', { status: 200 }));
  vi.stubGlobal('fetch', send);
  let error: any;
  try {
    await requireEmailForLogin(s.actionCtx, s.userId, s.token);
  } catch (cause) {
    error = cause;
  }
  expect(error.data.code).toBe('EMAIL_VERIFICATION_REQUIRED');
  expect(JSON.stringify(error.data)).not.toContain(s.token);
  const body = JSON.parse((send.mock.calls[0] as any)[1].body);
  const code = body.text.match(/\b\d{6}\b/)[0];
  const result = await finishEmailLogin(s.actionCtx, {
    challengeId: error.data.challengeId,
    token: s.token,
    code,
  });
  expect(result.userId).toBe(s.userId);
  expect(
    (await s.t.run((ctx) => ctx.db.get(s.userId)))?.emailVerificationTime,
  ).toBeGreaterThan(0);
  expect(
    (await s.t.run((ctx) => ctx.db.query('authSessions').collect())).length,
  ).toBe(1);
});
test('login proof cannot be guessed, replayed, or used after password/email changes', async () => {
  const s = await setup();
  const { challengeId } = await s.login();
  await expect(
    s.t.query(internal.emailVerification.challenge, {
      challengeId,
      tokenHash: 'wrong',
    }),
  ).rejects.toThrow('REAUTHENTICATE');
  await s.t.run((ctx) => ctx.db.patch(s.accountId, { secret: 'changed' }));
  expect(
    await s.t.mutation(internal.emailVerification.consume, {
      challengeId,
      tokenHash: s.tokenHash,
      codeHash: s.codeHash,
    }),
  ).toEqual({ error: 'REAUTHENTICATE' });
  await s.t.run((ctx) => ctx.db.patch(s.accountId, { secret: 'hash' }));
  expect(
    await s.t.mutation(internal.emailVerification.consume, {
      challengeId,
      tokenHash: s.tokenHash,
      codeHash: s.codeHash,
    }),
  ).toEqual({ userId: s.userId });
  expect(
    await s.t.mutation(internal.emailVerification.consume, {
      challengeId,
      tokenHash: s.tokenHash,
      codeHash: s.codeHash,
    }),
  ).toEqual({ error: 'INVALID_CODE' });
});
test('five bad email codes lock the request and survive resend', async () => {
  const s = await setup();
  const { challengeId } = await s.login();
  for (let i = 0; i < 5; i++)
    await s.t.mutation(internal.emailVerification.consume, {
      challengeId,
      tokenHash: s.tokenHash,
      codeHash: 'wrong',
    });
  expect(
    (await s.t.run((ctx) => ctx.db.get(challengeId)))?.failedAttempts,
  ).toBe(5);
  expect(
    await s.t.mutation(internal.emailVerification.consume, {
      challengeId,
      tokenHash: s.tokenHash,
      codeHash: s.codeHash,
    }),
  ).toEqual({ error: 'INVALID_CODE' });
  vi.advanceTimersByTime(60001);
  await expect(
    s.t.mutation(internal.emailVerification.reserve, {
      userId: s.userId,
      accountId: s.accountId,
      credentialHash: s.credentialHash,
      tokenHash: s.tokenHash,
      codeHash: s.codeHash,
      ipHash: 'ip-hmac',
      generation: 'two',
      challengeId,
    }),
  ).rejects.toThrow('REAUTHENTICATE');
});
test('review exceptions are exact, audited, internal-only, non-admin and stop working after email change', async () => {
  const s = await setup();
  const grant = {
    userId: s.userId,
    email: 'contact@example.test',
    store: 'apple' as const,
    active: true,
    consoleAccountVerified: true,
    reason: 'fixture console match',
  };
  await expect(
    s.t.mutation(internal.reviewAccess.configure, {
      ...grant,
      consoleAccountVerified: false,
    }),
  ).rejects.toThrow('VERIFICATION_REQUIRED');
  await s.t.mutation(internal.reviewAccess.configure, grant);
  expect(
    (
      await s.t.query(internal.emailVerification.loginState, {
        userId: s.userId,
      })
    ).required,
  ).toBe(false);
  await s.t.run((ctx) =>
    ctx.db.patch(s.userId, { email: 'changed@example.test' }),
  );
  expect(
    (
      await s.t.query(internal.emailVerification.loginState, {
        userId: s.userId,
      })
    ).required,
  ).toBe(true);
  const audits = await s.t.run((ctx) =>
    ctx.db.query('reviewLoginAudit').collect(),
  );
  expect(audits.map((row) => row.operation)).toEqual(['grant']);
});
test('phone change is atomic, preserves password, invalidates old login and revokes only other sessions', async () => {
  const s = await setup();
  await s.t.run((ctx) =>
    ctx.db.insert('authAccounts', {
      userId: s.userId,
      provider: 'phone',
      providerAccountId: '+79990000001',
      phoneVerified: '+79990000001',
    }),
  );
  const other = await s.t.run((ctx) =>
    ctx.db.insert('authSessions', {
      userId: s.userId,
      expirationTime: Date.now() + 10000000,
    }),
  );
  const { challengeId } = await s.phone();
  for (let i = 0; i < 2; i++)
    expect(
      await s.client.action(api.phoneChange.confirm, {
        challengeId,
        code: '123456',
      }),
    ).toEqual({ changed: true, phone: '+79990000002' });
  expect((await s.t.run((ctx) => ctx.db.get(s.accountId)))?.secret).toBe(
    'hash',
  );
  expect(await s.t.run((ctx) => ctx.db.get(other))).toBeNull();
  expect(await s.t.run((ctx) => ctx.db.get(s.sessionId))).not.toBeNull();
  expect(
    await s.t.query(internal.passwordRecovery.resolvePasswordIdentifier, {
      identifier: '+79990000001',
      channel: 'sms',
    }),
  ).toBeNull();
  expect(
    await s.t.query(internal.passwordRecovery.resolvePasswordIdentifier, {
      identifier: '+79990000002',
      channel: 'sms',
    }),
  ).toMatchObject({ userId: s.userId });
});
test('phone confirmation rejects a foreign session, expiry, wrong codes and concurrent ownership', async () => {
  const s = await setup();
  const { challengeId } = await s.phone();
  await expect(
    s.t.action(api.phoneChange.confirm, { challengeId, code: '123456' }),
  ).rejects.toThrow('UNAUTHENTICATED');
  for (let i = 0; i < 5; i++)
    await expect(
      s.client.action(api.phoneChange.confirm, { challengeId, code: '000000' }),
    ).rejects.toThrow('INVALID_CODE');
  await expect(
    s.client.action(api.phoneChange.confirm, { challengeId, code: '123456' }),
  ).rejects.toThrow('INVALID_CODE');
  await s.t.run((ctx) =>
    ctx.db.patch(challengeId, { failedAttempts: 0, expiresAt: Date.now() - 1 }),
  );
  await expect(
    s.client.action(api.phoneChange.confirm, { challengeId, code: '123456' }),
  ).rejects.toThrow('INVALID_CODE');
  await s.t.run(async (ctx) => {
    await ctx.db.patch(challengeId, { expiresAt: Date.now() + 10000 });
    await ctx.db.insert('users', {
      phone: '+79990000002',
      phoneVerificationTime: 1,
    });
  });
  await expect(
    s.client.action(api.phoneChange.confirm, { challengeId, code: '123456' }),
  ).rejects.toThrow('PHONE_UNAVAILABLE');
});

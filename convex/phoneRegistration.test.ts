import { convexTest } from 'convex-test';
import { beforeEach, afterEach, expect, test, vi } from 'vitest';
import { makeFunctionReference } from 'convex/server';
import schema from './schema';
import { api, internal } from './_generated/api';
import { contactHash } from './lib/contactVerification';
import { PhonePasswordProvider } from './auth';
import { REGISTRATION_CONSENT_VERSION } from '../shared/registration-consent';
import { hmacSha256 } from './lib/sms';
import { request as requestSignup } from './phoneRegistration';
const modules = import.meta.glob('./**/*.ts');
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv('PASSWORD_RECOVERY_HASH_SECRET', 'synthetic-phone-registration');
  vi.stubEnv('EMAIL_VERIFICATION_REQUIRED', '1');
  vi.stubGlobal(
    'fetch',
    vi.fn(() => {
      throw Error('Real network forbidden');
    }),
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
test('request uses the existing SMS gateway contract once and never creates a user', async () => {
  const s = await fixture();
  vi.stubEnv('SMS_AUTH_ENABLED', '1');
  vi.stubEnv('SMS_RATE_LIMIT_HASH_SECRET', 'synthetic-sms-rate');
  vi.stubEnv('SMS_GATEWAY_SHARED_SECRET', 'synthetic-gateway');
  const send = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
  vi.stubGlobal('fetch', send);
  const ctx = { ...s.actionCtx, meta: { getRequestMetadata: async () => ({ ip: '192.0.2.10', requestId: 'synthetic-signup' }) } };
  const args = { phone: '+79990000025', token: 'c'.repeat(64), platform: 'android' };
  const result = await (requestSignup as any)._handler(ctx, args);
  expect(result.deliveryFailed).toBe(false); expect(send).toHaveBeenCalledTimes(1);
  const payload = JSON.parse((send.mock.calls[0] as any)[1].body);
  expect(payload.platform).toBe('android'); expect(payload.purpose).toBe('phone-verification');
  expect(await s.t.run(c => c.db.query('users').collect())).toHaveLength(0);
  await expect((requestSignup as any)._handler(ctx, args)).rejects.toThrow('RATE_LIMITED');
  expect(send).toHaveBeenCalledTimes(1);
  expect(await s.t.action(api.phoneRegistration.confirm, { challengeId: result.challengeId, token: args.token, code: payload.code })).toEqual({ verified: true });
});
async function fixture() {
  const t = convexTest(schema, modules),
    phone = '+79990000021',
    token = 'a'.repeat(64);
  const tokenHash = await contactHash(`signup-token:${token}`),
    codeHash = await contactHash('signup-code:first:123456');
  const input = {
    phone,
    tokenHash,
    codeHash,
    generation: 'first',
    ipHash: 'synthetic-ip',
  };
  const reserved = await t.mutation(internal.phoneRegistration.reserve, input);
  const id = reserved.challengeId;
  await t.mutation(internal.phoneRegistration.delivery, {
    challengeId: id,
    generation: 'first',
    ok: true,
  });
  const actionCtx: any = {
    auth: { getUserIdentity: async () => null },
    runQuery: (ref: any, args: any) => t.query(ref, args),
    runMutation: (ref: any, args: any) =>
      t.mutation(
        typeof ref === 'string' ? makeFunctionReference(ref) : ref,
        args,
      ),
  };
  const verify = () =>
    t.mutation(internal.phoneRegistration.verifyCode, {
      challengeId: id,
      tokenHash,
      codeHash,
    });
  const signup = (password = 'SyntheticPassword123!') =>
    PhonePasswordProvider.authorize(
      { flow: 'signUp', challengeId: id, token, password },
      actionCtx,
    );
  return {
    t,
    phone,
    token,
    tokenHash,
    codeHash,
    id,
    input,
    actionCtx,
    verify,
    signup,
  };
}
test('no user before verification; real auth provider stores a password and allows phone-only login', async () => {
  const s = await fixture();
  expect(await s.t.run((ctx) => ctx.db.query('users').collect())).toHaveLength(
    0,
  );
  await expect(s.signup()).rejects.toThrow('INVALID_CODE');
  expect(await s.verify()).toEqual({ verified: true });
  const result = await s.signup();
  const user = await s.t.run((ctx) => ctx.db.get(result!.userId));
  expect(user?.phone).toBe(s.phone);
  expect(user?.phoneVerificationTime).toBeGreaterThan(0);
  expect(user?.email).toBeUndefined();
  const accounts = await s.t.run((ctx) =>
    ctx.db.query('authAccounts').collect(),
  );
  expect(accounts).toHaveLength(1);
  expect(accounts[0].secret).not.toBe('SyntheticPassword123!');
  await expect(
    PhonePasswordProvider.authorize(
      { phone: s.phone, password: 'SyntheticPassword123!' },
      s.actionCtx,
    ),
  ).resolves.toEqual(result);
  await expect(
    PhonePasswordProvider.authorize(
      { phone: s.phone, password: 'WrongPassword123!' },
      s.actionCtx,
    ),
  ).rejects.toThrow();
  expect(await s.signup()).toEqual(result); // Lost response does not create another account.
  expect(await s.t.run((ctx) => ctx.db.query('users').collect())).toHaveLength(
    1,
  );
  expect(
    await s.t.run((ctx) => ctx.db.query('adminAccountLedger').collect()),
  ).toHaveLength(1);
});
test('wrong device token, five failed codes and expiry cannot create accounts', async () => {
  const s = await fixture();
  await expect(
    s.t.action(api.phoneRegistration.confirm, {
      challengeId: s.id,
      token: 'b'.repeat(64),
      code: '123456',
    }),
  ).rejects.toThrow('INVALID_CODE');
  for (let i = 0; i < 5; i++)
    expect(
      await s.t.mutation(internal.phoneRegistration.verifyCode, {
        challengeId: s.id,
        tokenHash: s.tokenHash,
        codeHash: 'wrong',
      }),
    ).toEqual({ verified: false });
  expect(await s.verify()).toEqual({ verified: false });
  vi.advanceTimersByTime(300001);
  await expect(
    s.t.mutation(internal.phoneRegistration.reserve, {
      ...s.input,
      challengeId: s.id,
    }),
  ).rejects.toThrow('INVALID_CODE');
  await expect(s.signup()).rejects.toThrow('INVALID_CODE');
});
test('delivery failure, stale delivery callback and resend cooldown are enforced', async () => {
  const s = await fixture();
  await s.t.run((ctx) => ctx.db.patch(s.id, { status: 'failed' }));
  expect(await s.verify()).toEqual({ verified: false });
  await expect(
    s.t.mutation(internal.phoneRegistration.reserve, {
      ...s.input,
      challengeId: s.id,
    }),
  ).rejects.toThrow('RATE_LIMITED');
  vi.advanceTimersByTime(300001);
  await s.t.mutation(internal.phoneRegistration.reserve, {
    ...s.input,
    challengeId: s.id,
    generation: 'second',
  });
  await s.t.mutation(internal.phoneRegistration.delivery, {
    challengeId: s.id,
    generation: 'first',
    ok: true,
  });
  expect((await s.t.run((ctx) => ctx.db.get(s.id)))?.status).toBe('sending');
});
test('existing number and number claimed after code verification never merge accounts', async () => {
  const s = await fixture();
  await s.verify();
  await s.t.run((ctx) =>
    ctx.db.insert('users', {
      phone: s.phone,
      phoneVerificationTime: Date.now(),
    }),
  );
  await expect(s.signup()).rejects.toThrow('PHONE_UNAVAILABLE');
  await expect(
    s.t.mutation(internal.phoneRegistration.reserve, {
      ...s.input,
      ipHash: 'another',
    }),
  ).rejects.toThrow('PHONE_UNAVAILABLE');
  expect(
    await s.t.run((ctx) => ctx.db.query('authAccounts').collect()),
  ).toHaveLength(0);
});
test('verified proof expires and cannot be used with another password after consumption', async () => {
  const s = await fixture();
  await s.verify();
  await s.signup();
  await expect(s.signup('AnotherPassword123!')).rejects.toThrow();
  vi.advanceTimersByTime(600001);
  await expect(s.signup()).rejects.toThrow('INVALID_CODE');
});
test('phone consent remains owner-bound and optional email credentials can be added', async () => {
  const s = await fixture();
  await s.verify();
  const result = await s.signup();
  const sessionId = await s.t.run((ctx) =>
    ctx.db.insert('authSessions', {
      userId: result!.userId,
      expirationTime: Date.now() + 100000,
    }),
  );
  const client = s.t.withIdentity({
    subject: `${result!.userId}|${sessionId}`,
  });
  const receipt = {
    phone: s.phone,
    acceptedAt: Date.now(),
    version: REGISTRATION_CONSENT_VERSION,
  };
  expect(
    (await client.mutation(api.registrationConsent.accept, receipt)).accepted,
  ).toBe(true);
  expect(
    (
      await client.mutation(api.registrationConsent.accept, {
        ...receipt,
        phone: '+79990000022',
      })
    ).accepted,
  ).toBe(false);
  expect(
    (await client.query(internal.emailChange.credentials, {})).email,
  ).toBeUndefined();
  const credential = await client.query(internal.emailChange.credentials, {});
  expect(credential.account.secret).toBeTruthy();
  expect(
    await s.t.run((ctx) =>
      ctx.db.query('documentInterpretationConsents').collect(),
    ),
  ).toHaveLength(0);
  const hash = (value: string) =>
    hmacSha256('synthetic-phone-registration', `email-change:${value}`);
  const codeHash = await hash('code:add:123456');
  const email = await client.mutation(internal.emailChange.reserve, {
    newEmail: 'added@example.test',
    credentialHash: await hash(`credential:${credential.account.secret}`),
    generation: 'add',
    codeHash,
    ipHash: 'synthetic-email-ip',
  });
  await s.t.run((ctx) =>
    ctx.db.patch(email.challengeId, { status: 'pending' }),
  );
  expect(
    await client.mutation(internal.emailChange.commit, {
      challengeId: email.challengeId,
      codeHash,
    }),
  ).toEqual({ changed: true });
  expect((await s.t.run((ctx) => ctx.db.get(result!.userId)))?.email).toBe(
    'added@example.test',
  );
  await expect(
    PhonePasswordProvider.authorize(
      { phone: s.phone, password: 'SyntheticPassword123!' },
      s.actionCtx,
    ),
  ).resolves.toEqual(result);
});

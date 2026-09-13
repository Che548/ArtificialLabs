import { convexTest } from 'convex-test';
import { afterEach, expect, test, vi } from 'vitest';
import { Scrypt } from 'lucia';
import { makeFunctionReference } from 'convex/server';
import schema from './schema';
import { api, internal } from './_generated/api';
import { VerifiedPasswordProvider } from './auth';
import { clearDemoAdminLoginException } from './lib/adminAccess';
const modules = import.meta.glob('./**/*.ts');
afterEach(() => vi.unstubAllEnvs());
async function setup() {
  vi.stubEnv('EMAIL_VERIFICATION_REQUIRED', '1');
  vi.stubEnv('EMAIL_VERIFICATION_ALLOW_LEGACY', '0');
  const t = convexTest(schema, modules);
  const email = 'demo@example.test', password = 'Synthetic-password-123!';
  const userId = await t.run(ctx => ctx.db.insert('users', { email }));
  const actorId = await t.run(ctx => ctx.db.insert('users', { email: 'operator@example.test' }));
  const secret = await new Scrypt().hash(password);
  await t.run(async ctx => {
    await ctx.db.insert('authAccounts', { userId, provider: 'password', providerAccountId: email, secret });
    await ctx.db.insert('adminMemberships', { userId: actorId, role: 'admin', emailSnapshot: 'operator@example.test', grantedAt: 1, updatedAt: 1 });
  });
  const operator = t.withIdentity({ subject: `${actorId}|operator` });
  const membershipId = await operator.mutation(api.admin.grant, { email, requestId: 'fixture' });
  const args = { userId, email, enabled: true, reason: 'Controlled customer demonstration' };
  return { t, email, password, userId, operator, membershipId, args };
}
test('operator-only exact account exception is audited and still checks the real password', async () => {
  const s = await setup();
  await expect(s.t.mutation(internal.adminDemoAccess.configure, s.args)).rejects.toThrow('UNAUTHENTICATED');
  await expect(s.operator.mutation(internal.adminDemoAccess.configure, { ...s.args, email: 'other@example.test' })).rejects.toThrow();
  expect((await s.t.query(internal.emailVerification.loginState, { userId: s.userId })).required).toBe(true);
  await s.operator.mutation(internal.adminDemoAccess.configure, s.args);
  expect((await s.t.query(internal.emailVerification.loginState, { userId: s.userId })).required).toBe(false);
  const ctx: any = {
    runQuery: (ref: any, args: any) => s.t.query(ref, args),
    runMutation: (ref: any, args: any) => s.t.mutation(typeof ref === 'string' ? makeFunctionReference(ref) : ref, args),
  };
  await expect(VerifiedPasswordProvider.authorize({ email: s.email, password: 'WrongPassword123!', flow: 'signIn' }, ctx)).rejects.toThrow();
  await expect(VerifiedPasswordProvider.authorize({ email: s.email, password: s.password, flow: 'signIn' }, ctx)).resolves.toMatchObject({ userId: s.userId });
  const state = await s.t.query(internal.emailVerification.loginState, { userId: s.userId });
  expect(state.user.emailVerificationTime).toBeUndefined();
  expect(await s.t.run(ctx => ctx.db.query('reviewLoginExceptions').collect())).toHaveLength(0);
  expect((await s.t.run(ctx => ctx.db.query('adminAuditEvents').collect())).some(x => x.action === 'admin.demo_login.grant')).toBe(true);
});
test('revocation and regrant never revive the exception', async () => {
  const s = await setup();
  await s.operator.mutation(internal.adminDemoAccess.configure, s.args);
  await s.operator.mutation(api.admin.revoke, { membershipId: s.membershipId, requestId: 'revoke' });
  expect((await s.t.query(internal.emailVerification.loginState, { userId: s.userId })).required).toBe(true);
  await s.operator.mutation(api.admin.grant, { email: s.email, requestId: 'regrant' });
  expect((await s.t.query(internal.emailVerification.loginState, { userId: s.userId })).required).toBe(true);
});
test('email changes clear the exception; ordinary and pending-deletion accounts cannot get it', async () => {
  const s = await setup();
  await s.operator.mutation(internal.adminDemoAccess.configure, s.args);
  const stateId = await s.t.run(ctx => ctx.db.insert('accountStates', { userId: s.userId, scheduledDeletionAt: Date.now() + 1000, updatedAt: Date.now() }));
  expect((await s.t.query(internal.emailVerification.loginState, { userId: s.userId })).required).toBe(true);
  await expect(s.operator.mutation(internal.adminDemoAccess.configure, s.args)).rejects.toThrow('ACTIVE_PASSWORD_ACCOUNT_REQUIRED');
  await s.t.run(ctx => ctx.db.delete(stateId));
  await s.t.run(ctx => clearDemoAdminLoginException(ctx, s.userId));
  expect((await s.t.query(internal.emailVerification.loginState, { userId: s.userId })).required).toBe(true);
  await s.t.run(ctx => ctx.db.patch(s.userId, { email: 'changed@example.test' }));
  await expect(s.operator.mutation(internal.adminDemoAccess.configure, s.args)).rejects.toThrow();
  await s.t.run(ctx => ctx.db.delete(s.membershipId));
  await expect(s.operator.mutation(internal.adminDemoAccess.configure, { ...s.args, email: 'changed@example.test' })).rejects.toThrow();
});

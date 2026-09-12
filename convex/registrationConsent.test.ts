import { convexTest } from 'convex-test';
import { expect, test } from 'vitest';
import { api } from './_generated/api';
import schema from './schema';
import { matchesNewRegistration, REGISTRATION_CONSENT_VERSION, REGISTRATION_CONSENT_TTL } from '../shared/registration-consent';

const modules = import.meta.glob('./**/*.ts');
const receipt = () => ({ email: 'registration@example.test', acceptedAt: Date.now(), version: REGISTRATION_CONSENT_VERSION });
async function fixture() {
  const t = convexTest(schema, modules);
  const args = receipt();
  const userId = await t.run(ctx => ctx.db.insert('users', { email: args.email, emailVerificationTime: Date.now() }));
  return { t, args, userId, client: t.withIdentity({ subject: `${userId}|fixture` }) };
}

test('registration choice is owner-bound, versioned, fresh and not a legacy migration', () => {
  const now = Date.now();
  const args = { ...receipt(), acceptedAt: now };
  const user = { email: args.email, _creationTime: now };
  expect(matchesNewRegistration(args, user, now)).toBe(true);
  expect(matchesNewRegistration(args, { ...user, email: 'other@example.test' }, now)).toBe(false);
  expect(matchesNewRegistration(args, { ...user, _creationTime: now - 120000 }, now)).toBe(false);
  expect(matchesNewRegistration(args, user, now + REGISTRATION_CONSENT_TTL + 1)).toBe(false);
  expect(matchesNewRegistration({ ...args, version: 'old' }, user, now)).toBe(false);
  expect(matchesNewRegistration({ ...args, acceptedAt: now + 1 }, user, now)).toBe(false);
});
test('guest is rejected and a foreign registration cannot change either consent', async () => {
  const { t, args, client } = await fixture();
  await expect(t.mutation(api.registrationConsent.accept, args)).rejects.toThrow('UNAUTHENTICATED');
  expect(await client.mutation(api.registrationConsent.accept, { ...args, email: 'other@example.test' })).toEqual({ accepted: false, automation: false });
  expect(await t.run(ctx => ctx.db.query('aiChatConsents').collect())).toEqual([]);
  expect(await t.run(ctx => ctx.db.query('aiAgentConsents').collect())).toEqual([]);
});
test('a legacy-compatible unverified session cannot activate registration services', async () => {
  const { t, args, client, userId } = await fixture();
  await t.run(ctx => ctx.db.patch(userId, { emailVerificationTime: undefined }));
  await expect(client.mutation(api.registrationConsent.accept, args)).rejects.toThrow('REGISTRATION_EMAIL_VERIFICATION_REQUIRED');
  expect(await t.run(ctx => ctx.db.query('aiChatConsents').collect())).toEqual([]);
  expect(await t.run(ctx => ctx.db.query('aiAgentConsents').collect())).toEqual([]);
});
test('one explicit choice atomically grants chat and assistant; retries do not duplicate or enable document interpretation', async () => {
  const { t, args, client } = await fixture();
  expect((await client.mutation(api.registrationConsent.accept, args)).accepted).toBe(true);
  expect((await client.mutation(api.registrationConsent.accept, args)).accepted).toBe(true);
  const chat = await t.run(ctx => ctx.db.query('aiChatConsents').collect());
  const agent = await t.run(ctx => ctx.db.query('aiAgentConsents').collect());
  expect(chat).toHaveLength(1); expect(agent).toHaveLength(1);
  expect(chat[0].acceptedAt).toBe(args.acceptedAt);
  expect(agent[0].acceptedAt).toBe(args.acceptedAt);
  expect(await t.run(ctx => ctx.db.query('documentInterpretationConsents').collect())).toEqual([]);
  expect((await client.query(api.chat.status, {})).consentAccepted).toBe(true);
  expect((await client.query(api.agent.status, {})).consentAccepted).toBe(true);
});
test('replaying a registration choice cannot reverse an explicit disable', async () => {
  const { args, client } = await fixture();
  await client.mutation(api.registrationConsent.accept, args);
  await client.mutation(api.chat.setEnabled, { enabled: false });
  expect((await client.mutation(api.registrationConsent.accept, args)).accepted).toBe(false);
  expect((await client.query(api.chat.status, {})).userEnabled).toBe(false);
});

test.each(['chat', 'agent'] as const)('registration replay preserves an explicit %s revocation', async (scope) => {
  const { t, args, client } = await fixture();
  await client.mutation(api.registrationConsent.accept, args);
  if (scope === 'chat') await client.mutation(api.chat.revokeConsent, {});
  else await client.mutation(api.agent.revokeConsent, {});
  const before = await t.run(async ctx => ({
    chat: await ctx.db.query('aiChatConsents').collect(),
    agent: await ctx.db.query('aiAgentConsents').collect(),
  }));
  expect(await client.mutation(api.registrationConsent.accept, args)).toEqual({ accepted: false, automation: false });
  const after = await t.run(async ctx => ({
    chat: await ctx.db.query('aiChatConsents').collect(),
    agent: await ctx.db.query('aiAgentConsents').collect(),
  }));
  expect(after).toEqual(before);
});

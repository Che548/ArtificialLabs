import { convexTest } from 'convex-test';
import { expect, test, vi } from 'vitest';
import { internal } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
const email = 'artificiallabs-e2e+abcdef012345-native@example.test';
async function fixture() {
  const t = convexTest(schema, modules);
  const userId = await t.run(async (ctx) => {
    const id = await ctx.db.insert('users', { email });
    await ctx.db.insert('authAccounts', {
      userId: id,
      provider: 'password',
      providerAccountId: email,
    });
    return id;
  });
  return { t, userId };
}

test('prepares only a fresh exact synthetic password fixture, idempotently', async () => {
  const { t, userId } = await fixture();
  await t.mutation(internal.testing.prepareVerifiedNativeFixture, {
    email,
    userId,
  });
  const first = await t.run((ctx) => ctx.db.get(userId));
  await t.mutation(internal.testing.prepareVerifiedNativeFixture, {
    email,
    userId,
  });
  expect(await t.run((ctx) => ctx.db.get(userId))).toEqual(first);
  expect(first?.emailVerificationTime).toBeTypeOf('number');
  expect(
    await t.run((ctx) => ctx.db.query('authAccounts').first()),
  ).toMatchObject({ emailVerified: email });
});

test('rejects real mail, mismatched IDs, and expired fixtures', async () => {
  const { t, userId } = await fixture();
  for (const bad of ['person@gmail.com', email.toUpperCase(), ' ' + email]) {
    await expect(
      t.mutation(internal.testing.prepareVerifiedNativeFixture, {
        email: bad,
        userId,
      }),
    ).rejects.toThrow('NATIVE_FIXTURE_EMAIL_REQUIRED');
  }
  const other = await t.run((ctx) =>
    ctx.db.insert('users', { email: 'other@example.test' }),
  );
  await expect(
    t.mutation(internal.testing.prepareVerifiedNativeFixture, {
      email,
      userId: other,
    }),
  ).rejects.toThrow('FRESH_NATIVE_FIXTURE_REQUIRED');
  const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 600_001);
  try {
    await expect(
      t.mutation(internal.testing.prepareVerifiedNativeFixture, {
        email,
        userId,
      }),
    ).rejects.toThrow('FRESH_NATIVE_FIXTURE_REQUIRED');
  } finally {
    clock.mockRestore();
  }
});

test.each([
  'profile',
  'admin',
  'reviewer',
  'second-account',
  'wrong-provider',
  'wrong-identifier',
] as const)('rejects occupied/privileged fixture: %s', async (kind) => {
  const { t, userId } = await fixture();
  await t.run(async (ctx) => {
    if (kind === 'profile')
      await ctx.db.insert('profiles', {
        userId,
        displayName: 'Synthetic',
        goal: 'cycle',
        onboardingCompleted: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    if (kind === 'admin')
      await ctx.db.insert('adminMemberships', {
        userId,
        role: 'admin',
        emailSnapshot: email,
        grantedAt: Date.now(),
        updatedAt: Date.now(),
      });
    if (kind === 'reviewer')
      await ctx.db.insert('reviewLoginExceptions', {
        userId,
        email,
        store: 'apple',
        active: false,
        updatedAt: Date.now(),
      });
    if (kind === 'second-account')
      await ctx.db.insert('authAccounts', {
        userId,
        provider: 'google',
        providerAccountId: 'synthetic',
      });
    if (kind === 'wrong-provider' || kind === 'wrong-identifier') {
      const account = (await ctx.db.query('authAccounts').first())!;
      await ctx.db.patch(
        account._id,
        kind === 'wrong-provider'
          ? { provider: 'google' }
          : { providerAccountId: 'other@example.test' },
      );
    }
  });
  await expect(
    t.mutation(internal.testing.prepareVerifiedNativeFixture, {
      email,
      userId,
    }),
  ).rejects.toThrow('EMPTY_NATIVE_FIXTURE_REQUIRED');
  expect(
    (await t.run((ctx) => ctx.db.get(userId)))?.emailVerificationTime,
  ).toBeUndefined();
});

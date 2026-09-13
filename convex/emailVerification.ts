import { ConvexError, v } from 'convex/values';
import { action, internalMutation, internalQuery } from './_generated/server';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import {
  contactError,
  contactHash,
  contactLimit,
} from './lib/contactVerification';
import { generateSixDigitCode, normalizeClientIp } from './lib/sms';
import { hasReviewLoginException } from './reviewAccess';
import { hasDemoAdminLoginException } from './lib/adminAccess';
import { sendEmail } from './emailChange';

export const loginState = internalQuery({
  args: { userId: v.id('users') },
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get(userId);
    if (!user?.email) return contactError('EMAIL_REQUIRED');
    const accounts = await ctx.db
      .query('authAccounts')
      .withIndex('userIdAndProvider', (q) =>
        q.eq('userId', userId).eq('provider', 'password'),
      )
      .take(2);
    const account = accounts[0];
    if (accounts.length !== 1 || !account.secret)
      return contactError('UNAVAILABLE');
    return {
      user,
      account,
      required:
        process.env.EMAIL_VERIFICATION_REQUIRED === '1' &&
        !user.emailVerificationTime &&
        !(await hasReviewLoginException(ctx, userId, user.email)) &&
        !(await hasDemoAdminLoginException(ctx, userId, user.email)),
    };
  },
});
export const reserve = internalMutation({
  args: {
    userId: v.id('users'),
    accountId: v.id('authAccounts'),
    credentialHash: v.string(),
    tokenHash: v.string(),
    ipHash: v.string(),
    codeHash: v.string(),
    generation: v.string(),
    challengeId: v.optional(v.id('contactVerificationChallenges')),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId),
      account = await ctx.db.get(args.accountId);
    if (
      !user?.email ||
      account?.userId !== args.userId ||
      !account.secret ||
      (await contactHash(`credential:${account.secret}`)) !==
        args.credentialHash
    )
      return contactError('REAUTHENTICATE');
    const previous = args.challengeId
      ? await ctx.db.get(args.challengeId)
      : null;
    if (
      args.challengeId &&
      (!previous ||
        previous.kind !== 'login-email' ||
        previous.userId !== args.userId ||
        previous.tokenHash !== args.tokenHash ||
        previous.target !== user.email ||
        previous.expiresAt <= Date.now() ||
        previous.failedAttempts >= 5 ||
        previous.status === 'consumed')
    )
      return contactError('REAUTHENTICATE');
    await contactLimit(
      ctx,
      [
        `email:user:${args.userId}`,
        `email:address:${await contactHash(user.email)}`,
        `email:ip:${args.ipHash}`,
      ],
      5,
      60000,
    );
    for (const row of await ctx.db
      .query('contactVerificationChallenges')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .take(100)) {
      if (
        row.kind === 'login-email' &&
        row._id !== args.challengeId &&
        row.status !== 'consumed'
      )
        await ctx.db.patch(row._id, {
          status: 'failed',
          expiresAt: Date.now(),
        });
    }
    const values = {
      kind: 'login-email' as const,
      userId: args.userId,
      accountId: args.accountId,
      target: user.email,
      credentialHash: args.credentialHash,
      tokenHash: args.tokenHash,
      codeHash: args.codeHash,
      generation: args.generation,
      expiresAt: previous?.expiresAt ?? Date.now() + 600000,
      retryAt: Date.now() + 60000,
      failedAttempts: previous?.failedAttempts ?? 0,
      status: 'sending' as const,
      purgeAt: Date.now() + 2 * 86400000,
    };
    const challengeId =
      previous?._id ??
      (await ctx.db.insert('contactVerificationChallenges', values));
    if (previous) await ctx.db.replace(previous._id, values);
    return {
      challengeId,
      retryAt: values.retryAt,
      expiresAt: values.expiresAt,
      email: user.email,
    };
  },
});
export const delivery = internalMutation({
  args: {
    challengeId: v.id('contactVerificationChallenges'),
    generation: v.string(),
    ok: v.boolean(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.challengeId);
    if (row?.generation === args.generation && row.status === 'sending')
      await ctx.db.patch(row._id, { status: args.ok ? 'pending' : 'failed' });
  },
});
export const challenge = internalQuery({
  args: {
    challengeId: v.id('contactVerificationChallenges'),
    tokenHash: v.string(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.challengeId);
    if (
      !row ||
      row.kind !== 'login-email' ||
      row.tokenHash !== args.tokenHash ||
      row.expiresAt <= Date.now() ||
      row.status === 'consumed'
    )
      return contactError('REAUTHENTICATE');
    return row;
  },
});
async function dispatch(
  ctx: any,
  args: {
    userId: Id<'users'>;
    accountId: Id<'authAccounts'>;
    credentialHash: string;
    tokenHash: string;
    challengeId?: Id<'contactVerificationChallenges'>;
  },
) {
  const meta = await ctx.meta.getRequestMetadata();
  const code = generateSixDigitCode(),
    generation = crypto.randomUUID();
  const result = await ctx.runMutation(internal.emailVerification.reserve, {
    ...args,
    generation,
    codeHash: await contactHash(`code:${generation}:${code}`),
    ipHash: await contactHash(`ip:${normalizeClientIp(meta.ip)}`),
  });
  let ok = false;
  try {
    await sendEmail(
      ctx,
      result.email,
      `Код подтверждения почты: ${code}. Действует 10 минут. Никому не сообщайте код.`,
      'Подтверждение почты — Сфера',
      `login-email/${generation}`,
    );
    ok = true;
  } catch {
    /* no credentials or provider response logs */
  }
  await ctx.runMutation(internal.emailVerification.delivery, {
    challengeId: result.challengeId,
    generation,
    ok,
  });
  return {
    challengeId: result.challengeId,
    retryAt: result.retryAt,
    expiresAt: result.expiresAt,
    deliveryFailed: !ok,
  };
}
// Called only after the password provider has authenticated the user. No tokens are issued yet.
export async function requireEmailForLogin(
  ctx: any,
  userId: Id<'users'>,
  token: unknown,
) {
  if (process.env.EMAIL_VERIFICATION_REQUIRED !== '1') return;
  const state = await ctx.runQuery(internal.emailVerification.loginState, {
    userId,
  });
  if (!state.required) return;
  // Temporary rollout compatibility, NOT a trusted client identity. A caller
  // can omit this parameter too; disable the flag to enforce verification for all.
  if (token === undefined && process.env.EMAIL_VERIFICATION_ALLOW_LEGACY === '1') return;
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token))
    return contactError('CLIENT_UPDATE_REQUIRED');
  const result = await dispatch(ctx, {
    userId,
    accountId: state.account._id,
    credentialHash: await contactHash(`credential:${state.account.secret}`),
    tokenHash: await contactHash(`token:${token}`),
  });
  // Challenge ID is not a bearer credential. The client-generated token is never echoed.
  throw new ConvexError({ code: 'EMAIL_VERIFICATION_REQUIRED', ...result });
}
export const resend = action({
  args: {
    challengeId: v.id('contactVerificationChallenges'),
    token: v.string(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    challengeId: Id<'contactVerificationChallenges'>;
    retryAt: number;
    expiresAt: number;
    deliveryFailed: boolean;
  }> => {
    const tokenHash = await contactHash(`token:${args.token}`);
    const row = await ctx.runQuery(internal.emailVerification.challenge, {
      challengeId: args.challengeId,
      tokenHash,
    });
    return dispatch(ctx, {
      userId: row.userId,
      accountId: row.accountId,
      credentialHash: row.credentialHash,
      tokenHash,
      challengeId: row._id,
    });
  },
});
export const consume = internalMutation({
  args: {
    challengeId: v.id('contactVerificationChallenges'),
    tokenHash: v.string(),
    codeHash: v.string(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.challengeId);
    if (
      !row ||
      row.kind !== 'login-email' ||
      row.tokenHash !== args.tokenHash ||
      row.status !== 'pending' ||
      row.expiresAt <= Date.now() ||
      row.failedAttempts >= 5
    )
      return { error: 'INVALID_CODE' as const };
    if (row.codeHash !== args.codeHash) {
      await ctx.db.patch(row._id, { failedAttempts: row.failedAttempts + 1 });
      return { error: 'INVALID_CODE' as const };
    }
    const user = await ctx.db.get(row.userId),
      account = await ctx.db.get(row.accountId);
    if (
      user?.email !== row.target ||
      account?.userId !== row.userId ||
      !account.secret ||
      (await contactHash(`credential:${account.secret}`)) !== row.credentialHash
    )
      return { error: 'REAUTHENTICATE' as const };
    await ctx.db.patch(user._id, { emailVerificationTime: Date.now() });
    await ctx.db.patch(account._id, { emailVerified: row.target });
    await ctx.db.patch(row._id, {
      status: 'consumed',
      codeHash: '',
      tokenHash: '',
      credentialHash: '',
    });
    return { userId: row.userId };
  },
});
export async function finishEmailLogin(
  ctx: any,
  params: any,
): Promise<{ userId: Id<'users'> }> {
  if (
    typeof params.token !== 'string' ||
    typeof params.code !== 'string' ||
    !/^\d{6}$/.test(params.code)
  )
    return contactError('INVALID_CODE');
  const tokenHash = await contactHash(`token:${params.token}`);
  const row = await ctx.runQuery(internal.emailVerification.challenge, {
    challengeId: params.challengeId,
    tokenHash,
  });
  const result = await ctx.runMutation(internal.emailVerification.consume, {
    challengeId: row._id,
    tokenHash,
    codeHash: await contactHash(`code:${row.generation}:${params.code}`),
  });
  if (!result.userId) return contactError(result.error);
  return { userId: result.userId };
}
export const cleanup = internalMutation({
  args: {},
  handler: async (ctx) => {
    for (const row of await ctx.db
      .query('contactVerificationChallenges')
      .withIndex('by_expiry', (q) => q.lt('purgeAt', Date.now()))
      .take(200))
      await ctx.db.delete(row._id);
    for (const row of await ctx.db
      .query('contactVerificationAttempts')
      .withIndex('by_expiry', (q) => q.lt('expiresAt', Date.now()))
      .take(200))
      await ctx.db.delete(row._id);
  },
});

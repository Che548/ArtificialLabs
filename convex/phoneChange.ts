import { getAuthSessionId, retrieveAccount } from '@convex-dev/auth/server';
import { v } from 'convex/values';
import {
  action,
  internalMutation,
  internalQuery,
  internalAction,
} from './_generated/server';
import { internal } from './_generated/api';
import type { MutationCtx, QueryCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { requireActiveAccount } from './lib/access';
import {
  contactError,
  contactHash,
  contactLimit,
  revokeOtherSessions,
} from './lib/contactVerification';
import {
  generateSixDigitCode,
  normalizeRussianPhone,
  hmacSha256,
  normalizeClientIp,
} from './lib/sms';
import { sendSmsCode } from './smsAuth';
import { sendEmail } from './emailChange';

async function owner(ctx: MutationCtx | QueryCtx) {
  const userId = await requireActiveAccount(ctx),
    sessionId = await getAuthSessionId(ctx);
  const session = sessionId ? await ctx.db.get(sessionId) : null;
  if (
    !session ||
    session.userId !== userId ||
    session.expirationTime <= Date.now()
  )
    return contactError('UNAUTHENTICATED');
  return { userId, sessionId: session._id };
}
async function available(
  ctx: MutationCtx | QueryCtx,
  phone: string,
  userId: Id<'users'>,
) {
  const users = await ctx.db
    .query('users')
    .withIndex('phone', (q) => q.eq('phone', phone))
    .take(2);
  const accounts = await ctx.db
    .query('authAccounts')
    .withIndex('providerAndAccountId', (q) =>
      q.eq('provider', 'phone').eq('providerAccountId', phone),
    )
    .take(2);
  if (
    users.some((u) => u._id !== userId && u.phoneVerificationTime) ||
    accounts.some((a) => a.userId !== userId)
  )
    contactError('PHONE_UNAVAILABLE');
}
export const reserve = internalMutation({
  args: {
    newPhone: v.string(),
    credentialHash: v.string(),
    generation: v.string(),
    codeHash: v.string(),
    challengeId: v.optional(v.id('contactVerificationChallenges')),
  },
  handler: async (ctx, args) => {
    const identity = await owner(ctx),
      user = await ctx.db.get(identity.userId);
    const accounts = await ctx.db
      .query('authAccounts')
      .withIndex('userIdAndProvider', (q) =>
        q.eq('userId', identity.userId).eq('provider', 'password'),
      )
      .take(2);
    const account = accounts[0];
    if (
      accounts.length !== 1 ||
      !account.secret ||
      (await contactHash(`credential:${account.secret}`)) !==
        args.credentialHash
    )
      return contactError('REAUTHENTICATE');
    const target = normalizeRussianPhone(args.newPhone);
    if (target === user?.phone) return contactError('SAME_PHONE');
    await available(ctx, target, identity.userId);
    const previous = args.challengeId
      ? await ctx.db.get(args.challengeId)
      : null;
    if (
      args.challengeId &&
      (!previous ||
        previous.kind !== 'phone-change' ||
        previous.userId !== identity.userId ||
        previous.sessionId !== identity.sessionId ||
        previous.target !== target ||
        previous.previous !== user?.phone ||
        previous.status === 'consumed' ||
        previous.failedAttempts >= 5 ||
        (previous.authorizationExpiresAt ?? 0) <= Date.now())
    )
      return contactError('REAUTHENTICATE');
    if (previous && previous.retryAt > Date.now())
      return contactError('RATE_LIMITED');
    await contactLimit(ctx, [`phone:user:${identity.userId}`], 3, 300000);
    for (const row of await ctx.db
      .query('contactVerificationChallenges')
      .withIndex('by_user', (q) => q.eq('userId', identity.userId))
      .take(100)) {
      if (
        row.kind === 'phone-change' &&
        row._id !== args.challengeId &&
        row.status !== 'consumed'
      )
        await ctx.db.patch(row._id, {
          status: 'failed',
          authorizationExpiresAt: 0,
        });
    }
    const values = {
      kind: 'phone-change' as const,
      ...identity,
      accountId: account._id,
      target,
      previous: user?.phone,
      credentialHash: args.credentialHash,
      codeHash: args.codeHash,
      tokenHash: '',
      generation: args.generation,
      expiresAt: Date.now() + 300000,
      authorizationExpiresAt:
        previous?.authorizationExpiresAt ?? Date.now() + 3600000,
      retryAt: Date.now() + 300000,
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
    };
  },
});
export const challenge = internalQuery({
  args: { challengeId: v.id('contactVerificationChallenges') },
  handler: async (ctx, args) => {
    const identity = await owner(ctx),
      row = await ctx.db.get(args.challengeId);
    if (
      !row ||
      row.kind !== 'phone-change' ||
      row.userId !== identity.userId ||
      row.sessionId !== identity.sessionId
    )
      return contactError('INVALID_CODE');
    return row;
  },
});
export const delivery = internalMutation({
  args: {
    challengeId: v.id('contactVerificationChallenges'),
    generation: v.string(),
    ok: v.boolean(),
    retryAt: v.number(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.challengeId);
    if (
      row?.kind === 'phone-change' &&
      row.generation === args.generation &&
      row.status === 'sending'
    )
      await ctx.db.patch(row._id, {
        status: args.ok ? 'pending' : 'failed',
        retryAt: args.retryAt,
      });
  },
});
async function dispatch(
  ctx: any,
  newPhone: string,
  credentialHash: string,
  platform: 'ios' | 'android',
  challengeId?: Id<'contactVerificationChallenges'>,
) {
  const phone = normalizeRussianPhone(newPhone),
    generation = crypto.randomUUID(),
    code = generateSixDigitCode();
  const result = await ctx.runMutation(internal.phoneChange.reserve, {
    newPhone: phone,
    credentialHash,
    generation,
    codeHash: await contactHash(`code:${generation}:${code}`),
    challengeId,
  });
  let ok = false,
    retryAt = result.retryAt;
  try {
    await sendSmsCode(ctx, phone, code, new Date(result.expiresAt), {
      platform,
      purpose: 'phone-verification',
    });
    ok = true;
  } catch {
    /* no gateway payload logs */
  }
  const key = process.env.SMS_RATE_LIMIT_HASH_SECRET;
  if (key) {
    const meta = await ctx.meta.getRequestMetadata();
    const status = await ctx.runQuery(internal.smsAuth.statusInternal, {
      phoneHash: await hmacSha256(key, `phone:${phone}`),
      ipHash: await hmacSha256(key, `ip:${normalizeClientIp(meta.ip)}`),
      now: Date.now(),
    });
    retryAt = Math.max(
      retryAt,
      status.retryAt ?? (status.allowed ? retryAt : Date.now() + 86400000),
    );
  }
  await ctx.runMutation(internal.phoneChange.delivery, {
    challengeId: result.challengeId,
    generation,
    ok,
    retryAt,
  });
  return { ...result, retryAt, deliveryFailed: !ok };
}
const platform = v.union(v.literal('ios'), v.literal('android'));
export const request = action({
  args: { newPhone: v.string(), currentPassword: v.string(), platform },
  handler: async (ctx, args): Promise<any> => {
    const meta = await ctx.meta.getRequestMetadata();
    await ctx.runMutation(internal.emailChange.passwordAttempt, {
      ipHash: await contactHash(`password-ip:${normalizeClientIp(meta.ip)}`),
    });
    const state = await ctx.runQuery(internal.emailChange.credentials, {});
    if (args.currentPassword.length < 8 || args.currentPassword.length > 1024)
      return contactError('INVALID_PASSWORD');
    try {
      const account = await retrieveAccount(ctx, {
        provider: 'password',
        account: {
          id: state.account.providerAccountId,
          secret: args.currentPassword,
        },
      });
      if (account.user._id !== state.userId)
        return contactError('INVALID_PASSWORD');
    } catch {
      return contactError('INVALID_PASSWORD');
    }
    return dispatch(
      ctx,
      args.newPhone,
      await contactHash(`credential:${state.account.secret}`),
      args.platform,
    );
  },
});
export const resend = action({
  args: { challengeId: v.id('contactVerificationChallenges'), platform },
  handler: async (ctx, args): Promise<any> => {
    const row = await ctx.runQuery(internal.phoneChange.challenge, {
      challengeId: args.challengeId,
    });
    return dispatch(
      ctx,
      row.target,
      row.credentialHash,
      args.platform,
      row._id,
    );
  },
});
export const commit = internalMutation({
  args: {
    challengeId: v.id('contactVerificationChallenges'),
    codeHash: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await owner(ctx),
      row = await ctx.db.get(args.challengeId),
      user = await ctx.db.get(identity.userId);
    if (
      !row ||
      row.kind !== 'phone-change' ||
      row.userId !== identity.userId ||
      row.sessionId !== identity.sessionId
    )
      return { error: 'INVALID_CODE' };
    if (row.status === 'consumed')
      return user?.phone === row.target
        ? { changed: true, phone: row.target }
        : { error: 'REAUTHENTICATE' };
    if (
      row.status !== 'pending' ||
      row.expiresAt <= Date.now() ||
      row.failedAttempts >= 5
    )
      return { error: 'INVALID_CODE' };
    if (row.codeHash !== args.codeHash) {
      await ctx.db.patch(row._id, { failedAttempts: row.failedAttempts + 1 });
      return { error: 'INVALID_CODE' };
    }
    const account = await ctx.db.get(row.accountId);
    if (
      user?.phone !== row.previous ||
      account?.userId !== identity.userId ||
      !account.secret ||
      (await contactHash(`credential:${account.secret}`)) !== row.credentialHash
    )
      return { error: 'REAUTHENTICATE' };
    await available(ctx, row.target, identity.userId);
    const phoneAccounts = await ctx.db
      .query('authAccounts')
      .withIndex('userIdAndProvider', (q) =>
        q.eq('userId', identity.userId).eq('provider', 'phone'),
      )
      .collect();
    for (const old of phoneAccounts) {
      for (const code of await ctx.db
        .query('authVerificationCodes')
        .withIndex('accountId', (q) => q.eq('accountId', old._id))
        .collect())
        await ctx.db.delete(code._id);
      await ctx.db.delete(old._id);
    }
    await ctx.db.insert('authAccounts', {
      userId: identity.userId,
      provider: 'phone',
      providerAccountId: row.target,
      phoneVerified: row.target,
    });
    await ctx.db.patch(identity.userId, {
      phone: row.target,
      phoneVerificationTime: Date.now(),
    });
    if (row.previous) {
      const key = process.env.PASSWORD_RECOVERY_HASH_SECRET!;
      const hash = await hmacSha256(key, `identifier:${row.previous}`);
      for (const recovery of await ctx.db
        .query('passwordRecoveryChallenges')
        .withIndex('by_identifier_time', (q) => q.eq('identifierHash', hash))
        .collect()) {
        if (recovery.status === 'pending' || recovery.status === 'claimed')
          await ctx.db.patch(recovery._id, {
            status: 'failed',
            claimTokenHash: undefined,
          });
      }
    }
    await revokeOtherSessions(ctx, identity.userId, identity.sessionId);
    await ctx.db.patch(row._id, {
      status: 'consumed',
      codeHash: '',
      credentialHash: '',
    });
    if (user?.email)
      await ctx.scheduler.runAfter(0, internal.phoneChange.notice, {
        email: user.email,
        challengeId: row._id,
      });
    return { changed: true, phone: row.target };
  },
});
export const confirm = action({
  args: {
    challengeId: v.id('contactVerificationChallenges'),
    code: v.string(),
  },
  handler: async (ctx, args): Promise<{ changed: true; phone: string }> => {
    const row = await ctx.runQuery(internal.phoneChange.challenge, {
      challengeId: args.challengeId,
    });
    const result = await ctx.runMutation(internal.phoneChange.commit, {
      challengeId: row._id,
      codeHash: await contactHash(`code:${row.generation}:${args.code}`),
    });
    if (!result.phone) return contactError(result.error ?? 'INVALID_CODE');
    return { changed: true, phone: result.phone };
  },
});
export const notice = internalAction({
  args: {
    email: v.string(),
    challengeId: v.id('contactVerificationChallenges'),
  },
  handler: async (ctx, args) => {
    try {
      await sendEmail(
        ctx,
        args.email,
        'Номер телефона вашего аккаунта Сфера изменён. Если это были не вы, обратитесь в поддержку: https://brainwaves.engineering/',
        'Телефон аккаунта изменён — Сфера',
        `phone-change/${args.challengeId}`,
      );
    } catch {
      /* confirmed identity change is not rolled back */
    }
  },
});

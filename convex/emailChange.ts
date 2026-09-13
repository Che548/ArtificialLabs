import { getAuthSessionId, retrieveAccount } from '@convex-dev/auth/server';
import { ConvexError, v } from 'convex/values';
import { internal } from './_generated/api';
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
} from './_generated/server';
import type { MutationCtx, QueryCtx, ActionCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { requireActiveAccount } from './lib/access';
import { revokeReviewLoginExceptions } from './reviewAccess';
import { clearDemoAdminLoginException } from './lib/adminAccess';
import { generateSixDigitCode, hmacSha256, normalizeClientIp } from './lib/sms';
import {
  includeAcceptedEmailInQuota,
  parseResendQuotaHeader,
} from './lib/resendUsage';

const TTL = 10 * 60_000;
const DAY = 24 * 60 * 60_000;
const fail = (code: string): never => {
  throw new ConvexError(`EMAIL_CHANGE_${code}`);
};
function secret() {
  const value = process.env.PASSWORD_RECOVERY_HASH_SECRET;
  if (!value) return fail('UNAVAILABLE');
  return value;
}
export function normalizeEmail(value: string) {
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return fail('INVALID_EMAIL');
  return email;
}
const hash = (value: string) => hmacSha256(secret(), `email-change:${value}`);

async function owner(ctx: QueryCtx | MutationCtx) {
  const userId = await requireActiveAccount(ctx);
  const sessionId = await getAuthSessionId(ctx);
  const session = sessionId ? await ctx.db.get(sessionId) : null;
  if (
    !session ||
    session.userId !== userId ||
    session.expirationTime <= Date.now()
  )
    return fail('UNAUTHENTICATED');
  return { userId, sessionId: session._id };
}
async function available(
  ctx: QueryCtx | MutationCtx,
  email: string,
  userId: Id<'users'>,
) {
  const users = await ctx.db
    .query('users')
    .withIndex('email', (q) => q.eq('email', email))
    .take(2);
  const accounts = await ctx.db
    .query('authAccounts')
    .withIndex('providerAndAccountId', (q) =>
      q.eq('provider', 'password').eq('providerAccountId', email),
    )
    .take(2);
  if (
    users.some((u) => u._id !== userId) ||
    accounts.some((a) => a.userId !== userId)
  )
    return fail('EMAIL_UNAVAILABLE');
}
export const credentials = internalQuery({
  args: {},
  handler: async (ctx) => {
    const identity = await owner(ctx);
    const user = await ctx.db.get(identity.userId);
    const accounts = await ctx.db
      .query('authAccounts')
      .withIndex('userIdAndProvider', (q) =>
        q.eq('userId', identity.userId).eq('provider', 'password'),
      )
      .take(2);
    if (!user?.email || accounts.length !== 1 || !accounts[0].secret)
      return fail('UNAVAILABLE');
    return { ...identity, email: user.email, account: accounts[0] };
  },
});

async function quota(
  ctx: MutationCtx,
  buckets: string[],
  window: number,
  cooldown: number,
) {
  const now = Date.now();
  for (const bucket of buckets) {
    const rows = await ctx.db
      .query('emailChangeAttempts')
      .withIndex('by_bucket_time', (q) =>
        q.eq('bucket', bucket).gt('attemptedAt', now - window),
      )
      .order('desc')
      .take(5);
    if (rows.length >= 5 || (rows[0] && rows[0].attemptedAt + cooldown > now))
      return fail('RATE_LIMITED');
  }
  for (const bucket of buckets)
    await ctx.db.insert('emailChangeAttempts', {
      bucket,
      attemptedAt: now,
      expiresAt: now + window,
    });
}
export const passwordAttempt = internalMutation({
  args: { ipHash: v.string() },
  handler: async (ctx, args) => {
    const { userId } = await owner(ctx);
    await quota(
      ctx,
      [`password:user:${userId}`, `password:ip:${args.ipHash}`],
      60 * 60_000,
      0,
    );
  },
});
export const reserve = internalMutation({
  args: {
    newEmail: v.string(),
    credentialHash: v.string(),
    ipHash: v.string(),
    codeHash: v.string(),
    generation: v.string(),
    challengeId: v.optional(v.id('emailChangeChallenges')),
  },
  handler: async (ctx, args) => {
    const { userId, sessionId } = await owner(ctx);
    const user = await ctx.db.get(userId);
    const accounts = await ctx.db
      .query('authAccounts')
      .withIndex('userIdAndProvider', (q) =>
        q.eq('userId', userId).eq('provider', 'password'),
      )
      .take(2);
    const account = accounts[0];
    if (
      !user?.email ||
      accounts.length !== 1 ||
      !account.secret ||
      (await hash(`credential:${account.secret}`)) !== args.credentialHash
    )
      return fail('REAUTHENTICATE');
    const newEmail = normalizeEmail(args.newEmail);
    if (newEmail === user.email.toLowerCase()) return fail('SAME_EMAIL');
    await available(ctx, newEmail, userId);
    const now = Date.now();
    const previous = args.challengeId
      ? await ctx.db.get(args.challengeId)
      : null;
    if (
      args.challengeId &&
      (!previous ||
        previous.userId !== userId ||
        previous.sessionId !== sessionId ||
        previous.newEmail !== newEmail ||
        previous.oldEmail !== user.email ||
        previous.expiresAt <= now ||
        previous.failedAttempts >= 5 ||
        previous.status === 'consumed')
    )
      return fail('REAUTHENTICATE');
    if (previous && previous.retryAt > now) return fail('RATE_LIMITED');
    await quota(
      ctx,
      [
        `send:user:${userId}`,
        `send:email:${await hash(`email:${newEmail}`)}`,
        `send:ip:${args.ipHash}`,
      ],
      DAY,
      60_000,
    );
    const other = await ctx.db
      .query('emailChangeChallenges')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .take(100);
    for (const row of other)
      if (row._id !== args.challengeId && row.status !== 'consumed')
        await ctx.db.patch(row._id, { status: 'failed', expiresAt: now });
    const values = {
      userId,
      sessionId,
      accountId: account._id,
      oldEmail: user.email,
      newEmail,
      credentialHash: args.credentialHash,
      codeHash: args.codeHash,
      generation: args.generation,
      expiresAt: previous?.expiresAt ?? now + TTL,
      retryAt: now + 60_000,
      failedAttempts: previous?.failedAttempts ?? 0,
      status: 'sending' as const,
      createdAt: previous?.createdAt ?? now,
      purgeAt: now + 2 * DAY,
    };
    const challengeId = previous
      ? previous._id
      : await ctx.db.insert('emailChangeChallenges', values);
    if (previous) await ctx.db.replace(challengeId, values);
    return {
      challengeId,
      expiresAt: values.expiresAt,
      retryAt: values.retryAt,
    };
  },
});
export const getChallenge = internalQuery({
  args: { challengeId: v.id('emailChangeChallenges') },
  handler: async (ctx, args) => {
    const { userId, sessionId } = await owner(ctx);
    const row = await ctx.db.get(args.challengeId);
    if (!row || row.userId !== userId || row.sessionId !== sessionId)
      return fail('INVALID_CODE');
    return row;
  },
});
export const delivery = internalMutation({
  args: {
    challengeId: v.id('emailChangeChallenges'),
    generation: v.string(),
    ok: v.boolean(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.challengeId);
    if (row?.generation === args.generation && row.status === 'sending')
      await ctx.db.patch(row._id, { status: args.ok ? 'pending' : 'failed' });
  },
});
export async function sendEmail(
  ctx: ActionCtx,
  to: string,
  text: string,
  subject: string,
  key: string,
) {
  if (!process.env.RESEND_API_KEY) return fail('UNAVAILABLE');
  const html = `<p>${text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')}</p>`;
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'content-type': 'application/json',
      'idempotency-key': key,
    },
    body: JSON.stringify({
      from:
        process.env.RESEND_FROM ?? 'Сфера <no-reply@artificiallabs.bebra42.ru>',
      to: [to],
      subject,
      text,
      html,
    }),
    signal: AbortSignal.timeout(12_000),
  });
  const daily = parseResendQuotaHeader(
    response.headers.get('x-resend-daily-quota'),
  );
  const monthly = parseResendQuotaHeader(
    response.headers.get('x-resend-monthly-quota'),
  );
  await ctx.runMutation(internal.monitoringData.recordResendQuotaHeaders, {
    dailyUsed: includeAcceptedEmailInQuota(daily.used, response.ok),
    dailyLimit: daily.limit,
    monthlyUsed: includeAcceptedEmailInQuota(monthly.used, response.ok),
    monthlyLimit: monthly.limit,
    now: Date.now(),
  });
  if (!response.ok) return fail('UNAVAILABLE');
}
async function dispatch(
  ctx: ActionCtx,
  newEmail: string,
  credentialHash: string,
  ipHash: string,
  challengeId?: Id<'emailChangeChallenges'>,
): Promise<{
  challengeId: Id<'emailChangeChallenges'>;
  expiresAt: number;
  retryAt: number;
}> {
  const code = generateSixDigitCode();
  const generation = crypto.randomUUID();
  const result = await ctx.runMutation(internal.emailChange.reserve, {
    newEmail,
    credentialHash,
    ipHash,
    challengeId,
    generation,
    codeHash: await hash(`code:${generation}:${code}`),
  });
  let ok = false;
  try {
    await sendEmail(
      ctx,
      newEmail,
      `Код подтверждения новой почты: ${code}. Код действует не более 10 минут. Никому не сообщайте его.`,
      'Подтверждение новой почты — Сфера',
      `email-change/${generation}`,
    );
    ok = true;
  } catch {
    /* Never log provider responses or credentials. */
  }
  await ctx.runMutation(internal.emailChange.delivery, {
    challengeId: result.challengeId,
    generation,
    ok,
  });
  if (!ok) return fail('UNAVAILABLE');
  return result;
}
async function requestIp(ctx: ActionCtx) {
  try {
    return await hash(
      `ip:${normalizeClientIp((await ctx.meta.getRequestMetadata()).ip)}`,
    );
  } catch {
    return fail('UNAVAILABLE');
  }
}
export const request = action({
  args: { newEmail: v.string(), currentPassword: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<{
    challengeId: Id<'emailChangeChallenges'>;
    expiresAt: number;
    retryAt: number;
  }> => {
    if (args.currentPassword.length < 8 || args.currentPassword.length > 1024)
      return fail('INVALID_PASSWORD');
    const newEmail = normalizeEmail(args.newEmail);
    const ipHash = await requestIp(ctx);
    await ctx.runMutation(internal.emailChange.passwordAttempt, { ipHash });
    const credentials = await ctx.runQuery(
      internal.emailChange.credentials,
      {},
    );
    try {
      const result = await retrieveAccount(ctx, {
        provider: 'password',
        account: {
          id: credentials.account.providerAccountId,
          secret: args.currentPassword,
        },
      });
      if (result.user._id !== credentials.userId)
        return fail('INVALID_PASSWORD');
    } catch {
      return fail('INVALID_PASSWORD');
    }
    return dispatch(
      ctx,
      newEmail,
      await hash(`credential:${credentials.account.secret}`),
      ipHash,
    );
  },
});
export const resend = action({
  args: { challengeId: v.id('emailChangeChallenges') },
  handler: async (
    ctx,
    args,
  ): Promise<{
    challengeId: Id<'emailChangeChallenges'>;
    expiresAt: number;
    retryAt: number;
  }> => {
    const row = await ctx.runQuery(internal.emailChange.getChallenge, args);
    return dispatch(
      ctx,
      row.newEmail,
      row.credentialHash,
      await requestIp(ctx),
      row._id,
    );
  },
});
export const commit = internalMutation({
  args: { challengeId: v.id('emailChangeChallenges'), codeHash: v.string() },
  handler: async (ctx, args) => {
    const { userId, sessionId } = await owner(ctx);
    const row = await ctx.db.get(args.challengeId);
    if (!row || row.userId !== userId || row.sessionId !== sessionId)
      return { error: 'INVALID_CODE' };
    const user = await ctx.db.get(userId);
    if (row.status === 'consumed')
      return user?.email === row.newEmail
        ? { changed: true }
        : { error: 'REAUTHENTICATE' };
    if (
      row.status !== 'pending' ||
      row.expiresAt <= Date.now() ||
      row.failedAttempts >= 5
    )
      return { error: 'INVALID_CODE' };
    if (args.codeHash !== row.codeHash) {
      await ctx.db.patch(row._id, { failedAttempts: row.failedAttempts + 1 });
      return { error: 'INVALID_CODE' };
    }
    const account = await ctx.db.get(row.accountId);
    if (
      !account?.secret ||
      account.userId !== userId ||
      user?.email !== row.oldEmail ||
      (await hash(`credential:${account.secret}`)) !== row.credentialHash
    )
      return { error: 'REAUTHENTICATE' };
    await available(ctx, row.newEmail, userId);
    // Both identity records and code consumption share a single transaction.
    await ctx.db.patch(userId, {
      email: row.newEmail,
      emailVerificationTime: Date.now(),
    });
    await revokeReviewLoginExceptions(ctx, userId, 'email_changed');
    await clearDemoAdminLoginException(ctx, userId);
    await ctx.db.patch(account._id, {
      providerAccountId: row.newEmail,
      emailVerified: row.newEmail,
    });
    const oldIdentifierHash = await hmacSha256(
      secret(),
      `identifier:${row.oldEmail}`,
    );
    const recoveries = await ctx.db
      .query('passwordRecoveryChallenges')
      .withIndex('by_identifier_time', (q) =>
        q.eq('identifierHash', oldIdentifierHash),
      )
      .collect();
    for (const recovery of recoveries)
      if (recovery.status === 'pending' || recovery.status === 'claimed')
        await ctx.db.patch(recovery._id, {
          status: 'failed',
          claimTokenHash: undefined,
        });
    // Same deletion semantics as Convex Auth, inside the identity transaction.
    const sessions = await ctx.db
      .query('authSessions')
      .withIndex('userId', (q) => q.eq('userId', userId))
      .collect();
    for (const session of sessions) {
      if (session._id === sessionId) continue;
      for (const token of await ctx.db
        .query('authRefreshTokens')
        .withIndex('sessionIdAndParentRefreshTokenId', (q) =>
          q.eq('sessionId', session._id),
        )
        .collect())
        await ctx.db.delete(token._id);
      await ctx.db.delete(session._id);
    }
    await ctx.db.patch(row._id, {
      status: 'consumed',
      codeHash: '',
      credentialHash: '',
    });
    await ctx.scheduler.runAfter(0, internal.emailChange.afterCommit, {
      userId,
      sessionId,
      oldEmail: row.oldEmail,
      challengeId: row._id,
    });
    return { changed: true };
  },
});
export const confirm = action({
  args: { challengeId: v.id('emailChangeChallenges'), code: v.string() },
  handler: async (ctx, args): Promise<{ changed: true }> => {
    const row = await ctx.runQuery(internal.emailChange.getChallenge, {
      challengeId: args.challengeId,
    });
    const result = await ctx.runMutation(internal.emailChange.commit, {
      challengeId: row._id,
      codeHash: await hash(`code:${row.generation}:${args.code}`),
    });
    if (result.error) return fail(result.error);
    return { changed: true };
  },
});
export const afterCommit = internalAction({
  args: {
    userId: v.id('users'),
    sessionId: v.id('authSessions'),
    oldEmail: v.string(),
    challengeId: v.id('emailChangeChallenges'),
  },
  handler: async (ctx, args) => {
    try {
      await sendEmail(
        ctx,
        args.oldEmail,
        'Адрес электронной почты вашего аккаунта Сфера изменён. Если это были не вы, обратитесь в поддержку: https://brainwaves.engineering/',
        'Почта аккаунта изменена — Сфера',
        `email-change-notice/${args.challengeId}`,
      );
    } catch {
      /* A failed notice must not roll back a completed change. */
    }
  },
});
export const cleanup = internalMutation({
  args: {},
  handler: async (ctx) => {
    for (const row of await ctx.db
      .query('emailChangeChallenges')
      .withIndex('by_expiry', (q) => q.lt('purgeAt', Date.now()))
      .take(200))
      await ctx.db.delete(row._id);
    for (const row of await ctx.db
      .query('emailChangeAttempts')
      .withIndex('by_expiry', (q) => q.lt('expiresAt', Date.now()))
      .take(200))
      await ctx.db.delete(row._id);
  },
});

import {
  createAccount,
  invalidateSessions,
  modifyAccountCredentials,
} from '@convex-dev/auth/server';
import { ConvexError, v } from 'convex/values';

import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { action, internalMutation, internalQuery } from './_generated/server';
import {
  generateSixDigitCode,
  hmacSha256,
  normalizeClientIp,
  normalizeRussianPhone,
} from './lib/sms';
import { parseResendQuotaHeader } from './lib/resendUsage';
import { sendSmsCode } from './smsAuth';

const EMAIL_CODE_TTL_MS = 10 * 60 * 1000;
const SMS_CODE_TTL_MS = 5 * 60 * 1000;
const EMAIL_SEND_WINDOW_MS = 24 * 60 * 60 * 1000;
const EMAIL_SEND_COOLDOWN_MS = 60 * 1000;
const RECOVERY_RETENTION_MS = 48 * 60 * 60 * 1000;
const CODE_FAILURE_WINDOW_MS = 60 * 60 * 1000;
const MAX_EMAIL_SENDS = 5;
const MAX_CODE_FAILURES = 5;
const CLAIM_TTL_MS = 60 * 1000;

type RecoveryChannel = 'email' | 'sms';

function requiredSecret(name: string) {
  const value = process.env[name];
  if (!value) throw new ConvexError('RECOVERY_UNAVAILABLE');
  return value;
}

function normalizeIdentifier(value: string): {
  identifier: string;
  channel: RecoveryChannel;
} {
  const trimmed = value.trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return { identifier: trimmed.toLowerCase(), channel: 'email' };
  }
  try {
    return { identifier: normalizeRussianPhone(trimmed), channel: 'sms' };
  } catch {
    throw new ConvexError('RECOVERY_IDENTIFIER_INVALID');
  }
}

function randomToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  );
}

async function recoveryHashes(identifier: string, ip: string) {
  const secret = requiredSecret('PASSWORD_RECOVERY_HASH_SECRET');
  return {
    identifierHash: await hmacSha256(secret, `identifier:${identifier}`),
    ipHash: await hmacSha256(secret, `ip:${ip}`),
  };
}

async function codeHash(identifierHash: string, code: string) {
  return await hmacSha256(
    requiredSecret('PASSWORD_RECOVERY_HASH_SECRET'),
    `code:${identifierHash}:${code}`,
  );
}

export const resolvePasswordIdentifier = internalQuery({
  args: {
    identifier: v.string(),
    channel: v.union(v.literal('email'), v.literal('sms')),
  },
  handler: async (ctx, args) => {
    const users =
      args.channel === 'email'
        ? await ctx.db
            .query('users')
            .withIndex('email', (q) => q.eq('email', args.identifier))
            .take(2)
        : await ctx.db
            .query('users')
            .withIndex('phone', (q) => q.eq('phone', args.identifier))
            .filter((q) => q.neq(q.field('phoneVerificationTime'), undefined))
            .take(2);
    if (users.length !== 1) return null;
    const user = users[0];
    const passwordAccounts = await ctx.db
      .query('authAccounts')
      .withIndex('userIdAndProvider', (q) =>
        q.eq('userId', user._id).eq('provider', 'password'),
      )
      .take(2);
    if (passwordAccounts.length > 1) return null;
    const passwordAccount = passwordAccounts[0];
    return {
      userId: user._id,
      passwordAccountId: passwordAccount?._id,
      passwordProviderAccountId: passwordAccount?.providerAccountId,
      verifiedPhone:
        args.channel === 'sms' && user.phoneVerificationTime
          ? user.phone
          : undefined,
    };
  },
});

export const reserveEmailSend = internalMutation({
  args: {
    identifierHash: v.string(),
    ipHash: v.string(),
    now: v.number(),
  },
  handler: async (ctx, args) => {
    const since = args.now - EMAIL_SEND_WINDOW_MS;
    const [identifierRows, ipRows] = await Promise.all([
      ctx.db
        .query('passwordRecoverySendAttempts')
        .withIndex('by_identifier_time', (q) =>
          q.eq('identifierHash', args.identifierHash).gt('attemptedAt', since),
        )
        .take(MAX_EMAIL_SENDS),
      ctx.db
        .query('passwordRecoverySendAttempts')
        .withIndex('by_ip_time', (q) =>
          q.eq('ipHash', args.ipHash).gt('attemptedAt', since),
        )
        .take(MAX_EMAIL_SENDS),
    ]);
    if (
      identifierRows.length >= MAX_EMAIL_SENDS ||
      ipRows.length >= MAX_EMAIL_SENDS
    ) {
      throw new ConvexError('RECOVERY_RATE_LIMITED');
    }
    const latest = Math.max(
      identifierRows.at(-1)?.attemptedAt ?? 0,
      ipRows.at(-1)?.attemptedAt ?? 0,
    );
    if (latest + EMAIL_SEND_COOLDOWN_MS > args.now) {
      throw new ConvexError('RECOVERY_RATE_LIMITED');
    }
    await ctx.db.insert('passwordRecoverySendAttempts', {
      identifierHash: args.identifierHash,
      ipHash: args.ipHash,
      channel: 'email',
      attemptedAt: args.now,
      expiresAt: args.now + RECOVERY_RETENTION_MS,
    });
  },
});

export const createChallenge = internalMutation({
  args: {
    identifierHash: v.string(),
    ipHash: v.string(),
    channel: v.union(v.literal('email'), v.literal('sms')),
    codeHash: v.string(),
    userId: v.optional(v.id('users')),
    passwordAccountId: v.optional(v.id('authAccounts')),
    now: v.number(),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    const { now, ...challenge } = args;
    const previous = await ctx.db
      .query('passwordRecoveryChallenges')
      .withIndex('by_identifier_time', (q) =>
        q.eq('identifierHash', args.identifierHash),
      )
      .order('desc')
      .take(5);
    for (const row of previous) {
      if (row.status === 'pending' || row.status === 'claimed') {
        await ctx.db.patch(row._id, {
          status: 'failed',
          claimTokenHash: undefined,
          claimedAt: undefined,
        });
      }
    }
    return await ctx.db.insert('passwordRecoveryChallenges', {
      ...challenge,
      status: args.userId ? 'pending' : 'dummy',
      failedAttempts: 0,
      createdAt: now,
    });
  },
});

export const markDeliveryFailed = internalMutation({
  args: { challengeId: v.id('passwordRecoveryChallenges') },
  handler: async (ctx, args) => {
    const challenge = await ctx.db.get(args.challengeId);
    if (challenge?.status === 'pending') {
      await ctx.db.patch(args.challengeId, { status: 'failed' });
    }
  },
});

async function sendRecoveryEmail(
  email: string,
  code: string,
  requestId: string,
) {
  const apiKey = requiredSecret('RESEND_API_KEY');
  const from =
    process.env.RESEND_FROM ?? 'Сфера <no-reply@artificiallabs.bebra42.ru>';
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
      'idempotency-key': `password-recovery/${requestId}`,
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: 'Код восстановления пароля Сфера',
      text: `Код восстановления пароля: ${code}. Код действует 10 минут. Никому не сообщайте его.`,
      html: `<p>Код восстановления пароля:</p><p style="font-size:28px;font-weight:700;letter-spacing:4px">${code}</p><p>Код действует 10 минут. Никому не сообщайте его.</p>`,
    }),
    signal: AbortSignal.timeout(12_000),
  });
  const daily = parseResendQuotaHeader(
    response.headers.get('x-resend-daily-quota'),
  );
  const monthly = parseResendQuotaHeader(
    response.headers.get('x-resend-monthly-quota'),
  );
  return {
    ok: response.ok,
    quota: {
      dailyUsed: daily.used,
      dailyLimit: daily.limit,
      monthlyUsed: monthly.used,
      monthlyLimit: monthly.limit,
    },
  };
}

export const request = action({
  args: {
    identifier: v.string(),
    platform: v.optional(v.union(v.literal('ios'), v.literal('android'))),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    challengeId: Id<'passwordRecoveryChallenges'>;
    channel: RecoveryChannel;
    expiresAt: number;
    retryAt: number;
  }> => {
    const { identifier, channel } = normalizeIdentifier(args.identifier);
    const metadata = await ctx.meta.getRequestMetadata();
    let ip: string;
    try {
      ip = normalizeClientIp(metadata.ip);
    } catch {
      throw new ConvexError('RECOVERY_UNAVAILABLE');
    }
    const hashes = await recoveryHashes(identifier, ip);
    const now = Date.now();
    if (channel === 'email') {
      await ctx.runMutation(internal.passwordRecovery.reserveEmailSend, {
        ...hashes,
        now,
      });
    }
    const target = await ctx.runQuery(
      internal.passwordRecovery.resolvePasswordIdentifier,
      { identifier, channel },
    );
    if (channel === 'sms' && !target) {
      throw new ConvexError('RECOVERY_PHONE_ACCOUNT_NOT_FOUND');
    }
    const code = generateSixDigitCode();
    const expiresAt =
      now + (channel === 'email' ? EMAIL_CODE_TTL_MS : SMS_CODE_TTL_MS);
    const challengeId = await ctx.runMutation(
      internal.passwordRecovery.createChallenge,
      {
        ...hashes,
        channel,
        codeHash: await codeHash(hashes.identifierHash, code),
        userId: target?.userId,
        passwordAccountId: target?.passwordAccountId,
        now,
        expiresAt,
      },
    );
    if (target) {
      try {
        if (channel === 'email') {
          const delivery = await sendRecoveryEmail(
            identifier,
            code,
            metadata.requestId,
          );
          await ctx.runMutation(
            internal.monitoringData.recordResendQuotaHeaders,
            { ...delivery.quota, now: Date.now() },
          );
          if (!delivery.ok) throw new ConvexError('RECOVERY_UNAVAILABLE');
        } else {
          await sendSmsCode(ctx, identifier, code, new Date(expiresAt), {
            platform: args.platform,
            purpose: 'password-recovery',
          });
        }
      } catch {
        await ctx.runMutation(internal.passwordRecovery.markDeliveryFailed, {
          challengeId,
        });
        throw new ConvexError('RECOVERY_UNAVAILABLE');
      }
    }
    return {
      challengeId,
      channel,
      expiresAt,
      retryAt:
        now + (channel === 'email' ? EMAIL_SEND_COOLDOWN_MS : 5 * 60_000),
    };
  },
});

export const claimChallenge = internalMutation({
  args: {
    challengeId: v.id('passwordRecoveryChallenges'),
    codeHash: v.string(),
    claimTokenHash: v.string(),
    now: v.number(),
  },
  handler: async (ctx, args) => {
    const challenge = await ctx.db.get(args.challengeId);
    if (
      !challenge ||
      challenge.expiresAt <= args.now ||
      challenge.status === 'consumed' ||
      challenge.status === 'failed' ||
      challenge.status === 'dummy'
    ) {
      return {
        ok: false as const,
        code: 'RECOVERY_CODE_INVALID_OR_EXPIRED' as const,
      };
    }
    if (
      challenge.status === 'claimed' &&
      (challenge.claimedAt ?? 0) + CLAIM_TTL_MS > args.now
    ) {
      return {
        ok: false as const,
        code: 'RECOVERY_CODE_INVALID_OR_EXPIRED' as const,
      };
    }
    const recentFailures = await ctx.db
      .query('passwordRecoveryCodeFailures')
      .withIndex('by_identifier_time', (q) =>
        q
          .eq('identifierHash', challenge.identifierHash)
          .gt('attemptedAt', args.now - CODE_FAILURE_WINDOW_MS),
      )
      .take(MAX_CODE_FAILURES);
    if (recentFailures.length >= MAX_CODE_FAILURES) {
      await ctx.db.patch(challenge._id, { status: 'failed' });
      return { ok: false as const, code: 'RECOVERY_RATE_LIMITED' as const };
    }
    if (challenge.codeHash !== args.codeHash) {
      await ctx.db.insert('passwordRecoveryCodeFailures', {
        identifierHash: challenge.identifierHash,
        attemptedAt: args.now,
        expiresAt: args.now + RECOVERY_RETENTION_MS,
      });
      const failedAttempts = challenge.failedAttempts + 1;
      await ctx.db.patch(challenge._id, {
        failedAttempts,
        ...(failedAttempts >= MAX_CODE_FAILURES
          ? { status: 'failed' as const }
          : {}),
      });
      return {
        ok: false as const,
        code: 'RECOVERY_CODE_INVALID_OR_EXPIRED' as const,
      };
    }
    const user = challenge.userId ? await ctx.db.get(challenge.userId) : null;
    if (!user) {
      return {
        ok: false as const,
        code: 'RECOVERY_CODE_INVALID_OR_EXPIRED' as const,
      };
    }
    const account = challenge.passwordAccountId
      ? await ctx.db.get(challenge.passwordAccountId)
      : null;
    await ctx.db.patch(challenge._id, {
      status: 'claimed',
      claimTokenHash: args.claimTokenHash,
      claimedAt: args.now,
    });
    return {
      ok: true as const,
      userId: user._id,
      passwordProviderAccountId: account?.providerAccountId,
      verifiedPhone: user.phoneVerificationTime ? user.phone : undefined,
    };
  },
});

export const releaseClaim = internalMutation({
  args: {
    challengeId: v.id('passwordRecoveryChallenges'),
    claimTokenHash: v.string(),
  },
  handler: async (ctx, args) => {
    const challenge = await ctx.db.get(args.challengeId);
    if (
      challenge?.status === 'claimed' &&
      challenge.claimTokenHash === args.claimTokenHash
    ) {
      await ctx.db.patch(challenge._id, {
        status: 'pending',
        claimTokenHash: undefined,
        claimedAt: undefined,
      });
    }
  },
});

export const finishClaim = internalMutation({
  args: {
    challengeId: v.id('passwordRecoveryChallenges'),
    claimTokenHash: v.string(),
  },
  handler: async (ctx, args) => {
    const challenge = await ctx.db.get(args.challengeId);
    if (
      !challenge ||
      challenge.status !== 'claimed' ||
      challenge.claimTokenHash !== args.claimTokenHash
    ) {
      throw new ConvexError('RECOVERY_CODE_INVALID_OR_EXPIRED');
    }
    await ctx.db.patch(challenge._id, {
      status: 'consumed',
      claimTokenHash: undefined,
    });
  },
});

export const complete = action({
  args: {
    challengeId: v.id('passwordRecoveryChallenges'),
    code: v.string(),
    newPassword: v.string(),
  },
  handler: async (ctx, args): Promise<{ changed: true }> => {
    if (args.newPassword.length < 8) {
      throw new ConvexError('RECOVERY_PASSWORD_INVALID');
    }
    const challenge = await ctx.runQuery(
      internal.passwordRecovery.getChallengeHash,
      { challengeId: args.challengeId },
    );
    if (!challenge) throw new ConvexError('RECOVERY_CODE_INVALID_OR_EXPIRED');
    const claimToken = randomToken();
    const claimTokenHash = await hmacSha256(
      requiredSecret('PASSWORD_RECOVERY_HASH_SECRET'),
      `claim:${claimToken}`,
    );
    const claimed = await ctx.runMutation(
      internal.passwordRecovery.claimChallenge,
      {
        challengeId: args.challengeId,
        codeHash: await codeHash(challenge.identifierHash, args.code),
        claimTokenHash,
        now: Date.now(),
      },
    );
    if (!claimed.ok) throw new ConvexError(claimed.code);
    try {
      if (claimed.passwordProviderAccountId) {
        await modifyAccountCredentials(ctx, {
          provider: 'password',
          account: {
            id: claimed.passwordProviderAccountId,
            secret: args.newPassword,
          },
        });
      } else if (claimed.verifiedPhone) {
        const created = await createAccount(ctx, {
          provider: 'password',
          account: { id: claimed.verifiedPhone, secret: args.newPassword },
          profile: { phone: claimed.verifiedPhone },
          shouldLinkViaPhone: true,
        });
        if (created.user._id !== claimed.userId) {
          throw new Error('Recovery account link mismatch');
        }
      } else {
        throw new Error('Recovery account is unavailable');
      }
      await invalidateSessions(ctx, { userId: claimed.userId });
      await ctx.runMutation(internal.passwordRecovery.finishClaim, {
        challengeId: args.challengeId,
        claimTokenHash,
      });
      return { changed: true };
    } catch {
      await ctx.runMutation(internal.passwordRecovery.releaseClaim, {
        challengeId: args.challengeId,
        claimTokenHash,
      });
      throw new ConvexError('RECOVERY_UNAVAILABLE');
    }
  },
});

export const getChallengeHash = internalQuery({
  args: { challengeId: v.id('passwordRecoveryChallenges') },
  handler: async (ctx, args) => {
    const challenge = await ctx.db.get(args.challengeId);
    return challenge ? { identifierHash: challenge.identifierHash } : null;
  },
});

export const cleanupExpired = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const [challenges, sends, failures] = await Promise.all([
      ctx.db
        .query('passwordRecoveryChallenges')
        .withIndex('by_expiry', (q) => q.lt('expiresAt', now))
        .take(100),
      ctx.db
        .query('passwordRecoverySendAttempts')
        .withIndex('by_expiry', (q) => q.lt('expiresAt', now))
        .take(100),
      ctx.db
        .query('passwordRecoveryCodeFailures')
        .withIndex('by_expiry', (q) => q.lt('expiresAt', now))
        .take(100),
    ]);
    for (const row of [...challenges, ...sends, ...failures]) {
      await ctx.db.delete(row._id);
    }
    if ([challenges, sends, failures].some((rows) => rows.length === 100)) {
      await ctx.scheduler.runAfter(
        0,
        internal.passwordRecovery.cleanupExpired,
        {},
      );
    }
    return challenges.length + sends.length + failures.length;
  },
});

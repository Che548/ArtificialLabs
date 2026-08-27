import { ConvexError, v } from 'convex/values';

import { internal } from './_generated/api';
import {
  action,
  internalMutation,
  internalQuery,
} from './_generated/server';
import type { MutationCtx } from './_generated/server';
import {
  evaluateSmsLimit,
  hmacSha256,
  normalizeClientIp,
  normalizeRussianPhone,
  SMS_CODE_TTL_SECONDS,
  SMS_RETENTION_MS,
  SMS_WINDOW_MS,
} from './lib/sms';

const SAFE_GATEWAY_ERRORS = new Set([
  'SMS_UNAVAILABLE',
  'SMS_GATEWAY_TIMEOUT',
  'SMS_GATEWAY_REJECTED',
]);
const SMS_DELIVERY_HINT_TTL_MS = 2 * 60 * 1000;

const utcDay = (timestamp: number) => new Date(timestamp).toISOString().slice(0, 10);

async function incrementDailyAggregate(
  ctx: MutationCtx,
  timestamp: number,
  field: 'requested' | 'sent' | 'failed',
) {
  const day = utcDay(timestamp);
  const existing = await ctx.db
    .query('smsDailyAggregates')
    .withIndex('by_day', (q) => q.eq('day', day))
    .unique();
  if (existing) {
    await ctx.db.patch(existing._id, {
      [field]: existing[field] + 1,
      updatedAt: timestamp,
    });
    return;
  }
  await ctx.db.insert('smsDailyAggregates', {
    day,
    requested: field === 'requested' ? 1 : 0,
    sent: field === 'sent' ? 1 : 0,
    failed: field === 'failed' ? 1 : 0,
    updatedAt: timestamp,
  });
}

function requiredSecret(name: string) {
  const value = process.env[name];
  if (!value) throw new ConvexError('SMS_UNAVAILABLE');
  return value;
}

async function requestHashes(phone: string, ip: string) {
  const secret = requiredSecret('SMS_RATE_LIMIT_HASH_SECRET');
  return {
    phoneHash: await hmacSha256(secret, `phone:${phone}`),
    ipHash: await hmacSha256(secret, `ip:${ip}`),
  };
}

export const reserve = internalMutation({
  args: {
    requestId: v.string(),
    phoneHash: v.string(),
    ipHash: v.string(),
    now: v.number(),
  },
  handler: async (ctx, args) => {
    const duplicate = await ctx.db
      .query('smsSendAttempts')
      .withIndex('by_request', (q) => q.eq('requestId', args.requestId))
      .unique();
    if (duplicate) {
      return { allowed: false as const, duplicate: true as const, remaining: 0 };
    }
    const since = args.now - SMS_WINDOW_MS;
    const [phoneRows, ipRows] = await Promise.all([
      ctx.db
        .query('smsSendAttempts')
        .withIndex('by_phone_time', (q) =>
          q.eq('phoneHash', args.phoneHash).gt('attemptedAt', since),
        )
        .take(3),
      ctx.db
        .query('smsSendAttempts')
        .withIndex('by_ip_time', (q) =>
          q.eq('ipHash', args.ipHash).gt('attemptedAt', since),
        )
        .take(3),
    ]);
    const state = evaluateSmsLimit(
      phoneRows.map((row) => row.attemptedAt),
      ipRows.map((row) => row.attemptedAt),
      args.now,
    );
    if (!state.allowed) return { ...state, duplicate: false as const };
    const attemptId = await ctx.db.insert('smsSendAttempts', {
      requestId: args.requestId,
      phoneHash: args.phoneHash,
      ipHash: args.ipHash,
      attemptedAt: args.now,
      expiresAt: args.now + SMS_RETENTION_MS,
      outcome: 'reserved',
    });
    await incrementDailyAggregate(ctx, args.now, 'requested');
    return {
      allowed: true as const,
      duplicate: false as const,
      attemptId,
      remaining: Math.max(0, state.remaining - 1),
    };
  },
});

export const finish = internalMutation({
  args: {
    attemptId: v.id('smsSendAttempts'),
    sent: v.boolean(),
    errorCode: v.optional(v.string()),
    latencyMs: v.number(),
  },
  handler: async (ctx, args) => {
    const attempt = await ctx.db.get(args.attemptId);
    if (!attempt || attempt.outcome !== 'reserved') return false;
    await ctx.db.patch(args.attemptId, {
      outcome: args.sent ? 'sent' : 'failed',
      errorCode: args.errorCode,
      latencyMs: Math.max(0, Math.round(args.latencyMs)),
    });
    await incrementDailyAggregate(
      ctx,
      attempt.attemptedAt,
      args.sent ? 'sent' : 'failed',
    );
    return true;
  },
});

export const statusInternal = internalQuery({
  args: { phoneHash: v.string(), ipHash: v.string(), now: v.number() },
  handler: async (ctx, args) => {
    const since = args.now - SMS_WINDOW_MS;
    const [phoneRows, ipRows] = await Promise.all([
      ctx.db
        .query('smsSendAttempts')
        .withIndex('by_phone_time', (q) =>
          q.eq('phoneHash', args.phoneHash).gt('attemptedAt', since),
        )
        .take(3),
      ctx.db
        .query('smsSendAttempts')
        .withIndex('by_ip_time', (q) =>
          q.eq('ipHash', args.ipHash).gt('attemptedAt', since),
        )
        .take(3),
    ]);
    return evaluateSmsLimit(
      phoneRows.map((row) => row.attemptedAt),
      ipRows.map((row) => row.attemptedAt),
      args.now,
    );
  },
});

export const status = action({
  args: { phone: v.string() },
  handler: async (ctx, args): Promise<{
    allowed: boolean;
    remaining: number;
    retryAt?: number;
    reason?: 'SMS_COOLDOWN' | 'SMS_RATE_LIMITED';
  }> => {
    const metadata = await ctx.meta.getRequestMetadata();
    const phone = normalizeRussianPhone(args.phone);
    const ip = normalizeClientIp(metadata.ip);
    const hashes = await requestHashes(phone, ip);
    return await ctx.runQuery(internal.smsAuth.statusInternal, {
      ...hashes,
      now: Date.now(),
    });
  },
});

export const storeDeliveryHint = internalMutation({
  args: {
    phoneHash: v.string(),
    ipHash: v.string(),
    platform: v.union(v.literal('ios'), v.literal('android')),
    now: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('smsDeliveryHints')
      .withIndex('by_phone_ip_time', (q) =>
        q.eq('phoneHash', args.phoneHash).eq('ipHash', args.ipHash),
      )
      .take(5);
    for (const row of existing) await ctx.db.delete(row._id);
    await ctx.db.insert('smsDeliveryHints', {
      phoneHash: args.phoneHash,
      ipHash: args.ipHash,
      platform: args.platform,
      createdAt: args.now,
      expiresAt: args.now + SMS_DELIVERY_HINT_TTL_MS,
    });
  },
});

export const prepareDelivery = action({
  args: {
    phone: v.string(),
    platform: v.union(v.literal('ios'), v.literal('android')),
  },
  handler: async (ctx, args) => {
    const metadata = await ctx.meta.getRequestMetadata();
    const phone = normalizeRussianPhone(args.phone);
    const ip = normalizeClientIp(metadata.ip);
    const hashes = await requestHashes(phone, ip);
    await ctx.runMutation(internal.smsAuth.storeDeliveryHint, {
      ...hashes,
      platform: args.platform,
      now: Date.now(),
    });
    return true;
  },
});

export const consumeDeliveryHint = internalMutation({
  args: { phoneHash: v.string(), ipHash: v.string(), now: v.number() },
  handler: async (ctx, args) => {
    const hint = await ctx.db
      .query('smsDeliveryHints')
      .withIndex('by_phone_ip_time', (q) =>
        q.eq('phoneHash', args.phoneHash).eq('ipHash', args.ipHash),
      )
      .order('desc')
      .first();
    if (!hint) return null;
    await ctx.db.delete(hint._id);
    return hint.expiresAt >= args.now ? hint.platform : null;
  },
});

export async function sendPhoneVerification(
  ctx: any,
  phoneInput: string,
  code: string,
  expires: Date,
) {
  if (process.env.SMS_AUTH_ENABLED !== '1') {
    throw new ConvexError('SMS_UNAVAILABLE');
  }
  const metadata = await ctx.meta.getRequestMetadata();
  const phone = normalizeRussianPhone(phoneInput);
  const ip = normalizeClientIp(metadata.ip);
  const hashes = await requestHashes(phone, ip);
  const now = Date.now();
  const platform = await ctx.runMutation(
    internal.smsAuth.consumeDeliveryHint,
    { ...hashes, now },
  );
  const reservation = await ctx.runMutation(internal.smsAuth.reserve, {
    requestId: metadata.requestId,
    ...hashes,
    now,
  });
  if (!reservation.allowed) {
    if (reservation.duplicate) throw new ConvexError('SMS_UNAVAILABLE');
    throw new ConvexError({
      code: reservation.reason,
      retryAt: reservation.retryAt,
      remaining: reservation.remaining,
    });
  }

  const body = JSON.stringify({
    requestId: metadata.requestId,
    phone,
    code,
    expiration: Math.min(
      expires.getTime(),
      now + SMS_CODE_TTL_SECONDS * 1000,
    ),
    platform,
  });
  const timestamp = String(now);
  const signature = await hmacSha256(
    requiredSecret('SMS_GATEWAY_SHARED_SECRET'),
    `${timestamp}\n${metadata.requestId}\n${body}`,
  );
  const startedAt = Date.now();
  let sent = false;
  let errorCode: string | undefined;
  try {
    const gatewayUrl = process.env.SMS_GATEWAY_URL ?? 'http://sms-gateway:8080';
    const response = await fetch(`${gatewayUrl}/v1/sms`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-sms-timestamp': timestamp,
        'x-sms-request-id': metadata.requestId,
        'x-sms-signature': signature,
      },
      body,
      signal: AbortSignal.timeout(12_000),
    });
    const payload = (await response.json().catch(() => null)) as
      | { ok?: boolean; code?: string }
      | null;
    sent = response.ok && payload?.ok === true;
    if (!sent) {
      errorCode =
        payload?.code && SAFE_GATEWAY_ERRORS.has(payload.code)
          ? payload.code
          : 'SMS_UNAVAILABLE';
    }
  } catch {
    errorCode = 'SMS_UNAVAILABLE';
  }
  await ctx.runMutation(internal.smsAuth.finish, {
    attemptId: reservation.attemptId,
    sent,
    errorCode,
    latencyMs: Date.now() - startedAt,
  });
  if (!sent) throw new ConvexError(errorCode ?? 'SMS_UNAVAILABLE');
  return { remaining: reservation.remaining };
}

export const cleanupAttempts = internalMutation({
  args: {},
  handler: async (ctx) => {
    const expired = await ctx.db
      .query('smsSendAttempts')
      .withIndex('by_expiry', (q) => q.lt('expiresAt', Date.now()))
      .take(100);
    for (const row of expired) await ctx.db.delete(row._id);
    if (expired.length === 100) {
      await ctx.scheduler.runAfter(0, internal.smsAuth.cleanupAttempts, {});
    }
    return expired.length;
  },
});

export const cleanupDeliveryHints = internalMutation({
  args: {},
  handler: async (ctx) => {
    const expired = await ctx.db
      .query('smsDeliveryHints')
      .withIndex('by_expiry', (q) => q.lt('expiresAt', Date.now()))
      .take(100);
    for (const row of expired) await ctx.db.delete(row._id);
    if (expired.length === 100) {
      await ctx.scheduler.runAfter(0, internal.smsAuth.cleanupDeliveryHints, {});
    }
    return expired.length;
  },
});

export const cleanupUnverifiedAccounts = internalMutation({
  args: { cursor: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const page = await ctx.db.query('authAccounts').paginate({
      cursor: args.cursor ?? null,
      numItems: 50,
    });
    const now = Date.now();
    let deleted = 0;
    for (const account of page.page) {
      if (account.provider !== 'phone' || account.phoneVerified) continue;
      const user = await ctx.db.get(account.userId);
      if (!user || user.phoneVerificationTime) continue;
      const verification = await ctx.db
        .query('authVerificationCodes')
        .withIndex('accountId', (q) => q.eq('accountId', account._id))
        .unique();
      const eligibleAt = verification
        ? verification.expirationTime + 60 * 60 * 1000
        : account._creationTime +
          (SMS_CODE_TTL_SECONDS * 1000 + 60 * 60 * 1000);
      if (eligibleAt > now) continue;
      if (verification) await ctx.db.delete(verification._id);
      await ctx.db.delete(account._id);
      deleted += 1;
      if (user.phone && !user.phoneVerificationTime) {
        await ctx.db.patch(user._id, { phone: undefined });
      }
      const [otherAccounts, sessions, profile] = await Promise.all([
        ctx.db
          .query('authAccounts')
          .withIndex('userIdAndProvider', (q) => q.eq('userId', user._id))
          .take(1),
        ctx.db
          .query('authSessions')
          .withIndex('userId', (q) => q.eq('userId', user._id))
          .take(1),
        ctx.db
          .query('profiles')
          .withIndex('by_user', (q) => q.eq('userId', user._id))
          .unique(),
      ]);
      if (otherAccounts.length === 0 && sessions.length === 0 && !profile) {
        await ctx.db.delete(user._id);
      }
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(
        0,
        internal.smsAuth.cleanupUnverifiedAccounts,
        { cursor: page.continueCursor },
      );
    }
    return { scanned: page.page.length, deleted };
  },
});

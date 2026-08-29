import { v } from 'convex/values';

import { internal } from './_generated/api';
import { internalMutation, mutation, query } from './_generated/server';
import { requireAdmin, writeAdminAudit } from './lib/adminAccess';

const DAY_MS = 24 * 60 * 60 * 1000;
const RESEND_USAGE_KEY = 'primary' as const;
const DEFAULT_RESEND_DAILY_LIMIT = 100;
const DEFAULT_RESEND_MONTHLY_LIMIT = 3_000;
const TARIFF_BALANCE_KEY = 't2-primary' as const;
const SAFE_BALANCE_ERRORS = new Set([
  'SMS_BALANCE_COOLDOWN',
  'SMS_BALANCE_UNAVAILABLE',
  'SMS_BALANCE_TIMEOUT',
  'SMS_BALANCE_UNPARSEABLE',
  'SMS_BALANCE_NOT_INCLUDED',
]);
const utcDay = (timestamp: number) =>
  new Date(timestamp).toISOString().slice(0, 10);

const quotaPercent = (used: number | undefined, limit: number | undefined) =>
  used === undefined || limit === undefined || limit <= 0
    ? null
    : Math.min(100, Math.round((used / limit) * 100));

export const recordServiceCheck = internalMutation({
  args: {
    service: v.string(),
    status: v.union(
      v.literal('healthy'),
      v.literal('degraded'),
      v.literal('offline'),
    ),
    latencyMs: v.optional(v.number()),
    errorCode: v.optional(v.string()),
    capacityUsed: v.optional(v.number()),
    capacityTotal: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const checkedAt = Date.now();
    return await ctx.db.insert('serviceChecks', {
      service: args.service.slice(0, 80),
      status: args.status,
      latencyMs: args.latencyMs,
      errorCode: args.errorCode?.slice(0, 80),
      capacityUsed: args.capacityUsed,
      capacityTotal: args.capacityTotal,
      checkedAt,
      expiresAt: checkedAt + 30 * DAY_MS,
    });
  },
});

export const latest = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const services = ['convex-backend', 'convex-site', 'sms-gateway'] as const;
    return await Promise.all(
      services.map(async (service) =>
        ctx.db
          .query('serviceChecks')
          .withIndex('by_service_time', (q) => q.eq('service', service))
          .order('desc')
          .first(),
      ),
    );
  },
});

export const smsOverview = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const [balance, aggregate] = await Promise.all([
      ctx.db
        .query('smsTariffBalance')
        .withIndex('by_key', (q) => q.eq('key', TARIFF_BALANCE_KEY))
        .unique(),
      ctx.db
        .query('smsDailyAggregates')
        .withIndex('by_day', (q) => q.eq('day', utcDay(Date.now())))
        .unique(),
    ]);
    const requested = aggregate?.requested ?? 0;
    const sent = aggregate?.sent ?? 0;
    const successfulSendsSinceRefresh =
      balance?.successfulSendsSinceRefresh ?? 0;
    return {
      balance: balance
        ? {
            status: balance.status,
            remainingSms: balance.remainingSms,
            estimatedRemainingSms:
              balance.remainingSms === undefined
                ? undefined
                : Math.max(
                    0,
                    balance.remainingSms - successfulSendsSinceRefresh,
                  ),
            successfulSendsSinceRefresh,
            lastAttemptAt: balance.lastAttemptAt,
            lastSuccessAt: balance.lastSuccessAt,
            nextAllowedAt: balance.nextAllowedAt,
            errorCode: balance.errorCode,
          }
        : {
            status: 'idle' as const,
            remainingSms: undefined,
            estimatedRemainingSms: undefined,
            successfulSendsSinceRefresh: 0,
            lastAttemptAt: undefined,
            lastSuccessAt: undefined,
            nextAllowedAt: undefined,
            errorCode: undefined,
          },
      todayUtc: {
        day: utcDay(Date.now()),
        requested,
        sent,
        failed: aggregate?.failed ?? 0,
        successPercent:
          requested > 0 ? Math.round((sent / requested) * 100) : null,
      },
    };
  },
});

export const emailOverview = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const usage = await ctx.db
      .query('resendUsage')
      .withIndex('by_key', (q) => q.eq('key', RESEND_USAGE_KEY))
      .unique();
    const dailyLimit = usage?.dailyLimit ?? DEFAULT_RESEND_DAILY_LIMIT;
    const monthlyLimit = usage?.monthlyLimit ?? DEFAULT_RESEND_MONTHLY_LIMIT;
    const hasUsage =
      usage?.dailyUsed !== undefined || usage?.monthlyUsed !== undefined;
    return {
      status: hasUsage ? ('ready' as const) : ('idle' as const),
      source: usage?.source === 'response_headers' ? usage.source : undefined,
      daily: {
        used: usage?.dailyUsed,
        limit: dailyLimit,
        remaining:
          usage?.dailyUsed === undefined
            ? undefined
            : Math.max(0, dailyLimit - usage.dailyUsed),
        sent: usage?.dailySent,
        received: usage?.dailyReceived,
        resetsAt: usage?.dailyResetsAt,
        percent: quotaPercent(usage?.dailyUsed, dailyLimit),
      },
      monthly: {
        used: usage?.monthlyUsed,
        limit: monthlyLimit,
        remaining:
          usage?.monthlyUsed === undefined
            ? undefined
            : Math.max(0, monthlyLimit - usage.monthlyUsed),
        sent: usage?.monthlySent,
        received: usage?.monthlyReceived,
        resetsAt: usage?.monthlyResetsAt,
        percent: quotaPercent(usage?.monthlyUsed, monthlyLimit),
      },
      lastSuccessAt: usage?.lastSuccessAt,
    };
  },
});

export const recordResendQuotaHeaders = internalMutation({
  args: {
    dailyUsed: v.optional(v.number()),
    dailyLimit: v.optional(v.number()),
    monthlyUsed: v.optional(v.number()),
    monthlyLimit: v.optional(v.number()),
    now: v.number(),
  },
  handler: async (ctx, args) => {
    if (args.dailyUsed === undefined && args.monthlyUsed === undefined) {
      return false;
    }
    const current = await ctx.db
      .query('resendUsage')
      .withIndex('by_key', (q) => q.eq('key', RESEND_USAGE_KEY))
      .unique();
    const patch = {
      status: 'ready' as const,
      source: 'response_headers' as const,
      dailyUsed: args.dailyUsed ?? current?.dailyUsed,
      dailyLimit:
        args.dailyLimit ?? current?.dailyLimit ?? DEFAULT_RESEND_DAILY_LIMIT,
      dailySent: undefined,
      dailyReceived: undefined,
      dailyResetsAt: undefined,
      monthlyUsed: args.monthlyUsed ?? current?.monthlyUsed,
      monthlyLimit:
        args.monthlyLimit ??
        current?.monthlyLimit ??
        DEFAULT_RESEND_MONTHLY_LIMIT,
      monthlySent: undefined,
      monthlyReceived: undefined,
      monthlyResetsAt: undefined,
      lastSuccessAt: args.now,
      errorCode: undefined,
      updatedAt: args.now,
    };
    if (current) await ctx.db.patch(current._id, patch);
    else {
      await ctx.db.insert('resendUsage', {
        key: RESEND_USAGE_KEY,
        ...patch,
      });
    }
    return true;
  },
});

export const requestSmsTariffRefresh = mutation({
  args: { requestId: v.string() },
  handler: async (ctx, args) => {
    const { userId } = await requireAdmin(ctx);
    if (!/^[A-Za-z0-9:_-]{8,120}$/.test(args.requestId)) {
      throw new Error('INVALID_REQUEST_ID');
    }
    const now = Date.now();
    const current = await ctx.db
      .query('smsTariffBalance')
      .withIndex('by_key', (q) => q.eq('key', TARIFF_BALANCE_KEY))
      .unique();
    if (current?.nextAllowedAt && current.nextAllowedAt > now) {
      return {
        accepted: false as const,
        status: current.status,
        nextAllowedAt: current.nextAllowedAt,
      };
    }
    const patch = {
      status: 'checking' as const,
      lastAttemptAt: now,
      nextAllowedAt: now + DAY_MS,
      lastRequestId: args.requestId,
      errorCode: undefined,
      updatedAt: now,
    };
    if (current) await ctx.db.patch(current._id, patch);
    else {
      await ctx.db.insert('smsTariffBalance', {
        key: TARIFF_BALANCE_KEY,
        ...patch,
      });
    }
    await writeAdminAudit(ctx, {
      actorUserId: userId,
      action: 'sms.tariff_balance.request',
      entityType: 'sms_tariff_balance',
      entityId: TARIFF_BALANCE_KEY,
      summary: 'Запрошено ручное обновление остатка SMS по тарифу T2',
      requestId: args.requestId,
      occurredAt: now,
    });
    await ctx.scheduler.runAfter(
      0,
      internal.monitoring.refreshSmsTariffBalance,
      { requestId: args.requestId, actorUserId: userId },
    );
    return {
      accepted: true as const,
      status: 'checking' as const,
      nextAllowedAt: now + DAY_MS,
    };
  },
});

export const finishSmsTariffRefresh = internalMutation({
  args: {
    requestId: v.string(),
    actorUserId: v.id('users'),
    remainingSms: v.optional(v.number()),
    errorCode: v.optional(v.string()),
    nextAllowedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const current = await ctx.db
      .query('smsTariffBalance')
      .withIndex('by_key', (q) => q.eq('key', TARIFF_BALANCE_KEY))
      .unique();
    if (!current || current.lastRequestId !== args.requestId) return false;
    const now = Date.now();
    const success =
      args.remainingSms !== undefined &&
      Number.isSafeInteger(args.remainingSms) &&
      args.remainingSms >= 0;
    const errorCode = success
      ? undefined
      : args.errorCode && SAFE_BALANCE_ERRORS.has(args.errorCode)
        ? args.errorCode
        : 'SMS_BALANCE_UNAVAILABLE';
    const gatewayCooldownAt =
      !success &&
      errorCode === 'SMS_BALANCE_COOLDOWN' &&
      Number.isSafeInteger(args.nextAllowedAt) &&
      (args.nextAllowedAt ?? 0) > now &&
      (args.nextAllowedAt ?? 0) <= now + DAY_MS
        ? args.nextAllowedAt
        : undefined;
    await ctx.db.patch(current._id, {
      status: success ? 'ready' : 'error',
      remainingSms: success ? args.remainingSms : current.remainingSms,
      successfulSendsSinceRefresh: success
        ? 0
        : current.successfulSendsSinceRefresh,
      lastSuccessAt: success ? now : current.lastSuccessAt,
      errorCode,
      // A gateway cooldown means this request did not execute USSD. Adopt the
      // gateway's existing deadline instead of extending it by another day.
      nextAllowedAt: gatewayCooldownAt ?? current.nextAllowedAt,
      updatedAt: now,
    });
    await writeAdminAudit(ctx, {
      actorUserId: args.actorUserId,
      action: success
        ? 'sms.tariff_balance.updated'
        : 'sms.tariff_balance.failed',
      entityType: 'sms_tariff_balance',
      entityId: TARIFF_BALANCE_KEY,
      summary: success
        ? 'Остаток SMS по тарифу T2 обновлён'
        : `Обновление остатка SMS завершилось ошибкой ${errorCode}`,
      requestId: args.requestId,
      occurredAt: now,
    });
    return true;
  },
});

export const resetSmsTariffCooldown = internalMutation({
  args: {
    actorUserId: v.id('users'),
    now: v.number(),
  },
  handler: async (ctx, args) => {
    const current = await ctx.db
      .query('smsTariffBalance')
      .withIndex('by_key', (q) => q.eq('key', TARIFF_BALANCE_KEY))
      .unique();
    if (!current) return false;
    await ctx.db.patch(current._id, {
      status: current.remainingSms === undefined ? 'idle' : 'ready',
      nextAllowedAt: args.now,
      errorCode: undefined,
      updatedAt: args.now,
    });
    await writeAdminAudit(ctx, {
      actorUserId: args.actorUserId,
      action: 'sms.tariff_balance.cooldown_reset',
      entityType: 'sms_tariff_balance',
      entityId: TARIFF_BALANCE_KEY,
      summary: 'Суточный cooldown проверки тарифа сброшен вручную',
      requestId: `sms-tariff-reset-${args.now}`,
      occurredAt: args.now,
    });
    return true;
  },
});

export const initializeSuccessfulSendsSinceRefresh = internalMutation({
  args: { count: v.number() },
  handler: async (ctx, args) => {
    if (!Number.isSafeInteger(args.count) || args.count < 0) {
      throw new Error('INVALID_SMS_SEND_COUNT');
    }
    const current = await ctx.db
      .query('smsTariffBalance')
      .withIndex('by_key', (q) => q.eq('key', TARIFF_BALANCE_KEY))
      .unique();
    if (
      !current ||
      current.lastSuccessAt === undefined ||
      current.successfulSendsSinceRefresh !== undefined
    ) {
      return false;
    }
    await ctx.db.patch(current._id, {
      successfulSendsSinceRefresh: args.count,
      updatedAt: Date.now(),
    });
    return true;
  },
});

export const cleanupExpired = internalMutation({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query('serviceChecks')
      .withIndex('by_expiry', (q) => q.lte('expiresAt', Date.now()))
      .take(100);
    for (const row of rows) await ctx.db.delete(row._id);
    return { deleted: rows.length };
  },
});

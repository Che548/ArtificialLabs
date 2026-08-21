import { RateLimiter } from '@convex-dev/rate-limiter';
import { v } from 'convex/values';

import { components, internal } from './_generated/api';
import { internalMutation, mutation, query } from './_generated/server';
import type { MutationCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { requireAdmin } from './lib/adminAccess';
import { requireUserId } from './lib/access';

const DAY_MS = 24 * 60 * 60 * 1000;
const RAW_RETENTION_MS = 7 * DAY_MS;
const ERROR_RETENTION_MS = 30 * DAY_MS;
const AGGREGATE_RETENTION_MS = 730 * DAY_MS;
const ACTIVE_KEY_RETENTION_MS = 2 * DAY_MS;
const MAX_EVENTS = 50;
const WORKER_BATCH = 50;

const rateLimiter = new RateLimiter(components.rateLimiter, {
  telemetryPerUser: {
    kind: 'token bucket',
    rate: 30,
    period: 60_000,
    capacity: 10,
  },
});

const eventKind = v.union(
  v.literal('cv_processed'),
  v.literal('calibration_fetch'),
  v.literal('client_error'),
);
const platform = v.union(v.literal('ios'), v.literal('android'));
const outcome = v.union(
  v.literal('success'),
  v.literal('review'),
  v.literal('invalid'),
  v.literal('error'),
);
const scope = v.union(
  v.literal('global'),
  v.literal('platform'),
  v.literal('test_system'),
  v.literal('lot'),
  v.literal('algorithm'),
  v.literal('app_version'),
);
const telemetryEvent = v.object({
  eventId: v.string(),
  kind: eventKind,
  occurredAt: v.number(),
  platform,
  osMajor: v.string(),
  appVersion: v.string(),
  algorithmVersion: v.optional(v.string()),
  calibrationVersion: v.optional(v.string()),
  testSystemKey: v.optional(v.string()),
  lotNumber: v.optional(v.string()),
  durationMs: v.optional(v.number()),
  outcome: v.optional(outcome),
  errorCode: v.optional(v.string()),
  qualityFlags: v.array(v.string()),
});

const dayFor = (timestamp: number) =>
  new Date(timestamp).toISOString().slice(0, 10);

function safeDimension(value: string | undefined, max = 80) {
  if (!value) return undefined;
  const normalized = value.trim();
  if (
    !normalized ||
    normalized.length > max ||
    !/^[A-Za-z0-9._:+-]+$/.test(normalized)
  ) {
    throw new Error('INVALID_TELEMETRY_DIMENSION');
  }
  return normalized;
}

async function ensureWorker(ctx: MutationCtx, now: number) {
  const state = await ctx.db
    .query('analyticsWorkerState')
    .withIndex('by_key', (q) => q.eq('key', 'telemetry'))
    .unique();
  if (state && state.scheduled && (state.leaseUntil ?? 0) > now) return;
  const patch = {
    scheduled: true,
    leaseUntil: now + 2 * 60_000,
    updatedAt: now,
  } as const;
  if (state) await ctx.db.patch(state._id, patch);
  else
    await ctx.db.insert('analyticsWorkerState', { key: 'telemetry', ...patch });
  await ctx.scheduler.runAfter(0, internal.telemetry.processBatch, {});
}

async function scheduleWorker(ctx: MutationCtx, now: number) {
  return await ensureWorker(ctx, now);
}

export const setConsent = mutation({
  args: { enabled: v.boolean() },
  handler: async (ctx, { enabled }) => {
    const userId = await requireUserId(ctx);
    const existing = await ctx.db
      .query('analyticsConsents')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .unique();
    const updatedAt = Date.now();
    if (existing) await ctx.db.patch(existing._id, { enabled, updatedAt });
    else
      await ctx.db.insert('analyticsConsents', { userId, enabled, updatedAt });
    return { enabled, updatedAt };
  },
});

export const consent = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    return await ctx.db
      .query('analyticsConsents')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .unique();
  },
});

export const ingest = mutation({
  args: { events: v.array(telemetryEvent) },
  handler: async (ctx, { events }) => {
    const userId = await requireUserId(ctx);
    if (events.length === 0 || events.length > MAX_EVENTS) {
      throw new Error('INVALID_TELEMETRY_BATCH');
    }
    const consentRow = await ctx.db
      .query('analyticsConsents')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .unique();
    if (!consentRow?.enabled) throw new Error('ANALYTICS_CONSENT_REQUIRED');
    const limited = await rateLimiter.limit(ctx, 'telemetryPerUser', {
      key: userId,
    });
    if (!limited.ok) throw new Error('TELEMETRY_RATE_LIMITED');
    const now = Date.now();
    let accepted = 0;
    for (const event of events) {
      if (
        event.occurredAt < now - RAW_RETENTION_MS ||
        event.occurredAt > now + 5 * 60_000 ||
        !/^[A-Za-z0-9_-]{12,100}$/.test(event.eventId)
      ) {
        throw new Error('INVALID_TELEMETRY_EVENT');
      }
      if (
        event.durationMs !== undefined &&
        (!Number.isFinite(event.durationMs) ||
          event.durationMs < 0 ||
          event.durationMs > 60_000)
      ) {
        throw new Error('INVALID_DURATION');
      }
      if (event.qualityFlags.length > 12)
        throw new Error('TOO_MANY_QUALITY_FLAGS');
      const duplicate = await ctx.db
        .query('telemetryEvents')
        .withIndex('by_event_id', (q) => q.eq('eventId', event.eventId))
        .unique();
      if (duplicate) continue;
      await ctx.db.insert('telemetryEvents', {
        eventId: event.eventId,
        kind: event.kind,
        occurredAt: event.occurredAt,
        day: dayFor(event.occurredAt),
        platform: event.platform,
        osMajor: safeDimension(event.osMajor, 16)!,
        appVersion: safeDimension(event.appVersion, 32)!,
        algorithmVersion: safeDimension(event.algorithmVersion),
        calibrationVersion: safeDimension(event.calibrationVersion),
        testSystemKey: safeDimension(event.testSystemKey),
        lotNumber: safeDimension(event.lotNumber),
        durationMs: event.durationMs,
        outcome: event.outcome,
        errorCode: safeDimension(event.errorCode),
        qualityFlags: event.qualityFlags.map((flag) =>
          safeDimension(flag, 48)!,
        ),
        expiresAt:
          event.occurredAt +
          (event.outcome === 'error' ? ERROR_RETENTION_MS : RAW_RETENTION_MS),
        createdAt: now,
      });
      accepted += 1;
    }
    if (accepted) await scheduleWorker(ctx, now);
    return { accepted, duplicates: events.length - accepted };
  },
});

async function dailyHmac(userId: Id<'users'>, day: string) {
  const secret = process.env.ANALYTICS_HASH_SECRET;
  if (!secret) throw new Error('ANALYTICS_HASH_SECRET_NOT_CONFIGURED');
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const bytes = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(`${day}:${userId}`),
  );
  return Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

export const heartbeat = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const now = Date.now();
    const day = dayFor(now);
    const keyHash = await dailyHmac(userId, day);
    const existing = await ctx.db
      .query('analyticsDailyActiveKeys')
      .withIndex('by_day_key', (q) => q.eq('day', day).eq('keyHash', keyHash))
      .unique();
    if (existing) return { counted: false };
    await ctx.db.insert('analyticsDailyActiveKeys', {
      day,
      keyHash,
      expiresAt: now + ACTIVE_KEY_RETENTION_MS,
      createdAt: now,
    });
    const count = await ctx.db
      .query('analyticsDailyActiveCounts')
      .withIndex('by_day', (q) => q.eq('day', day))
      .unique();
    if (count) {
      await ctx.db.patch(count._id, { count: count.count + 1, updatedAt: now });
    } else {
      await ctx.db.insert('analyticsDailyActiveCounts', {
        day,
        count: 1,
        updatedAt: now,
        expiresAt: now + AGGREGATE_RETENTION_MS,
      });
    }
    return { counted: true };
  },
});

type BucketDelta = {
  processed: number;
  successes: number;
  reviews: number;
  invalid: number;
  errors: number;
  durationCount: number;
  durationTotalMs: number;
  quality: Map<string, number>;
  errorsByCode: Map<string, number>;
};

function addMap(target: Map<string, number>, key: string | undefined) {
  if (key) target.set(key, (target.get(key) ?? 0) + 1);
}

function mergeCounts(
  existing: Array<{ key: string; count: number }>,
  additions: Map<string, number>,
) {
  const values = new Map(existing.map((item) => [item.key, item.count]));
  for (const [key, count] of additions)
    values.set(key, (values.get(key) ?? 0) + count);
  return [...values.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(0, 50)
    .map(([key, count]) => ({ key, count }));
}

function dimensions(event: Doc<'telemetryEvents'>) {
  return [
    ['global', '__all__'],
    ['platform', event.platform],
    ['test_system', event.testSystemKey],
    ['lot', event.lotNumber],
    ['algorithm', event.algorithmVersion],
    ['app_version', event.appVersion],
  ].filter((item): item is [Doc<'analyticsBuckets'>['scope'], string] =>
    Boolean(item[1]),
  );
}

export const processBatch = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const rows = await ctx.db
      .query('telemetryEvents')
      .withIndex('by_processed_time', (q) => q.eq('processedAt', undefined))
      .take(WORKER_BATCH);
    const grouped = new Map<
      string,
      {
        day: string;
        scope: Doc<'analyticsBuckets'>['scope'];
        dimension: string;
        delta: BucketDelta;
      }
    >();
    for (const event of rows) {
      for (const [bucketScope, dimension] of dimensions(event)) {
        const key = `${event.day}\u0000${bucketScope}\u0000${dimension}`;
        let group = grouped.get(key);
        if (!group) {
          group = {
            day: event.day,
            scope: bucketScope,
            dimension,
            delta: {
              processed: 0,
              successes: 0,
              reviews: 0,
              invalid: 0,
              errors: 0,
              durationCount: 0,
              durationTotalMs: 0,
              quality: new Map(),
              errorsByCode: new Map(),
            },
          };
          grouped.set(key, group);
        }
        const delta = group.delta;
        delta.processed += 1;
        if (event.outcome === 'success') delta.successes += 1;
        else if (event.outcome === 'review') delta.reviews += 1;
        else if (event.outcome === 'invalid') delta.invalid += 1;
        else if (event.outcome === 'error') delta.errors += 1;
        if (event.durationMs !== undefined) {
          delta.durationCount += 1;
          delta.durationTotalMs += event.durationMs;
        }
        for (const flag of event.qualityFlags) addMap(delta.quality, flag);
        addMap(delta.errorsByCode, event.errorCode);
      }
    }
    for (const group of grouped.values()) {
      const existing = await ctx.db
        .query('analyticsBuckets')
        .withIndex('by_scope_dimension_day', (q) =>
          q
            .eq('scope', group.scope)
            .eq('dimension', group.dimension)
            .eq('day', group.day),
        )
        .unique();
      const delta = group.delta;
      if (existing) {
        await ctx.db.patch(existing._id, {
          processed: existing.processed + delta.processed,
          successes: existing.successes + delta.successes,
          reviews: existing.reviews + delta.reviews,
          invalid: existing.invalid + delta.invalid,
          errors: existing.errors + delta.errors,
          durationCount: existing.durationCount + delta.durationCount,
          durationTotalMs: existing.durationTotalMs + delta.durationTotalMs,
          qualityFlagCounts: mergeCounts(
            existing.qualityFlagCounts,
            delta.quality,
          ),
          errorCounts: mergeCounts(existing.errorCounts, delta.errorsByCode),
          updatedAt: now,
        });
      } else {
        await ctx.db.insert('analyticsBuckets', {
          day: group.day,
          scope: group.scope,
          dimension: group.dimension,
          processed: delta.processed,
          successes: delta.successes,
          reviews: delta.reviews,
          invalid: delta.invalid,
          errors: delta.errors,
          durationCount: delta.durationCount,
          durationTotalMs: delta.durationTotalMs,
          qualityFlagCounts: mergeCounts([], delta.quality),
          errorCounts: mergeCounts([], delta.errorsByCode),
          updatedAt: now,
          expiresAt: now + AGGREGATE_RETENTION_MS,
        });
      }
    }
    for (const row of rows) await ctx.db.patch(row._id, { processedAt: now });
    const remaining = await ctx.db
      .query('telemetryEvents')
      .withIndex('by_processed_time', (q) => q.eq('processedAt', undefined))
      .first();
    const state = await ctx.db
      .query('analyticsWorkerState')
      .withIndex('by_key', (q) => q.eq('key', 'telemetry'))
      .unique();
    if (remaining) {
      if (state) {
        await ctx.db.patch(state._id, {
          scheduled: true,
          leaseUntil: now + 2 * 60_000,
          lastStartedAt: now,
          updatedAt: now,
        });
      }
      await ctx.scheduler.runAfter(100, internal.telemetry.processBatch, {});
    } else if (state) {
      await ctx.db.patch(state._id, {
        scheduled: false,
        leaseUntil: undefined,
        lastCompletedAt: now,
        lastError: undefined,
        updatedAt: now,
      });
    }
    return { processed: rows.length, remaining: Boolean(remaining) };
  },
});

export const watchdog = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const pending = await ctx.db
      .query('telemetryEvents')
      .withIndex('by_processed_time', (q) => q.eq('processedAt', undefined))
      .first();
    if (!pending) return { restarted: false };
    const state = await ctx.db
      .query('analyticsWorkerState')
      .withIndex('by_key', (q) => q.eq('key', 'telemetry'))
      .unique();
    if (state?.scheduled && (state.leaseUntil ?? 0) > now)
      return { restarted: false };
    await scheduleWorker(ctx, now);
    return { restarted: true };
  },
});

async function deleteExpired(
  ctx: MutationCtx,
  table:
    | 'telemetryEvents'
    | 'analyticsBuckets'
    | 'analyticsDailyActiveKeys'
    | 'analyticsDailyActiveCounts'
    | 'serviceChecks',
  now: number,
) {
  const rows = await ctx.db
    .query(table)
    .withIndex('by_expiry', (q) => q.lte('expiresAt', now))
    .take(100);
  for (const row of rows) await ctx.db.delete(row._id);
  return rows.length;
}

export const cleanupExpired = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const deleted = {
      events: await deleteExpired(ctx, 'telemetryEvents', now),
      buckets: await deleteExpired(ctx, 'analyticsBuckets', now),
      activeKeys: await deleteExpired(ctx, 'analyticsDailyActiveKeys', now),
      activeCounts: await deleteExpired(ctx, 'analyticsDailyActiveCounts', now),
      serviceChecks: await deleteExpired(ctx, 'serviceChecks', now),
    };
    return deleted;
  },
});

export const overview = query({
  args: {
    fromDay: v.string(),
    toDay: v.string(),
    scope,
    dimension: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(args.fromDay) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(args.toDay)
    ) {
      throw new Error('INVALID_DATE_RANGE');
    }
    const days = Math.floor(
      (Date.parse(`${args.toDay}T00:00:00Z`) -
        Date.parse(`${args.fromDay}T00:00:00Z`)) /
        DAY_MS,
    );
    if (days < 0 || days > 366) throw new Error('DATE_RANGE_TOO_LARGE');
    const buckets = await ctx.db
      .query('analyticsBuckets')
      .withIndex('by_scope_dimension_day', (q) =>
        q
          .eq('scope', args.scope)
          .eq('dimension', args.dimension)
          .gte('day', args.fromDay)
          .lte('day', args.toDay),
      )
      .take(367);
    const activeUsers =
      args.scope === 'global'
        ? await ctx.db
            .query('analyticsDailyActiveCounts')
            .withIndex('by_day', (q) =>
              q.gte('day', args.fromDay).lte('day', args.toDay),
            )
            .take(367)
        : [];
    return { buckets, activeUsers };
  },
});

export const recentErrors = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    await requireAdmin(ctx);
    return await ctx.db
      .query('telemetryEvents')
      .withIndex('by_outcome_time', (q) => q.eq('outcome', 'error'))
      .order('desc')
      .take(Math.max(1, Math.min(limit ?? 20, 50)));
  },
});

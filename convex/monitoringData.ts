import { v } from 'convex/values';

import { internalMutation, query } from './_generated/server';
import { requireAdmin } from './lib/adminAccess';

const DAY_MS = 24 * 60 * 60 * 1000;

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
  },
  handler: async (ctx, args) => {
    const checkedAt = Date.now();
    return await ctx.db.insert('serviceChecks', {
      service: args.service.slice(0, 80),
      status: args.status,
      latencyMs: args.latencyMs,
      errorCode: args.errorCode?.slice(0, 80),
      checkedAt,
      expiresAt: checkedAt + 30 * DAY_MS,
    });
  },
});

export const latest = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const services = ['convex-backend', 'convex-site'] as const;
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

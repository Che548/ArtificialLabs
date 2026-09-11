import { paginationOptsValidator } from 'convex/server';
import { v } from 'convex/values';
import { query, internalMutation } from './_generated/server';
import { requireAdmin } from './lib/adminAccess';
import { countAccount } from './lib/accountCounts';

export const list = query({
  args: { paginationOpts: paginationOptsValidator, email: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const email = args.email?.trim().toLowerCase() ?? '';
    if (email.length > 254) throw new Error('EMAIL_SEARCH_TOO_LONG');
    const source = email
      ? ctx.db.query('users').withIndex('email', q => q.gte('email', email).lt('email', `${email}\uffff`))
      : ctx.db.query('users');
    const result = await source.order('desc').paginate({ ...args.paginationOpts,
      numItems: Math.max(1, Math.min(args.paginationOpts.numItems, 50)), maximumRowsRead: 75, maximumBytesRead: 256_000 });
    const page = await Promise.all(result.page.map(async user => {
      const state = await ctx.db.query('accountStates').withIndex('by_user', q => q.eq('userId', user._id)).unique();
      return { id: user._id, email: user.email ?? null, registeredAt: user._creationTime,
        status: state?.scheduledDeletionAt ? 'pending_deletion' as const : 'active' as const };
    }));
    return { ...result, page };
  },
});

export const overview = query({
  args: { fromDay: v.string(), toDay: v.string() },
  handler: async (ctx, { fromDay, toDay }) => {
    await requireAdmin(ctx);
    const valid = (day: string) => /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(Date.parse(day)) && new Date(day).toISOString().slice(0, 10) === day;
    if (!valid(fromDay) || !valid(toDay) || toDay < fromDay || Date.parse(toDay) - Date.parse(fromDay) > 366 * 86400000) throw new Error('INVALID_DATE_RANGE');
    const migration = await ctx.db.query('adminAccountMigration').withIndex('by_key', q => q.eq('key', 'accounts-v1')).unique();
    const total = await ctx.db.query('adminAccountCounts').withIndex('by_key', q => q.eq('key', 'total')).unique();
    const daily = await ctx.db.query('adminAccountCounts').withIndex('by_key', q => q.gte('key', `day:${fromDay}`).lte('key', `day:${toDay}`)).take(367);
    return { complete: migration?.complete ?? false, total: total?.count ?? 0,
      registrations: daily.reduce((sum, row) => sum + row.count, 0),
      daily: daily.map(row => ({ day: row.key.slice(4), count: row.count })) };
  },
});

// Operator-only, bounded and resumable. Never run from public pages or on startup.
export const backfill = internalMutation({
  args: {},
  handler: async ctx => {
    const state = await ctx.db.query('adminAccountMigration').withIndex('by_key', q => q.eq('key', 'accounts-v1')).unique();
    if (state?.complete) return { complete: true, processed: 0 };
    const page = await ctx.db.query('users').order('asc').paginate({ cursor: state?.cursor ?? null, numItems: 50 });
    for (const user of page.page) await countAccount(ctx, user._id);
    const next = { key: 'accounts-v1', cursor: page.continueCursor, complete: page.isDone };
    if (state) await ctx.db.patch(state._id, next);
    else await ctx.db.insert('adminAccountMigration', next);
    return { complete: page.isDone, processed: page.page.length };
  },
});

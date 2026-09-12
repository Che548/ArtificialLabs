import { v } from 'convex/values';
import { internalMutation } from './_generated/server';
import type { QueryCtx, MutationCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';

export async function hasReviewLoginException(
  ctx: QueryCtx | MutationCtx,
  userId: Id<'users'>,
  email: string,
) {
  const member = await ctx.db
    .query('adminMemberships')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .first();
  if (member) return false;
  const rows = await ctx.db
    .query('reviewLoginExceptions')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .take(2);
  return rows.some((row) => row.active && row.email === email);
}
export async function revokeReviewLoginExceptions(
  ctx: MutationCtx,
  userId: Id<'users'>,
  reason: string,
) {
  for (const row of await ctx.db
    .query('reviewLoginExceptions')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .collect()) {
    if (!row.active) continue;
    await ctx.db.patch(row._id, { active: false, updatedAt: Date.now() });
    await ctx.db.insert('reviewLoginAudit', {
      userId,
      store: row.store,
      operation: 'revoke',
      reason,
      at: Date.now(),
    });
  }
}
// Admin-authenticated CLI only. Never exposed as an app mutation.
export const configure = internalMutation({
  args: {
    userId: v.id('users'),
    email: v.string(),
    store: v.union(v.literal('apple'), v.literal('google')),
    active: v.boolean(),
    consoleAccountVerified: v.boolean(),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (
      !user ||
      user.email !== args.email ||
      !args.reason.trim() ||
      args.reason.length > 200
    )
      throw new Error('REVIEW_ACCOUNT_MISMATCH');
    if (!args.active) {
      await revokeReviewLoginExceptions(ctx, args.userId, args.reason);
      return;
    }
    if (!args.consoleAccountVerified)
      throw new Error('REVIEW_CONSOLE_VERIFICATION_REQUIRED');
    const own = await ctx.db
      .query('reviewLoginExceptions')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .take(2);
    if (own.some((row) => row.active && row.store !== args.store))
      throw new Error('REVIEW_STORES_REQUIRE_DISTINCT_ACCOUNTS');
    if (
      await ctx.db
        .query('adminMemberships')
        .withIndex('by_user', (q) => q.eq('userId', args.userId))
        .first()
    )
      throw new Error('REVIEW_ACCOUNT_MUST_NOT_BE_ADMIN');
    const existing = await ctx.db
      .query('reviewLoginExceptions')
      .withIndex('by_store', (q) => q.eq('store', args.store))
      .collect();
    if (existing.some((row) => row.active && row.userId !== args.userId))
      throw new Error('REVIEW_STORE_ALREADY_ASSIGNED');
    const same = existing.find((row) => row.userId === args.userId);
    if (same?.active && same.email === args.email) return;
    const data = {
      userId: args.userId,
      email: args.email,
      store: args.store,
      active: true,
      updatedAt: Date.now(),
    };
    if (same) await ctx.db.replace(same._id, data);
    else await ctx.db.insert('reviewLoginExceptions', data);
    await ctx.db.insert('reviewLoginAudit', {
      userId: args.userId,
      store: args.store,
      operation: 'grant',
      reason: args.reason,
      at: Date.now(),
    });
  },
});

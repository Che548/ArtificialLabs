import type { Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';

async function increment(ctx: MutationCtx, key: string, delta: number) {
  const row = await ctx.db.query('adminAccountCounts').withIndex('by_key', q => q.eq('key', key)).unique();
  if (row) await ctx.db.patch(row._id, { count: row.count + delta });
  else await ctx.db.insert('adminAccountCounts', { key, count: delta });
}

// Ledger and counters share the user mutation's transaction. Retries are safe.
export async function countAccount(ctx: MutationCtx, userId: Id<'users'>) {
  const user = await ctx.db.get(userId);
  if (!user) return;
  const counted = await ctx.db.query('adminAccountLedger').withIndex('by_user', q => q.eq('userId', userId)).unique();
  if (counted) return;
  await ctx.db.insert('adminAccountLedger', { userId });
  await increment(ctx, 'total', 1);
  await increment(ctx, `day:${new Date(user._creationTime).toISOString().slice(0, 10)}`, 1);
}

export async function uncountAccount(ctx: MutationCtx, userId: Id<'users'>) {
  // Capture legacy registrations even when deletion precedes the backfill cursor.
  await countAccount(ctx, userId);
  const counted = await ctx.db.query('adminAccountLedger').withIndex('by_user', q => q.eq('userId', userId)).unique();
  if (!counted) return;
  await increment(ctx, 'total', -1);
  await ctx.db.delete(counted._id);
}

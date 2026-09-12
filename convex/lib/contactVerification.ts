import { ConvexError } from 'convex/values';
import { hmacSha256 } from './sms';
import type { MutationCtx } from '../_generated/server';
import type { Id } from '../_generated/dataModel';

export const contactError = (code: string): never => {
  throw new ConvexError(`CONTACT_${code}`);
};
export const contactHash = (value: string) => {
  const key = process.env.PASSWORD_RECOVERY_HASH_SECRET;
  if (!key) return contactError('UNAVAILABLE');
  return hmacSha256(key, `contact-verification:${value}`);
};
export async function contactLimit(
  ctx: MutationCtx,
  buckets: string[],
  max: number,
  cooldown: number,
) {
  const now = Date.now();
  for (const bucket of buckets) {
    const rows = await ctx.db
      .query('contactVerificationAttempts')
      .withIndex('by_bucket_time', (q) =>
        q.eq('bucket', bucket).gt('at', now - 86400000),
      )
      .order('desc')
      .take(max);
    if (rows.length >= max || (rows[0] && rows[0].at + cooldown > now))
      contactError('RATE_LIMITED');
  }
  for (const bucket of buckets)
    await ctx.db.insert('contactVerificationAttempts', {
      bucket,
      at: now,
      expiresAt: now + 86400000,
    });
}
export async function revokeOtherSessions(
  ctx: MutationCtx,
  userId: Id<'users'>,
  current: Id<'authSessions'>,
) {
  const sessions = await ctx.db
    .query('authSessions')
    .withIndex('userId', (q) => q.eq('userId', userId))
    .collect();
  for (const session of sessions) {
    if (session._id === current) continue;
    const tokens = await ctx.db
      .query('authRefreshTokens')
      .withIndex('sessionIdAndParentRefreshTokenId', (q) =>
        q.eq('sessionId', session._id),
      )
      .collect();
    for (const token of tokens) await ctx.db.delete(token._id);
    await ctx.db.delete(session._id);
  }
}

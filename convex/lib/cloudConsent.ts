import { getAuthSessionId } from '@convex-dev/auth/server';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import type { Id } from '../_generated/dataModel';

export async function cloudSession(ctx: QueryCtx | MutationCtx, userId: Id<'users'>) {
  const sessionId = await getAuthSessionId(ctx);
  if (!sessionId) throw new Error('UNAUTHENTICATED');
  const row = await ctx.db.query('cloudSyncSessions').withIndex('by_user_session', q => q.eq('userId', userId).eq('sessionId', sessionId)).unique();
  return { sessionId, row };
}

export async function recordCloudReceipt(ctx: MutationCtx, userId: Id<'users'>, receipt?: number) {
  const { sessionId, row } = await cloudSession(ctx, userId);
  if (row?.revokedAt && (!receipt || receipt <= row.revokedAt)) throw new Error('CLOUD_SYNC_CONSENT_REVOKED');
  if (!receipt) return;
  if (receipt > Date.now() + 300_000 || !Number.isFinite(receipt)) throw new Error('SYNC_CLOCK_INVALID');
  if (!row) await ctx.db.insert('cloudSyncSessions', { userId, sessionId, consentedAt: receipt });
  else if (receipt > (row.consentedAt ?? 0)) await ctx.db.patch(row._id, { consentedAt: receipt });
}

export async function hasCloudConsent(ctx: QueryCtx | MutationCtx, userId: Id<'users'>) {
  const { row } = await cloudSession(ctx, userId);
  return Boolean(row?.consentedAt && row.consentedAt > (row.revokedAt ?? 0));
}

// Scheduled work has no caller session. Require an outstanding explicit device
// receipt, never the compatibility timestamp left on the account profile.
export async function hasAnyCloudConsent(ctx: QueryCtx | MutationCtx, userId: Id<'users'>) {
  const rows = await ctx.db.query('cloudSyncSessions').withIndex('by_user_session', q => q.eq('userId', userId)).take(100);
  return rows.some(row => Boolean(row.consentedAt && row.consentedAt > (row.revokedAt ?? 0)));
}

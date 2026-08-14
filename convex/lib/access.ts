import { getAuthUserId } from '@convex-dev/auth/server';

import type { Doc } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';

type Ctx = QueryCtx | MutationCtx;

export async function requireUserId(ctx: Ctx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error('UNAUTHENTICATED');
  return userId;
}

export async function getOwnedProfile(ctx: Ctx) {
  const userId = await requireUserId(ctx);
  return await ctx.db
    .query('profiles')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .unique();
}

export async function getAccountState(ctx: Ctx) {
  const userId = await requireUserId(ctx);
  return await ctx.db
    .query('accountStates')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .unique();
}

export async function requireActiveAccount(ctx: Ctx) {
  const userId = await requireUserId(ctx);
  const state = await ctx.db
    .query('accountStates')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .unique();
  if (state?.scheduledDeletionAt) throw new Error('ACCOUNT_PENDING_DELETION');
  return userId;
}

export async function requireOwnedProfile(ctx: Ctx): Promise<Doc<'profiles'>> {
  await requireActiveAccount(ctx);
  const profile = await getOwnedProfile(ctx);
  if (!profile) throw new Error('PROFILE_REQUIRED');
  return profile;
}

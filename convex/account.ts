import { v } from 'convex/values';

import { internalMutation, mutation, query } from './_generated/server';
import type { MutationCtx } from './_generated/server';
import { requireUserId } from './lib/access';

const RECOVERY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

async function accountStateFor(ctx: MutationCtx, userId: string) {
  return await ctx.db
    .query('accountStates')
    .withIndex('by_user', (q) => q.eq('userId', userId as never))
    .unique();
}

export const status = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const state = await ctx.db
      .query('accountStates')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .unique();
    return {
      pendingDeletion: Boolean(state?.scheduledDeletionAt),
      deletionRequestedAt: state?.deletionRequestedAt,
      scheduledDeletionAt: state?.scheduledDeletionAt,
    };
  },
});

export const requestDeletion = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const now = Date.now();
    const existing = await accountStateFor(ctx, userId);
    const state = {
      deletionRequestedAt: now,
      scheduledDeletionAt: now + RECOVERY_WINDOW_MS,
      restoredAt: undefined,
      updatedAt: now,
    };
    if (existing) await ctx.db.patch(existing._id, state);
    else await ctx.db.insert('accountStates', { ...state, userId });
    return state;
  },
});

export const restore = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const existing = await accountStateFor(ctx, userId);
    if (!existing?.scheduledDeletionAt) return { restored: false };
    const restoredAt = Date.now();
    await ctx.db.patch(existing._id, {
      deletionRequestedAt: undefined,
      scheduledDeletionAt: undefined,
      restoredAt,
      updatedAt: restoredAt,
    });
    return { restored: true, restoredAt };
  },
});

async function deleteProfileData(ctx: MutationCtx, profileId: string) {
  const tables = [
    'monitoringPrograms',
    'journalEntries',
    'labResults',
    'scanResults',
    'reminders',
    'medicalConditions',
    'medications',
    'allergyRisks',
    'documents',
    'chatConversations',
    'chatMessages',
    'carePlanItems',
    'agentTriggers',
    'recommendationEvents',
    'preferences',
  ] as const;
  for (const table of tables) {
    const rows = await ctx.db
      .query(table)
      .filter((q) => q.eq(q.field('profileId'), profileId))
      .collect();
    for (const row of rows) await ctx.db.delete(row._id);
  }
}

export async function permanentlyDeleteUser(ctx: MutationCtx, userId: string) {
  const profile = await ctx.db
    .query('profiles')
    .withIndex('by_user', (q) => q.eq('userId', userId as never))
    .unique();
  if (profile) {
    await deleteProfileData(ctx, profile._id);
    await ctx.db.delete(profile._id);
  }

  const sessions = await ctx.db
    .query('authSessions')
    .withIndex('userId', (q) => q.eq('userId', userId as never))
    .collect();
  const verifiers = await ctx.db.query('authVerifiers').collect();
  for (const session of sessions) {
    const refreshTokens = await ctx.db
      .query('authRefreshTokens')
      .withIndex('sessionId', (q) => q.eq('sessionId', session._id))
      .collect();
    for (const token of refreshTokens) await ctx.db.delete(token._id);
    for (const verifier of verifiers) {
      if (verifier.sessionId === session._id) await ctx.db.delete(verifier._id);
    }
    await ctx.db.delete(session._id);
  }

  const accounts = await ctx.db
    .query('authAccounts')
    .withIndex('userIdAndProvider', (q) => q.eq('userId', userId as never))
    .collect();
  for (const account of accounts) {
    const verificationCodes = await ctx.db
      .query('authVerificationCodes')
      .withIndex('accountId', (q) => q.eq('accountId', account._id))
      .collect();
    for (const code of verificationCodes) await ctx.db.delete(code._id);
    await ctx.db.delete(account._id);
  }

  const state = await ctx.db
    .query('accountStates')
    .withIndex('by_user', (q) => q.eq('userId', userId as never))
    .unique();
  if (state) await ctx.db.delete(state._id);
  const aiChatConsent = await ctx.db
    .query('aiChatConsents')
    .withIndex('by_user', (q) => q.eq('userId', userId as never))
    .unique();
  if (aiChatConsent) await ctx.db.delete(aiChatConsent._id);
  const aiAgentConsent = await ctx.db
    .query('aiAgentConsents')
    .withIndex('by_user', (q) => q.eq('userId', userId as never))
    .unique();
  if (aiAgentConsent) await ctx.db.delete(aiAgentConsent._id);
  const agentRuns = await ctx.db
    .query('agentRuns')
    .filter((q) => q.eq(q.field('userId'), userId))
    .collect();
  for (const run of agentRuns) await ctx.db.delete(run._id);
  await ctx.db.delete(userId as never);
}

export const purgeExpired = internalMutation({
  args: { now: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now();
    const expired = await ctx.db
      .query('accountStates')
      .withIndex('by_scheduled_deletion', (q) =>
        q.gt('scheduledDeletionAt', 0).lte('scheduledDeletionAt', now),
      )
      .take(25);
    for (const state of expired) {
      await permanentlyDeleteUser(ctx, state.userId);
    }
    return { deleted: expired.length };
  },
});

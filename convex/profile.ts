import { v } from 'convex/values';

import { mutation, query } from './_generated/server';
import { getOwnedProfile, requireUserId } from './lib/access';

const goal = v.union(v.literal('planning'), v.literal('pregnancy'));

export const current = query({
  args: {},
  handler: getOwnedProfile,
});

export const viewer = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const profile = await ctx.db
      .query('profiles')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .unique();
    return { userId, profile };
  },
});

export const save = mutation({
  args: {
    displayName: v.string(),
    goal,
    onboardingCompleted: v.boolean(),
    pregnancyStartAt: v.optional(v.number()),
    lastPeriodStartAt: v.optional(v.number()),
    cycleLengthDays: v.optional(v.number()),
    consentToCloudSyncAt: v.optional(v.number()),
    updatedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const existing = await ctx.db
      .query('profiles')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, args);
      return existing._id;
    }
    return await ctx.db.insert('profiles', {
      ...args,
      userId,
      createdAt: args.updatedAt,
    });
  },
});

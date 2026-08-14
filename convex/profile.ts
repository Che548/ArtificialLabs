import { v } from 'convex/values';

import { mutation, query } from './_generated/server';
import {
  getOwnedProfile,
  requireActiveAccount,
  requireUserId,
} from './lib/access';

const goal = v.union(
  v.literal('cycle'),
  v.literal('planning'),
  v.literal('pregnancy'),
);

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
    const [user, accountState] = await Promise.all([
      ctx.db.get(userId),
      ctx.db
        .query('accountStates')
        .withIndex('by_user', (q) => q.eq('userId', userId))
        .unique(),
    ]);
    return { userId, email: user?.email, profile, accountState };
  },
});

export const save = mutation({
  args: {
    displayName: v.string(),
    goal,
    onboardingCompleted: v.boolean(),
    phone: v.optional(v.string()),
    birthDate: v.optional(v.number()),
    heightCm: v.optional(v.number()),
    weightKg: v.optional(v.number()),
    postpartum: v.optional(v.boolean()),
    postContraception: v.optional(v.boolean()),
    pregnancyStartAt: v.optional(v.number()),
    lastPeriodStartAt: v.optional(v.number()),
    cycleLengthDays: v.optional(v.number()),
    consentToCloudSyncAt: v.optional(v.number()),
    updatedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await requireActiveAccount(ctx);
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

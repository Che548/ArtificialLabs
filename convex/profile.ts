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
    return {
      userId,
      email: user?.email,
      verifiedPhone:
        user?.phoneVerificationTime !== undefined ? user.phone : undefined,
      profile,
      accountState,
    };
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
    timezoneOffsetMinutes: v.optional(v.number()),
    consentToCloudSyncAt: v.optional(v.number()),
    updatedAt: v.number(),
  },
  handler: async (ctx, args) => {
    if (
      args.timezoneOffsetMinutes !== undefined &&
      (!Number.isInteger(args.timezoneOffsetMinutes) ||
        args.timezoneOffsetMinutes < -840 ||
        args.timezoneOffsetMinutes > 840)
    )
      throw new Error('INVALID_TIMEZONE_OFFSET');
    const userId = await requireActiveAccount(ctx);
    const user = await ctx.db.get(userId);
    if (
      args.phone !== undefined &&
      (user?.phoneVerificationTime === undefined || user.phone !== args.phone)
    ) {
      throw new Error('PHONE_NOT_VERIFIED');
    }
    const existing = await ctx.db
      .query('profiles')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .unique();
    if (existing) {
      if (args.updatedAt < existing.updatedAt) {
        if (
          args.consentToCloudSyncAt &&
          args.consentToCloudSyncAt > (existing.consentToCloudSyncAt ?? 0)
        ) {
          await ctx.db.patch(existing._id, {
            consentToCloudSyncAt: args.consentToCloudSyncAt,
          });
        }
        return existing._id;
      }
      // Old native clients save their profile after every subscription refresh.
      // An identical write must not invalidate that subscription again.
      // Each opted-in device has its own receipt time. Keep the newest receipt
      // instead of letting two devices overwrite it back and forth. Revocation
      // remains the separate revokeCloudSync mutation, never a profile replay.
      const patch = { ...args };
      if (
        args.consentToCloudSyncAt !== undefined &&
        existing.consentToCloudSyncAt !== undefined
      ) {
        patch.consentToCloudSyncAt = Math.max(
          args.consentToCloudSyncAt,
          existing.consentToCloudSyncAt,
        );
      }
      if (
        Object.entries(patch).some(
          ([key, value]) => existing[key as keyof typeof existing] !== value,
        )
      ) {
        await ctx.db.patch(existing._id, patch);
      }
      return existing._id;
    }
    return await ctx.db.insert('profiles', {
      ...args,
      userId,
      createdAt: args.updatedAt,
    });
  },
});

export const revokeCloudSync = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireActiveAccount(ctx);
    const profile = await ctx.db
      .query('profiles')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .unique();
    if (!profile) return { revoked: false };
    await ctx.db.patch(profile._id, {
      consentToCloudSyncAt: undefined,
      lastMedicalSyncAt: undefined,
    });
    return { revoked: true };
  },
});

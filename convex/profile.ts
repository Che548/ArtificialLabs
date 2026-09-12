import { v } from 'convex/values';
import { requireSyncProtocol, supportsRevisionSync } from './lib/clientCompatibility';

import { mutation, query } from './_generated/server';
import { mergeProfileFields } from '../shared/profile-merge';
import { cloudSession, recordCloudReceipt } from './lib/cloudConsent';
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
    const { row: cloud } = await cloudSession(ctx, userId);
    return {
      userId,
      email: user?.email,
      verifiedPhone:
        user?.phoneVerificationTime !== undefined ? user.phone : undefined,
      profile,
      cloudSyncRevokedAt: cloud?.revokedAt,
      cloudSyncConsentedAt: cloud?.consentedAt,
      accountState,
    };
  },
});

export const save = mutation({
  args: {
    protocolVersion: v.optional(v.number()),
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
    base: v.optional(v.object({
      displayName: v.string(), goal, onboardingCompleted: v.boolean(),
      phone: v.optional(v.string()), birthDate: v.optional(v.number()),
      heightCm: v.optional(v.number()), weightKg: v.optional(v.number()),
      postpartum: v.optional(v.boolean()), postContraception: v.optional(v.boolean()),
      pregnancyStartAt: v.optional(v.number()), lastPeriodStartAt: v.optional(v.number()),
      cycleLengthDays: v.optional(v.number()), timezoneOffsetMinutes: v.optional(v.number()),
      updatedAt: v.number(),
    })),
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
    requireSyncProtocol('profileSync', args.protocolVersion);
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
    const { base, protocolVersion: _protocol, ...portable } = args;
    const now = Date.now();
    if (!Number.isFinite(args.updatedAt) || args.updatedAt > now + 300_000 ||
      (args.consentToCloudSyncAt !== undefined && (!Number.isFinite(args.consentToCloudSyncAt) || args.consentToCloudSyncAt > now + 300_000))) {
      throw new Error('SYNC_CLOCK_INVALID');
    }
    await recordCloudReceipt(ctx, userId, args.consentToCloudSyncAt);
    if (existing) {
      if (base) {
        const changed = mergeProfileFields(existing, portable, base);
        const receipt = Math.max(existing.consentToCloudSyncAt ?? 0, args.consentToCloudSyncAt ?? 0);
        if (receipt > (existing.consentToCloudSyncAt ?? 0)) changed.consentToCloudSyncAt = receipt;
        if (Object.keys(changed).length) {
          await ctx.db.patch(existing._id, { ...changed, updatedAt: Math.max(now, existing.updatedAt + 1) });
        }
        return existing._id;
      }
      if (args.updatedAt < existing.updatedAt) {
        // TODO(remove-legacy-sync-compat): protocol 0 retains timestamp precedence
        // only while SYNC_LEGACY_COMPAT_ENABLED allows it at the entry guard.
        // A capable client without a base must not silently retire local edits.
        if (supportsRevisionSync(args.protocolVersion)) mergeProfileFields(existing, portable);
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
      const patch = { ...portable };
      // TODO(remove-legacy-sync-compat): remove the legacy bypass with the flag.
      if (supportsRevisionSync(args.protocolVersion)) mergeProfileFields(existing, portable);
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
      ...portable,
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
    const { sessionId, row } = await cloudSession(ctx, userId);
    const revokedAt = Math.max(Date.now(), row?.consentedAt ?? 0);
    if (row) await ctx.db.patch(row._id, { revokedAt });
    else await ctx.db.insert('cloudSyncSessions', { userId, sessionId, revokedAt });
    return { revoked: true };
  },
});

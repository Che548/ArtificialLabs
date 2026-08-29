import { v } from 'convex/values';

import { internalMutation } from './_generated/server';
import { permanentlyDeleteUser } from './account';

const E2E_EMAIL =
  /^(?:artificiallabs-e2e\+[a-z0-9-]{8,80}@example\.test|2taras2006\+artificiallabs-e2e-[a-z0-9-]{8,80}@gmail\.com)$/;

export const purgeE2EAccount = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!E2E_EMAIL.test(normalizedEmail)) {
      throw new Error('E2E_EMAIL_REQUIRED');
    }
    const user = await ctx.db
      .query('users')
      .withIndex('email', (q) => q.eq('email', normalizedEmail))
      .unique();
    if (!user) return { deleted: false };
    const adminMembership = await ctx.db
      .query('adminMemberships')
      .withIndex('by_user', (q) => q.eq('userId', user._id))
      .unique();
    if (adminMembership) await ctx.db.delete(adminMembership._id);
    await permanentlyDeleteUser(ctx, user._id);
    return { deleted: true };
  },
});

export const grantE2EAdmin = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!E2E_EMAIL.test(normalizedEmail)) {
      throw new Error('E2E_EMAIL_REQUIRED');
    }
    const user = await ctx.db
      .query('users')
      .withIndex('email', (q) => q.eq('email', normalizedEmail))
      .unique();
    if (!user) throw new Error('E2E_USER_REQUIRED');
    const existing = await ctx.db
      .query('adminMemberships')
      .withIndex('by_user', (q) => q.eq('userId', user._id))
      .unique();
    if (existing) return { membershipId: existing._id };
    const now = Date.now();
    const membershipId = await ctx.db.insert('adminMemberships', {
      userId: user._id,
      role: 'admin',
      emailSnapshot: normalizedEmail,
      grantedAt: now,
      updatedAt: now,
    });
    return { membershipId };
  },
});

export const invalidateE2ESessions = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!E2E_EMAIL.test(normalizedEmail)) {
      throw new Error('E2E_EMAIL_REQUIRED');
    }
    const user = await ctx.db
      .query('users')
      .withIndex('email', (q) => q.eq('email', normalizedEmail))
      .unique();
    if (!user) return { invalidated: 0 };
    const sessions = await ctx.db
      .query('authSessions')
      .withIndex('userId', (q) => q.eq('userId', user._id))
      .collect();
    const verifiers = await ctx.db.query('authVerifiers').collect();
    for (const session of sessions) {
      const refreshTokens = await ctx.db
        .query('authRefreshTokens')
        .withIndex('sessionId', (q) => q.eq('sessionId', session._id))
        .collect();
      for (const token of refreshTokens) await ctx.db.delete(token._id);
      for (const verifier of verifiers) {
        if (verifier.sessionId === session._id)
          await ctx.db.delete(verifier._id);
      }
      await ctx.db.delete(session._id);
    }
    return { invalidated: sessions.length };
  },
});

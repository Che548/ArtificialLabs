import { paginationOptsValidator } from 'convex/server';
import { v } from 'convex/values';

import { internalMutation, mutation, query } from './_generated/server';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { requireAdmin, writeAdminAudit } from './lib/adminAccess';
import { requireUserId } from './lib/access';

const normalizeEmail = (email: string) => email.trim().toLowerCase();

async function userByEmail(ctx: MutationCtx | QueryCtx, email: string) {
  return await ctx.db
    .query('users')
    .withIndex('email', (q) => q.eq('email', normalizeEmail(email)))
    .unique();
}

export const bootstrapByEmail = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const existingAdmin = await ctx.db
      .query('adminMemberships')
      .withIndex('by_role_revoked', (q) =>
        q.eq('role', 'admin').eq('revokedAt', undefined),
      )
      .first();
    if (existingAdmin) throw new Error('ADMIN_ALREADY_BOOTSTRAPPED');
    const user = await userByEmail(ctx, email);
    if (!user?.email) throw new Error('USER_NOT_FOUND');
    const now = Date.now();
    const membershipId = await ctx.db.insert('adminMemberships', {
      userId: user._id,
      role: 'admin',
      emailSnapshot: user.email,
      grantedAt: now,
      updatedAt: now,
    });
    await writeAdminAudit(ctx, {
      actorUserId: user._id,
      action: 'admin.bootstrap',
      entityType: 'admin_membership',
      entityId: membershipId,
      summary: 'Первый администратор назначен защищённой internal-командой',
      requestId: `bootstrap:${membershipId}`,
      occurredAt: now,
    });
    return { membershipId, email: user.email };
  },
});

export const viewer = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const [user, membership] = await Promise.all([
      ctx.db.get(userId),
      ctx.db
        .query('adminMemberships')
        .withIndex('by_user', (q) => q.eq('userId', userId))
        .unique(),
    ]);
    return {
      authenticated: true,
      email: user?.email,
      isAdmin: Boolean(membership && membership.revokedAt === undefined),
    };
  },
});

export const list = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    await requireAdmin(ctx);
    const page = await ctx.db
      .query('adminMemberships')
      .withIndex('by_updated')
      .order('desc')
      .paginate({
        ...paginationOpts,
        numItems: Math.min(paginationOpts.numItems, 50),
        maximumRowsRead: 75,
        maximumBytesRead: 256_000,
      });
    return {
      ...page,
      page: page.page.map((membership) => ({
        _id: membership._id,
        email: membership.emailSnapshot,
        grantedAt: membership.grantedAt,
        revokedAt: membership.revokedAt,
      })),
    };
  },
});

export const grant = mutation({
  args: { email: v.string(), requestId: v.string() },
  handler: async (ctx, { email, requestId }) => {
    const { userId: actorUserId } = await requireAdmin(ctx);
    const user = await userByEmail(ctx, email);
    if (!user?.email) throw new Error('USER_NOT_FOUND');
    const existing = await ctx.db
      .query('adminMemberships')
      .withIndex('by_user', (q) => q.eq('userId', user._id))
      .unique();
    const now = Date.now();
    let membershipId;
    if (existing) {
      if (existing.revokedAt === undefined) return existing._id;
      await ctx.db.patch(existing._id, {
        emailSnapshot: user.email,
        grantedBy: actorUserId,
        grantedAt: now,
        revokedBy: undefined,
        revokedAt: undefined,
        updatedAt: now,
      });
      membershipId = existing._id;
    } else {
      membershipId = await ctx.db.insert('adminMemberships', {
        userId: user._id,
        role: 'admin',
        emailSnapshot: user.email,
        grantedBy: actorUserId,
        grantedAt: now,
        updatedAt: now,
      });
    }
    await writeAdminAudit(ctx, {
      actorUserId,
      action: 'admin.grant',
      entityType: 'admin_membership',
      entityId: membershipId,
      summary: `Назначен администратор ${user.email}`,
      requestId,
      occurredAt: now,
    });
    return membershipId;
  },
});

export const revoke = mutation({
  args: { membershipId: v.id('adminMemberships'), requestId: v.string() },
  handler: async (ctx, { membershipId, requestId }) => {
    const { userId: actorUserId } = await requireAdmin(ctx);
    const membership = await ctx.db.get(membershipId);
    if (!membership || membership.revokedAt !== undefined) return false;
    const otherActive = await ctx.db
      .query('adminMemberships')
      .withIndex('by_role_revoked', (q) =>
        q.eq('role', 'admin').eq('revokedAt', undefined),
      )
      .filter((q) => q.neq(q.field('_id'), membershipId))
      .first();
    if (!otherActive) throw new Error('LAST_ADMIN_REQUIRED');
    const now = Date.now();
    await ctx.db.patch(membershipId, {
      revokedBy: actorUserId,
      revokedAt: now,
      updatedAt: now,
    });
    await writeAdminAudit(ctx, {
      actorUserId,
      action: 'admin.revoke',
      entityType: 'admin_membership',
      entityId: membershipId,
      summary: `Отозваны права ${membership.emailSnapshot}`,
      requestId,
      occurredAt: now,
    });
    return true;
  },
});

export const audit = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    await requireAdmin(ctx);
    return await ctx.db
      .query('adminAuditEvents')
      .withIndex('by_time')
      .order('desc')
      .paginate({
        ...paginationOpts,
        numItems: Math.min(paginationOpts.numItems, 50),
        maximumRowsRead: 75,
        maximumBytesRead: 256_000,
      });
  },
});

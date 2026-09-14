import { v } from 'convex/values';
import { internalMutation } from './_generated/server';
import { requireAdmin, writeAdminAudit } from './lib/adminAccess';

// Operator-only configuration, never a client parameter or a store-review exception.
// Does not claim that mailbox ownership was verified and does not change recovery.
export const configure = internalMutation({
  args: { userId: v.id('users'), email: v.string(), enabled: v.boolean(), reason: v.string() },
  handler: async (ctx, args) => {
    const { userId: actorUserId } = await requireAdmin(ctx);
    if (!args.reason.trim() || args.reason.length > 200) throw new Error('REASON_REQUIRED');
    const user = await ctx.db.get(args.userId);
    const membership = await ctx.db.query('adminMemberships')
      .withIndex('by_user', q => q.eq('userId', args.userId)).unique();
    if (!user || user.email !== args.email || !membership || membership.revokedAt !== undefined)
      throw new Error('ACTIVE_ADMIN_EMAIL_REQUIRED');
    if (args.enabled) {
      const state = await ctx.db.query('accountStates')
        .withIndex('by_user', q => q.eq('userId', args.userId)).unique();
      const accounts = await ctx.db.query('authAccounts')
        .withIndex('userIdAndProvider', q => q.eq('userId', args.userId).eq('provider', 'password')).take(2);
      if (state?.scheduledDeletionAt || accounts.length !== 1 || !accounts[0].secret ||
          accounts[0].providerAccountId !== args.email) throw new Error('ACTIVE_PASSWORD_ACCOUNT_REQUIRED');
    }
    const email = args.enabled ? args.email : undefined;
    if (membership.demoLoginEmail === email) return { changed: false };
    await ctx.db.patch(membership._id, { demoLoginEmail: email, updatedAt: Date.now() });
    await writeAdminAudit(ctx, {
      actorUserId, action: args.enabled ? 'admin.demo_login.grant' : 'admin.demo_login.revoke',
      entityType: 'admin_membership', entityId: membership._id,
      summary: args.reason.trim(), requestId: `demo-login:${membership._id}:${Date.now()}`,
    });
    return { changed: true };
  },
});

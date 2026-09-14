import type { Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import { requireUserId } from './access';

type Ctx = QueryCtx | MutationCtx;

export async function hasDemoAdminLoginException(ctx: Ctx, userId: Id<'users'>, email: string) {
  const membership = await ctx.db.query('adminMemberships')
    .withIndex('by_user', q => q.eq('userId', userId)).unique();
  const state = await ctx.db.query('accountStates')
    .withIndex('by_user', q => q.eq('userId', userId)).unique();
  return Boolean(membership && membership.revokedAt === undefined &&
    membership.demoLoginEmail === email && !state?.scheduledDeletionAt);
}

export async function clearDemoAdminLoginException(ctx: MutationCtx, userId: Id<'users'>) {
  const membership = await ctx.db.query('adminMemberships')
    .withIndex('by_user', q => q.eq('userId', userId)).unique();
  if (!membership?.demoLoginEmail) return;
  await ctx.db.patch(membership._id, { demoLoginEmail: undefined, updatedAt: Date.now() });
  await writeAdminAudit(ctx, {
    actorUserId: userId, action: 'admin.demo_login.revoke', entityType: 'admin_membership',
    entityId: membership._id, summary: 'Демо-исключение входа отозвано при смене email',
    requestId: `demo-email-change:${membership._id}:${Date.now()}`,
  });
}

export async function requireAdmin(ctx: Ctx) {
  const userId = await requireUserId(ctx);
  const membership = await ctx.db
    .query('adminMemberships')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .unique();
  if (!membership || membership.revokedAt !== undefined) {
    throw new Error('ADMIN_REQUIRED');
  }
  return { userId, membership };
}

export async function writeAdminAudit(
  ctx: MutationCtx,
  args: {
    actorUserId: Id<'users'>;
    action: string;
    entityType: string;
    entityId?: string;
    summary: string;
    requestId: string;
    occurredAt?: number;
  },
) {
  if (args.summary.length > 500) throw new Error('AUDIT_SUMMARY_TOO_LONG');
  return await ctx.db.insert('adminAuditEvents', {
    ...args,
    occurredAt: args.occurredAt ?? Date.now(),
  });
}
